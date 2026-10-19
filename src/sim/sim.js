// The authoritative game. Only the host runs this; the partner sends it
// positions and button presses and renders the snapshots it sends back.
import { isStory, chapterInfo, CHAPTERS, AREAS, unlockList } from '../data/progression.js';
import { UPGRADES, MARKETING } from '../data/upgrades.js';
import { dailyGoal } from './progression.js';
import { CFG } from '../config.js';
import { spawnPoints } from '../data/layout.js';
import { ING } from '../data/ingredients.js';
import { buildGrid, collide } from './world.js';
import { freshToday, dishById, cuisineOf, allDishes, WEEKDAYS, nextId } from './state.js';
import {
  actE, actSpace, actQ, tickStations, takeFromStore, takeDrink, dropHeld, cleanup, objById,
} from './kitchen.js';
import { updateParties, spawnParty, buildSchedule, compItem, sendHome, pay } from './guests.js';
import {
  spoil, deliverOrders, expectedParties, closeBooks, placeOrder, cancelOrder, applyAutofill, buyUpgrade,
  buyMarketing, setPrice, toggleDish, createDish, deleteDish, tryMove, addLot, buyUnlock, completeChapter, upgradeStatus, autofillPlan, casePrice,
} from './economy.js';

const round2 = (v) => Math.round(v * 100) / 100;

export class Sim {
  constructor(state) {
    this.state = state;
    this.events = [];
    this.time = state.t || 0;
    this.layoutRev = 0;
    this.announcedLevel = state.level || 1;
    this.rebuild();
    if (!state.today) state.today = freshToday();
    if (state.phase === 'morning' && !state.morningDone) this.beginMorning(true);
  }

  rebuild() {
    this.grid = buildGrid(this.state);
    this.layoutRev++;
    this.state.layoutRev = (this.state.layoutRev || 0) + 1;
  }

  emit(e) { this.events.push(e); }

  drain() { const e = this.events; this.events = []; return e; }

  playerCount() { return Object.keys(this.state.players).length; }

  // ------------------------------------------------------------ players

  addPlayer(pid, profile) {
    const S = this.state;
    if (S.pendingPurchase && !S.players[pid]) {
      delete S.pendingPurchase;
      this.emit({ type: 'toast', text: 'Purchase canceled because a chef joined.', kind: 'warn' });
    }
    const slot = Object.values(S.players).some((p) => p.slot === 0) ? 1 : 0;
    const sp = spawnPoints(S)[slot];
    S.players[pid] = {
      id: pid, slot, name: (profile.name || 'Chef').slice(0, 16), look: sanitizeLook(profile.look),
      x: sp.x, z: sp.z, rot: Math.PI, hand: null, tips: 0, last: {}, working: null,
    };
    this.emit({ type: 'toast', text: `${S.players[pid].name} clocked in.`, kind: 'good' });
    return S.players[pid];
  }

  updateProfile(pid, profile) {
    const p = this.state.players[pid];
    if (!p) return;
    if (profile.name) p.name = String(profile.name).slice(0, 16);
    if (profile.look) p.look = sanitizeLook(profile.look);
  }

  removePlayer(pid) {
    const S = this.state;
    if (!S.players[pid]) return;
    dropHeld(this, pid);
    for (const party of S.parties) if (party.leader === pid) { party.leader = null; party.state = 'waiting'; party.spot = -1; }
    const name = S.players[pid].name;
    delete S.players[pid];
    delete S.ready[pid];
    if (S.pendingPurchase) {
      delete S.pendingPurchase;
      this.emit({ type: 'toast', text: 'Purchase canceled because a chef left.', kind: 'warn' });
    }
    this.emit({ type: 'toast', text: `${name} left the kitchen.`, kind: 'warn' });
  }

  setPose(pid, x, z, rot) {
    const p = this.state.players[pid];
    if (!p) return;
    if (!Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(rot)) return;
    const position = collide(this.grid, { x, z }, CFG.move.radius);
    p.x = position.x; p.z = position.z; p.rot = rot;
  }

  setWork(pid, on) {
    const p = this.state.players[pid];
    if (p) p.space = !!on;
  }

  press(pid, key) {
    const S = this.state;
    if (S.paused) return;
    if (S.phase === 'office') return;
    if (key === 'e') actE(this, pid, false);
    else if (key === 'q') actQ(this, pid, false);
  }

  // ------------------------------------------------------------ commands

