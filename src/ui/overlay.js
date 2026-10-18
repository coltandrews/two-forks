// DOM markers that float over the 3D scene: cooking rings, table bubbles,
// name tags, counts and floating "+$" text.
import { CFG } from '../config.js';
import { stepFor } from '../data/ingredients.js';
import { HEAT_TYPES } from '../data/layout.js';

const ICON = {
  menu: '<svg viewBox="0 0 24 24"><path d="M6 3h12v18H6z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M9 8h6M9 12h6M9 16h4" stroke="currentColor" stroke-width="2"/></svg>',
  bang: '<svg viewBox="0 0 24 24"><path d="M12 3v12" stroke="currentColor" stroke-width="3.4" stroke-linecap="round"/><circle cx="12" cy="20" r="2" fill="currentColor"/></svg>',
  plate: '<svg viewBox="0 0 24 24"><circle cx="12" cy="13" r="8" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="13" r="4" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M3 4v6M21 4v16" stroke="currentColor" stroke-width="2"/></svg>',
  fork: '<svg viewBox="0 0 24 24"><path d="M8 3v6a2 2 0 0 0 4 0V3M10 9v12M16 3c-2 2-2 7 0 9v9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  dollar: '<svg viewBox="0 0 24 24"><path d="M16 7c-1-1.5-3-2-4.5-2C9 5 7.5 6.2 7.5 8s1.8 2.6 4.5 3.3S17 13 17 15.2 15 19 12 19c-2 0-4-.8-5-2.3M12 3v18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
  cake: '<svg viewBox="0 0 24 24"><path d="M4 21h16v-8H4zM4 16c2 1.5 4 1.5 6 0s4-1.5 6 0 4 1.5 4 0" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 9v4M12 4l1 2-1 2-1-2z" stroke="currentColor" stroke-width="2" fill="currentColor"/></svg>',
  dots: '<svg viewBox="0 0 24 24"><circle cx="6" cy="12" r="2" fill="currentColor"/><circle cx="12" cy="12" r="2" fill="currentColor"/><circle cx="18" cy="12" r="2" fill="currentColor"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="M5 12l5 5 9-10" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  fire: '<svg viewBox="0 0 24 24"><path d="M12 2c1 4 5 6 5 11a5 5 0 0 1-10 0c0-3 2-4 2-7 2 1 3 3 3 5 1-1 1-3 0-9z" fill="currentColor"/></svg>',
  x: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="3.4" stroke-linecap="round"/></svg>',
  drink: '<svg viewBox="0 0 24 24"><path d="M6 4h12l-2 17H8z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M7 9h10" stroke="currentColor" stroke-width="2"/></svg>',
  angry: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 9l3 1M16 9l-3 1M8 17c2-2 6-2 8 0" stroke="currentColor" stroke-width="2" fill="none"/></svg>',
};

export class Overlay {
  constructor(root, view) {
    this.root = root;
    this.view = view;
    this.els = new Map();
    this.floats = [];
    this.frame = 0;
  }

  el(key, cls) {
    let e = this.els.get(key);
    if (!e) {
      e = document.createElement('div');
      e.className = 'mk ' + cls;
      this.root.appendChild(e);
      this.els.set(key, e);
      e._html = '';
    }
    e._used = this.frame;
    return e;
  }

  html(e, h) { if (e._html !== h) { e.innerHTML = h; e._html = h; } }

  place(e, a, dy = 0) {
    if (!a) { e.style.display = 'none'; return; }
    const p = this.view.toScreen(a.x, a.y, a.z);
    e.style.display = p.on ? '' : 'none';
    e.style.transform = `translate(${p.x.toFixed(1)}px, ${(p.y + dy).toFixed(1)}px) translate(-50%, -100%)`;
  }

