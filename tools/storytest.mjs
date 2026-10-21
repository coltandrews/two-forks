// Story checks and a 25-day, repeatable two-chef simulation.
// The balance bot cooks real recipes and serves real guests. As in simtest,
// chef travel is instantaneous; this is an economy gate, not a play test.
import assert from 'node:assert/strict';
import { newState, serialize, deserialize, dishById, courseSlot } from '../src/sim/state.js';
import { Sim } from '../src/sim/sim.js';
import { awardXP } from '../src/sim/progression.js';
import { CUISINE_ORDER } from '../src/data/cuisines.js';
import { ING } from '../src/data/ingredients.js';
import { roomSize, frontDoor, spawnPoints, queueSpots, KITCHEN_MAX_Z } from '../src/data/layout.js';
import { buildGrid, walkable, validateLayout, findPath, approachTile } from '../src/sim/world.js';
import { placementStatus, fixedCosts, placeOrder, toggleDish, createDish, buyUpgrade, autofillPlan } from '../src/sim/economy.js';
import { spawnParty, serveTo, tableWork, leave, compItem } from '../src/sim/guests.js';
import { ingItem } from '../src/sim/items.js';
import { isOwned, ingredientAllowed, recipeRequirements, unlockList, chapterInfo, XP_LEVELS } from '../src/data/progression.js';
import { useBot, playDay, seededRandom } from './simtest.mjs';
import { Session } from '../src/net/session.js';
import { actE, takeFromStore, findTarget } from '../src/sim/kitchen.js';
import { CFG, TICK } from '../src/config.js';

function restaurant(cuisine = 'southern', mode = 'story') {
  const sim = new Sim(newState({ cuisine, name: 'Story test', mode }));
  sim.addPlayer('A', { name: 'Cook' });
  sim.addPlayer('B', { name: 'Server' });
  return sim;
}

function saveRoundTrip(sim) {
  const copy = deserialize(JSON.parse(JSON.stringify(serialize(sim.state))));
  for (const key of ['mode', 'xp', 'level', 'owned', 'chapter', 'goal', 'cash', 'building']) {
    assert.deepEqual(copy[key], sim.state[key], `${key} must survive a save`);
  }
  const next = new Sim(copy);
  next.addPlayer('A', { name: 'Cook' });
  next.addPlayer('B', { name: 'Server' });
  return next;
}

