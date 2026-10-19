// Headless test: a bot plays several full days of every cuisine through the
// real interaction code (teleporting between stations instead of walking).
// Run: node tools/simtest.mjs [cuisine] [days]
import { newState, dishById, serialize, deserialize, initObject, nextId, numberTables, SAVE_VERSION } from '../src/sim/state.js';
import { BUILD } from '../src/config.js';
import { Sim } from '../src/sim/sim.js';
import { actE, findTarget } from '../src/sim/kitchen.js';
import { buildGrid, findPath, walkable, footprint, validateLayout } from '../src/sim/world.js';
import { ING } from '../src/data/ingredients.js';
import { frontDoor, roomSize, startingObjects, spawnPoints, HEAT_TYPES, STORE_TYPES } from '../src/data/layout.js';
import { legacyStartingObjects } from '../src/data/legacy-layouts.js';
import { CUISINE_ORDER } from '../src/data/cuisines.js';
import { ALLEY_OBJECTS, BACK_DOOR, TRASH_CAPACITY, playerArea } from '../src/data/alley.js';
import { autofillPlan, placementStatus, tryMove } from '../src/sim/economy.js';
import { pathToFileURL } from 'node:url';

const DT = 1 / 30;
let sim;
let PID = 'A';
let pickerQueue = [];
let log = [];
let supportBot = false;
let supporting = false;
let ticks = 0;

/** A repeatable world seed. Restore the previous source after each test. */
export function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6D2B79F5;
    let n = value;
    n = Math.imul(n ^ n >>> 15, n | 1);
    n ^= n + Math.imul(n ^ n >>> 7, n | 61);
    return ((n ^ n >>> 14) >>> 0) / 4294967296;
  };
}

export function useBot(nextSim, { support = false } = {}) {
  sim = nextSim;
  PID = 'A';
  pickerQueue = [];
  log = [];
  supportBot = support;
  supporting = false;
  ticks = 0;
}

function step(n = 1) {
  for (let i = 0; i < n; i++) {
    sim.step(DT);
    for (const e of sim.drain()) {
      if (e.type === 'picker') pickerQueue.push(e);
      if (e.type === 'toast' && /burnt|walked|left|gave up/.test(e.text)) log.push(`[d${sim.state.day} ${fmtClock(sim.state.clock)}] ${e.text}`);
      if (e.type === 'levelUp') log.push(`LEVEL UP ${e.level}: ${(e.dishes || e.unlocks || []).join(', ')}`);
    }
    if (sim.state.phase === 'office') return;
    if (supportBot && !supporting && ++ticks % 15 === 0) supportTick();
  }
}
const fmtClock = (m) => `${Math.floor(m / 60)}:${String(Math.floor(m % 60)).padStart(2, '0')}`;

function face(o) {
  const g = sim.gridFor(playerArea(P()));
  const f = footprint(o);
  let best = null, bd = Infinity;
  for (let dz = -1; dz <= f.h; dz++) {
    for (let dx = -1; dx <= f.w; dx++) {
      const inside = dx >= 0 && dx < f.w && dz >= 0 && dz < f.h;
      if (inside) continue;
      if ((dx < 0 || dx >= f.w) && (dz < 0 || dz >= f.h)) continue; // no diagonals
      const x = f.x + dx, z = f.z + dz;
      if (!walkable(g, x, z)) continue;
      const d = (x + 0.5 - P().x) ** 2 + (z + 0.5 - P().z) ** 2;
      if (d < bd) { bd = d; best = { x, z, tx: Math.max(f.x, Math.min(x, f.x + f.w - 1)), tz: Math.max(f.z, Math.min(z, f.z + f.h - 1)) }; }
    }
  }
  if (!best) throw new Error('No approach to ' + o.type + ' ' + o.id);
  const px = best.x + 0.5, pz = best.z + 0.5;
  const rot = Math.atan2(best.tx + 0.5 - px, best.tz + 0.5 - pz);
  sim.setPose(PID, px, pz, rot);
  const t = findTarget(sim.state, g, sim.state.players[PID]);
  if (!t || t.id !== o.id) throw new Error(`Facing ${o.type} ${o.id} but target is ${t && t.type}`);
}

