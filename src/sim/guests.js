// Parties: arrival, the queue, seating, ordering, eating, paying, reviews.
import { CFG } from '../config.js';
import { QUEUE_SPOTS, FRONT_DOOR } from '../data/layout.js';
import { ING } from '../data/ingredients.js';
import { dishById, drinkById, dishVeg, courseSlot, repLevel, nextId } from './state.js';
import { findPath, seatsOf, walkable } from './world.js';
import { availableUnits, menuItemsOn } from './economy.js';
import { matchDish, plateQuality, itemCost } from './items.js';

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const round2 = (v) => Math.round(v * 100) / 100;

const SKIN = [0xf3d2b8, 0xe8b894, 0xd09a70, 0xa8714a, 0x7a4e30, 0x5a3820];
const HAIR = [0x2a1e16, 0x4a3020, 0x8a5a2a, 0xd8b060, 0xb04a24, 0x6a6a6a, 0x1a1a22, 0xe8e0d0];
const SHIRT = [0x3a6ea8, 0xc8503a, 0x4a8a5a, 0xe0a83a, 0x7a4a8a, 0x2a2a2e, 0xe8e2d4, 0x5ab0c0, 0xd86a8a, 0x8a6a4a, 0x40506a];
const FIRST = ['Ava', 'Ben', 'Cleo', 'Dev', 'Elena', 'Finn', 'Grace', 'Hugo', 'Iris', 'Jules', 'Kai', 'Lena', 'Marco', 'Nia', 'Omar', 'Priya', 'Quinn', 'Rosa', 'Sam', 'Tess', 'Uma', 'Vic', 'Wes', 'Yara', 'Zoe', 'Luis', 'Mei', 'Theo', 'Hana', 'Owen'];

export function guestLook(critic = false) {
  return {
    skin: pick(SKIN), hair: pick(HAIR), shirt: critic ? 0x2a2a30 : pick(SHIRT), pants: pick([0x2a3040, 0x3a3a3a, 0x5a4a3a, 0x2a4a6a, 0x6a5a48]),
    style: (Math.random() * 4) | 0, h: rand(0.92, 1.06), critic,
  };
}

// ------------------------------------------------------------ movement

function goTo(sim, g, x, z) {
  const path = findPath(sim.grid, g.x, g.z, x, z);
  g.path = path || [];
  g.tx = x; g.tz = z;
}

function moveGuest(g, dt, speed) {
  let budget = speed * dt;
  while (budget > 0) {
    let target = g.path.length ? g.path[0] : (g.tx != null ? { x: g.tx, z: g.tz } : null);
    if (!target) break;
    const dx = target.x - g.x, dz = target.z - g.z;
    const d = Math.hypot(dx, dz);
    if (d < 1e-3) {
      if (g.path.length) g.path.shift(); else { g.tx = null; g.tz = null; }
      continue;
    }
    const step = Math.min(d, budget);
    g.x += (dx / d) * step;
    g.z += (dz / d) * step;
    g.rot = Math.atan2(dx, dz);
    budget -= step;
    g.moving = true;
    if (step >= d) {
      if (g.path.length) g.path.shift(); else { g.tx = null; g.tz = null; }
    }
  }
}

function arrived(g) { return !g.path.length && g.tx == null; }

// ------------------------------------------------------------ spawning

function rollSize(maxSeats) {
  const r = Math.random();
  let s = r < 0.16 ? 1 : r < 0.62 ? 2 : r < 0.8 ? 3 : 4;
  return Math.min(s, maxSeats);
}

