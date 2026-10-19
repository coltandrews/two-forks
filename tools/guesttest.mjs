import assert from 'node:assert/strict';
import { CFG } from '../src/config.js';
import { CUISINE_ORDER } from '../src/data/cuisines.js';
import { queueSpots } from '../src/data/layout.js';
import { Sim } from '../src/sim/sim.js';
import { newState } from '../src/sim/state.js';
import { greet, leave, seatAt, spawnParty } from '../src/sim/guests.js';
import { approachTile, findPath, seatsOf, validateLayout, walkable } from '../src/sim/world.js';
import { seededRandom } from './simtest.mjs';

const DT = 1 / CFG.tickHz;
const EPSILON = 0.02;
let frames = 0;

function game(cuisine = 'southern', mode = 'arcade') {
  const sim = new Sim(newState({ cuisine, mode }));
  sim.addPlayer('A', { name: 'A' });
  sim.state.phase = 'service';
  sim.state.clock = CFG.serviceStart;
  sim.state.today.schedule = [];
  sim.drain();
  return sim;
}

function guests(sim) {
  return sim.state.parties.flatMap((party) => party.guests.filter((g) => !g.exited).map((guest) => ({ party, guest })));
}

// Inspect body circles, not just tile centers. Only the assigned chair may be
// blocked floor; a path through another chair or through a table is a failure.
function assertSpace(sim, context) {
  const all = guests(sim), radius = CFG.party.radius;
  assert.ok(Number.isFinite(radius) && radius > 0, 'Guest collision radius is set');
  for (let i = 0; i < all.length; i++) {
    const { party, guest: g } = all[i];
    assert.ok(Number.isFinite(g.x) && Number.isFinite(g.z), `${context}: finite guest position`);
    const table = sim.state.objects.find((o) => o.id === party.table);
    const ownSeat = table && g.seat >= 0 ? seatsOf(table)[g.seat] : null;
    for (let z = Math.floor(g.z - radius); z <= Math.floor(g.z + radius); z++) {
      for (let x = Math.floor(g.x - radius); x <= Math.floor(g.x + radius); x++) {
        if (walkable(sim.grid, x, z) || (ownSeat && ownSeat.tile[0] === x && ownSeat.tile[1] === z)) continue;
        const dx = g.x - Math.max(x, Math.min(g.x, x + 1));
        const dz = g.z - Math.max(z, Math.min(g.z, z + 1));
        assert.ok(Math.hypot(dx, dz) >= radius - EPSILON,
          `${context}: ${g.id} (${party.state}) intersects blocked cell ${x},${z} at ${g.x.toFixed(3)},${g.z.toFixed(3)}`);
      }
    }
    for (let j = i + 1; j < all.length; j++) {
      const other = all[j].guest;
      const distance = Math.hypot(g.x - other.x, g.z - other.z);
      assert.ok(distance >= 2 * radius - EPSILON,
        `${context}: ${g.id} (${party.state}) and ${other.id} (${all[j].party.state}) overlap by ${(2 * radius - distance).toFixed(3)} m`);
    }
  }
}

function tick(sim, context) {
  sim.step(DT);
  sim.drain();
  assertSpace(sim, context);
  frames++;
}

function waitFor(sim, predicate, seconds, context) {
  for (let i = 0; i < Math.ceil(seconds / DT) && !predicate(); i++) tick(sim, context);
  assert.ok(predicate(), `${sim.state.cuisine} ${sim.state.mode} ${context}: did not finish within ${seconds} seconds`);
}

function fillQueue(sim, size, count = 3) {
  const parties = [];
  for (let i = 0; i < count; i++) {
    const party = spawnParty(sim, { size, critic: false });
    assert.ok(party, `There is room for party ${i + 1} in ${sim.state.cuisine} ${sim.state.mode}`);
    parties.push(party);
    assertSpace(sim, 'Spawn');
  }
  waitFor(sim, () => parties.every((p) => p.state === 'waiting'), 30, 'Queue arrival');
  for (let i = 0; i < 30; i++) tick(sim, 'Standing queue');
  return parties;
}

function seatAndLeave(sim, party, table) {
  assert.equal(greet(sim, 'A', false), 'greet');
  assert.equal(party.state, 'following');
  const seat = seatsOf(table).find((s) => approachTile(sim.grid, ...s.tile));
  assert.ok(seat, 'Table has a chair approach');
  const approach = approachTile(sim.grid, ...seat.tile);
  sim.setPose('A', approach.x + 0.5, approach.z + 0.5, 0);
  for (let i = 0; i < CFG.tickHz * 4; i++) tick(sim, 'Following a chef near furniture');
  assert.equal(seatAt(sim, 'A', table, false), 'seat');
  const seats = seatsOf(table);
  for (let i = 0; i < CFG.tickHz * 15 && party.state === 'seating'; i++) {
    const before = party.guests.map((g) => ({ x: g.x, z: g.z }));
    tick(sim, 'Seating');
    if (party.state === 'browsing') party.guests.forEach((g, j) => {
      const seat = seats[g.seat];
      assert.ok(Math.hypot(before[j].x - seat.x, before[j].z - seat.z) < 0.1,
        `Seating: ${g.id} reached the chair without the timeout moving them there`);
    });
  }
  assert.equal(party.state, 'browsing', 'Seating finishes');
  for (const guest of party.guests) {
    assert.equal(guest.x, seats[guest.seat].x);
    assert.equal(guest.z, seats[guest.seat].z);
  }
  leave(sim, party, false);
  waitFor(sim, () => !sim.state.parties.includes(party), 25, 'Leaving past the queue');
  assert.equal(party.guests.length, party.size, 'Exit keeps guest identity records');
  assert.ok(party.guests.every((g) => g.exited), 'Every guest reaches the door before the party is removed');
  assert.equal(table.party, null, 'Leaving frees the table');
}