function E(o) {
  if (o.type === 'bin' && o.trash >= TRASH_CAPACITY && P().hand && !['trash', 'dirty'].includes(P().hand.k)) {
    const counter = sim.state.objects.find((item) => ['counter', 'pass'].includes(item.type) && !item.slot);
    if (!counter) throw new Error('No clear surface while emptying the bin');
    E(counter);
    emptyBin();
    E(counter);
  }
  face(o);
  const r = actE(sim, PID, false);
  for (const e of sim.drain()) if (e.type === 'picker') pickerQueue.push(e);
  return r;
}

function emptyBin() {
  const bin = objs('bin')[0];
  if (P().hand || bin.trash < TRASH_CAPACITY) return false;
  E(bin);
  E(BACK_DOOR);
  E(ALLEY_OBJECTS.find((o) => o.type === 'dumpster'));
  E(ALLEY_OBJECTS.find((o) => o.type === 'backdoor'));
  if (P().hand || playerArea(P()) !== 'restaurant') throw new Error('Could not dispose of trash');
  return true;
}
const P = () => sim.state.players[PID];
const objs = (type) => sim.state.objects.filter((o) => o.type === type);

function hold(o, done, max = 20) {
  face(o);
  sim.setWork(PID, true);
  let t = 0;
  while (!done() && t < max) { step(); t += DT; }
  sim.setWork(PID, false);
  return done();
}

function waitFor(done, max = 120) {
  let t = 0;
  while (!done() && t < max) { step(); t += DT; }
  return done();
}

function takeRaw(ing) {
  const store = objs(ING[ing].store)[0];
  pickerQueue = [];
  E(store);
  if (!pickerQueue.length) return false;
  const pk = pickerQueue.shift();
  const before = JSON.stringify(P().hand);
  sim.command(PID, { c: 'take', obj: pk.obj, ing });
  return JSON.stringify(P().hand) !== before;
}

function chainTo(ing, st) {
  const steps = [];
  let cur = st;
  while (cur !== 'raw') {
    const s = ING[ing].steps.find((x) => x.to === cur);
    if (!s) throw new Error(`No way to make ${ing}:${st}`);
    steps.unshift(s);
    cur = s.from;
  }
  return steps;
}

function freeStation(type) {
  return objs(type).find((o) => !o.slot);
}

// Start independent heat steps together, then plate each finished component.
// This is normal kitchen work: no timer, stock, or quality value is changed.
function prepareTogether(comps, counter) {
  const tasks = comps.map(([ing, st]) => ({ ing, st, steps: chainTo(ing, st), at: null, done: false }));
  let guard = 0;
  while (tasks.some((t) => !t.done) && guard++ < 50000) {
    let moved = false;
    const readyFirst = [...tasks].sort((a, b) => Number(b.at?.type === 'board') - Number(a.at?.type === 'board'));
    for (const task of readyFirst) {
      if (task.done || !task.at) continue;
      const stepInfo = task.steps[0];
      if (!task.at.slot || task.at.slot.st !== stepInfo.to) continue;
      E(task.at);
      task.steps.shift();
      task.at = null;
      if (!task.steps.length) {
        if (E(counter) !== 'ok') throw new Error('Could not plate ' + task.ing);
        task.done = true;
      } else {
        const next = freeStation(task.steps[0].at);
        if (!next) throw new Error('No free next station for ' + task.ing);
        E(next);
        task.at = next;
        if (task.steps[0].at === 'board') hold(next, () => next.slot?.st === task.steps[0].to);
      }
      moved = true;
    }
    for (const task of tasks) {
      if (task.done || task.at) continue;
      const station = task.steps.length ? freeStation(task.steps[0].at) : null;
      if (task.steps.length && !station) continue;
      if (task.steps[0]?.at === 'board' && task.steps[1] && !freeStation(task.steps[1].at)) continue;
      if (task.steps.length && tasks.some((other) => other.at?.type === 'board' && other.steps[1]?.at === task.steps[0].at)) continue;
      if (!takeRaw(task.ing)) return false;
      if (!station) {
        if (E(counter) !== 'ok') throw new Error('Could not plate ' + task.ing);
        task.done = true;
      } else {
        E(station);
        task.at = station;
        if (task.steps[0].at === 'board') hold(station, () => station.slot?.st === task.steps[0].to);
      }
      moved = true;
    }
    if (!moved) step(3);
    if (sim.state.phase === 'office') return false;
  }
  return tasks.every((t) => t.done);
}