export function spawnParty(sim, opts = {}) {
  const S = sim.state;
  const waiting = S.parties.filter((p) => p.state === 'entering' || p.state === 'waiting');
  if (waiting.length >= CFG.queueMax) { S.today.turnedAway++; return null; }
  const maxSeats = Math.max(...S.objects.filter((o) => o.type === 'table').map((t) => t.seats), 2);
  const critic = opts.critic ?? (S.day >= 3 && Math.random() < 0.035);
  const size = critic ? 1 : opts.size || rollSize(maxSeats);
  const r = Math.random();
  const kind = critic ? 'critic' : r < 0.3 ? 'budget' : r < 0.8 ? 'regular' : 'foodie';
  const decor = (S.upgrades.decor1 ? 4 : 0) + (S.upgrades.decor2 ? 4 : 0) + (S.upgrades.decor3 ? 4 : 0);
  const party = {
    id: nextId(S, 'p'), size, kind, state: 'entering', t: 0, mood: CFG.party.startMood + decor,
    guests: [], table: null, leader: null, items: [], drinks: [], ticket: 0, workP: 0,
    arrivedAt: sim.time, seatedAt: 0, orderedAt: 0, servedAt: 0, notes: [], spot: -1,
    name: pick(FIRST) + ' ' + String.fromCharCode(65 + ((Math.random() * 26) | 0)) + '.',
  };
  for (let i = 0; i < size; i++) {
    party.guests.push({
      id: party.id + 'g' + i, x: FRONT_DOOR.x + 0.5 + rand(-0.2, 0.2), z: FRONT_DOOR.z + 0.4, rot: Math.PI,
      path: [], tx: null, tz: null, seat: -1, look: guestLook(critic && i === 0), veg: Math.random() < 0.12,
      eating: false,
    });
  }
  S.parties.push(party);
  S.today.parties++;
  S.today.covers += size;
  assignQueue(sim);
  sim.emit({ type: 'sfx', name: 'door', x: FRONT_DOOR.x, z: FRONT_DOOR.z });
  if (critic) sim.emit({ type: 'toast', text: 'A food critic just walked in. Make it count.', kind: 'warn' });
  return party;
}

/** Gives every waiting party a queue spot in arrival order. */
function assignQueue(sim) {
  const q = sim.state.parties.filter((p) => p.state === 'entering' || p.state === 'waiting');
  q.forEach((p, i) => {
    if (p.spot === i) return;
    p.spot = i;
    const s = QUEUE_SPOTS[Math.min(i, QUEUE_SPOTS.length - 1)];
    p.guests.forEach((g, k) => {
      const ox = ((k % 2) - 0.5) * 0.36, oz = (k >> 1) * 0.3 - 0.15;
      goTo(sim, g, s.x + ox, s.z + oz);
    });
  });
  sim.state.today.peakQueue = Math.max(sim.state.today.peakQueue, q.length);
}

// ------------------------------------------------------------ actions from players

export function waitingParty(state) {
  return state.parties.find((p) => p.state === 'waiting' || p.state === 'entering') || null;
}

export function followingParty(state, pid) {
  return state.parties.find((p) => p.state === 'following' && p.leader === pid) || null;
}

export function greet(sim, pid, dry) {
  const S = sim.state;
  if (followingParty(S, pid)) return null;
  const p = waitingParty(S);
  if (!p) return null;
  if (dry) return `Greet party of ${p.size}`;
  p.state = 'following';
  p.leader = pid;
  p.t = 0;
  p.spot = -1;
  p.mood = Math.min(100, p.mood + 3);
  p.queued = sim.time - p.arrivedAt;
  assignQueue(sim);
  sim.emit({ type: 'sfx', name: 'greet', x: p.guests[0].x, z: p.guests[0].z });
  return 'greet';
}

export function canSeat(table, party) {
  return !table.party && !table.dirty && table.seats >= party.size;
}

export function seatAt(sim, pid, table, dry) {
  const S = sim.state;
  const p = followingParty(S, pid);
  if (!p) return null;
  if (table.party) return dry ? { blocked: 'Table is taken' } : null;
  if (table.dirty) return dry ? { blocked: 'Clear the dirty plates first' } : null;
  if (table.seats < p.size) return dry ? { blocked: `Party of ${p.size} needs a bigger table` } : null;
  if (dry) return `Seat party at table ${table.num}`;
  p.state = 'seating';
  p.t = 0;
  p.table = table.id;
  p.leader = null;
  p.seatedAt = sim.time;
  table.party = p.id;
  table.plates = 0;
  const seats = seatsOf(table);
  const order = [...seats.keys()].sort(() => Math.random() - 0.5);
  p.guests.forEach((g, i) => {
    g.seat = order[i];
    const s = seats[g.seat];
    goTo(sim, g, s.x, s.z);
  });
  if (p.size < table.seats - 1 && table.seats === 4) p.notes.push('roomy');
  sim.emit({ type: 'sfx', name: 'seat', x: table.x + 1, z: table.z + 1 });
  return 'seat';
}

