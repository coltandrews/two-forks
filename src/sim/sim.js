// The authoritative game. Only the host runs this; the partner sends it
// positions and button presses and renders the snapshots it sends back.
import { CFG } from '../config.js';
import { SPAWN_POINTS, FRONT_DOOR } from '../data/layout.js';
import { ING } from '../data/ingredients.js';
import { buildGrid } from './world.js';
import { freshToday, dishById, cuisineOf, allDishes, WEEKDAYS } from './state.js';
import {
  actE, actSpace, actQ, tickStations, takeFromStore, takeDrink, dropHeld, cleanup, objById,
} from './kitchen.js';
import { updateParties, spawnParty, buildSchedule, compItem, sendHome } from './guests.js';
import {
  spoil, deliverOrders, expectedParties, closeBooks, placeOrder, cancelOrder, applyAutofill, buyUpgrade,
  buyMarketing, setPrice, toggleDish, createDish, deleteDish, tryMove, addLot,
} from './economy.js';

const round2 = (v) => Math.round(v * 100) / 100;

export class Sim {
  constructor(state) {
    this.state = state;
    this.events = [];
    this.time = state.t || 0;
    this.layoutRev = 0;
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
    const slot = Object.values(S.players).some((p) => p.slot === 0) ? 1 : 0;
    const sp = SPAWN_POINTS[slot];
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
    this.emit({ type: 'toast', text: `${name} left the kitchen.`, kind: 'warn' });
  }

  setPose(pid, x, z, rot) {
    const p = this.state.players[pid];
    if (!p) return;
    if (!Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(rot)) return;
    p.x = x; p.z = z; p.rot = rot;
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
    const r = this._command(pid, c) || {};
    if (r.reason) this.emit({ type: 'toast', text: r.reason, kind: 'bad', to: pid });
    if (r.layout) this.rebuild();
    return r;
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
    this.emit({ type: 'toast', text: `Doors open! ${WEEKDAYS[(S.day - 1) % 7]}, day ${S.day}.`, kind: 'good' });
    this.emit({ type: 'sfx', name: 'bell' });
  }

  endDay() {
    const S = this.state;
    for (const p of [...S.parties]) {
      // Anyone still here pays what they owe.
      if (['eating', 'dessertEat', 'paying', 'dessertReady', 'dessertWait'].includes(p.state)) {
        const food = p.items.filter((x) => x.served).reduce((s, x) => s + x.price, 0);
        const drinks = p.drinks.filter((x) => x.served).reduce((s, x) => s + x.price, 0);
        S.cash = round2(S.cash + food + drinks);
        S.today.foodRev = round2(S.today.foodRev + food);
        S.today.drinkRev = round2(S.today.drinkRev + drinks);
      }
    }
    S.parties = [];
    const cl = cleanup(this);
    const report = closeBooks(S, { cleanup: cl, spoiled: S.today.spoiledLines || [] });
    S.phase = 'office';
    S.ready = {};
    for (const p of Object.values(S.players)) {
      const sp = SPAWN_POINTS[p.slot];
      p.x = sp.x; p.z = sp.z; p.rot = Math.PI; p.hand = null;
    }
    if (S.marketing && S.marketing.days > 0) { S.marketing.days -= 1; if (S.marketing.days <= 0) S.marketing = null; }
    this.emit({ type: 'dayEnd', report });
    this.emit({ type: 'sfx', name: 'bell' });
    this.emit({ type: 'save' });
  }

  nextDay() {
    const S = this.state;
    S.day += 1;
    S.today = freshToday();
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
          this.emit({ type: 'toast', text: 'Last seating. The doors are locked.', kind: 'warn' });
        }
        if (S.clock >= CFG.serviceEnd) {
          S.phase = 'closing';
          this.lockAnnounced = false;
          // Unseated parties go home.
          for (const p of S.parties) if (p.state === 'waiting' || p.state === 'entering' || p.state === 'following') sendHome(this, p);
          this.emit({ type: 'toast', text: 'Closing time. Finish the last tables.', kind: 'warn' });
        }
      }
      updateParties(this, dt);
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
