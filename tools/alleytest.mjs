import assert from 'node:assert/strict';
import { Sim } from '../src/sim/sim.js';
import { newState, serialize, deserialize, addTrash } from '../src/sim/state.js';
import { actE, actQ, actSpace, describe, findTarget, takeFromStore, takeDrink, cleanup } from '../src/sim/kitchen.js';
import { ingItem, itemLabel, itemSig, stationAccepts } from '../src/sim/items.js';
import { footprint, walkable, validateLayout } from '../src/sim/world.js';
import { CUISINE_ORDER } from '../src/data/cuisines.js';
import { ING } from '../src/data/ingredients.js';
import { CFG } from '../src/config.js';
import { ALLEY_OBJECTS, ALLEY_OBSTACLES, BACK_DOOR, TRASH_CAPACITY, SMOKE_SECONDS, SMOKE_BOOST_SECONDS, hasSmokeBoost, movementMultiplier, cookingMultiplier, playerArea } from '../src/data/alley.js';
import { spawnPoints } from '../src/data/layout.js';

function game(cuisine = 'southern', mode = 'story') {
  const sim = new Sim(newState({ cuisine, mode }));
  sim.addPlayer('A', { name: 'A' });
  sim.drain();
  return sim;
}

function face(sim, target, pid = 'A') {
  const p = sim.state.players[pid], grid = sim.gridFor(playerArea(p));
  const f = footprint(target);
  for (let dz = -1; dz <= f.h; dz++) for (let dx = -1; dx <= f.w; dx++) {
    if ((dx >= 0 && dx < f.w && dz >= 0 && dz < f.h) || ((dx < 0 || dx >= f.w) && (dz < 0 || dz >= f.h))) continue;
    const x = f.x + dx, z = f.z + dz;
    if (!walkable(grid, x, z)) continue;
    const tx = Math.max(f.x, Math.min(x, f.x + f.w - 1)) + 0.5;
    const tz = Math.max(f.z, Math.min(z, f.z + f.h - 1)) + 0.5;
    sim.setPose(pid, x + 0.5, z + 0.5, Math.atan2(tx - x - 0.5, tz - z - 0.5));
    if (findTarget(sim.state, grid, p)?.id === target.id) return;
  }
  assert.fail(`Cannot face ${target.id}`);
}

function use(sim, target, pid = 'A') {
  face(sim, target, pid);
  return actE(sim, pid, false);
}

const door = ALLEY_OBJECTS.find((o) => o.type === 'backdoor');
const dumpster = ALLEY_OBJECTS.find((o) => o.type === 'dumpster');
const smoke = ALLEY_OBJECTS.find((o) => o.type === 'smoking');

for (const cuisine of CUISINE_ORDER) for (const mode of ['story', 'arcade']) {
  const sim = game(cuisine, mode), S = sim.state, p = S.players.A;
  assert.equal(validateLayout(S).ok, true, `${cuisine} ${mode} layout`);
  face(sim, BACK_DOOR);
  assert.equal(describe(sim, 'A').e, 'Go outside');
  assert.equal(use(sim, BACK_DOOR), 'ok');
  assert.equal(p.area, 'alley');
  assert.equal(p.areaRev, 1);
  assert.ok(sim.drain().some((e) => e.type === 'areaChanged' && e.area === 'alley' && e.to === 'A'));
  assert.equal(use(sim, door), 'ok');
  assert.equal(p.area, 'restaurant');
  assert.equal(p.areaRev, 2);
  assert.equal(p.x, 1.5);
  assert.equal(p.z, 3.5);
}

{
  const sim = game(), S = sim.state, p = S.players.A;
  const counter = S.objects.find((o) => o.type === 'counter');
  counter.x = 1; counter.z = 3;
  assert.equal(validateLayout(S).reason, 'Keep the back door clear.');
  sim.rebuild();
  // A room from an old save can still return to a nearby clear cell.
  p.area = 'alley';
  use(sim, door);
  assert.equal(p.area, 'restaurant');
  assert.equal(walkable(sim.grid, Math.floor(p.x), Math.floor(p.z)), true);
}