function weightFor(state, guest, kind, dish, menuItem) {
  if (guest.veg && !dishVeg(dish)) return 0;
  const ratio = dish.fair / menuItem.price;
  const sens = kind === 'budget' ? 2.6 : kind === 'foodie' ? 0.7 : kind === 'critic' ? 0.4 : 1.5;
  const ap = kind === 'foodie' || kind === 'critic' ? Math.pow(dish.appeal, 2.2) : Math.pow(dish.appeal, 1.5);
  if (menuItem.price / dish.fair > 2.2) return 0;
  return ap * Math.pow(ratio, sens);
}

function choose(state, guest, kind, items) {
  let total = 0;
  const w = items.map((m) => { const x = weightFor(state, guest, kind, dishById(state, m.id), m); total += x; return x; });
  if (total <= 0) return null;
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i++) { r -= w[i]; if (r <= 0) return items[i]; }
  return items[items.length - 1];
}

/** Menu items guests can order right now (unlocked, on, and in stock). */
export function orderable(state, slot) {
  const units = availableUnits(state);
  return menuItemsOn(state, slot).filter((m) => dishById(state, m.id).comps.every(([ing]) => (units[ing] || 0) > 0));
}

function pickDrink(state) {
  const on = state.menu.drinks.filter((d) => d.on);
  if (!on.length) return null;
  const w = on.map((m) => { const d = drinkById(state, m.id); return Math.pow(d.price / m.price, 1.6); });
  let r = Math.random() * w.reduce((s, x) => s + x, 0);
  for (let i = 0; i < on.length; i++) { r -= w[i]; if (r <= 0) return on[i]; }
  return on[0];
}

export function takeOrder(sim, party, pid) {
  const S = sim.state;
  const mains = orderable(S, 'main'), starters = orderable(S, 'starter');
  const items = [], drinks = [];
  let noVeg = false, tooPricey = 0;
  for (const g of party.guests) {
    const m = choose(S, g, party.kind, mains);
    if (m) items.push({ id: m.id, price: m.price, served: false, q: null, guest: g.id });
    else {
      if (g.veg && mains.length) noVeg = true;
      else if (mains.length) tooPricey++;
    }
    const pStarter = party.kind === 'foodie' || party.kind === 'critic' ? 0.6 : party.kind === 'budget' ? 0.22 : 0.4;
    if (starters.length && (Math.random() < pStarter || !m)) {
      const s = choose(S, g, party.kind, starters);
      if (s) items.push({ id: s.id, price: s.price, served: false, q: null, guest: g.id });
    }
    if (Math.random() < (party.kind === 'budget' ? 0.65 : 0.85)) {
      const d = pickDrink(S);
      if (d) drinks.push({ id: d.id, price: d.price, served: false });
    }
  }
  if (noVeg) { party.notes.push('noveg'); party.mood -= 10; }
  if (tooPricey) { party.notes.push('pricey'); party.mood -= 6 * tooPricey; }
  if (!items.length) {
    // Nothing they want: they leave politely, a little annoyed.
    party.notes.push(mains.length ? 'pricey' : 'soldout');
    party.mood = Math.min(party.mood, 30);
    sim.emit({ type: 'toast', text: `Table ${tableNum(S, party)} found nothing they wanted and left.`, kind: 'bad' });
    leave(sim, party, false);
    return;
  }
  party.items = items;
  party.drinks = drinks;
  party.state = 'waitingFood';
  party.t = 0;
  party.orderedAt = sim.time;
  party.workP = 0;
  party.server = pid;
  S.ticketSeq = (S.ticketSeq || 0) + 1;
  party.ticket = S.ticketSeq;
  party.grace = CFG.party.foodGrace + CFG.party.gracePerDish * items.length;
  sim.emit({ type: 'sfx', name: 'ticket' });
  sim.emit({ type: 'ticket', party: party.id });
}