function verifyStartsAndMigration() {
  for (const cuisine of CUISINE_ORDER) {
    const { state } = restaurant(cuisine);
    assert.equal(state.mode, 'story');
    assert.equal(state.cash, 600);
    assert.deepEqual(roomSize(state), { width: 14, height: 12 });
    assert.equal(state.xp, 0);
    assert.equal(state.level, 1);
    assert.equal(fixedCosts(state).rent, 40);
    assert.equal(state.objects.filter((o) => o.type === 'table').length, 3);
    assert(state.objects.filter((o) => o.type === 'table').every((o) => o.seats === 2));
    assert(!state.objects.some((o) => o.type === 'freezer'));
    const active = state.menu.dishes.filter((d) => d.on).map((d) => dishById(state, d.id));
    assert.equal(active.length, 3, `${cuisine}: three starting recipes`);
    assert.equal(active.filter((d) => d.course === 'main').length, 2);
    assert.equal(active.filter((d) => courseSlot(d.course) === 'starter').length, 1);
    assert.equal(state.menu.drinks.filter((d) => d.on).length, 2);
    for (const dish of active) assert.deepEqual(recipeRequirements(state, dish), [], `${cuisine}/${dish.id} must be cookable`);
    assert(validateLayout(state, frontDoor(state)).ok, `${cuisine}: valid starting floor`);
    const firstLocked = Object.keys(ING).find((id) => !ingredientAllowed(state, id));
    assert(firstLocked, 'Story must restrict some ingredients');
    const cash = state.cash, orders = JSON.stringify(state.orders);
    assert.equal(placeOrder(state, firstLocked, 1).ok, false);
    assert.equal(placeOrder(state, firstLocked, 1, true, 0).ok, false);
    assert.equal(state.cash, cash);
    assert.equal(JSON.stringify(state.orders), orders);
    const lockedDish = state.menu.dishes.find((d) => recipeRequirements(state, dishById(state, d.id)).length);
    assert(lockedDish);
    assert.equal(toggleDish(state, lockedDish.id, true).ok, false);
    state.rep.level = 20;
    assert.equal(toggleDish(state, lockedDish.id, true).ok, false, 'Rating cannot bypass Chef Level');
    assert.equal(buyUpgrade(state, 'fryer').ok, false, 'A level-1 kitchen cannot buy a fryer');
    {
      // Tables need only a level and cash, never a floor expansion.
      const t = JSON.parse(JSON.stringify(state));
      assert.equal(buyUpgrade(t, 'table2').ok, false, 'A level-1 room cannot buy a table yet');
      t.level = 2;
      assert(!isOwned(t, 'areas', 'main_room'));
      const before = t.objects.filter((o) => o.type === 'table').length;
      const r = buyUpgrade(t, 'table2');
      assert(r.ok, `A level-2 room should fit a 2-top without an expansion: ${r.reason}`);
      assert.equal(t.objects.filter((o) => o.type === 'table').length, before + 1);
    }
    assert.equal(createDish(state, { name: 'Test bowl', course: 'main', tpl: 'bowl', comps: [['rice', 'cooked'], ['chicken', 'sliced'], ['avocado', 'sliced']] }).ok, false);
    assert(autofillPlan(state, 2).every((line) => ingredientAllowed(state, line.ing)));

    const arcade = newState({ cuisine, mode: 'arcade' });
    assert.equal(arcade.cash, 3000);
    assert.deepEqual(roomSize(arcade), { width: 20, height: 15 });
    assert(isOwned(arcade, 'areas', 'main_room'));
    for (const id of Object.keys(ING)) assert(ingredientAllowed(arcade, id));
    for (const dish of arcade.menu.dishes) assert.deepEqual(recipeRequirements(arcade, dishById(arcade, dish.id)), []);

    // Saves made before mode was added keep their money, menu, and floor.
    const old = serialize(arcade);
    for (const key of ['mode', 'xp', 'level', 'owned', 'chapter', 'goal']) delete old[key];
    old.cash = 731.25;
    old.objects.find((o) => o.type === 'counter').x = 8;
    old.menu.dishes[0].price = 18;
    const expectedObjects = structuredClone(old.objects), expectedMenu = structuredClone(old.menu);
    const migrated = deserialize(old);
    assert.equal(migrated.mode, 'arcade');
    assert.equal(migrated.cash, 731.25);
    assert.deepEqual(migrated.objects, expectedObjects);
    assert.deepEqual(migrated.menu, expectedMenu);
    assert.deepEqual(roomSize(migrated), { width: 20, height: 15 });

    // Story saves from the fixed building keep their floor and purchases.
    const oldStory = serialize(state);
    delete oldStory.building;
    oldStory.objects = structuredClone(arcade.objects);
    oldStory.cash = 912.75;
    oldStory.owned.areas.main_room = true;
    const oldStoryObjects = structuredClone(oldStory.objects);
    const oldStoryOwned = structuredClone(oldStory.owned);
    const migratedStory = deserialize(oldStory);
    assert.deepEqual(roomSize(migratedStory), { width: 20, height: 15 });
    assert.equal(migratedStory.cash, 912.75);
    assert.deepEqual(migratedStory.objects, oldStoryObjects);
    assert.deepEqual(migratedStory.owned, oldStoryOwned);
    assert(validateLayout(migratedStory, frontDoor(migratedStory)).ok);
    const migratedAgain = deserialize(serialize(migratedStory));
    assert.deepEqual(migratedAgain.building, migratedStory.building, 'Migration must not change size on each load');
  }
  for (const cash of [1500, 3000, 5000]) {
    assert.equal(newState({ cuisine: 'southern', mode: 'arcade', cash }).cash, cash);
  }
  console.log('checked story starts, recipe dependencies, order gates, and old saves');
}