  command(pid, c) {
    const S = this.state;
    if (!S.players[pid] || !c || typeof c.c !== 'string') return { ok: false };
    let r;
    if (c.c === 'approvePurchase') r = this.approvePurchase(pid, c);
    else {
      const quote = this.purchaseQuote(c);
      if (quote && S.pendingPurchase) r = { ok: false, reason: 'Finish the pending purchase first.' };
      else if (quote && isStory(S) && quote.price > 500) {
        if (!['morning', 'office'].includes(S.phase)) r = { ok: false, reason: 'Approve large purchases before opening or after closing.' };
        else {
          S.pendingPurchase = { id: nextId(S, 'purchase'), name: quote.name, price: quote.price, requestedBy: pid, required: Object.keys(S.players), approved: [], command: { ...c } };
          r = { ok: true, pending: true };
        }
      } else r = this._command(pid, c) || {};
    }
    if (r.reason) this.emit({ type: 'toast', text: r.reason, kind: 'bad', to: pid });
    if (r.layout) this.rebuild();
    if (r.chapter) this.emit({ type: 'chapter', ...r.chapter });
    this.syncProgression();
    if (r.ok && ['unlock', 'chapter', 'approvePurchase', 'upgrade'].includes(c.c)) this.emit({ type: 'save' });
    return r;
  }

  purchaseQuote(c) {
    const S = this.state;
    if (c.c === 'chapter') {
      const info = chapterInfo(S);
      return info?.ready ? { name: info.area ? AREAS.find((a) => a.id === info.area).name : 'Finish the story', price: info.price } : null;
    }
    if (c.c === 'unlock') {
      const row = unlockList(S).find((u) => u.kind === c.kind && u.id === c.id && u.can);
      return row ? { name: row.name, price: row.price } : null;
    }
    if (c.c === 'upgrade') {
      const row = UPGRADES.find((u) => u.id === c.id);
      return row && upgradeStatus(S, row).can ? { name: row.name, price: row.price } : null;
    }
    if (c.c === 'marketing') return MARKETING.find((m) => m.id === c.id) || null;
    if ((c.c === 'order' || c.c === 'rush') && ING[c.ing] && c.cases > 0) return { name: 'Supplier order', price: casePrice(c.ing, c.c === 'rush') * Math.min(c.c === 'rush' ? 5 : 50, c.cases | 0) };
    if (c.c === 'autofill') return { name: 'Supplier autofill', price: Math.round(autofillPlan(S, this.playerCount()).reduce((sum, row) => sum + casePrice(row.ing) * row.cases, 0) * 100) / 100 };
    return null;
  }

  approvePurchase(pid, c) {
    const S = this.state, purchase = S.pendingPurchase;
    if (!purchase || purchase.id !== c.id || !purchase.required.includes(pid)) return { ok: false };
    if (c.approve !== true) { delete S.pendingPurchase; return { ok: true }; }
    if (!purchase.approved.includes(pid)) purchase.approved.push(pid);
    if (!purchase.required.every((id) => purchase.approved.includes(id))) return { ok: true, pending: true };
    delete S.pendingPurchase;
    const quote = this.purchaseQuote(purchase.command);
    if (!['morning', 'office'].includes(S.phase) || !quote || quote.price !== purchase.price) return { ok: false, reason: 'The purchase changed. Please request it again.' };
    return this._command(pid, purchase.command) || {};
  }

  syncProgression() {
    const S = this.state;
    if (!isStory(S) || S.level <= this.announcedLevel) return;
    const unlocks = unlockList(S).filter((u) => u.level > this.announcedLevel && u.level <= S.level).map((u) => u.name);
    this.announcedLevel = S.level;
    this.emit({ type: 'chefLevelUp', level: S.level, unlocks });
    this.emit({ type: 'sfx', name: 'level' });
  }

