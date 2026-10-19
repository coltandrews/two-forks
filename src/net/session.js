// A running game, from one laptop's point of view.
//   host   runs the Sim, saves, and streams state to the partner.
//   client mirrors the host's state and sends its own moves and presses.
// Solo play is a host with nobody connected.
import { CFG, TICK, BUILD } from '../config.js';
import { Sim } from '../sim/sim.js';
import { buildGrid } from '../sim/world.js';
import { serialize } from '../sim/state.js';
import { Net } from './net.js';

const HOST_PID = 'H', CLIENT_PID = 'C';

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
    this.partner = null;          // { peerId, name } when connected
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

  gridFor() {
    const s = this.state;
    if (!s) return null;
    const key = JSON.stringify(s.building || null) + (s.mode || 'arcade') + JSON.stringify(s.owned?.areas || {}) + s.objects.map((o) => o.id + o.x + ',' + o.z).join('|');
    if (key !== this.gridKey) { this.grid = buildGrid(s); this.gridKey = key; }
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

  wireHost() {
    const n = this.net;
    n.on('hello', (d, peerId) => {
      if (!d || d.build !== BUILD) { n.to('welcome', { ok: false, reason: `Version mismatch (host ${BUILD}). Both laptops should refresh the page.` }, peerId); return; }
      if (this.partner && this.partner.peerId !== peerId && n.peers.has(this.partner.peerId)) { n.to('welcome', { ok: false, reason: 'This kitchen already has two chefs.' }, peerId); return; }
      if (this.partner && this.partner.peerId !== peerId) this.sim.removePlayer(CLIENT_PID);
      if (!this.sim.state.players[CLIENT_PID]) this.sim.addPlayer(CLIENT_PID, d.profile || {});
      else this.sim.updateProfile(CLIENT_PID, d.profile || {});
      this.partner = { peerId, name: this.sim.state.players[CLIENT_PID].name };
      this.lastSlow = ''; this.lastMeta = '';
      n.to('welcome', { ok: true, pid: CLIENT_PID, build: BUILD }, peerId);
      this.sendSnapshots(true);
      this.fire('partner', this.partner);
    });
    n.on('leave', (peerId) => {
      if (this.partner && this.partner.peerId === peerId) {
        this.sim.removePlayer(CLIENT_PID);
        this.partner = null;
        this.fire('partner', null);
      }
    });
    n.on('pose', (d, peerId) => {
      if (!this.partner || peerId !== this.partner.peerId || !Array.isArray(d)) return;
      this.sim.setPose(CLIENT_PID, d[0], d[1], d[2]);
      this.sim.setWork(CLIENT_PID, !!d[3]);
    });
    n.on('key', (d, peerId) => {
      if (!this.partner || peerId !== this.partner.peerId) return;
      if (d === 'e' || d === 'q') this.sim.press(CLIENT_PID, d);
    });
    n.on('cmd', (d, peerId) => {
      if (!this.partner || peerId !== this.partner.peerId || !d || typeof d.c !== 'string') return;
      this.sim.command(CLIENT_PID, d);
    });
  }

  sendSnapshots(force = false) {
    if (!this.net || !this.partner) return;
    const st = this.sim.state;
    const slow = JSON.stringify(liveOf(st), strip);
    if (force || slow !== this.lastSlow) { this.lastSlow = slow; this.net.to('slow', slow, this.partner.peerId); }
    if (force || this.metaAcc <= 0) {
      this.metaAcc = 0.5;
      const meta = JSON.stringify(metaOf(st));
      if (force || meta !== this.lastMeta) { this.lastMeta = meta; this.net.to('meta', meta, this.partner.peerId); }
    }
  }

  sendFast() {
    if (!this.net || !this.partner) return;
    const st = this.sim.state;
    const p = {}, g = {};
    for (const [pid, pl] of Object.entries(st.players)) p[pid] = [r2(pl.x), r2(pl.z), r2(pl.rot)];
    for (const party of st.parties) for (const gu of party.guests) g[gu.id] = [r2(gu.x), r2(gu.z), r2(gu.rot)];
    this.net.to('fast', { p, g }, this.partner.peerId);
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
      const timer = setTimeout(() => fail("Couldn't find that kitchen. Check the code and make sure your partner is hosting."), 20000);
      const hello = () => s.net.to('hello', { build: BUILD, profile });
      s.net.on('join', () => hello());
      hello();
      const again = setInterval(() => { if (!done) hello(); else clearInterval(again); }, 2500);
      s.net.on('welcome', (d, peerId) => {
        if (done) return;
        if (!d || !d.ok) { clearTimeout(timer); fail(d && d.reason ? d.reason : 'The host turned us away.'); return; }
        s.hostPeer = peerId;
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
    this.partner = { peerId: this.hostPeer };
    n.on('fast', (d, peerId) => { if (peerId === this.hostPeer && d) this.fast = d; });
    n.on('ev', (list, peerId) => { if (peerId === this.hostPeer && Array.isArray(list)) for (const e of list) this.fire('event', e); });
    n.on('leave', (peerId) => {
      if (peerId === this.hostPeer) { this.lost = true; this.fire('lost'); }
    });
    n.on('join', () => { if (this.lost) n.to('hello', { build: BUILD, profile: this.profile }); });
    n.on('welcome', (d, peerId) => { if (d && d.ok) { this.hostPeer = peerId; this.partner = { peerId }; if (this.lost) { this.lost = false; this.fire('back'); } } });
  }

  // ------------------------------------------------------------ shared API

  /** Local chef pose; the host applies it directly, the client streams it. */
  setPose(x, z, rot, space) {
    if (this.role === 'client') {
      this.pose = [r2(x), r2(z), r2(rot), space ? 1 : 0];
      const p = this.replica && this.replica.players[this.selfPid];
      if (p) { p.x = x; p.z = z; p.rot = rot; }
    } else {
      this.sim.setPose(this.selfPid, x, z, rot);
      this.sim.setWork(this.selfPid, space);
    }
  }

  press(key) {
    if (this.role === 'client') this.net.to('key', key, this.hostPeer);
    else this.sim.press(this.selfPid, key);
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
        if (evs.some((e) => ['chapter', 'chefLevelUp', 'dayEnd'].includes(e.type))) this.sendSnapshots(true);
        const mine = [], theirs = [];
        for (const e of evs) {
          if (!e.to || e.to === this.selfPid) mine.push(e);
          if (!e.to || e.to === CLIENT_PID) theirs.push(e);
        }
        for (const e of mine) this.fire('event', e);
        if (theirs.length && this.net && this.partner) this.net.to('ev', theirs, this.partner.peerId);
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
    for (const [pid, a] of Object.entries(this.fast.p || {})) if (pid !== this.selfPid) poses[pid] = { x: a[0], z: a[1], rot: a[2] };
    const guests = {};
    for (const [id, a] of Object.entries(this.fast.g || {})) guests[id] = { x: a[0], z: a[1], rot: a[2] };
    return { poses, guests };
  }

  saveable() { return this.role !== 'client' ? serialize(this.sim.state) : null; }

  close() { if (this.net) this.net.close(); }
}

export { HOST_PID, CLIENT_PID };