  /** extra: seconds since the last snapshot, so client rings move smoothly. */
  update(state, opts = {}) {
    this.frame++;
    const extra = opts.extra || 0;
    const showAll = state.phase !== 'office';
    for (const o of state.objects) {
      if (!showAll) break;
      const a = this.view.anchorOf(o.id);
      if (!a) continue;
      if (HEAT_TYPES.has(o.type) && o.slot && o.slot.k === 'ing') {
        const it = o.slot;
        const e = this.el(o.id, 'ring');
        let cls = 'ring', h = '';
        if (it.st === 'burnt') { cls += ' burnt'; h = ICON.x; }
        else {
          const step = stepFor(it.ing, it.st, o.type);
          if (step) {
            const p = Math.min(1, (it.t + extra) / step.t);
            e.style.setProperty('--p', (p * 100).toFixed(1));
            cls += ' cooking';
            h = it.n > 1 ? `<b>${it.n}</b>` : '';
          } else if (o.type === 'pot') {
            cls += it.q < 1 ? ' warn' : ' done';
            h = it.n > 1 ? `<b>${it.n}</b>` : ICON.check;
          } else {
            const limit = CFG.burn[o.type] || 30;
            const over = it.over + extra;
            const danger = over / limit;
            e.style.setProperty('--p', (Math.min(1, danger) * 100).toFixed(1));
            cls += danger > 0.5 ? ' warn' : ' done';
            h = danger > 0.5 ? ICON.fire : (it.n > 1 ? `<b>${it.n}</b>` : ICON.check);
          }
        }
        if (e.className !== 'mk ' + cls) e.className = 'mk ' + cls;
        this.html(e, h);
        this.place(e, a);
      } else if (o.type === 'board' && o.slot && o.slot.k === 'ing' && o.slot.t > 0) {
        const step = stepFor(o.slot.ing, o.slot.st, 'board');
        if (step) {
          const e = this.el(o.id, 'ring cooking chop');
          e.style.setProperty('--p', (Math.min(1, o.slot.t / step.t) * 100).toFixed(1));
          this.html(e, '');
          this.place(e, a);
        }
      } else if (o.type === 'sink' && o.n > 0) {
        const e = this.el(o.id, 'badge sinkb');
        e.style.setProperty('--p', ((o.wash || 0) * 100).toFixed(1));
        this.html(e, `${o.n} dirty`);
        this.place(e, a);
      } else if (o.type === 'well' && o.well) {
        const e = this.el(o.id, 'badge well');
        this.html(e, `×${o.well.n}`);
        this.place(e, { ...a, y: a.y - 0.25 });
      } else if (o.type === 'dock' && o.boxes.length) {
        const e = this.el(o.id, 'badge dockb');
        this.html(e, `${o.boxes.length} case${o.boxes.length > 1 ? 's' : ''}`);
        this.place(e, { ...a, y: 1.2 + Math.min(3, Math.ceil(o.boxes.length / 4)) * 0.3 });
      } else if (o.type === 'rack' && o.n <= 3) {
        const e = this.el(o.id, 'badge low');
        this.html(e, o.n ? `${o.n} plates` : 'No plates!');
        this.place(e, { ...a, y: a.y + 0.3 });
      } else if (o.type === 'host') {
        const q = state.parties.filter((p) => p.state === 'waiting' || p.state === 'entering').length;
        if (q && showAll) {
          const waiting = state.parties.find((p) => p.state === 'waiting');
          const mood = waiting ? waiting.mood : 100;
          const e = this.el(o.id, 'bubble host');
          this.html(e, `<span class="ic">${ICON.bang}</span><span>${q} waiting</span>${moodBar(mood)}`);
          this.place(e, { ...a, y: 2.0 });
        }
      } else if (o.type === 'table') {
        this.tableMarker(state, o, a);
      }
    }
    // Chef name tags.
    for (const [pid, p] of Object.entries(state.players)) {
      const e = this.el('chef:' + pid, 'tag');
      const col = p.look.apron ? p.look.apronColor : p.look.shirt;
      this.html(e, `<span style="--c:${col}">${esc(p.name)}</span>`);
      this.place(e, this.view.chefAnchor(pid));
    }
    // Following parties show above their first guest.
    for (const party of state.parties) {
      if (party.state !== 'following') continue;
      const e = this.el('follow:' + party.id, 'bubble small');
      this.html(e, `<span class="ic">${ICON.dots}</span><span>Party of ${party.size}</span>`);
      this.place(e, this.view.guestAnchor(party.guests[0].id));
    }
    this.updateFloats(opts.dt || 0.016);
    for (const [k, e] of this.els) {
      if (e._used !== this.frame) { e.remove(); this.els.delete(k); }
    }
  }