  _command(pid, c) {
    const S = this.state;
    switch (c.c) {
      case 'take': takeFromStore(this, pid, c.obj, c.ing); return null;
      case 'drink': takeDrink(this, pid, c.obj, c.id); return null;
      case 'ready': return this.setReady(pid, c.on !== false);
      case 'pause': if (this.playerCount() >= 1) S.paused = !!c.on; return null;
      case 'comp': compItem(this, c.party, c.index); return null;
      case 'rush': {
        if (S.phase === 'office') return { reason: 'Rush deliveries are for open hours.' };
        const r = placeOrder(S, c.ing, Math.max(1, Math.min(5, c.cases | 0)), true, this.time);
        if (r.ok) this.emit({ type: 'toast', text: `Rush order placed: ${ING[c.ing].name} arrives in ${CFG.money.rushDelay} s ($${r.price.toFixed(2)}).`, kind: 'good' });
        return r;
      }
      case 'order': {
        if (c.cases > 0) return placeOrder(S, c.ing, Math.min(50, c.cases | 0));
        if (c.cases < 0) { cancelOrder(S, c.ing, -c.cases); return null; }
        return null;
      }
      case 'autofill': {
        const r = applyAutofill(S, this.playerCount());
        this.emit({ type: 'toast', text: r.lines ? `Ordered ${r.lines} items for $${r.spent.toFixed(2)}.` : 'Storage already covers tomorrow.', kind: 'good', to: pid });
        if (r.failed.length) return { reason: 'Ran out of cash before ordering everything.' };
        return null;
      }
      case 'upgrade': {
        if (S.phase !== 'office' && S.phase !== 'morning') return { reason: 'Shop in the office before opening or after closing.' };
        const r = buyUpgrade(S, c.id);
        if (r.ok) this.emit({ type: 'sfx', name: 'cash' });
        return r;
      }
      case 'unlock':
      case 'chapter':
        if (!['morning', 'office'].includes(S.phase)) return { ok: false, reason: 'Use the office before opening or after closing.' };
        return c.c === 'chapter' ? completeChapter(S) : buyUnlock(S, c.kind, c.id);
      case 'marketing': return buyMarketing(S, c.id);
      case 'price': setPrice(S, c.id, c.price, c.drink); return null;
      case 'toggle': return toggleDish(S, c.id, c.on, c.drink);
      case 'dish': return createDish(S, c.spec);
      case 'deldish': deleteDish(S, c.id); return null;
      case 'move': {
        if (S.phase !== 'office' && S.phase !== 'morning') return { reason: 'Rearrange before opening or after closing.' };
        const r = tryMove(S, c.id, c.x | 0, c.z | 0);
        return r.ok ? { layout: true } : r;
      }
      case 'profile': this.updateProfile(pid, c); return null;
      case 'skip': if (S.phase === 'closing') this.endDay(); return null;
    }
    return null;
  }

  setReady(pid, on) {
    const S = this.state;
    if (S.phase !== 'morning' && S.phase !== 'office') return null;
    if (S.pendingPurchase) return { ok: false, reason: 'Approve or cancel the pending purchase first.' };
    if (on) S.ready[pid] = true; else delete S.ready[pid];
    const ids = Object.keys(S.players);
    if (ids.length && ids.every((id) => S.ready[id])) {
      S.ready = {};
      if (S.phase === 'morning') this.openDoors();
      else this.nextDay();
    }
    return null;
  }

  // ------------------------------------------------------------ day cycle

  beginMorning(initial = false) {
    const S = this.state;
    S.phase = 'morning';
    S.clock = 8 * 60;
    S.morningDone = true;
    if (initial && S.day === 1 && !S.started) {
      S.started = true;
      this.firstDelivery();
      if (isStory(S)) this.emit({ type: 'chapter', chapter: 1, ...CHAPTERS[0] });
    }
  }

  /** Day one: storage comes pre-stocked and a few cases wait on the pallet. */
  firstDelivery() {
    const S = this.state;
    const dock = S.objects.find((o) => o.type === 'dock');
    const need = {};
    for (const m of S.menu.dishes) {
      if (!m.on) continue;
      for (const [ing] of dishById(S, m.id).comps) need[ing] = true;
    }
    const ings = Object.keys(need);
    // Fresh produce arrives in boxes to teach unpacking; the rest is stocked.
    const boxed = ings.filter((i) => ING[i].store !== 'freezer').slice(0, 4);
    for (const ing of ings) {
      const d = ING[ing];
      if (boxed.includes(ing)) dock.boxes.push({ ing });
      addLot(S, ing, Math.ceil(d.case * (boxed.includes(ing) ? 0.5 : 1.2)), d.cost);
    }
  }

  openDoors() {
    const S = this.state;
    S.phase = 'service';
    S.clock = CFG.serviceStart;
    S.today.expected = expectedParties(S, S.day, this.playerCount());
    S.today.repStart = S.rep.points;
    // A first party arrives right away so there is something to do.
    S.today.schedule = [CFG.serviceStart + 3, ...buildSchedule(S.today.expected - 1, this.playerCount()).filter((t) => t > CFG.serviceStart + 12)];
    this.emit({ type: 'banner', text: 'DOORS OPEN!', sub: `${WEEKDAYS[(S.day - 1) % 7]} · Day ${S.day}`, color: 'green' });
    this.emit({ type: 'sfx', name: 'bell' });
  }

  endDay() {
    const S = this.state;
    for (const p of [...S.parties]) {
      // Anyone still here pays what they owe.
      if (['eating', 'dessertEat', 'paying', 'dessertReady', 'dessertWait'].includes(p.state)) {
        pay(this, p, null);
      }
    }
    S.parties = [];
    const cl = cleanup(this);
    delete S.pendingPurchase;
    const report = closeBooks(S, { cleanup: cl, spoiled: S.today.spoiledLines || [] });
    S.phase = 'office';
    S.ready = {};
    for (const p of Object.values(S.players)) {
      const sp = spawnPoints(S)[p.slot];
      p.x = sp.x; p.z = sp.z; p.rot = Math.PI; p.hand = null;
    }
    if (S.marketing && S.marketing.days > 0) { S.marketing.days -= 1; if (S.marketing.days <= 0) S.marketing = null; }
    this.syncProgression();
    this.emit({ type: 'dayEnd', report });
    this.emit({ type: 'sfx', name: 'bell' });
    this.emit({ type: 'save' });
  }