function takeDessertOrder(sim, party) {
  const S = sim.state;
  const desserts = orderable(S, 'dessert');
  const items = [];
  for (const g of party.guests) {
    if (Math.random() < 0.6 || (!items.length && g === party.guests[party.guests.length - 1])) {
      const d = choose(S, g, party.kind, desserts);
      if (d) items.push({ id: d.id, price: d.price, served: false, q: null, guest: g.id, dessert: true });
    }
  }
  if (!items.length) { toPaying(sim, party); return; }
  party.items.push(...items);
  party.state = 'dessertWait';
  party.t = 0;
  party.workP = 0;
  party.dessertAt = sim.time;
  party.grace = 60 + CFG.party.gracePerDish * items.length;
  S.ticketSeq = (S.ticketSeq || 0) + 1;
  party.ticket = S.ticketSeq;
  sim.emit({ type: 'sfx', name: 'ticket' });
  sim.emit({ type: 'ticket', party: party.id });
}

export function tableNum(state, party) {
  const t = state.objects.find((o) => o.id === party.table);
  return t ? t.num : '?';
}

/** Space held at a table: take the order or settle the bill. */
export function tableWork(sim, pid, table, dt, dry) {
  const S = sim.state;
  const p = S.parties.find((q) => q.id === table.party);
  if (!p) return null;
  if (p.state === 'ordering' || p.state === 'dessertReady') {
    if (dry) return p.state === 'ordering' ? 'Take order' : 'Take dessert order';
    p.workP += dt / CFG.work.order;
    if (p.workP >= 1) {
      if (p.state === 'ordering') takeOrder(sim, p, pid); else takeDessertOrder(sim, p);
    }
    return 'work';
  }
  if (p.state === 'paying') {
    if (dry) return 'Settle the bill';
    p.workP += dt / CFG.work.pay;
    if (p.workP >= 1) pay(sim, p, pid);
    return 'work';
  }
  return null;
}

/** E at a table holding a plate or a drink. */
export function serveTo(sim, pid, table, item, dry) {
  const S = sim.state;
  const p = S.parties.find((q) => q.id === table.party);
  if (!p) return null;
  if (item.k === 'drink') {
    const d = p.drinks.find((x) => !x.served && x.id === item.id);
    if (!d) return dry ? { blocked: p.drinks.some((x) => !x.served) ? "They didn't order that drink" : 'No drinks needed here' } : null;
    if (dry) return 'Serve ' + drinkById(S, item.id).name.toLowerCase();
    d.served = true;
    S.today.cogsDrink = round2(S.today.cogsDrink + (item.cost || 0));
    S.today.soldDrinks[item.id] = (S.today.soldDrinks[item.id] || 0) + 1;
    p.mood = Math.min(100, p.mood + 3);
    sim.emit({ type: 'sfx', name: 'serve', x: table.x + 1, z: table.z + 1 });
    return 'served';
  }
  if (item.k !== 'plate' || !item.items.length) return null;
  if (!['waitingFood', 'dessertWait', 'eating', 'dessertEat'].includes(p.state)) return dry ? { blocked: 'They are not waiting for food' } : null;
  const open = p.items.filter((x) => !x.served);
  if (!open.length) return dry ? { blocked: 'Their order is complete' } : null;
  const id = matchDish(S, item, [...new Set(open.map((x) => x.id))]);
  if (!id) return dry ? { blocked: `Table ${table.num} didn't order that` } : null;
  const dish = dishById(S, id);
  if (dry) return `Serve ${dish.name.toLowerCase()}`;
  const line = open.find((x) => x.id === id);
  const { q, cold } = plateQuality(item);
  line.served = true;
  line.q = q;
  line.cold = cold;
  const cost = itemCost(item);
  S.today.cogsFood = round2(S.today.cogsFood + cost);
  const sold = S.today.sold[id] || (S.today.sold[id] = { n: 0, rev: 0, cost: 0 });
  sold.n++; sold.rev = round2(sold.rev + line.price); sold.cost = round2(sold.cost + cost);
  if (cold) { S.today.cold++; p.notes.push('cold:' + id); p.mood -= 6; }
  else p.mood = Math.min(100, p.mood + (q > 0.95 ? 5 : 3));
  if (q < 0.8 && !cold) p.notes.push('overdone:' + id);
  table.plates = (table.plates || 0) + 1;
  table.served = table.served || [];
  table.served.push({ dish: id, tpl: dish.tpl, seat: guestSeat(p, line.guest) });
  sim.emit({ type: 'sfx', name: 'serve', x: table.x + 1, z: table.z + 1 });
  if (!p.items.some((x) => !x.served)) {
    const waited = sim.time - (p.state === 'dessertWait' ? p.dessertAt : p.orderedAt);
    S.today.ticketTimes.push(waited);
    if (waited < p.grace * 0.6) p.notes.push('fast');
    if (p.state === 'waitingFood') { p.state = 'eating'; p.t = 0; p.eatFor = rand(...CFG.party.eat); }
    else if (p.state === 'dessertWait') { p.state = 'dessertEat'; p.t = 0; p.eatFor = rand(...CFG.party.dessertEat); }
    p.guests.forEach((g) => { g.eating = true; });
  }
  return 'served';
}

