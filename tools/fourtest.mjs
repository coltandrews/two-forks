import assert from 'node:assert/strict';
import { TICK, BUILD, MAX_PLAYERS } from '../src/config.js';
import { newState } from '../src/sim/state.js';
import { expectedParties } from '../src/sim/economy.js';
import { Session } from '../src/net/session.js';

// A host and several clients on a fake in-memory room: every send goes
// straight to the target's handlers, the way Trystero delivers by peerId.
assert.equal(MAX_PLAYERS, 4);
const handlers = new Map();   // peerId -> { type: fn }
const peers = new Set();
function fakeNet(selfId) {
  const own = {};
  handlers.set(selfId, own);
  peers.add(selfId);
  return {
    peers,
    on(type, fn) { own[type] = fn; },
    to(type, data, target) {
      const copy = structuredClone(data);
      const targets = target ? [target] : [...handlers.keys()].filter((id) => id !== selfId);
      for (const id of targets) handlers.get(id)?.[type]?.(copy, selfId);
    },
  };
}

const state = newState({ cuisine: 'southern', mode: 'arcade' });
const host = await Session.host(state, { name: 'Host' }, null, false);
host.net = fakeNet('host');
host.wireHost();
const hostChat = [];
host.on('chat', (pid, text) => hostChat.push([pid, text]));

function makeClient(name) {
  const c = new Session('client');
  c.net = fakeNet(name);
  c.profile = { name };
  c.chatIn = [];
  c.rejected = null;
  c.net.on('welcome', (d, peerId) => {
    if (!d.ok) { c.rejected = d.reason; return; }
    c.hostPeer = peerId; c.selfPid = d.pid; c.welcomed = true;
  });
  c.net.on('slow', (d) => c.applySlow(JSON.parse(d)));
  c.net.on('meta', (d) => c.applyMeta(JSON.parse(d)));
  c.net.to('hello', { build: BUILD, profile: c.profile }, 'host');
  if (c.welcomed) {
    c.wireClient();
    c.on('chat', (pid, text) => c.chatIn.push([pid, text]));
  }
  return c;
}

const ana = makeClient('Ana'), ben = makeClient('Ben'), cy = makeClient('Cy');
assert.deepEqual([ana.selfPid, ben.selfPid, cy.selfPid], ['C', 'C2', 'C3']);
assert.equal(Object.keys(state.players).length, 4);
assert.deepEqual(host.crewNames, ['Ana', 'Ben', 'Cy']);

// Everyone starts on their own tile.
const spots = Object.values(state.players).map((p) => `${p.x},${p.z}`);
assert.equal(new Set(spots).size, 4, 'Four chefs need four spawn spots');
assert.deepEqual(Object.values(state.players).map((p) => p.slot).sort(), [0, 1, 2, 3]);

// Each client mirrors the whole crew.
for (const c of [ana, ben, cy]) assert.deepEqual(Object.keys(c.state.players).sort(), ['C', 'C2', 'C3', 'H']);

// A fifth chef is turned away.
const dee = makeClient('Dee');
assert.match(dee.rejected, /full/);
assert.equal(Object.keys(state.players).length, 4);

// Inputs from each peer move only that peer's chef.
const before = Object.fromEntries(Object.entries(state.players).map(([id, p]) => [id, p.x]));
ben.setPose(6.5, 3.5, 0, false);
ben.net.to('pose', ben.pose, 'host');
assert.ok(state.players.C2.x < before.C2, 'Ben moved toward his pose');
for (const id of ['H', 'C', 'C3']) assert.equal(state.players[id].x, before[id], `${id} stayed put`);

// Chat reaches everyone once and never echoes to the sender.
ana.chat('hi all');
assert.deepEqual(hostChat, [['C', 'hi all']]);
assert.deepEqual(ben.chatIn, [['C', 'hi all']]);
assert.deepEqual(cy.chatIn, [['C', 'hi all']]);
assert.deepEqual(ana.chatIn, [['C', 'hi all']], 'The sender sees their line once (locally), never an echo');
host.chat('order up');
for (const c of [ana, ben, cy]) assert.deepEqual(c.chatIn.at(-1), ['H', 'order up']);

// Ready-up waits for all four.
for (const [who, pid] of [[host, 'H'], [ana, 'C'], [ben, 'C2']]) {
  if (who === host) host.command({ c: 'ready', on: true }); else who.command({ c: 'ready', on: true });
  assert.ok(state.ready[pid]);
}
assert.equal(state.phase === 'morning' || state.phase === 'office', true, 'Doors stay shut until the last chef is ready');

// A leaving chef frees their slot for someone new.
peers.delete('Ben');
handlers.delete('Ben');
handlers.get('host').leave('Ben');
assert.equal(state.players.C2, undefined);
assert.equal(state.ready.C2, undefined);
const eve = makeClient('Eve');
assert.equal(eve.selfPid, 'C2');
assert.equal(state.players.C2.slot, 2, 'Eve takes the spot Ben left');
assert.equal(Object.keys(state.players).length, 4);

// Snapshots and per-chef events flow to every client on the host's tick.
host.update(TICK * 10);
for (const c of [ana, cy, eve]) assert.ok(c.state.players[c.selfPid]);

// Bigger crews get more guests, but never fewer.
const counts = [1, 2, 3, 4].map((n) => expectedParties(state, 1, n));
for (let i = 1; i < counts.length; i++) assert.ok(counts[i] > counts[i - 1], `traffic should grow with crew size: ${counts}`);

console.log('four-player session ok');