export function cook(dishId) {
  const dish = dishById(sim.state, dishId);
  const container = dish.comps.find(([i]) => ING[i].container);
  const rack = objs('rack')[0];
  if (rack.n <= 0) return false;
  const counter = objs('counter').find((c) => !c.slot);
  if (!counter) return false;
  E(rack);
  E(counter); // plate down
  const rest = dish.comps.filter((c) => c !== container);
  if (container) {
    const c2 = objs('counter').find((c) => !c.slot);
    if (!takeRaw(container[0])) return abort(counter);
    E(c2); // dough down
    if (!prepareTogether(rest, c2)) return abort(counter, c2);
    E(c2); // pick dough
    const oven = freeStation('oven') || (waitFor(() => freeStation('oven')), freeStation('oven'));
    E(oven);
    waitFor(() => oven.slot && oven.slot.st === container[1], 90);
    E(oven);
    E(counter); // dough onto plate? combine: hand ing + slot plate
  } else {
    if (!prepareTogether(rest, counter)) return abort(counter);
  }
  E(counter); // pick up plate
  return P().hand && P().hand.k === 'plate';
}

function abort(...cs) {
  for (const c of cs) if (c && c.slot) { E(c); E(objs('bin')[0]); }
  if (P().hand) {
    if (P().hand.k === 'plate' && P().hand.items.length) E(objs('bin')[0]);
    if (P().hand && P().hand.k === 'plate') E(objs('rack')[0]);
    else if (P().hand) E(objs('bin')[0]);
  }
  return false;
}

const tableOf = (p) => sim.state.objects.find((o) => o.id === p.table);

function serviceTick({ kitchen = true } = {}) {
  const S = sim.state;
  if (!P().hand && !S.parties.some((p) => p.leader === PID && p.state === 'following') && emptyBin()) return true;
  // Settle and take orders first.
  for (const p of S.parties) {
    if (!P().hand && ['ordering', 'dessertReady', 'paying'].includes(p.state)) {
      const t = tableOf(p);
      const st = p.state;
      hold(t, () => p.state !== st, 6);
      return true;
    }
  }
  // Seat someone.
  const waiting = S.parties.find((p) => p.state === 'waiting');
  if (waiting && !P().hand) {
    const t = objs('table').find((t) => !t.party && !t.dirty && t.seats >= waiting.size);
    if (t) {
      E(objs('host')[0]);
      E(t);
      return true;
    }
  }
  // Bus tables.
  const dirty = objs('table').find((t) => t.dirty > 0);
  if (dirty && !P().hand) {
    E(dirty);
    E(objs('sink')[0]);
    const sink = objs('sink')[0];
    hold(sink, () => sink.n === 0, kitchen ? 30 : 0.5);
    return true;
  }
  // Drinks.
  for (const p of S.parties) {
    if (!['waitingFood', 'eating', 'dessertWait'].includes(p.state)) continue;
    const d = p.drinks.find((x) => !x.served);
    if (d && !P().hand) {
      pickerQueue = [];
      E(objs('drinks')[0]);
      const pk = pickerQueue.shift();
      sim.command(PID, { c: 'drink', obj: pk.obj, id: d.id });
      const r = E(tableOf(p));
      if (r !== 'served') throw new Error('Drink not served: ' + JSON.stringify(r));
      return true;
    }
  }
  if (!kitchen) {
    const sink = objs('sink')[0];
    if (sink.n && !P().hand) hold(sink, () => sink.n === 0, 0.5);
    return false;
  }
  // Cook the oldest ticket.
  const open = S.parties.filter((p) => ['waitingFood', 'dessertWait'].includes(p.state)).sort((a, b) => a.ticket - b.ticket);
  for (const p of open) {
    const line = p.items.find((x) => !x.served);
    if (!line) continue;
    if (!cook(line.id)) {
      sim.command(PID, { c: 'comp', party: p.id, index: p.items.filter((x) => !x.served).indexOf(line) });
      log.push(`comped ${line.id}`);
      return true;
    }
    if (!S.parties.includes(p) || !tableOf(p)) { E(objs('bin')[0]); E(objs('rack')[0]); return true; }
    const r = E(tableOf(p));
    if (r !== 'served') {
      log.push(`serve failed ${line.id}: ${JSON.stringify(r)} plate=${JSON.stringify(P().hand && P().hand.items.map((i) => i.ing + ':' + i.st))}`);
      E(objs('bin')[0]); E(objs('rack')[0]);
    }
    return true;
  }
  return false;
}

