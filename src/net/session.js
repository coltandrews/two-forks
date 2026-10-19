// A running game, from one laptop's point of view.
//   host   runs the Sim, saves, and streams state to every joined chef.
//   client mirrors the host's state and sends its own moves and presses.
// Solo play is a host with nobody connected. Up to MAX_PLAYERS chefs in all.
import { CFG, TICK, BUILD, MAX_PLAYERS } from '../config.js';
import { Sim } from '../sim/sim.js';
import { buildGrid } from '../sim/world.js';
import { serialize } from '../sim/state.js';
import { Net } from './net.js';

const HOST_PID = 'H', CLIENT_PID = 'C';
// The first guest keeps 'C' so older tests and habits still line up.
const CLIENT_PIDS = ['C', 'C2', 'C3'].slice(0, MAX_PLAYERS - 1);

const strip = (k, v) => (k === 'path' || k === 'tx' || k === 'tz' || k === 'moving' ? undefined : v);
const META_KEYS = ['stock', 'orders', 'history', 'report', 'reviews', 'lifetime', 'unlocked', 'spentUpgrades', 'spentMarketing', 'tipJar', 'created', 'mode', 'building', 'xp', 'level', 'prestige', 'owned', 'chapter', 'chapterDay', 'storyStats', 'debt', 'debtDays'];

function liveOf(state) {
  const o = {};
  for (const k of Object.keys(state)) if (!META_KEYS.includes(k)) o[k] = state[k];
  return o;
}
function metaOf(state) {
  const o = {};
  for (const k of META_KEYS) o[k] = state[k];
  return o;
}
const r2 = (v) => Math.round(v * 100) / 100;

export class Session {
  constructor(role) {
    this.role = role;
    this.listeners = {};
    this.selfPid = role === 'client' ? CLIENT_PID : HOST_PID;
    this.net = null;
    this.clients = new Map();     // host: peerId -> { peerId, pid, name }
    this.hostPeer = null;         // client: the host's peerId
    this.acc = 0;
    this.sendSlowAcc = 0;
    this.sendFastAcc = 0;
    this.metaAcc = 0;
    this.lastSlow = '';
    this.lastMeta = '';
    this.since = 0;               // seconds since the last snapshot (client)
    this.layoutRev = -1;
    this.grid = null;
  }