function verifyFloor(state) {
  const size = roomSize(state), grid = buildGrid(state), door = frontDoor(state);
  assert.equal(grid.width, size.width);
  assert.equal(grid.height, size.height);
  assert.equal(grid.blocked.length, size.width * size.height);
  const valid = validateLayout(state, door);
  assert(valid.ok, `${state.cuisine}, chapter ${state.chapter}: ${valid.reason}`);
  assert(walkable(grid, door.x, door.z), 'The front door must be open');
  for (const point of [...spawnPoints(state), ...queueSpots(state)]) {
    const x = Math.floor(point.x), z = Math.floor(point.z);
    assert(walkable(grid, x, z), `Blocked spawn or queue at ${x},${z}`);
    assert(findPath(grid, door.x, door.z, x, z), `No route from the door to ${x},${z}`);
  }
  const counter = state.objects.find((o) => o.type === 'counter');
  for (let z = 0; z < size.height; z++) {
    for (const x of [-1, 0, size.width - 1, size.width]) {
      assert.equal(walkable(grid, x, z), false, `Side wall ${x},${z}`);
      assert.equal(placementStatus(state, counter.id, x, z).ok, false);
    }
  }
  for (let x = 0; x < size.width; x++) {
    assert.equal(walkable(grid, x, 0), false, `Back wall ${x},0`);
    assert.equal(walkable(grid, x, size.height), false);
    assert.equal(placementStatus(state, counter.id, x, size.height - 1).ok, false);
    if (x !== door.x) assert.equal(walkable(grid, x, size.height - 1), false);
  }
  assert.equal(findPath(grid, door.x, door.z, size.width, door.z), null, 'A path cannot leave the building');
}

function verifyFloorExpansions() {
  for (const cuisine of CUISINE_ORDER) {
    const sim = restaurant(cuisine), state = sim.state;
    assert(state.objects.filter((o) => ['board', 'grill', 'pan', 'pot', 'oven'].includes(o.type)).every((o) => o.z <= KITCHEN_MAX_Z));
    assert(state.objects.filter((o) => o.type === 'table').every((o) => o.z > KITCHEN_MAX_Z + 1));
    verifyFloor(state);
    state.cash = 10000;
    state.level = 20;
    state.xp = XP_LEVELS.at(-1);
    state.storyStats = { paidGuests: 500, bestPaidDay: 99, criticPassed: true };
    for (let chapter = 1; chapter <= 4; chapter++) {
      const before = roomSize(state), objects = structuredClone(state.objects);
      assert.equal(chapterInfo(state).ready, true);
      const result = approve(sim, sim.command('A', { c: 'chapter' }));
      assert.equal(result.ok, true);
      const after = roomSize(state);
      assert.equal(after.width, before.width + (chapter <= 3 ? 10 : 0));
      assert.equal(after.height, before.height);
      assert.deepEqual(state.objects, objects, 'An expansion must keep furniture positions');
      verifyFloor(state);
      if (chapter <= 3) {
        const counter = state.objects.find((o) => o.type === 'counter');
        let target;
        for (let x = after.width - 2; x >= before.width && !target; x--) {
          for (let z = 1; z < after.height - 1; z++) {
            if (placementStatus(state, counter.id, x, z).ok) { target = { x, z }; break; }
          }
        }
        assert(target, 'The new floor must accept furniture');
        assert.equal(sim.command('A', { c: 'move', id: counter.id, ...target }).layout, true);
        const approach = approachTile(sim.grid, counter.x, counter.z);
        assert(approach, 'The moved station must be reachable');
        const x = approach.x + 0.5, z = approach.z + 0.5;
        sim.setPose('A', x, z, Math.atan2(counter.x + 0.5 - x, counter.z + 0.5 - z));
        assert.equal(state.players.A.x, x, 'Host movement must use the expanded bounds');
        assert.equal(findTarget(state, sim.grid, state.players.A)?.id, counter.id);
        const item = ingItem('lettuce', 'raw', ING.lettuce.cost);
        state.players.A.hand = item;
        assert.equal(actE(sim, 'A', false), 'ok');
        assert.equal(counter.slot.ing, item.ing, 'A station in the new floor must accept an item');
        assert.equal(actE(sim, 'A', false), 'ok');
        assert.equal(state.players.A.hand.ing, item.ing);
        state.players.A.hand = null;
        verifyFloor(state);
      }
      const saved = deserialize(serialize(state));
      assert.deepEqual(saved.building, state.building);
      assert.deepEqual(saved.objects, state.objects);
      assert.equal(saved.cash, state.cash);
      verifyFloor(saved);
    }
    assert.equal(state.chapter, 5);
  }
  console.log('checked every Story floor, three expansions, final chapter, boundaries, routes, furniture, and station interaction');
}

