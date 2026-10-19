import assert from 'node:assert/strict';
import { TICK } from '../src/config.js';
import { ALLEY_SIZE, ALLEY_SPAWN, ALLEY_OBJECTS, SMOKE_BOOST_SECONDS, movementMultiplier } from '../src/data/alley.js';
import { roomSize } from '../src/data/layout.js';
import { newState } from '../src/sim/state.js';
import { Session } from '../src/net/session.js';

// Exercise the real Session messages without a browser or a public room.
const state = newState({ cuisine: 'southern', mode: 'story' });
const host = await Session.host(state, { name: 'Host' }, null, false);
host.sim.addPlayer('C', { name: 'Partner' });
host.sim.drain();
const client = new Session('client');
const hostHandlers = {}, clientHandlers = {}, messages = [];
host.partner = { peerId: 'client' };
host.net = {
  on(type, fn) { hostHandlers[type] = fn; },
  to(type, data) { messages.push({ type, data: structuredClone(data) }); },
};
client.hostPeer = 'host';
client.net = {
  on(type, fn) { clientHandlers[type] = fn; },
  to(type, data) { hostHandlers[type]?.(structuredClone(data), 'client'); },
};
host.wireHost();
client.wireClient();

function flush() {
  const sent = messages.splice(0);
  for (const message of sent) {
    if (message.type === 'slow') client.applySlow(JSON.parse(message.data));
    else if (message.type === 'meta') client.applyMeta(JSON.parse(message.data));
    else clientHandlers[message.type]?.(message.data, 'host');
  }
  return sent;
}

host.sim.setPose('C', 1.5, 3.5, -Math.PI / 2);
host.sendSnapshots(true);
flush();
assert.equal(client.state.players.C.area, 'restaurant');
assert.equal(client.gridFor().width, roomSize(state).width);
client.setPose(1.5, 3.5, -Math.PI / 2, true);
const oldPose = structuredClone(client.pose);
const oldKey = { key: 'e', area: 'restaurant', areaRev: 0 };
let transitions = 0;
client.on('event', (event) => {
  if (event.type !== 'areaChanged') return;
  transitions++;
  assert.equal(client.state.players.C.area, event.area, 'The area snapshot must arrive before its event');
  assert.equal(client.state.players.C.areaRev, event.areaRev);
});
client.press('e');
assert.equal(state.players.C.area, 'alley');
assert.equal(state.players.H.area, 'restaurant', 'Each chef must have an independent area');
host.update(TICK);
const transitionMessages = flush();
assert(transitionMessages.findIndex((message) => message.type === 'slow') < transitionMessages.findIndex((message) => message.type === 'ev'));
assert.equal(transitions, 1);
assert.equal(client.pose, null, 'A transition must clear the old predicted pose');
assert.equal(client.gridFor().width, ALLEY_SIZE.width);
assert.equal(client.gridFor().height, ALLEY_SIZE.height);
assert.equal(host.gridFor().width, roomSize(state).width);

const outside = structuredClone(state.players.C);
hostHandlers.pose(oldPose, 'client');
hostHandlers.key(oldKey, 'client');
assert.equal(state.players.C.area, 'alley', 'An old key must not enter the restaurant again');
assert.equal(state.players.C.areaRev, outside.areaRev);
assert.equal(state.players.C.x, outside.x, 'An old pose must not move a chef across the door');
assert.equal(state.players.C.z, outside.z);
assert.equal(state.players.C.space, outside.space, 'An old work input must not apply in the new area');
client.setPose(1.5, 3.5, 0, true, 'restaurant', 0);
assert.equal(client.pose, null, 'Local prediction must also reject an old area revision');

client.setPose(ALLEY_SPAWN.x - 1, ALLEY_SPAWN.z, 0, false);
client.update(TICK);
assert.equal(state.players.C.x, ALLEY_SPAWN.x - 1);
assert.equal(state.players.C.z, ALLEY_SPAWN.z);

host.sendFast();
flush();
const oldFast = structuredClone(client.fast);
assert(client.poses().poses.H);
host.sim.setPose('H', 1.5, 3.5, -Math.PI / 2);
host.press('e');
host.update(TICK);
flush();
assert.equal(client.state.players.H.area, 'alley');
client.fast = oldFast;
assert.equal(client.poses().poses.H, undefined, 'Fast coordinates from another area must not draw the partner');
host.sendFast();
flush();
assert.equal(client.poses().poses.H.area, 'alley');

host.sim.setPose('H', ALLEY_SPAWN.x, ALLEY_SPAWN.z, Math.PI / 2);
host.press('e');
host.update(TICK);
flush();
assert.equal(client.state.players.H.area, 'restaurant');
assert.equal(client.state.players.H.areaRev, 2);
client.fast = oldFast;
assert.equal(client.poses().poses.H, undefined, 'A matching area name must not accept an earlier visit');
host.sendFast();
flush();
assert.equal(client.poses().poses.H.areaRev, 2);

const smoke = ALLEY_OBJECTS.find((o) => o.type === 'smoking');
client.setPose(smoke.x - 0.5, smoke.z + 0.5, Math.PI / 2, false);
client.update(0.1);
client.press('e');
assert(state.players.C.smoking, 'The host must start the client cigarette');
const boostUntil = state.players.C.smokeBoostUntil;
assert.equal(boostUntil, state.t + SMOKE_BOOST_SECONDS);
host.sendSnapshots(true);
flush();
assert.equal(client.state.players.C.smokeBoostUntil, boostUntil, 'The client must receive the host boost timer');
assert.equal(movementMultiplier(client.state, client.state.players.C), 1.1);
assert.equal(movementMultiplier(state, state.players.C), 1.1);
assert.equal(movementMultiplier(state, state.players.H), 1, 'The other chef does not gain movement speed');

client.setPose(ALLEY_SPAWN.x, ALLEY_SPAWN.z, Math.PI / 2, false);
client.update(0.1);
client.press('e');
assert.equal(state.players.C.area, 'restaurant');
assert(state.players.C.smoking, 'The cigarette must stay lit through the door');
host.update(TICK);
flush();
assert.equal(client.state.players.C.smokeBoostUntil, boostUntil, 'The boost timer must survive a door transition');
assert.equal(movementMultiplier(client.state, client.state.players.C), 1.1);
host.sim.step(boostUntil - state.t);
host.sendSnapshots(true);
flush();
assert.equal(movementMultiplier(state, state.players.C), 1);
assert.equal(movementMultiplier(client.state, client.state.players.C), 1, 'Host and client must use the same boost expiry');
console.log('checked alley Session snapshots, independent areas, collision grids, stale inputs, and smoke boost snapshots/expiry');