  nextDay() {
    const S = this.state;
    S.day += 1;
    S.today = freshToday();
    if (isStory(S)) S.goal = dailyGoal(S);
    const sp = spoil(S);
    S.today.waste.spoiled = sp.total;
    S.today.spoiledLines = sp.lines;
    const n = deliverOrders(S);
    S.phase = 'morning';
    S.clock = 8 * 60;
    S.rush = [];
    this.emit({ type: 'morning', delivered: n, spoiled: sp });
    if (n) this.emit({ type: 'toast', text: `${n} case${n > 1 ? 's' : ''} delivered to the back door.`, kind: 'good' });
    if (sp.total > 0) this.emit({ type: 'toast', text: `$${sp.total.toFixed(2)} of food spoiled overnight.`, kind: 'warn' });
    this.emit({ type: 'save' });
  }

  onLevelUp(lv) {
    const S = this.state;
    const unlocked = allDishes(S).filter((d) => d.level === lv).map((d) => d.name);
    this.emit({ type: 'levelUp', level: lv, dishes: unlocked });
    this.emit({ type: 'sfx', name: 'level' });
  }

  // ------------------------------------------------------------ tick

  step(dt) {
    const S = this.state;
    if (S.paused) return;
    this.time += dt;
    S.t = this.time;

    if (S.phase === 'office') return;

    // Held Space.
    for (const [pid, p] of Object.entries(S.players)) {
      p.working = null;
      if (p.space) actSpace(this, pid, dt, false);
    }

    tickStations(this, dt);
    this.syncProgression();
    if (S.upgrades.dishwasher) {
      const sink = S.objects.find((o) => o.type === 'sink');
      if (sink.n > 0) {
        sink.auto = (sink.auto || 0) + dt / 6;
        if (sink.auto >= 1) { sink.auto = 0; sink.n -= 1; S.objects.find((o) => o.type === 'rack').n += 1; }
      }
    }

    // Rush deliveries.
    if (S.rush && S.rush.length) {
      const dock = S.objects.find((o) => o.type === 'dock');
      for (const r of S.rush) {
        if (this.time >= r.at) {
          for (let i = 0; i < r.cases; i++) dock.boxes.push({ ing: r.ing });
          r.done = true;
          this.emit({ type: 'toast', text: `Rush delivery: ${ING[r.ing].name.toLowerCase()} is at the back door.`, kind: 'good' });
          this.emit({ type: 'sfx', name: 'truck' });
        }
      }
      S.rush = S.rush.filter((r) => !r.done);
    }

    if (S.phase === 'service' || S.phase === 'closing') {
      if (S.phase === 'service') {
        S.clock = Math.min(CFG.serviceEnd, S.clock + dt * ((CFG.serviceEnd - CFG.serviceStart) / CFG.serviceRealSeconds));
        const sched = S.today.schedule || [];
        if (sched.length && S.clock >= sched[0]) {
          const first = S.today.parties === 0;
          sched.shift();
          spawnParty(this, first ? { size: 2 } : {});
        }
        if (S.clock >= CFG.doorsLock && !this.lockAnnounced) {
          this.lockAnnounced = true;
          this.emit({ type: 'banner', text: 'LAST SEATING', sub: 'The doors are locked for new guests', color: 'yellow', ms: 1800 });
        }
        if (S.clock >= CFG.serviceEnd) {
          S.phase = 'closing';
          this.lockAnnounced = false;
          // Unseated parties go home.
          for (const p of S.parties) if (p.state === 'waiting' || p.state === 'entering' || p.state === 'following') sendHome(this, p);
          this.emit({ type: 'banner', text: 'CLOSING TIME', sub: 'Finish up the last tables', color: 'red', ms: 1800 });
        }
      }
      updateParties(this, dt);
      this.syncProgression();
      if (S.phase === 'closing' && !S.parties.length) this.endDay();
    }
  }
}

const HAT_COLORS = ['#ffffff', '#f2c94c', '#eb5757', '#2f80ed', '#27ae60', '#9b51e0', '#222222', '#f2994a'];
export function sanitizeLook(l = {}) {
  const color = (v, d) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v : d);
  return {
    hat: l.hat !== false, apron: l.apron !== false,
    hatColor: color(l.hatColor, HAT_COLORS[0]), apronColor: color(l.apronColor, '#ffffff'),
    shirt: color(l.shirt, '#2f80ed'), skin: color(l.skin, '#e8b894'), hair: color(l.hair, '#4a3020'),
    hairStyle: Math.max(0, Math.min(3, l.hairStyle | 0)),
  };
}