  on(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); }
  fire(type, ...a) { for (const fn of this.listeners[type] || []) fn(...a); }

  get state() { return this.role === 'client' ? this.replica : this.sim.state; }

  /** Names of the other chefs connected to this host. */
  get crewNames() { return [...this.clients.values()].map((c) => c.name); }

  gridFor(area = this.state?.players[this.selfPid]?.area || 'restaurant') {
    const s = this.state;
    if (!s) return null;
    const key = area + JSON.stringify(s.building || null) + (s.mode || 'arcade') + JSON.stringify(s.owned?.areas || {}) + s.objects.map((o) => o.id + o.x + ',' + o.z).join('|');
    if (key !== this.gridKey) { this.grid = buildGrid(s, area); this.gridKey = key; }
    return this.grid;
  }

  // ------------------------------------------------------------ host

  static async host(state, profile, code, withNet = true) {
    const s = new Session('host');
    s.sim = new Sim(state);
    s.sim.addPlayer(HOST_PID, profile);
    s.profile = profile;
    if (withNet) {
      s.code = code;
      s.net = new Net();
      try {
        await s.net.open(code);
        s.wireHost();
      } catch (e) {
        console.warn('Could not open the room', e);
        s.netError = 'Online play is unavailable right now. You can still play solo.';
        s.net = null;
      }
    }
    return s;
  }

  /** Drops a joined chef: their player, their slot, and tells the UI. */
  dropClient(peerId) {
    const c = this.clients.get(peerId);
    if (!c) return;
    this.clients.delete(peerId);
    this.sim.removePlayer(c.pid);
    this.fire('partner', null, c.name);
  }

  /** Forgets chefs whose connection is gone without a leave message. */
  pruneClients() {
    const peers = this.net && this.net.peers;
    if (!peers) return;
    for (const peerId of [...this.clients.keys()]) if (!peers.has(peerId)) this.dropClient(peerId);
  }

  wireHost() {
    const n = this.net;
    const pidOf = (peerId) => this.clients.get(peerId)?.pid;
    n.on('hello', (d, peerId) => {
      if (!d || d.build !== BUILD) { n.to('welcome', { ok: false, reason: `Version mismatch (host ${BUILD}). Everyone should refresh the page.` }, peerId); return; }
      let c = this.clients.get(peerId);
      const fresh = !c;
      if (!c) {
        this.pruneClients();
        const used = new Set([...this.clients.values()].map((x) => x.pid));
        const pid = CLIENT_PIDS.find((x) => !used.has(x));
        if (!pid) { n.to('welcome', { ok: false, reason: `This kitchen is full (${MAX_PLAYERS} chefs).` }, peerId); return; }
        c = { peerId, pid, name: '' };
        this.clients.set(peerId, c);
      }
      if (!this.sim.state.players[c.pid]) this.sim.addPlayer(c.pid, d.profile || {});
      else this.sim.updateProfile(c.pid, d.profile || {});
      c.name = this.sim.state.players[c.pid].name;
      this.lastSlow = ''; this.lastMeta = '';
      n.to('welcome', { ok: true, pid: c.pid, build: BUILD }, peerId);
      this.sendSnapshots(true);
      if (fresh) this.fire('partner', { pid: c.pid, name: c.name });
    });
    n.on('leave', (peerId) => this.dropClient(peerId));
    n.on('pose', (d, peerId) => {
      const pid = pidOf(peerId);
      if (!pid || !Array.isArray(d)) return;
      const p = this.sim.state.players[pid];
      if (!p || d[4] !== (p.area || 'restaurant') || d[5] !== (p.areaRev || 0)) return;
      this.sim.setPose(pid, d[0], d[1], d[2], d[4], d[5]);
      this.sim.setWork(pid, !!d[3], d[4], d[5]);
    });
    n.on('key', (d, peerId) => {
      const pid = pidOf(peerId);
      if (!pid || !d) return;
      const p = this.sim.state.players[pid];
      if (!p || d.area !== (p.area || 'restaurant') || d.areaRev !== (p.areaRev || 0)) return;
      if (d.key === 'e' || d.key === 'q') this.sim.press(pid, d.key, d.area, d.areaRev);
    });
    n.on('cmd', (d, peerId) => {
      const pid = pidOf(peerId);
      if (!pid || !d || typeof d.c !== 'string') return;
      this.sim.command(pid, d);
    });
    n.on('chat', (d, peerId) => {
      const pid = pidOf(peerId);
      if (!pid || !d || typeof d.text !== 'string') return;
      this.fire('chat', pid, d.text);
      // Joined chefs only talk to the host, so pass the line along to the rest.
      for (const other of this.clients.values()) if (other.peerId !== peerId) n.to('chat', { text: d.text, pid }, other.peerId);
    });
  }

  sendSnapshots(force = false) {
    if (!this.net || !this.clients.size) return;
    const st = this.sim.state;
    const slow = JSON.stringify(liveOf(st), strip);
    if (force || slow !== this.lastSlow) {
      this.lastSlow = slow;
      for (const c of this.clients.values()) this.net.to('slow', slow, c.peerId);
    }
    if (force || this.metaAcc <= 0) {
      this.metaAcc = 0.5;
      const meta = JSON.stringify(metaOf(st));
      if (force || meta !== this.lastMeta) {
        this.lastMeta = meta;
        for (const c of this.clients.values()) this.net.to('meta', meta, c.peerId);
      }
    }
  }

  sendFast() {
    if (!this.net || !this.clients.size) return;
    const st = this.sim.state;
    const p = {}, g = {};
    for (const [pid, pl] of Object.entries(st.players)) p[pid] = [r2(pl.x), r2(pl.z), r2(pl.rot), pl.area || 'restaurant', pl.areaRev || 0];
    for (const party of st.parties) for (const gu of party.guests) if (!gu.exited) g[gu.id] = [r2(gu.x), r2(gu.z), r2(gu.rot)];
    const msg = { p, g };
    for (const c of this.clients.values()) this.net.to('fast', msg, c.peerId);
  }

  // ------------------------------------------------------------ client

  static async join(code, profile) {
    const s = new Session('client');
    s.code = code;
    s.profile = profile;
    s.net = new Net();
    await s.net.open(code);
    return new Promise((resolve, reject) => {
      let done = false;
      const fail = (msg) => { if (!done) { done = true; s.net.close(); reject(new Error(msg)); } };
      const timer = setTimeout(() => fail("Couldn't find that kitchen. Check the code and make sure the host is hosting."), 20000);
      const hello = () => s.net.to('hello', { build: BUILD, profile });
      s.net.on('join', () => hello());
      hello();
      const again = setInterval(() => { if (!done) hello(); else clearInterval(again); }, 2500);
      s.net.on('welcome', (d, peerId) => {
        if (done) return;
        if (!d || !d.ok) { clearTimeout(timer); fail(d && d.reason ? d.reason : 'The host turned us away.'); return; }
        s.hostPeer = peerId;
        s.selfPid = d.pid || CLIENT_PID;
        s.welcomed = true;
      });
      s.net.on('slow', (d, peerId) => {
        if (!s.welcomed || peerId !== s.hostPeer) return;
        try { s.applySlow(JSON.parse(d)); } catch (e) { console.warn(e); return; }
        if (!done && s.replica && s.metaIn) { done = true; clearTimeout(timer); s.wireClient(); resolve(s); }
      });
      s.net.on('meta', (d, peerId) => {
        if (!s.welcomed || peerId !== s.hostPeer) return;
        try { s.applyMeta(JSON.parse(d)); } catch (e) { console.warn(e); return; }
        if (!done && s.replica && s.metaIn) { done = true; clearTimeout(timer); s.wireClient(); resolve(s); }
      });
    });
  }

  applySlow(live) {
    const meta = this.metaIn || {};
    const before = this.replica?.players[this.selfPid];
    const after = live.players[this.selfPid];
    if (!before || !after || before.area !== after.area || before.areaRev !== after.areaRev) this.pose = null;
    this.liveIn = live;
    this.replica = { ...live, ...meta };
    this.since = 0;
  }

  applyMeta(meta) {
    this.metaIn = meta;
    if (this.liveIn) this.replica = { ...this.liveIn, ...meta };
  }

  wireClient() {
    const n = this.net;
    n.on('fast', (d, peerId) => { if (peerId === this.hostPeer && d) this.fast = d; });
    n.on('ev', (list, peerId) => { if (peerId === this.hostPeer && Array.isArray(list)) for (const e of list) this.fire('event', e); });
    n.on('chat', (d, peerId) => {
      if (peerId !== this.hostPeer || !d || typeof d.text !== 'string') return;
      const pid = typeof d.pid === 'string' ? d.pid : HOST_PID;
      if (pid !== this.selfPid) this.fire('chat', pid, d.text);
    });
    n.on('leave', (peerId) => {
      if (peerId === this.hostPeer) { this.lost = true; this.fire('lost'); }
    });
    n.on('join', () => { if (this.lost) n.to('hello', { build: BUILD, profile: this.profile }); });
    n.on('welcome', (d, peerId) => {
      if (!d || !d.ok) return;
      this.hostPeer = peerId;
      if (d.pid && d.pid !== this.selfPid) { this.selfPid = d.pid; this.pose = null; }
      if (this.lost) { this.lost = false; this.fire('back'); }
    });
  }

  // ------------------------------------------------------------ shared API

  /** Local chef pose; the host applies it directly, the client streams it. */
  setPose(x, z, rot, space, area = this.state?.players[this.selfPid]?.area || 'restaurant', areaRev = this.state?.players[this.selfPid]?.areaRev || 0) {
    const p = this.state?.players[this.selfPid];
    if (!p || area !== (p.area || 'restaurant') || areaRev !== (p.areaRev || 0)) return;
    if (this.role === 'client') {
      this.pose = [r2(x), r2(z), r2(rot), space ? 1 : 0, area, areaRev];
      p.x = x; p.z = z; p.rot = rot;
    } else {
      this.sim.setPose(this.selfPid, x, z, rot, area, areaRev);
      this.sim.setWork(this.selfPid, space, area, areaRev);
    }
  }

  press(key) {
    const p = this.state?.players[this.selfPid];
    if (!p) return;
    const area = p.area || 'restaurant', areaRev = p.areaRev || 0;
    if (this.role === 'client') this.net.to('key', { key, area, areaRev }, this.hostPeer);
    else this.sim.press(this.selfPid, key, area, areaRev);
  }

  /** True when there is another chef to talk to. */
  get canChat() {
    if (!this.net) return false;
    return this.role === 'client' ? !!(this.hostPeer && !this.lost) : this.clients.size > 0;
  }

  /** Sends a chat line to the other chefs and shows it locally. Chat is not game state. */
  chat(text) {
    if (!this.canChat) return false;
    if (this.role === 'client') this.net.to('chat', { text }, this.hostPeer);
    else for (const c of this.clients.values()) this.net.to('chat', { text, pid: this.selfPid }, c.peerId);
    this.fire('chat', this.selfPid, text);
    return true;
  }

  command(c) {
    if (this.role === 'client') this.net.to('cmd', c, this.hostPeer);
    else return this.sim.command(this.selfPid, c);
  }

  /** Called every frame with real seconds. */
  update(dt) {
    if (this.role === 'client') {
      this.since += dt;
      this.sendFastAcc -= dt;
      if (this.sendFastAcc <= 0 && this.pose) {
        this.sendFastAcc = 1 / CFG.fastHz;
        this.net.to('pose', this.pose, this.hostPeer);
      }
      return;
    }
    this.acc += Math.min(dt, 0.25);
    let steps = 0;
    while (this.acc >= TICK && steps < 8) {
      this.sim.step(TICK);
      this.acc -= TICK;
      steps++;
      const evs = this.sim.drain();
      if (evs.length) {
        if (evs.some((e) => ['chapter', 'chefLevelUp', 'dayEnd', 'areaChanged'].includes(e.type))) this.sendSnapshots(true);
        for (const e of evs) if (!e.to || e.to === this.selfPid) this.fire('event', e);
        if (this.net) {
          for (const c of this.clients.values()) {
            const theirs = evs.filter((e) => !e.to || e.to === c.pid);
            if (theirs.length) this.net.to('ev', theirs, c.peerId);
          }
        }
      }
    }
    this.sendSlowAcc -= dt;
    this.sendFastAcc -= dt;
    this.metaAcc -= dt;
    if (this.sendSlowAcc <= 0) { this.sendSlowAcc = 1 / CFG.slowHz; this.sendSnapshots(); }
    if (this.sendFastAcc <= 0) { this.sendFastAcc = 1 / CFG.fastHz; this.sendFast(); }
  }

  /** Positions to draw, smoothing the partner and guests on the client. */
  poses() {
    if (this.role !== 'client' || !this.fast) return { poses: null, guests: null };
    const poses = {};
    for (const [pid, a] of Object.entries(this.fast.p || {})) {
      const p = this.replica.players[pid];
      if (pid !== this.selfPid && p && a[3] === (p.area || 'restaurant') && a[4] === (p.areaRev || 0)) poses[pid] = { x: a[0], z: a[1], rot: a[2], area: a[3], areaRev: a[4] };
    }
    const guests = {};
    for (const [id, a] of Object.entries(this.fast.g || {})) guests[id] = { x: a[0], z: a[1], rot: a[2] };
    return { poses, guests };
  }

  saveable() { return this.role !== 'client' ? serialize(this.sim.state) : null; }

  close() { if (this.net) this.net.close(); }
}

export { HOST_PID, CLIENT_PID };