function guestSeat(p, gid) {
  const g = p.guests.find((x) => x.id === gid);
  return g ? g.seat : 0;
}

/** Removes one item from a party's order (the kitchen can't make it). */
export function compItem(sim, partyId, index) {
  const S = sim.state;
  const p = S.parties.find((q) => q.id === partyId);
  if (!p) return false;
  const open = p.items.filter((x) => !x.served);
  const line = open[index];
  if (!line) return false;
  p.items.splice(p.items.indexOf(line), 1);
  p.mood -= 8;
  p.notes.push('comped');
  if (!p.items.some((x) => !x.served)) {
    if (!p.items.length) { leave(sim, p, false); return true; }
    if (p.state === 'waitingFood') { p.state = 'eating'; p.t = 0; p.eatFor = rand(...CFG.party.eat) * 0.7; }
    else if (p.state === 'dessertWait') { p.state = 'dessertEat'; p.t = 0; p.eatFor = rand(...CFG.party.dessertEat); }
  }
  return true;
}

function toPaying(sim, party) {
  party.state = 'paying';
  party.t = 0;
  party.workP = 0;
  sim.emit({ type: 'sfx', name: 'check' });
}

function clearPlates(sim, party) {
  const t = sim.state.objects.find((o) => o.id === party.table);
  if (!t) return;
  t.dirty = (t.dirty || 0) + (t.plates || 0);
  t.plates = 0;
  t.served = [];
  party.guests.forEach((g) => { g.eating = false; });
}

function pay(sim, party, pid) {
  const S = sim.state;
  const food = party.items.filter((x) => x.served).reduce((s, x) => s + x.price, 0);
  const drinks = party.drinks.filter((x) => x.served).reduce((s, x) => s + x.price, 0);
  const bill = round2(food + drinks);
  S.cash = round2(S.cash + bill);
  S.today.foodRev = round2(S.today.foodRev + food);
  S.today.drinkRev = round2(S.today.drinkRev + drinks);
  let tip = 0;
  if (pid && party.kind !== 'critic') {
    const m = clamp(party.mood, 0, 100) / 100;
    const rate = clamp(0.04 + 0.2 * m + (S.upgrades.decor3 ? 0.02 : 0), 0, 0.26);
    tip = round2(bill * rate);
    const pl = S.players[pid];
    const who = pl ? pl.name : 'Chef';
    S.today.tips[who] = round2((S.today.tips[who] || 0) + tip);
    if (pl) pl.tips = round2((pl.tips || 0) + tip);
    S.tipJar = S.tipJar || {};
    S.tipJar[who] = round2((S.tipJar[who] || 0) + tip);
  }
  party.paid = bill;
  party.tip = tip;
  sim.emit({ type: 'sfx', name: 'cash' });
  sim.emit({ type: 'float', text: `+$${bill.toFixed(2)}` + (tip ? `  tip $${tip.toFixed(2)}` : ''), party: party.id, to: pid });
  leave(sim, party, true);
}