const previousRandom = Math.random;
try {
  Math.random = seededRandom(20261019);
  for (const cuisine of CUISINE_ORDER) for (const mode of ['story', 'arcade']) {
    const sim = game(cuisine, mode);
    assert.equal(validateLayout(sim.state).ok, true);
    const size = mode === 'story' ? 2 : 4;
    const parties = fillQueue(sim, size);
    const table = sim.state.objects.find((o) => o.type === 'table' && o.seats >= size);
    seatAndLeave(sim, parties[0], table);
    waitFor(sim, () => sim.state.parties.every((p) => p.state === 'waiting'), 15, 'Queue after seating');
    assert.equal(sim.state.parties.length, 2, 'Other queued parties remain');
    console.log(`Checked guest spawn, queue, follow, seating, and exit: ${cuisine} ${mode}`);
  }

  // Old or custom layouts can have furniture in the former queue corridor.
  for (const mode of ['story', 'arcade']) {
    const sim = game('southern', mode);
    const counter = sim.state.objects.find((o) => o.type === 'counter');
    const spot = queueSpots(sim.state)[0];
    counter.x = Math.floor(spot.x);
    counter.z = Math.floor(spot.z);
    assert.equal(validateLayout(sim.state).ok, true, 'Counter move is a valid floor plan');
    sim.rebuild();
    const parties = fillQueue(sim, 2);
    const table = sim.state.objects.find((o) => o.type === 'table' && o.seats === 2);
    seatAndLeave(sim, parties[0], table);
    console.log(`Checked guest queue around moved furniture: ${mode}`);
  }

  for (const cuisine of CUISINE_ORDER) for (const mode of ['story', 'arcade']) {
    const sim = game(cuisine, mode), size = mode === 'story' ? 2 : 4;
    fillQueue(sim, size, CFG.queueMax);
    assert.equal(spawnParty(sim, { size, critic: false }), null, 'A full queue rejects the next party');
    assert.equal(sim.state.today.turnedAway, 1);
    assert.equal(sim.state.today.covers, CFG.queueMax * size, 'Rejected arrivals do not change the cover count');
  }
  console.log('Checked full queues and rejected arrivals in all ten layouts');

  // A queue must leave chair approaches open, including the front-wall seats.
  // These tables also send a party along both sides of a narrow dining aisle.
  for (const [cuisine, number] of [['diner', 5], ['mexican', 2]]) {
    Math.random = () => 0.5;
    const sim = game(cuisine);
    const table = sim.state.objects.find((o) => o.type === 'table' && o.num === number);
    const parties = fillQueue(sim, table.seats);
    seatAndLeave(sim, parties[0], table);
    console.log(`Checked queue clearance and both seat approaches: ${cuisine} table ${number}`);
  }
  // This seat order sends one guest around the far side of the room. Let the
  // guest finish that valid route instead of moving them into the chair early.
  {
    let seed = 3962149334;
    Math.random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const sim = game('italian');
    const table = sim.state.objects.find((o) => o.type === 'table' && o.num === 3);
    const parties = Array.from({ length: 3 }, () => spawnParty(sim, { size: 4, critic: false }));
    assert.ok(parties.every(Boolean));
    waitFor(sim, () => parties[0].state === 'waiting', 30, 'First party arrives');
    seatAndLeave(sim, parties[0], table);
    console.log('Checked the long seating route: italian table 3');
  }
  Math.random = seededRandom(20261019);

  // Opposing and crossing routes must remain separated and still make progress.
  // Use the clear left dining aisle in the normal southern floor plan.
  for (const routes of [
    [[1.5, 9.5, 3.5, 9.5], [3.5, 9.5, 1.5, 9.5]],
    [[1.5, 10.5, 3.5, 10.5], [3.5, 10.5, 1.5, 10.5], [2.5, 8.5, 2.5, 12.5], [2.5, 12.5, 2.5, 8.5]],
  ]) {
    const sim = game();
    const parties = routes.map(() => spawnParty(sim, { size: 1, critic: false }));
    assert.ok(parties.every(Boolean));
    parties.forEach((party, i) => {
      const [x, z, tx, tz] = routes[i], g = party.guests[0];
      g.x = x; g.z = z; g.tx = tx; g.tz = tz;
      g.path = findPath(sim.grid, x, z, tx, tz);
      assert.ok(g.path, 'Crossing route exists');
    });
    assertSpace(sim, 'Crossing start');
    waitFor(sim, () => parties.every((p) => p.state === 'waiting'), 20, 'Crossing routes');
    parties.forEach((party, i) => {
      const g = party.guests[0];
      assert.ok(Math.hypot(g.x - routes[i][2], g.z - routes[i][3]) < 0.15, 'Guest reached the route destination');
    });
    console.log(`Checked ${routes.length} crossing guest routes`);
  }
} finally {
  Math.random = previousRandom;
}

console.log(`Guest checks passed (${frames} movement frames).`);