function approve(sim, result) {
  if (!sim.state.pendingPurchase) return result;
  const purchase = sim.state.pendingPurchase;
  for (const pid of purchase.required) result = sim.command(pid, { c: 'approvePurchase', id: purchase.id, approve: true });
  return result;
}

function verifyPurchaseApproval() {
  const sim = restaurant(), state = sim.state;
  // Test fixture funds and XP are for command validation only, never balance.
  state.cash = 10000;
  state.xp = XP_LEVELS.at(-1);
  state.level = 20;
  const choice = unlockList(state).find((u) => !u.owned && u.can && u.price > 500);
  assert(choice, 'An expensive unlock must be available in the fixture');
  const before = state.cash;
  sim.command('A', { c: 'unlock', kind: choice.kind, id: choice.id });
  assert(state.pendingPurchase);
  const pending = state.pendingPurchase;
  assert.deepEqual([...pending.required].sort(), ['A', 'B']);
  assert.equal(state.cash, before, 'A request must not spend cash');
  sim.command('A', { c: 'approvePurchase', id: pending.id, approve: true });
  assert.equal(state.cash, before, 'One approval must not spend cash');
  sim.command('B', { c: 'approvePurchase', id: pending.id + '-stale', approve: true });
  assert.equal(state.cash, before, 'A stale approval must not spend cash');
  sim.command('B', { c: 'approvePurchase', id: pending.id, approve: false });
  assert.equal(state.cash, before, 'A refusal must not spend cash');
  assert(!state.pendingPurchase);
  sim.command('A', { c: 'unlock', kind: choice.kind, id: choice.id });
  assert(sim.command('A', { c: 'ready' }).reason, 'A pending purchase must block opening');
  state.phase = 'service';
  approve(sim);
  assert.equal(state.cash, before, 'A phase change must cancel a purchase');
  assert(!state.pendingPurchase);
  state.phase = 'morning';
  approve(sim, sim.command('A', { c: 'unlock', kind: choice.kind, id: choice.id }));
  assert.equal(state.cash, before - choice.price);
  sim.command('B', { c: 'approvePurchase', id: pending.id, approve: true });
  assert.equal(state.cash, before - choice.price, 'A replay must not spend twice');
  const beforeSmall = state.cash;
  assert.equal(sim.command('A', { c: 'upgrade', id: 'fridge_temp' }).ok, true);
  assert(!state.pendingPurchase, 'A $500 purchase does not need shared approval');
  assert.equal(state.cash, beforeSmall - 500);
  saveRoundTrip(sim);
  const joined = restaurant();
  joined.removePlayer('B');
  joined.state.cash = 10000;
  joined.state.xp = XP_LEVELS.at(-1);
  joined.state.level = 20;
  const joinChoice = unlockList(joined.state).find((u) => !u.owned && u.can && u.price > 500);
  const command = { c: 'unlock', kind: joinChoice.kind, id: joinChoice.id };
  joined.command('A', command);
  const soloRequest = joined.state.pendingPurchase;
  assert.deepEqual(soloRequest.required, ['A']);
  joined.addPlayer('B', { name: 'Server' });
  assert(!joined.state.pendingPurchase, 'A new chef must cancel the previous approval request');
  joined.command('A', { c: 'approvePurchase', id: soloRequest.id, approve: true });
  assert.equal(joined.state.cash, 10000, 'An approval from before the join must not spend cash');
  joined.command('A', command);
  const sharedRequest = joined.state.pendingPurchase;
  assert.deepEqual([...sharedRequest.required].sort(), ['A', 'B']);
  joined.command('A', { c: 'approvePurchase', id: sharedRequest.id, approve: true });
  assert.equal(joined.state.cash, 10000, 'The new chef must also approve');
  joined.command('B', { c: 'approvePurchase', id: sharedRequest.id, approve: true });
  assert.equal(joined.state.cash, 10000 - joinChoice.price);
  console.log('checked shared purchase requests, crew changes, refusal, stale approval, and replay');
}