/** The party heads for the door. Writes the review. */
export function leave(sim, party, paid) {
  const S = sim.state;
  const table = S.objects.find((o) => o.id === party.table);
  if (table) {
    table.dirty = (table.dirty || 0) + (table.plates || 0);
    table.plates = 0;
    table.served = [];
    table.party = null;
  }
  if (!paid) {
    // Food that was served but never paid for still cost us.
    const served = party.items.filter((x) => x.served);
    if (served.length || party.state === 'waitingFood' || party.state === 'waiting' || party.state === 'ordering') S.today.walkouts++;
  }
  review(sim, party, paid);
  party.state = 'leaving';
  party.t = 0;
  party.leader = null;
  party.guests.forEach((g) => { g.eating = false; goTo(sim, g, FRONT_DOOR.x + 0.5, FRONT_DOOR.z + 0.5); });
  assignQueue(sim);
}

const LINES = {
  great: ['The {dish} was perfect. Already planning our next visit.', 'Best {dish} in town, no contest.', 'Warm service and a fantastic {dish}.', 'Everything came out fast and delicious.'],
  good: ['Solid {dish}, friendly place.', 'Nice spot, good {dish}. Would come back.', 'Good food, fair prices.'],
  meh: ['The {dish} was fine. Nothing special.', 'Decent, but it took a while.', 'Okay meal, a bit slow.'],
  cold: ['My {dish} arrived lukewarm.', 'Food came out cold. Disappointing.'],
  slow: ['We waited forever for our food.', 'Took way too long to get our order.'],
  queue: ['Waited ages just to get a table.', 'Nobody seated us for a long time.'],
  pricey: ['Pricey for what it is.', 'Way too expensive for a casual meal.'],
  value: ['Great value for the money.', 'Generous plates at a fair price.'],
  noveg: ['Almost nothing on the menu for vegetarians.'],
  soldout: ['Half the menu was sold out.'],
  walkout: ['We gave up and left. Never got our food.', 'Walked out after waiting forever.'],
  overdone: ['The {dish} was overcooked.'],
  comped: ['They ran out of what I ordered.'],
  fast: ['Lightning fast kitchen!'],
};

function review(sim, party, paid) {
  const S = sim.state;
  const served = party.items.filter((x) => x.served);
  const q = served.length ? served.reduce((s, x) => s + (x.q ?? 1), 0) / served.length : 0.5;
  let value = 1;
  if (party.items.length) {
    value = party.items.reduce((s, x) => s + dishById(S, x.id).fair / x.price, 0) / party.items.length;
  }
  let stars;
  const m = clamp(party.mood, 0, 100) / 100;
  if (!paid && !served.length) stars = 1;
  else {
    const score = clamp(0.5 * m + 0.3 * q + 0.2 * (clamp(value, 0, 1.2) / 1.2), 0, 1);
    stars = clamp(Math.round(1 + 4 * Math.pow(score, 1.3)), 1, 5);
    if (!paid) stars = Math.min(stars, 2);
  }
  const dishName = served.length ? dishById(S, pick(served).id).name.toLowerCase() : 'food';
  const notes = party.notes;
  let pool;
  if (!paid && !served.length) pool = (party.queued || 0) > 0 && !party.seatedAt ? LINES.queue : LINES.walkout;
  else if (notes.includes('soldout')) pool = LINES.soldout;
  else if (notes.some((n) => n.startsWith('cold'))) pool = LINES.cold;
  else if (notes.includes('noveg')) pool = LINES.noveg;
  else if (stars <= 2 && (party.queued || 0) > CFG.party.queuePatience) pool = LINES.queue;
  else if (stars <= 3 && party.servedLate) pool = LINES.slow;
  else if (notes.includes('pricey') || value < 0.8) pool = LINES.pricey;
  else if (notes.some((n) => n.startsWith('overdone'))) pool = LINES.overdone;
  else if (notes.includes('comped')) pool = LINES.comped;
  else if (stars >= 5) pool = notes.includes('fast') && Math.random() < 0.4 ? LINES.fast : LINES.great;
  else if (stars === 4) pool = value > 1.15 ? LINES.value : LINES.good;
  else pool = LINES.meh;
  const text = pick(pool).replace('{dish}', dishName);
  const weight = (party.kind === 'critic' ? 3 : 1) * Math.sqrt(party.size);
  const pts = { 1: -6, 2: -3, 3: 1, 4: 4, 5: 7 }[stars] * weight;
  S.rep.points = Math.round((S.rep.points + pts) * 10) / 10;
  if (S.rep.points < 0) S.rep.points = 0;
  S.rep.ratings.push(stars);
  if (S.rep.ratings.length > CFG.rep.window) S.rep.ratings.shift();
  S.today.ratings.push(stars);
  const r = { day: S.day, stars, text, name: party.name, critic: party.kind === 'critic', size: party.size };
  S.reviews.unshift(r);
  if (S.reviews.length > 30) S.reviews.pop();
  sim.emit({ type: 'review', review: r });
  const lv = repLevel(S.rep.points);
  if (lv > S.rep.level) {
    S.rep.level = lv;
    sim.onLevelUp(lv);
  }
}