// A second chef handles the dining room while the first chef waits for heat.
// Both use the normal commands, cooking times, guest paths, and work timers.
// Chef travel is still instantaneous, as in the original simulation test.
function supportTick() {
  if (!sim.state.players.B || !['service', 'closing'].includes(sim.state.phase)) return;
  const previousPid = PID;
  supporting = true;
  PID = 'B';
  try { serviceTick({ kitchen: false }); }
  finally { PID = previousPid; supporting = false; }
}

function unpackAll() {
  const dock = objs('dock')[0];
  let n = 0;
  while (dock.boxes.length) {
    E(dock);
    const ing = P().hand.ing;
    const r = E(objs(ING[ing].store)[0]);
    if (r !== 'ok') throw new Error('unpack failed');
    n++;
  }
  return n;
}

export function playDay() {
  const S = sim.state;
  const unpacked = unpackAll();
  // Morning prep: a well of chopped lettuce if the menu uses it.
  sim.command(PID, { c: 'ready' });
  if (supportBot) sim.command('B', { c: 'ready' });
  if (S.phase !== 'service') throw new Error('Did not open');
  let guard = 0;
  while (S.phase !== 'office' && guard++ < 200000) {
    try {
      if (!serviceTick()) step(15);
    } catch (err) {
      if (S.phase !== 'office') throw err;
    }
  }
  if (S.phase !== 'office') throw new Error('Service did not finish');
  return unpacked;
}

function runCuisine(cuisine, days) {
  sim = new Sim(newState({ cuisine, name: 'Test ' + cuisine, mode: 'arcade' }));
  sim.addPlayer(PID, { name: 'Bot' });
  log = [];
  const out = [];
  for (let d = 0; d < days; d++) {
    const unpacked = playDay();
    const r = sim.state.report;
    out.push(`day ${r.day}: parties ${r.parties} covers ${r.covers} walkouts ${r.walkouts} turned ${r.turnedAway} rev $${r.revenue} cogs $${r.cogs} (${r.foodCostPct}%) waste $${r.waste} fixed $${r.fixedTotal} net $${r.net} rating ${r.rating} ticket ${r.ticketTime}s cash $${r.cashEnd} rep ${r.repPoints} L${r.level} unpacked ${unpacked}`);
    // Office: autofill, try an upgrade, reopen.
    const plan = autofillPlan(sim.state, 1);
    sim.command(PID, { c: 'autofill' });
    out.push('  autofill: ' + plan.map((x) => x.ing + '×' + x.cases).join(' '));
    if (d === 0) {
      const r1 = sim.command(PID, { c: 'upgrade', id: 'counter' });
      if (!r1.ok) out.push('upgrade failed ' + JSON.stringify(r1));
      const r2 = sim.command(PID, { c: 'dish', spec: { name: 'Bot bowl', course: 'main', tpl: 'bowl', comps: [['rice', 'cooked'], ['chicken', 'sliced'], ['avocado', 'sliced']] } });
      if (!r2.ok) out.push('custom dish failed ' + JSON.stringify(r2));
    }
    // Save round-trip.
    const copy = deserialize(JSON.parse(JSON.stringify(serialize(sim.state))));
    sim = new Sim(copy);
    sim.addPlayer(PID, { name: 'Bot' });
    sim.command(PID, { c: 'ready' });
    if (sim.state.phase !== 'morning') throw new Error('next day did not start');
  }
  const r = sim.state.report;
  console.log(`\n=== ${cuisine} ===`);
  out.forEach((l) => console.log(l));
  console.log('menu:', r.menu.map((m) => `${m.name} ${m.n} ${m.cls}`).join(' | '));
  console.log('reviews:', sim.state.reviews.slice(0, 4).map((x) => `${x.stars}★ ${x.text}`).join(' / '));
  if (log.length) console.log('log:', log.slice(0, 12).join('\n  '));
}