function verifyChapterReport() {
  const sim = restaurant(), state = sim.state;
  state.cash = 10000;
  state.xp = XP_LEVELS[4] - 120;
  state.level = 4;
  state.storyStats.paidGuests = 40;
  awardXP(state, 20, 'Paying guests');
  sim.endDay();
  const report = state.report;
  assert.equal(report.progression.xp, 20);
  assert.equal(report.progression.level, 4);
  const result = approve(sim, sim.command('A', { c: 'chapter' }));
  assert.equal(result.ok, true);
  assert.equal(state.chapter, 2);
  assert.equal(state.level, 5);
  assert.equal(report.progression.xp, 170, 'The report must include office chapter XP');
  assert.deepEqual(report.progression.lines, [
    { label: 'Paying guests', amount: 20 },
    { label: 'Chapter goal', amount: 150 },
  ]);
  assert.equal(report.progression.level, state.level);
  assert.notEqual(report.progression.lines, state.today.xpLines, 'Report lines must be a snapshot');
  assert.notEqual(report.progression.lines[0], state.today.xpLines[0]);
  const saved = saveRoundTrip(sim);
  assert.deepEqual(saved.state.report.progression, report.progression);
  sim.nextDay();
  awardXP(state, 10, 'Paying guests');
  assert.equal(report.progression.xp, 170, 'The next day must not change the previous report');
  console.log('checked office chapter XP totals, report lines, levels, and save retention');
}

async function verifySessionSnapshots() {
  const state = newState({ cuisine: 'southern', mode: 'story' });
  state.cash = 5000;
  state.xp = XP_LEVELS[4] - 100;
  state.level = 4;
  state.storyStats.paidGuests = 40;
  // This transport exercises Session messages without opening a network.
  const host = await Session.host(state, { name: 'Host' }, null, false);
  host.sim.addPlayer('C', { name: 'Guest chef' });
  const client = new Session('client');
  const hostHandlers = {}, clientHandlers = {}, messages = [], events = [];
  host.clients.set('client', { peerId: 'client', pid: 'C', name: 'Guest chef' });
  host.net = {
    on(type, fn) { hostHandlers[type] = fn; },
    to(type, data, peerId) { messages.push({ type, data: structuredClone(data), peerId }); },
  };
  client.hostPeer = 'host';
  client.net = {
    on(type, fn) { clientHandlers[type] = fn; },
    to(type, data, peerId) {
      assert.equal(peerId, 'host');
      hostHandlers[type]?.(structuredClone(data), 'client');
    },
  };
  host.wireHost();
  client.wireClient();
  const flush = () => {
    const sent = messages.splice(0);
    for (const message of sent) {
      assert.equal(message.peerId, 'client');
      if (message.type === 'slow') client.applySlow(JSON.parse(message.data));
      else if (message.type === 'meta') client.applyMeta(JSON.parse(message.data));
      else clientHandlers[message.type]?.(message.data, 'host');
    }
    return sent;
  };
  host.sendSnapshots(true);
  flush();
  assert.equal(client.state.mode, 'story');
  assert.equal(client.state.xp, state.xp);
  assert.deepEqual(client.state.owned, state.owned);
  assert.deepEqual(roomSize(client.state), roomSize(state));
  const initialGrid = client.gridFor(), initialWidth = initialGrid.width;
  const probe = { x: initialWidth, z: KITCHEN_MAX_Z };
  assert.equal(walkable(initialGrid, probe.x, probe.z), false, 'The client must block land outside its building');
  const initialObjects = structuredClone(state.objects);
  host.sendSnapshots();
  assert.equal(flush().length, 0, 'Unchanged state must not resend slow or meta messages');
  host.sim.drain();

  host.command({ c: 'chapter' });
  host.sendSnapshots();
  flush();
  const request = client.state.pendingPurchase;
  assert(request, 'The guest chef must receive the purchase request');
  assert.deepEqual([...request.required].sort(), ['C', 'H']);
  assert.deepEqual(request.approved, []);
  client.command({ c: 'approvePurchase', id: request.id, approve: true });
  host.sendSnapshots();
  flush();
  assert.deepEqual(client.state.pendingPurchase.approved, ['C']);
  assert.equal(state.cash, 5000, 'Guest approval alone must not buy the lease');
  assert.equal(state.chapter, 1);

  client.on('event', (event) => {
    if (!['chapter', 'chefLevelUp'].includes(event.type)) return;
    assert.equal(client.state.mode, 'story');
    assert.equal(client.state.xp, state.xp, 'XP must arrive before its event');
    assert.equal(client.state.level, state.level, 'Chef Level must arrive before its event');
    assert.equal(client.state.chapter, 2, 'The chapter snapshot must arrive before its card');
    assert.equal(client.state.owned.areas.main_room, true);
    assert.deepEqual(roomSize(client.state), roomSize(state));
    assert.equal(client.gridFor().width, initialWidth + 10, 'The client grid must use the expanded width');
    assert.notEqual(client.gridFor(), initialGrid, 'The client must rebuild the grid when only the building changes');
    assert.deepEqual(client.state.objects, initialObjects, 'The expansion must keep object positions');
    assert.equal(walkable(client.gridFor(), probe.x, probe.z), true, 'The client must be able to use the new floor');
    events.push(event);
  });
  host.command({ c: 'approvePurchase', id: request.id, approve: true });
  assert.equal(state.cash, 3500);
  assert.equal(state.level, 5);
  host.update(TICK);
  const sent = flush();
  assert(sent.findIndex((m) => m.type === 'meta') < sent.findIndex((m) => m.type === 'ev'));
  assert.deepEqual(events.map((event) => event.type).sort(), ['chapter', 'chefLevelUp']);
  assert(!client.state.pendingPurchase);
  assert.deepEqual(client.state.owned, state.owned);
  client.setPose(probe.x + 0.5, probe.z + 0.5, 0, false);
  client.update(TICK);
  assert.equal(state.players.C.x, probe.x + 0.5, 'Host movement must accept the client on its new floor');
  assert.equal(state.players.C.z, probe.z + 0.5);
  console.log('checked Session building snapshots, shared approval, client movement, grid rebuilds, and event order with a local test transport');
}