{
  const sim = game(), S = sim.state, p = S.players.A;
  S.parties.push({ id: 'following', leader: 'A', state: 'following' });
  face(sim, BACK_DOOR);
  assert.equal(describe(sim, 'A').e.blocked, 'Seat your guests first');
  assert.equal(actE(sim, 'A', false), null);
  assert.equal(p.area, 'restaurant');
  S.parties = [];
  use(sim, BACK_DOOR);
  const before = { x: p.x, z: p.z, rot: p.rot };
  sim.setPose('A', 3, 4, 0, 'restaurant', 0);
  sim.press('A', 'e', 'restaurant', 0);
  sim.setWork('A', true, 'restaurant', 0);
  assert.deepEqual({ x: p.x, z: p.z, rot: p.rot }, before);
  assert.equal(p.area, 'alley');
  assert.equal(p.space, false);
  sim.setPose('A', 0.9, 4.5, 0);
  assert.ok(p.x >= 1.3, 'Alley wall collision');
  const truck = ALLEY_OBSTACLES.find((o) => o.type === 'truck');
  sim.setPose('A', truck.x + 0.5, truck.z + 0.5, 0);
  assert.equal(walkable(sim.alleyGrid, Math.floor(p.x), Math.floor(p.z)), true, 'Truck collision');
  assert.equal(walkable(sim.alleyGrid, 1, 5), false, 'Crates block the floor');
  const store = S.objects.find((o) => o.type === 'fridge');
  assert.equal(actE(sim, 'A', false, store), null);
  assert.equal(actQ(sim, 'A', false), null);
  assert.equal(actSpace(sim, 'A', 1, false, S.objects.find((o) => o.type === 'board')), null);
  assert.equal(takeFromStore(sim, 'A', store.id, 'tomato'), false);
  assert.equal(takeDrink(sim, 'A', S.objects.find((o) => o.type === 'drinks').id, S.menu.drinks[0].id), false);
  assert.equal(sim.command('A', { c: 'ready', on: true }).ok, false);
  assert.equal(sim.command('A', { c: 'move', id: store.id, x: 3, z: 3 }).ok, false);
}

{
  const sim = game(), S = sim.state, p = S.players.A, bin = S.objects.find((o) => o.type === 'bin');
  for (let n = 0; n < TRASH_CAPACITY; n++) {
    p.hand = ingItem('tomato', 'raw', 0.25);
    assert.equal(use(sim, bin), 'ok');
  }
  assert.equal(bin.trash, TRASH_CAPACITY);
  assert.equal(S.today.waste.binned, TRASH_CAPACITY * 0.25);
  p.hand = ingItem('tomato', 'raw', 0.25);
  face(sim, bin);
  assert.match(describe(sim, 'A').e.blocked, /Bin full/);
  actE(sim, 'A', false);
  assert.ok(p.hand, 'A full bin cannot delete food');
  p.hand = null;
  assert.equal(use(sim, bin), 'ok');
  assert.deepEqual(p.hand, { k: 'trash', n: TRASH_CAPACITY });
  assert.equal(bin.trash, 0);
  assert.equal(itemLabel(S, p.hand), 'Trash bag');
  assert.match(itemSig(p.hand), /^trash:/);
  assert.equal(stationAccepts('counter', p.hand), false);
  const counter = S.objects.find((o) => o.type === 'counter');
  assert.equal(use(sim, counter), null);
  assert.equal(p.hand.k, 'trash');
  use(sim, BACK_DOOR);
  assert.equal(use(sim, dumpster), 'ok');
  assert.equal(p.hand, null);
  assert.ok(sim.drain().some((e) => e.type === 'sfx' && e.name === 'bin' && e.area === 'alley'));
  assert.equal(use(sim, dumpster), null, 'A second disposal has no bag');
  assert.equal(serialize(S).objects.find((o) => o.type === 'bin').trash, 0);
}