// ------------------------------------------------------------ per tick

export function updateParties(sim, dt) {
  const S = sim.state;
  const P = CFG.party;
  const speed = P.walkSpeed;
  for (const p of S.parties) {
    p.t += dt;
    const drain = (rate = 1) => { p.mood -= P.drain * rate * dt; };
    switch (p.state) {
      case 'entering':
        if (p.guests.every(arrived)) p.state = 'waiting';
        break;
      case 'waiting': {
        const waited = sim.time - p.arrivedAt;
        if (waited > P.queuePatience) p.mood -= P.queueDrain * dt;
        if (p.mood <= 0) { p.queued = waited; S.today.walkouts++; review(sim, p, false); sendHome(sim, p); sim.emit({ type: 'toast', text: 'A party gave up waiting for a table.', kind: 'bad' }); }
        break;
      }
      case 'following': {
        const pl = S.players[p.leader];
        if (!pl) { p.state = 'waiting'; p.leader = null; assignQueue(sim); break; }
        if (p.t > 45) drain(0.6);
        p.retarget = (p.retarget || 0) - dt;
        if (p.retarget <= 0) {
          p.retarget = 0.35;
          const fx = Math.sin(pl.rot), fz = Math.cos(pl.rot);
          p.guests.forEach((g, i) => {
            const back = 0.85 + i * 0.5;
            let tx = pl.x - fx * back, tz = pl.z - fz * back;
            const tix = Math.floor(tx), tiz = Math.floor(tz);
            if (!walkable(sim.grid, tix, tiz)) { tx = pl.x; tz = pl.z; }
            if (Math.hypot(tx - g.x, tz - g.z) > 0.5) goTo(sim, g, tx, tz);
          });
        }
        break;
      }
      case 'seating':
        if (p.guests.every(arrived) || p.t > 10) {
          const t = S.objects.find((o) => o.id === p.table);
          if (t) {
            const seats = seatsOf(t);
            p.guests.forEach((g) => { const s = seats[g.seat]; g.x = s.x; g.z = s.z; g.rot = s.face; g.path = []; g.tx = null; });
          }
          p.state = 'browsing';
          p.t = 0;
          p.browseFor = rand(...P.browse);
        }
        break;
      case 'browsing':
        if (p.t >= p.browseFor) { p.state = 'ordering'; p.t = 0; p.workP = 0; sim.emit({ type: 'sfx', name: 'ready' }); }
        break;
      case 'ordering':
      case 'dessertReady':
        if (p.t > P.orderPatience) drain(1);
        if (p.mood <= 0) { if (p.state === 'ordering') { leave(sim, p, false); sim.emit({ type: 'toast', text: 'A table left before anyone took their order.', kind: 'bad' }); } else toPaying(sim, p); }
        break;
      case 'waitingFood':
      case 'dessertWait': {
        const late = p.t > p.grace;
        if (late) { p.servedLate = true; const drinksDone = p.drinks.every((d) => d.served); drain(drinksDone ? 0.7 : 1); }
        if (p.drinks.some((d) => !d.served) && p.t > P.drinkPatience) drain(0.3);
        if (p.mood <= 0) {
          if (p.state === 'waitingFood') { leave(sim, p, false); sim.emit({ type: 'toast', text: `Table ${tableNum(S, p)} walked out!`, kind: 'bad' }); }
          else { compRemaining(p); clearPlates(sim, p); toPaying(sim, p); }
        }
        break;
      }
      case 'eating':
      case 'dessertEat':
        p.mood = Math.min(100, p.mood + 0.05 * dt);
        if (p.t >= p.eatFor) {
          clearPlates(sim, p);
          const desserts = orderable(S, 'dessert');
          const want = p.state === 'eating' && desserts.length && p.mood > 45 && Math.random() < (p.kind === 'foodie' || p.kind === 'critic' ? 0.6 : p.kind === 'budget' ? 0.2 : 0.4);
          if (want) { p.state = 'dessertReady'; p.t = 0; p.workP = 0; sim.emit({ type: 'sfx', name: 'ready' }); }
          else toPaying(sim, p);
        }
        break;
      case 'paying':
        if (p.t > P.payPatience) drain(0.8);
        if (p.mood <= 5 || p.t > P.payPatience * 3) {
          // They leave cash on the table without a tip.
          pay(sim, p, null);
          sim.emit({ type: 'toast', text: `Table ${tableNum(S, p)} left cash and no tip.`, kind: 'warn' });
        }
        break;
      case 'leaving':
        if (p.guests.every(arrived) || p.t > 20) p.gone = true;
        break;
    }
    for (const g of p.guests) {
      g.moving = false;
      if (p.state !== 'browsing' && p.state !== 'ordering' && !['waitingFood', 'eating', 'dessertReady', 'dessertWait', 'dessertEat', 'paying'].includes(p.state)) moveGuest(g, dt, speed);
    }
  }
  const before = S.parties.length;
  S.parties = S.parties.filter((p) => !p.gone);
  if (S.parties.length !== before) assignQueue(sim);
}