function verifyCrewPlating() {
  for (const source of ['store', 'well']) {
    const sim = restaurant(source === 'store' ? 'italian' : 'southern');
    const state = sim.state;
    const dish = dishById(state, source === 'store' ? 'caprese' : 'house_salad');
    const missing = source === 'store' ? 'mozzarella' : 'lettuce';
    state.players.A.hand = { k: 'plate', items: dish.comps.filter(([id]) => id !== missing).map(([id, st]) => ingItem(id, st, ING[id].cost)) };
    if (source === 'store') {
      const store = state.objects.find((o) => o.type === ING[missing].store);
      sim.setPose('A', store.x + 0.5, store.z + 1.5, Math.PI);
      assert.equal(takeFromStore(sim, 'A', store.id, missing), true);
    } else {
      state.level = 3;
      state.xp = XP_LEVELS[2];
      assert.equal(sim.command('A', { c: 'upgrade', id: 'well' }).ok, true);
      const well = state.objects.find((o) => o.type === 'well');
      well.well = { ing: missing, st: 'chopped', n: 2, cost: ING[missing].cost, day: state.day, hot: false, q: 1 };
      assert.equal(actE(sim, 'A', false, well), 'ok');
      assert.equal(well.well.n, 1);
    }
    assert.equal(state.players.A.hand.platedBy, 'A');
    const pass = state.objects.find((o) => o.type === 'pass');
    assert.equal(actE(sim, 'A', false, pass), 'ok');
    assert.equal(actE(sim, 'B', false, pass), 'ok');
    const party = spawnParty(sim, { size: 1, critic: false });
    const table = state.objects.find((o) => o.type === 'table');
    table.party = party.id;
    party.table = table.id;
    party.state = 'waitingFood';
    party.grace = 120;
    party.orderedAt = sim.time;
    party.items = [{ id: dish.id, price: dish.fair, served: false, guest: party.guests[0].id }];
    party.drinks = [];
    assert.equal(actE(sim, 'B', false, table), 'served');
    sim.endDay();
    const cook = state.report.crew.find((row) => row.id === 'A');
    const server = state.report.crew.find((row) => row.id === 'B');
    assert.equal(cook.plated, 1, `${source}: the cook must keep plating credit`);
    assert.equal(server.plated, 0, `${source}: serving must not transfer plating credit`);
    assert.equal(server.served, 1);
  }
  console.log('checked plating credit for ingredients taken directly from storage and prep wells');
}

