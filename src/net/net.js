// Peer-to-peer link between the two laptops. Trystero finds the other
// browser through public Nostr relays, then the game talks over a direct
// WebRTC data channel. If the network blocks direct connections, /api/ice
// can hand out TURN relay credentials (see README).
import { APP_ID, BUILD } from '../config.js';

const TRYSTERO = 'https://cdn.jsdelivr.net/npm/trystero@0.25.2/+esm';
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ';

export function makeCode() {
  let s = '';
  for (let i = 0; i < 4; i++) s += CODE_CHARS[(Math.random() * CODE_CHARS.length) | 0];
  return s;
}

export function cleanCode(s) {
  return String(s || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
}

async function fetchIce() {
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 2500);
    const r = await fetch('/api/ice', { signal: ctl.signal });
    clearTimeout(timer);
    if (!r.ok) return null;
    const j = await r.json();
    return Array.isArray(j.iceServers) && j.iceServers.length ? j.iceServers : null;
  } catch { return null; }
}

/** Works with both the newer object-style and older tuple-style Trystero APIs. */
function bindAction(room, id, handler) {
  const a = room.makeAction(id);
  if (Array.isArray(a)) {
    const [send, get] = a;
    get((data, peerId) => handler(data, peerId));
    return (data, target) => send(data, target);
  }
  a.onMessage = (data, meta) => handler(data, meta && meta.peerId);
  return (data, target) => a.send(data, target ? { target } : undefined);
}

function onPeer(room, ev, cb) {
  if (typeof room[ev] === 'function') {
    try { room[ev](cb); } catch { /* new API with a default handler */ }
  }
  try { room[ev] = cb; } catch { /* old API: method is read-only */ }
}

export class Net {
  constructor() {
    this.room = null;
    this.code = null;
    this.handlers = {};
    this.send = {};
    this.peers = new Set();
  }

  on(type, fn) { this.handlers[type] = fn; }

  emit(type, ...args) { const h = this.handlers[type]; if (h) h(...args); }

  async open(code) {
    const mod = await import(TRYSTERO);
    const ice = await fetchIce();
    const cfg = { appId: APP_ID, password: 'two-forks:' + code };
    if (ice) {
      cfg.rtcConfig = { iceServers: ice };
      cfg.turnConfig = ice.filter((s) => [].concat(s.urls).some((u) => /^turns?:/.test(u)));
    }
    this.code = code;
    this.selfId = mod.selfId;
    this.room = mod.joinRoom(cfg, 'tf-' + code);
    for (const id of ['hello', 'welcome', 'slow', 'meta', 'fast', 'pose', 'key', 'cmd', 'ev', 'chat']) {
      this.send[id] = bindAction(this.room, id, (data, peerId) => this.emit(id, data, peerId));
    }
    onPeer(this.room, 'onPeerJoin', (peerId) => { this.peers.add(peerId); this.emit('join', peerId); });
    onPeer(this.room, 'onPeerLeave', (peerId) => { this.peers.delete(peerId); this.emit('leave', peerId); });
    this.relayed = !!ice;
    return this;
  }

  to(type, data, peerId) {
    const f = this.send[type];
    if (!f) return;
    try { f(data, peerId); } catch (e) { console.warn('send failed', type, e); }
  }

  close() {
    try { if (this.room) this.room.leave(); } catch { /* ignore */ }
    this.room = null;
    this.peers.clear();
  }
}

export { BUILD };