/** Every dish in every cuisine can be cooked from scratch. */
function cookEveryDish() {
  for (const c of CUISINE_ORDER) {
    sim = new Sim(newState({ cuisine: c, name: 'x', mode: 'arcade' }));
    sim.state.rep.level = 10;
    sim.addPlayer(PID, { name: 'Bot' });
    for (const d of sim.state.objects) if (d.type === 'rack') d.n = 99;
    for (const ing of Object.keys(ING)) sim.state.stock[ing] = [{ n: 50, cost: ING[ing].cost, exp: 99 }];
    sim.command(PID, { c: 'ready' });
    for (const dish of sim.state.menu.dishes) {
      const ok = cook(dish.id);
      const plate = P().hand;
      const { matchAny } = itemsMod;
      const m = plate && itemsMod.matchDish(sim.state, plate, [dish.id]);
      if (!ok || !m) throw new Error(`Could not cook ${c}/${dish.id}: ${JSON.stringify(plate)}`);
      P().hand = null;
    }
    console.log(`cooked all ${sim.state.menu.dishes.length} dishes of ${c}`);
  }
}

function verifyKitchenFlow(state) {
  const check = (ok, reason) => { if (!ok) throw new Error(`${state.cuisine} kitchen: ${reason}`); };
  const distance = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.z - b.z);
  const ofType = (type) => state.objects.filter((o) => o.type === type);
  const grid = buildGrid(state);
  const stores = state.objects.filter((o) => STORE_TYPES.has(o.type));
  const dock = ofType('dock')[0];
  check(dock.x === BACK_DOOR.x + 1 && dock.z === BACK_DOOR.z + 1, 'deliveries must stay beside the back door');
  check(stores.every((o) => o.z === 1 && distance(o, dock) <= 5), 'tall storage must stay on the back wall near deliveries');
  check(Math.max(...stores.map((o) => o.x)) - Math.min(...stores.map((o) => o.x)) === stores.length - 1, 'storage must form one group');

  const heat = state.objects.filter((o) => HEAT_TYPES.has(o.type));
  const boards = ofType('board'), counters = ofType('counter');
  check(heat.every((o) => o.z === 1) && Math.max(...heat.map((o) => o.x)) - Math.min(...heat.map((o) => o.x)) === heat.length - 1, 'cooking stations must form one back-wall line');
  check(boards.every((b) => counters.some((c) => distance(b, c) <= 2)), 'each cutting board needs a nearby counter');
  check(heat.some((h) => boards.some((b) => distance(h, b) <= 4)), 'prep must be close to the cooking line');
  check(distance(ofType('sink')[0], ofType('bin')[0]) === 1, 'sink and bin must share one wash area');
  check(ofType('pass').every((o) => o.z === 5 && walkable(grid, o.x, o.z - 1) && walkable(grid, o.x, o.z + 1)), 'the pass needs access from kitchen and dining room');

  const remaining = new Set(ofType('well'));
  let benches = 0;
  while (remaining.size) {
    const first = remaining.values().next().value, group = [first];
    remaining.delete(first);
    for (const cell of group) for (const next of remaining) if (distance(cell, next) === 1) { remaining.delete(next); group.push(next); }
    benches++;
    check(group.length >= 2 && group.some((w) => counters.some((c) => distance(w, c) <= 2)), 'prep wells need a shared bench with a nearby counter');
  }
  check(benches <= 2, 'prep wells must stay in one or two work benches');

  for (const spawn of spawnPoints(state)) {
    check(walkable(grid, Math.floor(spawn.x), Math.floor(spawn.z)), 'a chef spawns inside furniture');
    for (const station of state.objects.filter((o) => o.type !== 'table' && o.type !== 'host')) {
      const reachable = [[0, 1], [-1, 0], [1, 0], [0, -1]].some(([dx, dz]) => {
        const x = station.x + dx, z = station.z + dz;
        if (!walkable(grid, x, z)) return false;
        const path = findPath(grid, spawn.x, spawn.z, x, z);
        if (!path || path.some((p) => !walkable(grid, Math.floor(p.x), Math.floor(p.z)))) return false;
        const chef = { x: x + 0.5, z: z + 0.5, rot: Math.atan2(-dx, -dz), area: 'restaurant' };
        return findTarget(state, grid, chef)?.id === station.id;
      });
      check(reachable, `${station.type} cannot be reached and used from both chef starts`);
    }
  }
}