function servedFixture(sim, { paid = true, comp = false, cold = false } = {}) {
  const state = sim.state;
  const party = spawnParty(sim, { size: 1, critic: false });
  const table = state.objects.find((o) => o.type === 'table');
  const id = state.menu.dishes.find((d) => d.on && dishById(state, d.id).course === 'main').id;
  const dish = dishById(state, id);
  party.table = table.id; table.party = party.id;
  party.state = 'waitingFood'; party.mood = 100; party.grace = 120; party.orderedAt = sim.time;
  party.items = [{ id, price: dish.fair, served: false, q: null, guest: party.guests[0].id }];
  party.drinks = [];
  if (comp) { compItem(sim, party.id, 0); return; }
  const plate = { k: 'plate', items: dish.comps.map(([ing, st]) => ({ ...ingItem(ing, st, ING[ing].cost), heat: cold ? 1000 : 0 })) };
  assert.equal(serveTo(sim, 'A', table, plate, false), 'served');
  if (paid) { party.state = 'paying'; tableWork(sim, 'B', table, 2, false); }
  else leave(sim, party, false);
}

function verifyXP() {
  Math.random = seededRandom(55);
  const good = restaurant();
  servedFixture(good);
  assert.equal(good.state.xp, 45, 'Paid guest + hot complete plate + five-star review');
  const cold = restaurant();
  servedFixture(cold, { cold: true });
  assert(cold.state.xp < good.state.xp, 'Cold plates must earn less XP');
  const walkout = restaurant();
  servedFixture(walkout, { paid: false });
  assert.equal(walkout.state.xp, 0, 'Unpaid service must not award XP');
  const earned = good.state.xp, level = good.state.level;
  servedFixture(good, { paid: false });
  assert.equal(good.state.xp, earned, 'A bad service cannot remove earned XP');
  assert.equal(good.state.level, level);
  const comped = restaurant();
  servedFixture(comped, { comp: true });
  assert.equal(comped.state.xp, 0, 'A comped dish must not award XP');
  const queued = restaurant();
  const waiting = spawnParty(queued, { size: 1, critic: false });
  waiting.state = 'waiting';
  queued.drain();
  leave(queued, waiting, false);
  const review = queued.drain().find((event) => event.type === 'review');
  assert(review, 'A queued walkout must leave a review');
  const size = roomSize(queued.state);
  assert(review.x >= 0 && review.x < size.width && review.z >= 0 && review.z < size.height, 'The review must appear inside the current building');
  assert(walkable(queued.grid, Math.floor(review.x), Math.floor(review.z)), 'A queued review must appear on open floor');
  assert.equal(queued.state.xp, 0);
  const arcade = restaurant('southern', 'arcade');
  servedFixture(arcade);
  assert.equal(arcade.state.xp || 0, 0, 'Arcade must not gain story XP');
  console.log('checked paid service, quality, review, walkout, and comp XP');
}

function verifyDebtSetback() {
  const sim = restaurant();
  sim.state.cash = -20;
  const debtBefore = sim.state.debt;
  for (let day = 1; day <= 4; day++) {
    sim.endDay();
    assert.equal(sim.state.phase, 'office', 'Debt must leave the restaurant playable');
    const report = sim.state.report;
    assert.equal(report.progression.debtDays, day < 3 ? day : 0);
    if (day === 3) {
      assert.equal(sim.state.cash, 100, 'The bank restores working capital');
      assert.equal(sim.state.debt, debtBefore + report.progression.relief);
    }
    assert.equal(report.revenue, 0, 'A loan is not revenue');
    assert(report.net < 0, 'A loan is not profit');
    if (day < 4) sim.nextDay();
  }
  assert.equal(sim.state.xp, 0, 'Empty days must not farm XP');
  console.log('checked debt grace and continued play after three negative days');
}