{
  const sim = game(), S = sim.state, p = S.players.A, bin = S.objects.find((o) => o.type === 'bin');
  const table = S.objects.find((o) => o.type === 'table');
  table.dirty = 3;
  use(sim, table);
  assert.equal(bin.trash, 3, 'Cleared tables make routine waste');
  addTrash(S, 100);
  assert.equal(bin.trash, TRASH_CAPACITY, 'Routine waste has a fixed capacity');
  p.hand = null;
  use(sim, bin);
  addTrash(S, TRASH_CAPACITY);
  sim.addPlayer('B', { name: 'B' });
  use(sim, bin, 'B');
  addTrash(S, TRASH_CAPACITY);
  const snapshot = serialize(S);
  assert.equal(snapshot.objects.find((o) => o.type === 'bin').trash, 3 * TRASH_CAPACITY);
  assert.equal(bin.trash, TRASH_CAPACITY, 'Saving does not change live trash');
  assert.equal(p.hand.k, 'trash');
  assert.equal(serialize(S).objects.find((o) => o.type === 'bin').trash, 3 * TRASH_CAPACITY);
  const loaded = deserialize(snapshot);
  assert.deepEqual(loaded.players, {});
  assert.equal(loaded.objects.find((o) => o.type === 'bin').trash, 3 * TRASH_CAPACITY);
  assert.equal(deserialize(loaded).objects.find((o) => o.type === 'bin').trash, 3 * TRASH_CAPACITY);
  sim.removePlayer('A');
  sim.removePlayer('A');
  assert.equal(bin.trash, 2 * TRASH_CAPACITY, 'Disconnect returns a bag once');
  cleanup(sim);
  assert.equal(bin.trash, 3 * TRASH_CAPACITY, 'Closing returns the other bag');
  addTrash(S, 1);
  assert.equal(bin.trash, 3 * TRASH_CAPACITY, 'Routine waste does not reduce returned bags');
}

{
  const sim = game(), S = sim.state, p = S.players.A;
  use(sim, BACK_DOOR);
  p.hand = { k: 'trash', n: TRASH_CAPACITY };
  assert.equal(use(sim, smoke), null);
  p.hand = null;
  const cash = S.cash, rep = S.rep.points, xp = S.xp;
  assert.equal(use(sim, smoke), 'ok');
  assert.equal(p.smoking.left, SMOKE_SECONDS);
  assert.equal(p.smokeBoostUntil, SMOKE_BOOST_SECONDS);
  assert.equal(movementMultiplier(S, p), 1.1);
  assert.equal(cookingMultiplier(S), 1 / 0.8);
  sim.step(2);
  assert.equal(p.smoking.left, SMOKE_SECONDS - 2);
  assert.equal(describe(sim, 'A').e, 'Put out cigarette');
  actE(sim, 'A', false, null);
  assert.equal(p.smoking, null, 'E stops smoking without a target');
  assert.equal(hasSmokeBoost(S, p), true, 'Putting out the cigarette keeps the boost');
  use(sim, smoke);
  assert.equal(p.smokeBoostUntil, S.t + SMOKE_BOOST_SECONDS, 'Lighting again refreshes the timer');
  const deadline = p.smokeBoostUntil;
  sim.setPose('A', p.x - 0.5, p.z, p.rot);
  assert.ok(p.smoking, 'Walking keeps the cigarette lit');
  use(sim, door);
  assert.equal(p.area, 'restaurant');
  assert.ok(p.smoking, 'A door action keeps the cigarette lit');
  assert.equal(p.smokeBoostUntil, deadline);
  const rack = S.objects.find((o) => o.type === 'rack');
  assert.equal(use(sim, rack), 'ok', 'Kitchen actions work while smoking');
  assert.equal(p.hand.k, 'plate');
  assert.ok(p.smoking);
  use(sim, rack);
  sim.step(SMOKE_SECONDS);
  assert.equal(p.smoking, null, 'Smoke timer ends');
  assert.equal(hasSmokeBoost(S, p), true, 'The boost lasts longer than the cigarette');
  assert.deepEqual([S.cash, S.rep.points, S.xp], [cash, rep, xp], 'Smoking does not give cash or XP');
  const beforePause = S.t;
  S.paused = true;
  sim.step(60);
  assert.equal(S.t, beforePause, 'Pause stops the boost clock');
  S.paused = false;
  use(sim, BACK_DOOR);
  use(sim, smoke);
  p.hand = { k: 'trash', n: TRASH_CAPACITY };
  const revision = p.areaRev;
  sim.endDay();
  assert.equal(p.area, 'restaurant');
  assert.equal(p.areaRev, revision + 1);
  assert.equal(p.smoking, null);
  assert.equal(hasSmokeBoost(S, p), true, 'Closing keeps the boost timer');
  assert.equal(p.hand, null);
  assert.equal(S.objects.find((o) => o.type === 'bin').trash, TRASH_CAPACITY);
  assert.deepEqual({ x: p.x, z: p.z }, spawnPoints(S)[p.slot]);
  sim.nextDay();
  assert.equal(p.area, 'restaurant');
  assert.equal(hasSmokeBoost(S, p), true);
  sim.step(p.smokeBoostUntil - S.t);
  assert.equal(hasSmokeBoost(S, p), false, 'The boost expires after 300 simulation seconds');
  assert.equal(movementMultiplier(S, p), 1);
  assert.equal(cookingMultiplier(S), 1);
}