function compRemaining(p) {
  p.items = p.items.filter((x) => x.served);
}

export function sendHome(sim, p) {
  p.state = 'leaving';
  p.t = 0;
  p.guests.forEach((g) => goTo(sim, g, FRONT_DOOR.x + 0.5, FRONT_DOOR.z + 0.5));
  assignQueue(sim);
}

/** Arrival times (game minutes) for today, spread by the hourly curve with a minimum gap. */
export function buildSchedule(expected, players) {
  const T = CFG.traffic;
  const n = Math.max(3, Math.round(expected + (Math.random() - 0.5) * 2));
  const H = T.hourly;
  const hours = (CFG.doorsLock - CFG.serviceStart) / 60;
  const w = H.map((x, i) => x * Math.max(0, Math.min(1, hours - i)));
  const sum = w.reduce((s, x) => s + x, 0);
  const at = (u) => {
    let acc = 0;
    for (let i = 0; i < w.length; i++) {
      if (acc + w[i] >= u * sum) return CFG.serviceStart + (i + (u * sum - acc) / w[i]) * 60;
      acc += w[i];
    }
    return CFG.doorsLock - 1;
  };
  const gap = players <= 1 ? T.minGap.solo : T.minGap.duo;
  const out = [];
  for (let i = 0; i < n; i++) out.push(at((i + 0.15 + Math.random() * 0.7) / n));
  out.sort((a, b) => a - b);
  for (let i = 1; i < out.length; i++) if (out[i] - out[i - 1] < gap) out[i] = out[i - 1] + gap * (0.85 + Math.random() * 0.3);
  return out.filter((t) => t < CFG.doorsLock).map((t) => Math.round(t * 10) / 10);
}