function buyProgress(sim) {
  // Save for floor expansions first. Buy only affordable optional upgrades
  // after retaining the next deposit plus a supplier reserve.
  const state = sim.state;
  let chapter = chapterInfo(state);
  if (chapter?.ready) {
    const result = approve(sim, sim.command('A', { c: 'chapter' }));
    assert(!result?.reason, `Chapter purchase: ${result?.reason}`);
    chapter = chapterInfo(state);
  }
  // More tables also bring more guests. Add seats only when the kitchen can
  // serve a two-top within its food grace period, with no walkouts.
  const canServeMore = !state.report.walkouts && state.report.ticketTime <= CFG.party.foodGrace + 2 * CFG.party.gracePerDish;
  if (canServeMore && state.objects.filter((o) => o.type === 'table').length < 4 && state.cash >= 500) {
    approve(sim, sim.command('A', { c: 'upgrade', id: 'table2' }));
  }
  const reserve = (chapter?.price || 0) + 250;
  for (const unlock of unlockList(state)) {
    if (unlock.owned || !unlock.can || unlock.kind === 'areas' || state.cash - unlock.price < reserve) continue;
    approve(sim, sim.command('A', { c: 'unlock', kind: unlock.kind, id: unlock.id }));
  }
}

function runStory(cuisine, days = 25) {
  Math.random = seededRandom(20261018 + CUISINE_ORDER.indexOf(cuisine));
  let sim = restaurant(cuisine);
  let negativeDays = 0;
  const completions = [], reports = [];
  for (let d = 1; d <= days; d++) {
    useBot(sim, { support: true });
    playDay();
    const state = sim.state, report = state.report;
    reports.push(report);
    assert(Number.isFinite(state.cash) && Number.isFinite(state.xp));
    assert(report.progression, 'Report must include earned XP');
    assert.equal(report.progression.lines.reduce((sum, line) => sum + line.amount, 0), report.progression.xp);
    const previousChapter = state.chapter;
    buyProgress(sim);
    if (state.chapter !== previousChapter) completions.push({ chapter: previousChapter, day: d });
    sim.command('A', { c: 'autofill' });
    negativeDays = state.cash < 0 ? negativeDays + 1 : 0;
    assert(negativeDays < 3, `${cuisine}: cash was negative for three days at day ${d}`);
    console.log(`${cuisine} day ${d}: cash $${state.cash.toFixed(2)}, XP ${state.xp}, L${state.level}, chapter ${state.chapter}, revenue $${report.revenue}, walkouts ${report.walkouts}`);
    if (d < days) {
      sim = saveRoundTrip(sim);
      sim.command('A', { c: 'ready' }); sim.command('B', { c: 'ready' });
      assert.equal(sim.state.phase, 'morning');
    }
  }
  const deadlines = [8, 14, 22, 25];
  for (let i = 0; i < deadlines.length; i++) {
    assert(completions[i], `${cuisine}: chapter ${i + 1} did not finish in ${days} days`);
    assert(completions[i].day <= deadlines[i], `${cuisine}: chapter ${i + 1} ended on day ${completions[i].day}, expected by ${deadlines[i]}`);
  }
  assert.equal(reports[0].progression.level, 2, `${cuisine}: a good first day should reach level 2`);
  console.log(`${cuisine}: chapter days ${completions.map((c) => c.day).join('/')}`);
}

if (!process.argv.includes('--balance-only')) {
  verifyStartsAndMigration();
  verifyFloorExpansions();
  verifyPurchaseApproval();
  verifyChapterReport();
  await verifySessionSnapshots();
  verifyCrewPlating();
  verifyXP();
  verifyDebtSetback();
}
if (!process.argv.includes('--checks-only')) {
  const only = process.argv.find((arg) => CUISINE_ORDER.includes(arg));
  for (const cuisine of only ? [only] : CUISINE_ORDER) runStory(cuisine);
}