// A second smoker refreshes the shared effect but cannot multiply it again.
{
  const sim = game(), S = sim.state;
  sim.addPlayer('B', { name: 'B' });
  use(sim, BACK_DOOR);
  use(sim, smoke);
  use(sim, BACK_DOOR, 'B');
  use(sim, smoke, 'B');
  assert.equal(cookingMultiplier(S), 1.25);
  assert.equal(movementMultiplier(S, S.players.A), 1.1);
  assert.equal(movementMultiplier(S, S.players.B), 1.1);
  sim.removePlayer('A');
  assert.equal(cookingMultiplier(S), 1.25);
  sim.removePlayer('B');
  assert.equal(cookingMultiplier(S), 1);
  const copy = new Sim(deserialize(serialize(S)));
  const p = copy.addPlayer('A', { name: 'A' });
  assert.equal(hasSmokeBoost(copy.state, p), false, 'Loaded games start without live player effects');
}

// Every food station uses 80% of its normal duration. Knife upgrades still apply.
for (const type of ['board', 'pot', 'fryer', 'oven', 'pan', 'grill']) {
  for (const boosted of [false, true]) {
    for (const knife of type === 'board' ? [false, true] : [false]) {
      const sim = game('southern', 'arcade'), S = sim.state;
      if (boosted) { use(sim, BACK_DOOR); use(sim, smoke); use(sim, door); }
      if (knife) S.upgrades.knife = 1;
      const station = S.objects.find((o) => o.type === type);
      const [ing, data] = Object.entries(ING).find(([, data]) => data.steps.some((step) => step.at === type));
      const recipeStep = data.steps.find((step) => step.at === type);
      station.slot = ingItem(ing, recipeStep.from, data.cost);
      if (type === 'board') { face(sim, station); sim.setWork('A', true); }
      const duration = recipeStep.t * (boosted ? 0.8 : 1) / (knife ? CFG.chopSpeedKnife : 1);
      sim.step(duration - 0.001);
      assert.equal(station.slot.st, recipeStep.from, `${type} must not finish early`);
      sim.step(0.00101);
      assert.equal(station.slot.st, recipeStep.to, `${type} duration with boost=${boosted}, knife=${knife}`);
    }
  }
}