function verifyStartingLayouts() {
  const signatures = new Set();
  const hostX = { southern: 4, italian: 4, mexican: 3, diner: 3, noodle: 8 };
  const countsOf = (objects) => Object.fromEntries([...new Set(objects.map((o) => o.type))].sort().map((type) => [type, objects.filter((o) => o.type === type).length]));
  for (const cuisine of CUISINE_ORDER) {
    const state = newState({ cuisine, name: 'Layout test', mode: 'arcade' });
    if (JSON.stringify(roomSize(state)) !== JSON.stringify({ width: 20, height: 15 })) throw new Error(`Arcade floor size changed for ${cuisine}`);
    if (state.cash !== 3000) throw new Error(`Wrong normal arcade cash for ${cuisine}: ${state.cash}`);
    const host = state.objects.find((o) => o.type === 'host');
    if (host.x !== hostX[cuisine] || host.z !== 13) throw new Error(`Wrong starting host stand position for ${cuisine}`);
    const status = validateLayout(state, frontDoor(state));
    if (!status.ok) throw new Error(`Invalid starting layout for ${cuisine}: ${status.reason}`);
    if (JSON.stringify(countsOf(state.objects)) !== JSON.stringify(countsOf(legacyStartingObjects(cuisine)))) throw new Error(`Equipment count changed for ${cuisine}`);
    verifyKitchenFlow(state);
    signatures.add(state.objects.map((o) => `${o.type}:${o.x},${o.z}`).sort().join('|'));
  }
  if (signatures.size !== CUISINE_ORDER.length) throw new Error('Starting layouts are not unique');

  const state = newState({ cuisine: 'southern', name: 'Move test', mode: 'arcade' });
  const drinks = state.objects.find((o) => o.type === 'drinks');
  let target = null;
  for (let z = 6; z <= 13 && !target; z++) {
    for (let x = 1; x <= 18; x++) {
      if (placementStatus(state, drinks.id, x, z).ok) { target = { x, z }; break; }
    }
  }
  if (!target) throw new Error('A service item cannot move across the full floor');
  const moved = tryMove(state, drinks.id, target.x, target.z);
  if (!moved.ok || drinks.x !== target.x || drinks.z !== target.z) throw new Error('Drag placement did not move the service item');
  console.log('checked five unique layouts, work areas, both chef routes, equipment counts, starting cash, and full-floor item movement');
}