  tableMarker(state, o, a) {
    const num = this.el('tn:' + o.id, 'tnum');
    this.html(num, String(o.num));
    this.place(num, { x: a.x, y: 0.95, z: a.z }, 0);
    const p = o.party && state.parties.find((x) => x.id === o.party);
    if (!p && o.dirty) {
      const e = this.el('tb:' + o.id, 'bubble dirty');
      this.html(e, `<span class="ic">${ICON.plate}</span><span>Clear table</span>`);
      this.place(e, a);
      return;
    }
    if (!p) return;
    let icon = ICON.dots, label = '', cls = 'bubble';
    switch (p.state) {
      case 'seating': case 'browsing': icon = ICON.menu; label = 'Reading menu'; cls += ' quiet'; break;
      case 'ordering': icon = ICON.bang; label = 'Ready to order'; cls += ' call'; break;
      case 'dessertReady': icon = ICON.cake; label = 'Dessert?'; cls += ' call'; break;
      case 'waitingFood': case 'dessertWait': {
        const open = p.items.filter((x) => !x.served).length;
        const drinks = p.drinks.filter((x) => !x.served).length;
        icon = ICON.plate;
        label = `#${p.ticket} · ${open} dish${open === 1 ? '' : 'es'}` + (drinks ? ` · ${drinks} drink${drinks > 1 ? 's' : ''}` : '');
        cls += ' wait';
        break;
      }
      case 'eating': case 'dessertEat': {
        icon = ICON.fork; label = 'Eating'; cls += ' quiet';
        const drinks = p.drinks.filter((x) => !x.served).length;
        if (drinks) label += ` · ${drinks} drink${drinks > 1 ? 's' : ''}`;
        break;
      }
      case 'paying': icon = ICON.dollar; label = 'Check, please'; cls += ' call pay'; break;
      default: return;
    }
    if (p.mood < 25 && p.state !== 'eating') { cls += ' angry'; }
    const e = this.el('tb:' + o.id, cls);
    if (e.className !== 'mk ' + cls) e.className = 'mk ' + cls;
    const work = p.workP > 0 && (p.state === 'ordering' || p.state === 'dessertReady' || p.state === 'paying') ? `<i class="wp" style="width:${Math.min(100, p.workP * 100).toFixed(0)}%"></i>` : '';
    const critic = p.kind === 'critic' ? '<em>Critic</em>' : '';
    this.html(e, `<span class="ic">${icon}</span><span>${label}</span>${critic}${moodBar(p.mood)}${work}`);
    this.place(e, a);
  }

  float(text, x, y, z, cls = '') {
    const e = document.createElement('div');
    e.className = 'mk float ' + cls;
    e.textContent = text;
    this.root.appendChild(e);
    this.floats.push({ e, x, y, z, t: 0 });
  }

  updateFloats(dt) {
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i];
      f.t += dt;
      if (f.t > 1.8) { f.e.remove(); this.floats.splice(i, 1); continue; }
      const p = this.view.toScreen(f.x, f.y + f.t * 0.6, f.z);
      f.e.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -100%)`;
      f.e.style.opacity = String(Math.min(1, 2.2 - f.t * 1.2));
    }
  }

  clear() {
    for (const [, e] of this.els) e.remove();
    this.els.clear();
    for (const f of this.floats) f.e.remove();
    this.floats = [];
  }
}

function moodBar(m) {
  const v = Math.max(0, Math.min(100, m));
  const c = v > 60 ? 'good' : v > 30 ? 'mid' : 'bad';
  return `<i class="mood ${c}" style="--m:${v.toFixed(0)}%"></i>`;
}

export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export { ICON };