{
  const sim = game('southern', 'arcade'), S = sim.state, p = S.players.A;
  use(sim, BACK_DOOR); use(sim, smoke); use(sim, door);
  const grill = S.objects.find((o) => o.type === 'grill');
  grill.slot = ingItem('beef_patty', 'grilled', 1);
  const counter = S.objects.find((o) => o.type === 'counter');
  counter.slot = ingItem('beef_patty', 'grilled', 1);
  counter.slot.heat = 0;
  p.hand = ingItem('beef_patty', 'grilled', 1);
  p.hand.heat = 0;
  const sink = S.objects.find((o) => o.type === 'sink');
  sink.n = 1;
  face(sim, sink);
  sim.setWork('A', true);
  sim.step(CFG.work.wash * 0.8);
  assert.equal(sink.n, 1, 'The boost does not speed up washing');
  assert.equal(sink.wash, 0.8);
  assert.equal(grill.slot.over, CFG.work.wash * 0.8, 'Overcook time does not speed up');
  assert.equal(counter.slot.heat, CFG.work.wash * 0.8, 'Heat loss does not speed up');
  assert.equal(p.hand.heat, CFG.work.wash * 0.8, 'Held food ages at normal speed');
  sim.setWork('A', false);
  sim.step(CFG.burn.grill - grill.slot.over);
  assert.equal(grill.slot.st, 'grilled');
  sim.step(0.01);
  assert.equal(grill.slot.st, 'burnt', 'Burn time uses the normal duration');
}

{
  const old = serialize(newState({ cuisine: 'southern' }));
  delete old.objects.find((o) => o.type === 'bin').trash;
  const sim = new Sim(deserialize(old));
  const p = sim.addPlayer('A', { name: 'A' });
  assert.equal(p.area, 'restaurant');
  assert.equal(p.areaRev, 0);
  assert.equal(sim.state.objects.find((o) => o.type === 'bin').trash, 0);
  assert.equal(playerArea({}), 'restaurant');
}

{
  const sim = game(), S = sim.state, p = S.players.A;
  const bin = S.objects.find((o) => o.type === 'bin');
  addTrash(S, TRASH_CAPACITY);
  use(sim, bin);
  use(sim, BACK_DOOR);
  const revision = p.areaRev;
  const replacement = sim.addPlayer('A', { name: 'A reconnected' });
  assert.equal(bin.trash, TRASH_CAPACITY, 'Reconnect returns the carried bag');
  assert.equal(replacement.area, 'restaurant');
  assert.equal(replacement.areaRev, revision + 1);
  assert.equal(replacement.slot, p.slot);
  sim.addPlayer('A', { name: 'A' });
  assert.equal(bin.trash, TRASH_CAPACITY, 'A repeated reconnect cannot duplicate the bag');
}

{
  const sim = game(), S = sim.state;
  sim.addPlayer('B', { name: 'B' });
  S.level = 20;
  S.cash = 5000;
  use(sim, BACK_DOOR, 'B');
  assert.equal(sim.command('A', { c: 'unlock', kind: 'stations', id: 'oven' }).pending, true);
  let purchase = S.pendingPurchase.id;
  assert.equal(sim.command('B', { c: 'approvePurchase', id: purchase, approve: false }).ok, true);
  assert.equal(S.pendingPurchase, undefined);
  assert.equal(S.players.B.area, 'alley');
  assert.equal(sim.command('A', { c: 'unlock', kind: 'stations', id: 'oven' }).pending, true);
  purchase = S.pendingPurchase.id;
  sim.command('A', { c: 'approvePurchase', id: purchase, approve: true });
  assert.equal(sim.command('B', { c: 'approvePurchase', id: purchase, approve: true }).ok, true);
  assert.equal(S.pendingPurchase, undefined);
  assert.equal(S.players.B.area, 'alley');
  assert.ok(S.objects.some((o) => o.type === 'oven'));
}

console.log('Alley tests passed: travel, collision, guards, trash, saves, smoke, day reset, and old saves.');