function verifyLayoutSaves() {
  const isKitchen = (o) => o.type !== 'table' && o.type !== 'host';
  const updatedSave = (save) => ({ ...structuredClone(save), v: SAVE_VERSION, build: BUILD });
  const checkLoad = (save, expected, label) => {
    const loaded = deserialize(structuredClone(save));
    if (JSON.stringify(loaded) !== JSON.stringify(expected)) throw new Error(`Save repair changed saved data or missed ${label}`);
    if (!validateLayout(loaded).ok) throw new Error(`Save repair made an invalid layout for ${label}`);
    if (JSON.stringify(deserialize(serialize(loaded))) !== JSON.stringify(loaded)) throw new Error(`Save repair repeated on reload for ${label}`);
    return loaded;
  };
  const oldSave = (cuisine, version) => {
    const save = serialize(newState({ cuisine, name: 'Saved layout', mode: 'arcade' }));
    save.v = version;
    save.build = 'tf-1.2.6-menu-sizes';
    save.seq = 0;
    save.objects = legacyStartingObjects(cuisine, version).map((spec) => initObject({ id: nextId(save), ...spec }));
    numberTables(save);
    save.day = 4;
    save.cash = 875.25;
    save.menu.dishes[0].price += 2;
    save.stock.tomato = [{ n: 12, cost: 0.25, exp: 8 }];
    save.objects.forEach((o, i) => {
      if ('slot' in o) o.slot = { k: 'ing', ing: 'tomato', st: 'raw', cost: i + 0.25, t: i, over: 0, q: 1, heat: -1 };
      if (o.type === 'well') o.well = { ing: 'tomato', st: 'chopped', n: i + 1, cost: 0.25, day: 4 };
      if (o.type === 'sink') { o.n = 2; o.wash = 0.5; }
      if (o.type === 'dock') o.boxes = [{ ing: 'tomato', cases: 2 }];
      if (o.type === 'bin') o.trash = 4;
    });
    save.objects.find((o) => o.type === 'rack').n = 7;
    save.objects.find((o) => o.type === 'table').dirty = 2;
    return save;
  };
  const withNewKitchen = (save) => {
    const expected = updatedSave(save);
    const legacy = legacyStartingObjects(save.cuisine);
    const defaults = startingObjects(save.cuisine);
    for (const o of expected.objects.filter(isKitchen)) {
      const siblings = legacy.filter((old) => old.type === o.type);
      const occurrence = siblings.findIndex((old) => old.x === o.x && old.z === o.z);
      const target = defaults.filter((next) => next.type === o.type)[occurrence];
      o.x = target.x; o.z = target.z;
    }
    return expected;
  };
  const moveInBoth = (old, updated, type) => {
    const object = old.objects.find((o) => o.type === type && !o.dirty);
    for (let z = 13; z >= 6; z--) for (let x = 1; x <= 18; x++) {
      if (x === object.x && z === object.z) continue;
      if (!placementStatus(old, object.id, x, z).ok || !placementStatus(updated, object.id, x, z).ok) continue;
      Object.assign(object, { x, z });
      Object.assign(updated.objects.find((o) => o.id === object.id), { x, z });
      return;
    }
    throw new Error(`No valid custom ${type} position for ${old.cuisine}`);
  };

  let blockedLayouts = 0;
  for (const cuisine of CUISINE_ORDER) {
    const old = oldSave(cuisine, 3);
    const expected = withNewKitchen(old);
    const host = expected.objects.find((o) => o.type === 'host');
    Object.assign(host, legacyStartingObjects(cuisine).find((o) => o.type === 'host'));
    checkLoad(old, expected, `${cuisine} version 3 host and kitchen`);

    for (const type of ['host', 'table']) {
      const custom = oldSave(cuisine, 3);
      const customExpected = withNewKitchen(custom);
      moveInBoth(custom, customExpected, type);
      checkLoad(custom, customExpected, `${cuisine} version 3 custom ${type}`);
    }

    const v4 = oldSave(cuisine, 4);
    const customDining = withNewKitchen(v4);
    moveInBoth(v4, customDining, 'host');
    moveInBoth(v4, customDining, 'table');
    checkLoad(v4, customDining, `${cuisine} version 4 kitchen and custom dining`);
    v4.objects.reverse();
    customDining.objects.reverse();
    checkLoad(v4, customDining, `${cuisine} reversed object order`);

    for (const change of ['version 5', 'future version', 'moved counter', 'extra equipment']) {
      const custom = oldSave(cuisine, 3);
      if (change === 'version 5') custom.v = 5;
      if (change === 'future version') custom.v = 6;
      if (change === 'moved counter') {
        const counter = custom.objects.find((o) => o.type === 'counter');
        if (!tryMove(custom, counter.id, 9, 6).ok) throw new Error(`Invalid custom counter test for ${cuisine}`);
      }
      if (change === 'extra equipment') custom.objects.push(initObject({ id: nextId(custom), type: 'counter', x: 9, z: 6 }));
      checkLoad(custom, updatedSave(custom), `${cuisine} ${change}`);
    }

    const blocked = oldSave(cuisine, 4);
    const blockedHost = blocked.objects.find((o) => o.type === 'host');
    const target = startingObjects(cuisine).filter(isKitchen).find((o) => placementStatus(blocked, blockedHost.id, o.x, o.z).ok);
    if (target) {
      Object.assign(blockedHost, { x: target.x, z: target.z });
      if (validateLayout(withNewKitchen(blocked)).ok) throw new Error(`Blocked migration fixture did not block ${cuisine}`);
      checkLoad(blocked, updatedSave(blocked), `${cuisine} custom host blocks the new kitchen`);
      blockedLayouts++;
    }

    const story = serialize(newState({ cuisine, mode: 'story' }));
    story.v = 3;
    checkLoad(story, updatedSave(story), `${cuisine} Story floor`);
    story.building = { width: 20, height: 15, divider: { from: 1, to: 12 } };
    story.objects = structuredClone(old.objects);
    story.seq = old.seq;
    checkLoad(story, updatedSave(story), `${cuisine} legacy Story floor`);
  }
  if (!blockedLayouts) throw new Error('No saved layout checked the blocked kitchen migration');
  console.log('checked host and kitchen save repairs, contents, custom floors, version gates, Story, and reloads');
}

const itemsMod = await import('../src/sim/items.js');
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  Math.random = seededRandom(20261018);
  verifyStartingLayouts();
  verifyLayoutSaves();
  cookEveryDish();
  const only = process.argv[2];
  const days = +(process.argv[3] || 3);
  for (const c of only ? [only] : CUISINE_ORDER) runCuisine(c, days);
}
