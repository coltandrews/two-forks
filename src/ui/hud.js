// In-game HUD: clock, money, ticket rail, prompts, toasts, and the small
// modal sheets (storage pickers, cookbook, rush orders, pause menu).
import { CFG } from '../config.js';
import { ING, stateInfo } from '../data/ingredients.js';
import { CUISINES } from '../data/cuisines.js';
import { STATION_NAMES } from '../data/layout.js';
import { XP_LEVELS, ingredientAllowed } from '../data/progression.js';
import { dishById, drinkById, WEEKDAYS, menuIngredients, courseSlot } from '../sim/state.js';
import { storeList } from '../sim/kitchen.js';
import { plateDiff, itemLabel, matchDish } from '../sim/items.js';
import { stockCount, casePrice, avgRating } from '../sim/economy.js';
import { esc } from './overlay.js';
import { sfx, volumes, setVolume } from '../audio.js';
import { keyName } from '../input.js';

export const money = (v) => (v < 0 ? '−$' : '$') + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const money0 = (v) => (v < 0 ? '−$' : '$') + Math.round(Math.abs(v)).toLocaleString('en-US');
export function clockText(m) {
  const h = Math.floor(m / 60), mm = Math.floor(m % 60);
  const ap = h >= 12 ? 'PM' : 'AM';
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}:${String(mm).padStart(2, '0')} ${ap}`;
}
function setText(el, t) { if (el && el._t !== t) { el.textContent = t; el._t = t; } }
export function stars(n) { const r = Math.round(n); return '★'.repeat(r) + '☆'.repeat(5 - r); }
const hex = (c) => '#' + c.toString(16).padStart(6, '0');
const lc = (s) => s.charAt(0).toLowerCase() + s.slice(1);

/** Station steps from raw to a state, as readable text. */
export function howTo(ing, st) {
  const d = ING[ing];
  if (st === 'raw') return `from the ${STATION_NAMES[d.store].toLowerCase()}`;
  const steps = [];
  let cur = st, guard = 0;
  while (cur !== 'raw' && guard++ < 6) {
    const s = d.steps.find((x) => x.to === cur);
    if (!s) break;
    steps.unshift(s.at === 'board' ? 'board' : `${STATION_NAMES[s.at].toLowerCase()} ${s.t}s`);
    cur = s.from;
  }
  return steps.join(' → ');
}

export class Hud {
  constructor(app) {
    this.app = app;
    this.root = document.getElementById('hud');
    this.modal = document.getElementById('modal');
    this.toasts = document.getElementById('toasts');
    this.root.innerHTML = `
      <div class="hud-left">
        <div class="hud-tl"><div class="rname"></div><div class="day"><span class="dn"></span><span class="wk"></span></div><div class="clock"></div><div class="phase"></div><div class="bar"><i></i><b></b></div></div>
        <div class="morning" hidden></div>
        <div class="hud-bl"><div class="rail" aria-label="Order tickets" tabindex="-1"></div><button class="keys-toggle" data-act="keys" aria-expanded="false">Keys <kbd>H</kbd></button><div class="keys" hidden>
          <span><kbd class="movekeys">WASD</kbd> move</span><span><kbd>E</kbd> grab / place</span><span><kbd>Space</kbd> hold to work</span>
          <span><kbd>Q</kbd> grab another</span><span><kbd>B</kbd> cookbook</span><span><kbd>O</kbd> rush order</span>
          <span><kbd>C</kbd> / scroll zoom</span><span><kbd>Tab</kbd> office (mornings)</span><span><kbd>Esc</kbd> menu</span><span><kbd>U</kbd> hide HUD</span>
        </div></div>
      </div>
      <div class="hud-tr"><div class="cash"></div><div class="rating"></div><div class="lvl"></div><div class="bar"><i></i></div><div class="story-goal" hidden></div></div>
      <div class="need" hidden></div>
      <div class="prompt"></div>
      <div class="hud-br"></div>
      <button class="hud-toggle" data-act="hud" title="Hide or show the HUD (U)" aria-pressed="false"><span class="eye" aria-hidden="true"></span><b>Hide HUD</b><kbd>U</kbd></button>
      <div class="closing" hidden></div>`;
    const q = (s) => this.root.querySelector(s);
    this.el = {
      rname: q('.rname'), dn: q('.day .dn'), wk: q('.day .wk'), clock: q('.clock'), phase: q('.phase'), dayBar: q('.hud-tl .bar i'), sun: q('.hud-tl .bar b'),
      cash: q('.cash'), rating: q('.rating'), lvl: q('.lvl'), lvlBar: q('.hud-tr .bar i'), goal: q('.story-goal'),
      rail: q('.rail'), prompt: q('.prompt'), need: q('.need'), br: q('.hud-br'), morning: q('.morning'), closing: q('.closing'), keys: q('.keys'),
    };
    this.slowAcc = 0;
    this.modalKind = null;
    let keys = null;
    try { keys = localStorage.getItem('tf-keys'); } catch { /* ignore */ }
    this.toggleKeys(keys !== '1');
    let mini = null;
    try { mini = localStorage.getItem('tf-mini'); } catch { /* ignore */ }
    if (mini === '1') this.toggleMinimal(true);
    this.root.querySelector('.hud-toggle').addEventListener('click', () => { this.toggleMinimal(); sfx('ui'); });
    this.el.rail.addEventListener('click', (e) => {
      const b = e.target.closest('button.x');
      if (!b) return;
      const party = b.dataset.party, index = +b.dataset.index;
      if (confirm('Take this item off the order? The table will be a little disappointed.')) this.app.command({ c: 'comp', party, index });
    });
    this.el.morning.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.act === 'ready') this.app.command({ c: 'ready', on: !this.selfReady });
      if (b.dataset.act === 'office') this.app.openOffice();
      sfx('ui');
    });
    this.root.querySelector('.keys-toggle').addEventListener('click', () => this.toggleKeys());
    this.el.br.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (b && b.dataset.act === 'copy' && this.app.code) { navigator.clipboard && navigator.clipboard.writeText(this.app.code); this.toast('Room code copied', 'good'); }
    });
  }

  show(on) {
    this.root.hidden = !on;
    if (!on) { this.pendingStoryCard = null; this.purchaseSig = null; }
    this.refreshKeys();
  }

  refreshKeys() {
    const b = this.app.input.binds;
    const el = this.root.querySelector('.movekeys');
    if (el) el.textContent = [b.up, b.left, b.down, b.right].map(keyName).join('');
  }

  toggleKeys(force) {
    this.keysHidden = force != null ? force : !this.keysHidden;
    this.el.keys.hidden = this.keysHidden;
    const toggle = this.root.querySelector('.keys-toggle');
    toggle.innerHTML = `${this.keysHidden ? 'Keys' : 'Hide keys'} <kbd>H</kbd>`;
    toggle.setAttribute('aria-expanded', String(!this.keysHidden));
    try { localStorage.setItem('tf-keys', this.keysHidden ? '0' : '1'); } catch { /* ignore */ }
  }

  /** Minimal mode hides panels, tickets and key help; prompts, bubbles and toasts stay. */
  toggleMinimal(force) {
    this.minimal = force != null ? force : !this.minimal;
    this.root.classList.toggle('hud-min', this.minimal);
    const toggle = this.root.querySelector('.hud-toggle');
    toggle.querySelector('b').textContent = this.minimal ? 'Show HUD' : 'Hide HUD';
    toggle.setAttribute('aria-pressed', String(this.minimal));
    try { localStorage.setItem('tf-mini', this.minimal ? '1' : '0'); } catch { /* ignore */ }
  }

  // ------------------------------------------------------------ per frame

  update(state, info, dt) {
    const e = this.el;
    const cz = CUISINES[state.cuisine];
    if (this.cuisine !== state.cuisine) {
      this.cuisine = state.cuisine;
      document.documentElement.style.setProperty('--accent', cz.palette.ui);
      document.documentElement.style.setProperty('--accent-dark', cz.palette.uiDark);
    }
    setText(e.rname, state.name);
    setText(e.dn, `Day ${state.day}`);
    setText(e.wk, WEEKDAYS[(state.day - 1) % 7]);
    const ph = state.phase;
    setText(e.clock, ph === 'morning' ? 'Prep time' : ph === 'office' ? 'After hours' : clockText(state.clock));
    setText(e.phase, state.paused ? 'Paused' : ph === 'service' ? (state.clock >= CFG.doorsLock ? 'Last seating passed' : 'Open for business') : ph === 'closing' ? 'Closing up' : ph === 'morning' ? 'Doors closed' : 'Office');
    e.phase.className = 'phase ' + (ph === 'service' ? 'open' : ph === 'closing' ? 'closing-phase' : '');
    const frac = ph === 'service' ? (state.clock - CFG.serviceStart) / (CFG.serviceEnd - CFG.serviceStart) : ph === 'closing' || ph === 'office' ? 1 : 0;
    e.dayBar.style.width = (frac * 100).toFixed(1) + '%';
    e.sun.style.left = (frac * 100).toFixed(1) + '%';
    const night = ph === 'office' || (ph !== 'morning' && state.clock >= 19 * 60);
    setText(e.sun, night ? '☾' : '☀');
    e.sun.classList.toggle('moon', night);
    const cashText = money(state.cash);
    if (cashText !== e.cash.textContent) {
      if (this.lastCash != null && state.cash > this.lastCash) { e.cash.classList.remove('bump'); void e.cash.offsetWidth; e.cash.classList.add('bump'); }
      this.lastCash = state.cash;
      e.cash.textContent = cashText;
    }
    e.cash.classList.toggle('neg', state.cash < 0);
    const avg = avgRating(state);
    const rh = avg ? `<span class="stars">${stars(avg)}</span> ${avg.toFixed(1)}` : 'No reviews yet';
    if (rh !== e.rating._h) { e.rating.innerHTML = rh; e.rating._h = rh; }
    const story = state.mode === 'story';
    e.lvl.hidden = !story;
    e.lvlBar.parentElement.hidden = !story;
    e.goal.hidden = !story;
    if (story) {
      const lv = state.level, next = XP_LEVELS[lv], prev = XP_LEVELS[lv - 1] || 0;
      setText(e.lvl, next != null ? `Chef Level ${lv} · ${Math.floor(state.xp)}/${next} XP` : `Chef Level ${lv} · ${state.prestige || 0} prestige stars`);
      e.lvlBar.style.width = next != null ? Math.max(0, Math.min(100, ((state.xp - prev) / (next - prev)) * 100)).toFixed(1) + '%' : '100%';
      const goal = state.goal;
      const progress = goal && goal.target > 1 && Number.isFinite(goal.progress) ? ` · ${Math.min(goal.target, Math.max(0, Math.floor(goal.progress)))}/${goal.target}` : '';
      const goalHtml = `<b>${state.chapter > 4 ? 'Story complete' : `Chapter ${state.chapter} of 4`}</b>${goal ? `<span class="${goal.done ? 'goal-done' : ''}">${goal.done ? '✓ ' : ''}${esc(goal.label)}${progress} · +${goal.xp} XP</span>` : 'Keep serving to earn XP.'}`;
      if (goalHtml !== e.goal._h) { e.goal.innerHTML = goalHtml; e.goal._h = goalHtml; }
    }
    this.updatePurchase(state);

    this.updatePrompt(state, info);

    this.slowAcc -= dt;
    if (this.slowAcc <= 0) {
      this.slowAcc = 0.2;
      this.updateRail(state, info);
      this.updateCorner(state, info);
      this.updateMorning(state, info);
      e.closing.hidden = ph !== 'closing' && !state.paused;
      if (state.paused) e.closing.innerHTML = 'Paused';
      else if (ph === 'closing') {
        const left = state.parties.length;
        e.closing.innerHTML = `Closing time · ${left} table${left === 1 ? '' : 's'} still here`;
      }
      if (this.modalKind === 'picker' && this.pickerState) this.renderPicker(state);
    }
  }

  updatePrompt(state, info) {
    const d = info.describe;
    const p = state.players[info.self];
    const chips = [];
    if (p && p.hand) chips.push(`<span class="chip hand"><small>Holding</small> ${esc(itemLabel(state, p.hand))}</span>`);
    if (state.phase !== 'office' && d) {
      const add = (key, v) => {
        if (!v) return;
        if (typeof v === 'string') chips.push(`<span class="chip"><kbd>${key}</kbd> ${esc(v)}</span>`);
        else if (v.blocked) chips.push(`<span class="chip blocked">${esc(v.blocked)}</span>`);
      };
      add('E', d.e);
      add('Space', d.space);
      add('Q', d.q);
    }
    const html = chips.join('');
    if (html !== this.lastPrompt) { this.el.prompt.innerHTML = html; this.lastPrompt = html; }

    // Recipe helper while plating.
    let need = '';
    if (p && p.hand && p.hand.k === 'plate' && p.hand.items.length) {
      need = this.plateHelp(state, p.hand);
    } else if (p && p.hand && p.hand.k === 'ing' && p.hand.ing === 'dough' && p.hand.st === 'raw') {
      need = this.doughHelp(state, p.hand);
    }
    if (need !== this.lastNeed) { this.el.need.innerHTML = need; this.el.need.hidden = !need; this.lastNeed = need; }
  }

  openDishes(state) {
    const out = [];
    for (const party of state.parties) {
      for (const x of party.items) if (!x.served) out.push({ id: x.id, party });
    }
    return out;
  }

  plateHelp(state, plate) {
    const open = this.openDishes(state);
    const ids = [...new Set(open.map((o) => o.id))];
    const done = matchDish(state, plate, ids);
    if (done) {
      const party = open.find((o) => o.id === done).party;
      const t = state.objects.find((o) => o.id === party.table);
      return `<span class="ok">✓ ${esc(dishById(state, done).name)}</span> is ready for <b>table ${t ? t.num : '?'}</b>`;
    }
    const cands = ids.length ? ids : state.menu.dishes.filter((m) => m.on).map((m) => m.id);
    let best = null;
    for (const id of cands) {
      const d = dishById(state, id);
      const diff = plateDiff(plate, d);
      const score = diff.missing.length + diff.extra.length * 1.5;
      if (!best || score < best.score) best = { d, diff, score };
    }
    if (!best) return '';
    const miss = best.diff.missing.map(([i, s]) => lc(stateInfo(i, s).label)).join(', ');
    const extra = best.diff.extra.map(([i, s]) => lc(stateInfo(i, s).label)).join(', ');
    let h = `${esc(best.d.name)}: `;
    if (miss) h += `still needs <b>${esc(miss)}</b>`;
    if (extra) h += `${miss ? ' · ' : ''}<b>${esc(extra)}</b> doesn't belong (bin the plate to start over)`;
    return h;
  }

  doughHelp(state, dough) {
    const pizzas = state.menu.dishes.filter((m) => m.on).map((m) => dishById(state, m.id)).filter((d) => d.comps.some(([i]) => i === 'dough'));
    if (!pizzas.length) return '';
    const tops = (dough.top || []).map((t) => t.ing + ':' + t.st);
    const lines = pizzas.map((d) => {
      const need = d.comps.filter(([i]) => i !== 'dough').filter(([i, s]) => !tops.includes(i + ':' + s)).map(([i, s]) => lc(stateInfo(i, s).label));
      return `${esc(d.name)}: ${need.length ? 'add <b>' + esc(need.join(', ')) + '</b>' : '<span class="ok">ready to bake</span>'}`;
    });
    return lines.join(' &nbsp;·&nbsp; ');
  }

  updateRail(state) {
    const parties = state.parties.filter((p) => p.ticket && (p.items.some((x) => !x.served) || p.drinks.some((x) => !x.served)) && ['waitingFood', 'dessertWait', 'eating', 'dessertEat'].includes(p.state));
    parties.sort((a, b) => a.ticket - b.ticket);
    const firstFood = parties.find((p) => p.items.some((x) => !x.served));
    this.el.rail.tabIndex = parties.length ? 0 : -1;
    this.tickets = this.tickets || new Map();
    const keep = new Set();
    let prev = null;
    for (const p of parties) {
      const key = p.id + ':' + p.ticket;
      keep.add(key);
      let el = this.tickets.get(key);
      if (!el) {
        el = document.createElement('div');
        el.className = 'ticket';
        el.innerHTML = '<header><span class="num"></span><span class="tm"></span></header><div class="body"></div>';
        this.tickets.set(key, el);
      }
      const t = state.objects.find((o) => o.id === p.table);
      const since = p.state === 'dessertWait' ? p.dessertAt : p.orderedAt;
      const secs = Math.max(0, (state.t || 0) - since);
      const ratio = secs / (p.grace || 90);
      const cls = 'ticket ' + (p.state === 'eating' || p.state === 'dessertEat' ? 'eating' : ratio > 1 ? 'late' : ratio > 0.6 ? 'mid' : '');
      if (el.className !== cls) el.className = cls;
      setText(el.querySelector('.num'), `Table ${t ? t.num : '?'}`);
      setText(el.querySelector('.tm'), `${Math.floor(secs / 60)}:${String(Math.floor(secs % 60)).padStart(2, '0')}`);
      const body = this.ticketBody(state, p, p === firstFood);
      const b = el.querySelector('.body');
      if (b._h !== body) { b.innerHTML = body; b._h = body; }
      const want = prev ? prev.nextSibling : this.el.rail.firstChild;
      if (el !== want) this.el.rail.insertBefore(el, want);
      prev = el;
    }
    for (const [k, el] of this.tickets) if (!keep.has(k)) { el.remove(); this.tickets.delete(k); }
  }

  ticketBody(state, p, withComps) {
    let h = '';
    const openIdx = p.items.filter((x) => !x.served);
    const groups = new Map();
    for (const x of p.items) {
      const k = x.id + (x.served ? ':s' : ':o');
      const g = groups.get(k) || { id: x.id, served: x.served, n: 0, first: x };
      g.n++;
      groups.set(k, g);
    }
    for (const g of groups.values()) {
      const d = dishById(state, g.id);
      if (!d) continue;
      const comps = d.comps.map(([i, s]) => lc(stateInfo(i, s).label)).join(' · ');
      const idx = openIdx.indexOf(g.first);
      h += `<div class="ln ${g.served ? 'done' : ''}" title="${esc(comps)}">${g.n > 1 ? g.n + '× ' : ''}${esc(d.name)}${!g.served ? `<button class="x" data-party="${p.id}" data-index="${idx}" title="Can't make it: take it off the order">✕</button>` : ''}</div>`;
      if (!g.served && withComps) {
        h += `<div class="comps">${d.comps.map(([i, s]) => { const info = stateInfo(i, s); return `<i><s style="background:${hex(info.color)}"></s>${esc(lc(info.label))}</i>`; }).join('')}</div>`;
      } else if (!g.served) {
        h += `<div class="comps">${d.comps.map(([i, s]) => `<i title="${esc(stateInfo(i, s).label)}"><s style="background:${hex(stateInfo(i, s).color)}"></s></i>`).join('')}</div>`;
      }
    }
    const dr = new Map();
    for (const x of p.drinks) if (!x.served) dr.set(x.id, (dr.get(x.id) || 0) + 1);
    for (const [id, n] of dr) h += `<div class="ln drk">${n > 1 ? n + '× ' : ''}${esc(drinkById(state, id).name)}</div>`;
    if (p.kind === 'critic') h += '<span class="crit">CRITIC</span>';
    return h;
  }

  updateCorner(state, info) {
    let h = '';
    if (info.role === 'host' && this.app.code) {
      h += info.partner
        ? `<div><span class="dot on"></span>${esc(info.partner)} is cooking with you</div>`
        : `<div>Room code <button class="icon-btn" data-act="copy" title="Copy">⧉</button></div><div class="code">${this.app.code}</div><div class="hint-line">Your partner joins with this code</div>`;
    } else if (info.role === 'client') {
      h += info.lost ? '<div><span class="dot off"></span>Lost the host. Reconnecting…</div>' : `<div><span class="dot on"></span>Connected · room ${this.app.code}</div>`;
    } else {
      h += '<div>Solo shift</div>';
    }
    const tips = state.today && state.today.tips ? Object.entries(state.today.tips) : [];
    if (tips.length) h += `<div class="hint-line">Tips today: ${tips.map(([n, v]) => `${esc(n)} ${money(v)}`).join(' · ')}</div>`;
    if (h !== this.lastBr) { this.el.br.innerHTML = h; this.lastBr = h; }
  }

  updateMorning(state, info) {
    const m = this.el.morning;
    if (state.phase !== 'morning') { m.hidden = true; return; }
    m.hidden = false;
    const dock = state.objects.find((o) => o.type === 'dock');
    const notes = [];
    const items = [];
    if (dock.boxes.length) items.push(`<li>${dock.boxes.length} delivery case${dock.boxes.length > 1 ? 's' : ''} at the back door. Carry them to storage with <kbd>E</kbd>.</li>`);
    const out = menuIngredients(state).filter((i) => stockCount(state, i) === 0 && !state.objects.some((o) => o.well && o.well.ing === i) && !dock.boxes.some((b) => b.ing === i));
    if (out.length) {
      items.push(`<li class="warn">${out.length} ingredient${out.length > 1 ? 's' : ''} out of stock. Rush order: <kbd>O</kbd>.</li>`);
      notes.push(`<li>Out of ${out.map((i) => lc(ING[i].name)).join(', ')}. Dishes that need these cannot be ordered.</li>`);
    }
    const mains = state.menu.dishes.filter((x) => x.on && courseSlot(dishById(state, x.id).course) === 'main').length;
    notes.push(`<li>Prep wells keep cooked food warm until tomorrow.</li>`);
    if (state.day === 1) notes.push(`<li><kbd>B</kbd> opens the cookbook (${mains} mains).</li>`);
    this.selfReady = !!state.ready[info.self];
    const others = Object.values(state.players).filter((p) => p.id !== info.self);
    const partner = others.length ? (state.ready[others[0].id] ? `${esc(others[0].name)} is ready` : `Waiting for ${esc(others[0].name)}`) : '';
    const html = `${items.length ? `<ul class="prep-alerts">${items.join('')}</ul>` : ''}<div class="row"><button class="btn ${this.selfReady ? 'on' : 'primary'}" data-act="ready">${this.selfReady ? '✓ Ready · undo' : 'Ready to open'}</button>
      <button class="btn ghost" data-act="office">Office <kbd>Tab</kbd></button>${partner ? `<span class="partner">${partner}</span>` : ''}</div>
      <details class="prep-notes"><summary>Prep notes</summary><ul>${notes.join('')}</ul></details>`;
    if (html !== this.lastMorning) {
      const notesOpen = !!m.querySelector('.prep-notes[open]');
      m.innerHTML = html;
      m.querySelector('.prep-notes').open = notesOpen;
      this.lastMorning = html;
    }
  }

  // ------------------------------------------------------------ toasts

  toast(text, kind = '', ms = 3400) {
    const t = document.createElement('div');
    t.className = 'toast ' + kind;
    t.textContent = text;
    this.toasts.appendChild(t);
    while (this.toasts.children.length > 4) this.toasts.firstChild.remove();
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 450); }, ms);
  }

  levelUp(level, dishes) {
    const d = document.createElement('div');
    d.className = 'panel levelup';
    d.innerHTML = `<h2>Reputation level ${level}!</h2><p>${dishes.length ? 'New dishes to put on the menu: <b>' + dishes.map(esc).join(', ') + '</b>' : 'Word is getting around. More guests are coming.'}</p>`;
    this.app.root.appendChild(d);
    setTimeout(() => d.remove(), 4200);
  }

  showLevelUp({ level, unlocks = [] }) {
    const d = document.createElement('div');
    d.className = 'panel levelup';
    d.setAttribute('role', 'status');
    d.innerHTML = `<h2>Chef Level ${level}</h2><p>${unlocks.length ? 'Now available: <b>' + unlocks.map(esc).join(', ') + '</b>' : 'Your restaurant has earned a new level.'}</p><p>See the Unlocks tab in the office.</p>`;
    this.app.root.appendChild(d);
    setTimeout(() => d.remove(), 5000);
  }

  showStoryCard(card) {
    if (this.app.session && this.app.session.state.pendingPurchase) { this.pendingStoryCard = card; return; }
    let { chapter, title, text } = card;
    if (this.modalKind === 'pause') this.closeModal();
    chapter = chapter || (this.app.session && this.app.session.state.chapter) || 1;
    this.openSheet('story-card', `<button class="icon-btn close" aria-label="Close">✕</button><div class="chapter-label">${chapter > 4 ? 'Story complete' : `Chapter ${chapter}`}</div><h2>${esc(title)}</h2><p>${esc(text)}</p><button class="btn primary story-next">Back to the restaurant</button>`);
    this.modal.querySelector('.story-next').onclick = () => this.closeModal();
  }

  updatePurchase(state) {
    const purchase = state.pendingPurchase;
    if (!purchase || !purchase.required.includes(this.app.selfPid)) {
      if (this.modalKind === 'purchase-confirm') this.closeModal();
      this.purchaseSig = null;
      if (this.pendingStoryCard) {
        const card = this.pendingStoryCard;
        this.pendingStoryCard = null;
        this.showStoryCard(card);
      }
      return;
    }
    const sig = JSON.stringify([purchase, state.cash]);
    if (this.modalKind === 'purchase-confirm' && sig === this.purchaseSig) return;
    this.purchaseSig = sig;
    this.showPurchaseConfirm(purchase, state);
  }

  showPurchaseConfirm(purchase, state = this.app.session.state) {
    if (this.modalKind === 'pause') this.closeModal();
    const approved = purchase.approved.includes(this.app.selfPid);
    const names = purchase.required.map((id) => `${state.players[id] ? state.players[id].name : 'Chef'}${purchase.approved.includes(id) ? ' ✓' : ''}`);
    this.openSheet('purchase-confirm', `<h2>Approve this purchase?</h2><p>${esc(purchase.name)}</p><div class="purchase-price">${money0(purchase.price)}</div><div class="sub">Cash after purchase: ${money(state.cash - purchase.price)}<br>Every chef must approve. ${purchase.approved.length}/${purchase.required.length} approved.</div><p>${names.map(esc).join(' · ')}</p><div class="actions"><button class="btn primary" data-vote="yes" ${approved ? 'disabled' : ''}>${approved ? 'Approved · waiting' : 'Approve'}</button><button class="btn ghost" data-vote="no">Cancel purchase</button></div>`);
    this.modal.onclick = null;
    this.modal.querySelectorAll('[data-vote]').forEach((b) => {
      b.onclick = () => this.app.command({ c: 'approvePurchase', id: purchase.id, approve: b.dataset.vote === 'yes' });
    });
  }

  // ------------------------------------------------------------ modals

  get modalOpen() { return !this.modal.hidden; }

  closeModal() {
    if (this.modalKind === 'purchase-confirm') {
      this.purchaseSig = null;
      const purchase = this.app.session && this.app.session.state.pendingPurchase;
      if (purchase) this.app.command({ c: 'approvePurchase', id: purchase.id, approve: false });
    }
    this.modal.hidden = true;
    this.modal.innerHTML = '';
    this.modal.className = '';
    this.modalKind = null;
    this.pickerState = null;
    this.app.focusGame();
  }

  openSheet(kind, html, light = false) {
    const refresh = this.modalKind === kind && this.modalOpen;
    this.modalKind = kind;
    this.modal.className = light ? 'light' : '';
    this.modal.innerHTML = `<div class="sheet ${kind}${refresh ? ' sheet-refresh' : ''}">${html}</div>`;
    this.modal.hidden = false;
    const close = this.modal.querySelector('.close');
    if (close) close.onclick = () => this.closeModal();
    this.modal.onclick = (e) => { if (e.target === this.modal) this.closeModal(); };
  }

  openPicker(state, store, obj) {
    this.pickerState = { store, obj };
    this.openSheet('picker', '', true);
    this.renderPicker(state);
  }

  renderPicker(state) {
    const { store, obj } = this.pickerState;
    const wanted = new Set();
    for (const party of state.parties) for (const x of party.items) if (!x.served) for (const [i] of dishById(state, x.id).comps) wanted.add(i);
    let list, title, sub;
    if (store === 'drinks') {
      title = 'Drink station';
      const pending = {};
      for (const party of state.parties) for (const d of party.drinks) if (!d.served) pending[d.id] = (pending[d.id] || 0) + 1;
      list = state.menu.drinks.filter((m) => m.on).map((m) => {
        const d = drinkById(state, m.id);
        return { key: m.id, name: d.name, sw: hex(d.color), ct: pending[m.id] ? `${pending[m.id]} waiting` : '', need: !!pending[m.id] };
      });
      sub = 'Pour one, then carry it to the table that ordered it.';
    } else {
      title = STATION_NAMES[store];
      list = storeList(state, store).map((x) => ({ key: x.ing, name: x.name, sw: hex(ING[x.ing].look.color), ct: `${x.n} left`, low: x.n <= 3, need: wanted.has(x.ing) }));
      const p = state.players[this.app.selfPid];
      sub = p && p.hand && p.hand.k === 'plate' ? 'Goes straight onto your plate.' : 'Take one. Press Q at the same spot to grab another.';
    }
    const html = `<button class="icon-btn close" aria-label="Close">✕</button><h2>${esc(title)}</h2><div class="sub">${sub}</div>
      <div class="grid">${list.length ? list.map((x, i) => `<button class="pick ${x.need ? 'wanted' : ''}" data-key="${x.key}"><span class="sw" style="background:${x.sw}"></span><span><span class="nm">${esc(x.name)}</span><br><span class="ct ${x.low ? 'low' : ''}">${x.ct}</span></span>${i < 10 ? `<span class="k">${(i + 1) % 10}</span>` : ''}</button>`).join('') : '<div class="empty">Nothing in here. Unpack deliveries or order more.</div>'}</div>`;
    const sheet = this.modal.querySelector('.sheet');
    if (!sheet || sheet._html === html) return;
    sheet._html = html;
    sheet.innerHTML = html;
    sheet.querySelector('.close').onclick = () => this.closeModal();
    this.pickList = list.map((x) => x.key);
    sheet.querySelectorAll('.pick').forEach((b) => { b.onclick = () => this.pick(b.dataset.key); });
  }

  pick(key) {
    if (!this.pickerState) return;
    const { store, obj } = this.pickerState;
    if (store === 'drinks') this.app.command({ c: 'drink', obj, id: key });
    else this.app.command({ c: 'take', obj, ing: key });
    sfx('pick');
    const p = this.app.session.state.players[this.app.selfPid];
    const keepOpen = store !== 'drinks' && p && p.hand && (p.hand.k === 'plate' || (p.hand.ing === 'dough' && p.hand.st === 'raw'));
    if (!keepOpen) this.closeModal();
  }

  pickerKey(k) {
    if (this.modalKind !== 'picker' || !this.pickList) return false;
    const i = k === '0' ? 9 : +k - 1;
    if (this.pickList[i]) { this.pick(this.pickList[i]); return true; }
    return false;
  }

  openCookbook(state) {
    const groups = { main: [], starter: [], dessert: [] };
    for (const m of state.menu.dishes) {
      if (!m.on) continue;
      const d = dishById(state, m.id);
      groups[courseSlot(d.course)].push({ d, m });
    }
    const card = ({ d, m }) => `<div class="recipe"><div class="course">${d.course}</div><h4>${esc(d.name)} <small>${money(m.price)}</small></h4><ol>${d.comps.map(([i, s]) => {
      const info = stateInfo(i, s);
      const how = i === 'dough' ? 'add toppings on raw dough, then oven ' + ING.dough.steps[0].t + 's' : howTo(i, s);
      return `<li><span class="sw" style="background:${hex(info.color)}"></span>${esc(info.label)}<span class="how">${esc(how)}</span></li>`;
    }).join('')}</ol></div>`;
    const drinks = state.menu.drinks.filter((m) => m.on).map((m) => drinkById(state, m.id).name).join(' · ');
    const html = `<button class="icon-btn close" aria-label="Close">✕</button><h2>Cookbook</h2>
      <div class="sub">Everything on tonight's menu. Build each plate on a counter: grab a plate from the rack, then add each part. Pot and fryer take several portions at once.</div>
      ${['main', 'starter', 'dessert'].map((k) => groups[k].length ? `<div class="section-title">${k === 'starter' ? 'Starters & sides' : k + 's'}</div><div class="cols">${groups[k].map(card).join('')}</div>` : '').join('')}
      <div class="section-title">Drinks</div><div>${esc(drinks)} (pour at the drink station)</div>`;
    this.openSheet('cookbook', html);
  }

  openRush(state) {
    if (state.phase === 'office') { this.toast('Rush deliveries are for open hours. Use the supplier tab instead.', 'warn'); return; }
    const ings = menuIngredients(state).filter((id) => ingredientAllowed(state, id)).sort((a, b) => stockCount(state, a) - stockCount(state, b));
    const rows = ings.map((i) => {
      const n = stockCount(state, i);
      return `<button class="pick ${n === 0 ? 'wanted' : ''}" data-ing="${i}"><span class="sw" style="background:${hex(ING[i].look.color)}"></span><span><span class="nm">${esc(ING[i].name)}</span><br><span class="ct ${n <= 3 ? 'low' : ''}">${n} in stock · case of ${ING[i].case} ${money(casePrice(i, true))}</span></span></button>`;
    }).join('');
    const pending = (state.rush || []).map((r) => `${ING[r.ing].name} in ${Math.max(0, Math.ceil(r.at - state.t))}s`).join(' · ');
    this.openSheet('picker', `<button class="icon-btn close" aria-label="Close">✕</button><h2>Call the supplier</h2>
      <div class="sub">Rush delivery: arrives at the back door in ${CFG.money.rushDelay} seconds, at ${Math.round((CFG.money.rushMarkup - 1) * 100)}% over the usual price.${pending ? '<br>On the way: ' + esc(pending) : ''}</div><div class="grid">${rows}</div>`);
    this.modal.querySelectorAll('.pick').forEach((b) => {
      b.onclick = () => { this.app.command({ c: 'rush', ing: b.dataset.ing, cases: 1 }); sfx('ui'); this.closeModal(); };
    });
  }

  openPause(state, info) {
    const v = volumes();
    const host = info.role !== 'client';
    const html = `<button class="icon-btn close" aria-label="Close">✕</button><h2>${state.paused ? 'Paused' : 'Menu'}</h2>
      <div class="sub">${host ? 'The game pauses for both of you while this is open.' : 'The kitchen keeps running while this is open.'}</div>
      <div class="slider"><span>Music</span><input type="range" min="0" max="1" step="0.05" value="${v.music}" data-vol="music"></div>
      <div class="slider"><span>Sounds</span><input type="range" min="0" max="1" step="0.05" value="${v.sfx}" data-vol="sfx"></div>
      <div class="section-title">Movement keys</div>
      <div class="binds">${['up', 'left', 'down', 'right'].map((d) => `<label>${d}<button class="btn small" data-bind="${d}">${keyName(this.app.input.binds[d])}</button></label>`).join('')}<button class="btn small ghost" data-bind="reset">Reset</button></div>
      <div class="hint-line">Arrow keys always work too. Click a key, then press the new one.</div>
      <div class="stack">
        <button class="btn primary" data-act="resume">Back to the kitchen</button>
        <button class="btn" data-act="chef">Change my chef</button>
        ${host ? '<button class="btn" data-act="code">Save code (backup / move to another laptop)</button>' : ''}
        <button class="btn ghost" data-act="leave">${host ? 'Save and quit to title' : 'Leave the kitchen'}</button>
      </div>`;
    this.openSheet('pause', html);
    this.modal.querySelectorAll('input[data-vol]').forEach((inp) => { inp.oninput = () => setVolume(inp.dataset.vol, +inp.value); });
    this.modal.querySelectorAll('button[data-bind]').forEach((b) => {
      b.onclick = () => {
        const d = b.dataset.bind;
        if (d === 'reset') { this.app.input.resetBinds(); this.openPause(state, info); this.refreshKeys(); return; }
        b.textContent = 'Press a key…';
        this.app.input.rebind(d, (code, reserved) => {
          if (reserved) this.toast('That key is already used for something else.', 'warn');
          this.openPause(state, info);
          this.refreshKeys();
        });
      };
    });
    this.modal.querySelectorAll('button[data-act]').forEach((b) => {
      b.onclick = () => {
        const a = b.dataset.act;
        if (a === 'resume') this.closeModal();
        if (a === 'leave') this.app.leave();
        if (a === 'chef') this.app.editChef();
        if (a === 'code') this.app.showSaveCode();
      };
    });
  }
}
