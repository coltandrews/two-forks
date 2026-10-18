// Everything a chef can do with E (grab / place / serve), Space (chop, wash,
// take orders, settle bills) and Q (grab another of the last thing taken
// from a store), plus the stations cooking on their own.
//
// Each action runs in two modes: dry (returns the prompt text, changes
// nothing) and live (does it). The HUD prompt and the real action can never
// disagree because they are the same code.
import { CFG } from '../config.js';
import { ING, stateInfo, stepFor } from '../data/ingredients.js';
import { HEAT_TYPES, STORE_TYPES, STATION_NAMES } from '../data/layout.js';
import { W, H } from './world.js';
import { drinkById } from './state.js';
import {
  ingItem, cloneItem, takePortion, isContainer, canTop, toppable, itemCost, itemLabel, stationAccepts,
  stationCapacity, PLATE_MAX,
} from './items.js';
import { addLot, stockCount, takeStock, returnStock, shelfLife } from './economy.js';
import { greet, followingParty, seatAt, serveTo, tableWork, waitingParty } from './guests.js';

const round2 = (v) => Math.round(v * 100) / 100;
const lc = (s) => s.charAt(0).toLowerCase() + s.slice(1);

export function objById(state, id) { return state.objects.find((o) => o.id === id) || null; }

/** The object a chef is facing within reach, preferring what is straight ahead. */
export function findTarget(state, grid, p) {
  const fx = Math.sin(p.rot), fz = Math.cos(p.rot);
  const reach = CFG.move.reach;
  let best = null, bs = Infinity;
  const tx = Math.floor(p.x), tz = Math.floor(p.z);
  for (let z = tz - 2; z <= tz + 2; z++) {
    for (let x = tx - 2; x <= tx + 2; x++) {
      if (x < 0 || z < 0 || x >= W || z >= H) continue;
      const id = grid.owner[z * W + x];
      if (!id) continue;
      const cx = Math.max(x, Math.min(p.x, x + 1)), cz = Math.max(z, Math.min(p.z, z + 1));
      const dx = cx - p.x, dz = cz - p.z;
      const d = Math.hypot(dx, dz);
      if (d > reach) continue;
      const ccx = x + 0.5 - p.x, ccz = z + 0.5 - p.z;
      const cd = Math.hypot(ccx, ccz) || 1;
      const dot = (ccx * fx + ccz * fz) / cd;
      if (dot < 0.15) continue;
      const s = d - dot * 0.9;
      if (s < bs) { bs = s; best = id; }
    }
  }
  return best ? objById(state, best) : null;
}

function rack(state) { return state.objects.find((o) => o.type === 'rack'); }

function name(t) { return STATION_NAMES[t] || t; }

function ingName(it) { return stateInfo(it.ing, it.st).label; }

function plateFull(plate) { return plate.items.length >= PLATE_MAX; }

function addToPlate(plate, it) {
  const one = cloneItem(it);
  delete one.n;
  plate.items.push(one);
}

function waste(ctx, it, why = 'binned') {
  const c = itemCost(it);
  if (c > 0) ctx.state.today.waste[why] = round2(ctx.state.today.waste[why] + c);
  if (it && it.k === 'ing' && it.st === 'burnt') ctx.state.today.burnt++;
  if (it && it.k === 'plate') for (const x of it.items) if (x.st === 'burnt') ctx.state.today.burnt++;
}

function sfx(ctx, name, o) { ctx.emit({ type: 'sfx', name, x: o ? o.x + 0.5 : undefined, z: o ? o.z + 0.5 : undefined }); }

/** Combine what is in hand with what is on a surface. Returns a label or null. */
function combine(ctx, p, surfaceItem, setSurface, dry) {
  const h = p.hand;
  const s = surfaceItem;
  // Plate in hand, food on the surface: put the food on the plate.
  if (h.k === 'plate' && s.k === 'ing') {
    if (s.st === 'raw' && ING[s.ing].steps.length && !isContainer(s)) {
      // Raw food that still needs cooking can still be plated (cheese, raw egg),
      // but only things that are eaten raw make sense; allow it and let the
      // dish matcher decide.
    }
    if (plateFull(h)) return dry ? { blocked: 'Plate is full' } : null;
    if (dry) return `Plate ${lc(ingName(s))}`;
    const { one, left } = takePortion(s);
    addToPlate(h, one);
    setSurface(left);
    sfx(ctx, 'plate');
    return 'ok';
  }
  // Food in hand, plate on the surface.
  if (h.k === 'ing' && s.k === 'plate') {
    if (plateFull(s)) return dry ? { blocked: 'Plate is full' } : null;
    if (dry) return `Add ${lc(ingName(h))} to plate`;
    addToPlate(s, h);
    p.hand = null;
    sfx(ctx, 'plate');
    return 'ok';
  }
  // Topping onto raw pizza dough (either way round).
  if (h.k === 'ing' && canTop(s) && toppable(h)) {
    if (dry) return `Top the dough with ${lc(ingName(h))}`;
    s.top = s.top || [];
    s.top.push({ ing: h.ing, st: h.st, cost: h.cost });
    p.hand = null;
    sfx(ctx, 'plate');
    return 'ok';
  }
  if (canTop(h) && s.k === 'ing' && toppable(s)) {
    if (dry) return `Top the dough with ${lc(ingName(s))}`;
    const { one, left } = takePortion(s);
    h.top = h.top || [];
    h.top.push({ ing: one.ing, st: one.st, cost: one.cost });
    setSurface(left);
    sfx(ctx, 'plate');
    return 'ok';
  }
  // A finished pizza goes onto a plate.
  if (h.k === 'plate' && isContainer(s) && s.st !== 'raw') {
    if (plateFull(h)) return dry ? { blocked: 'Plate is full' } : null;
    if (dry) return `Plate ${lc(itemLabel(ctx.state, s))}`;
    addToPlate(h, s);
    setSurface(null);
    sfx(ctx, 'plate');
    return 'ok';
  }
  return null;
}

function giveTo(ctx, p, it) {
  const h = p.hand;
  if (!h) { p.hand = it; return true; }
  if (h.k === 'plate' && !plateFull(h)) { addToPlate(h, it); return true; }
  if (canTop(h) && toppable(it)) { h.top = h.top || []; h.top.push({ ing: it.ing, st: it.st, cost: it.cost }); return true; }
  return false;
}

function canReceive(p) {
  const h = p.hand;
  return !h || (h.k === 'plate' && !plateFull(h)) || canTop(h);
}

// ------------------------------------------------------------------ E

export function actE(ctx, pid, dry, target) {
  const S = ctx.state;
  const p = S.players[pid];
  if (!p) return null;
  const o = target !== undefined ? target : findTarget(S, ctx.grid, p);
  if (!o) {
    return null;
  }
  const h = p.hand;
  const t = o.type;

  if (STORE_TYPES.has(t)) {
    if (h && h.k === 'box') {
      const d = ING[h.ing];
      if (d.store !== t) return dry ? { blocked: `That case goes in the ${name(d.store).toLowerCase()}` } : null;
      if (dry) return `Unpack ${d.case} × ${d.name.toLowerCase()}`;
      addLot(S, h.ing, d.case, d.cost);
      p.hand = null;
      sfx(ctx, 'unpack', o);
      ctx.emit({ type: 'float', text: `+${d.case} ${d.name.toLowerCase()}`, x: o.x + 0.5, z: o.z + 0.5, to: pid });
      return 'ok';
    }
    if (h && h.k === 'ing' && h.st === 'raw' && !h.top && ING[h.ing].store === t && !(h.n > 1)) {
      if (dry) return `Put ${lc(ING[h.ing].name)} back`;
      returnStock(S, h.ing, h.cost);
      p.hand = null;
      sfx(ctx, 'drop', o);
      return 'ok';
    }
    if (canReceive(p)) {
      if (dry) return `Open the ${name(t).toLowerCase()}`;
      ctx.emit({ type: 'picker', to: pid, store: t, obj: o.id });
      sfx(ctx, 'fridge', o);
      return 'ok';
    }
    return dry ? { blocked: 'Hands full' } : null;
  }

  if (t === 'counter' || t === 'pass') {
    if (!o.slot) {
      if (!h) return null;
      if (h.k === 'dirty') return dry ? { blocked: 'Dirty plates go to the sink' } : null;
      if (dry) return t === 'pass' ? `Put ${lc(itemLabel(S, h))} on the pass` : `Put down ${lc(itemLabel(S, h))}`;
      o.slot = h;
      p.hand = null;
      sfx(ctx, 'drop', o);
      return 'ok';
    }
    if (!h) {
      if (dry) return `Pick up ${lc(itemLabel(S, o.slot))}`;
      const { one, left } = o.slot.k === 'ing' ? takePortion(o.slot) : { one: o.slot, left: null };
      p.hand = one;
      o.slot = left;
      sfx(ctx, 'pick', o);
      return 'ok';
    }
    const r = combine(ctx, p, o.slot, (v) => { o.slot = v; }, dry);
    if (r) return r;
    return dry ? { blocked: `${name(t)} is full` } : null;
  }

  if (t === 'board') {
    if (!o.slot) {
      if (!h) return null;
      if (!stationAccepts('board', h)) return dry ? { blocked: h.k === 'ing' ? `Nothing to cut on ${lc(ingName(h))}` : 'Boards are for chopping' } : null;
      if (h.n > 1) return null;
      if (dry) return `Put ${lc(ingName(h))} on the board`;
      o.slot = h;
      p.hand = null;
      sfx(ctx, 'drop', o);
      return 'ok';
    }
    if (!h) {
      if (dry) return `Pick up ${lc(itemLabel(S, o.slot))}`;
      p.hand = o.slot;
      o.slot = null;
      sfx(ctx, 'pick', o);
      return 'ok';
    }
    const r = combine(ctx, p, o.slot, (v) => { o.slot = v; }, dry);
    if (r) return r;
    return dry ? { blocked: 'Board is busy' } : null;
  }

  if (HEAT_TYPES.has(t)) {
    if (!o.slot) {
      if (!h) return null;
      if (!stationAccepts(t, h)) {
        if (h.k !== 'ing') return dry ? { blocked: `Nothing to take from the ${name(t).toLowerCase()}` } : null;
        return dry ? { blocked: `Can't cook ${lc(ingName(h))} in the ${name(t).toLowerCase()}` } : null;
      }
      const step = stepFor(h.ing, h.st, t);
      if (dry) return `${t === 'pot' ? 'Boil' : t === 'oven' ? 'Bake' : t === 'fryer' ? 'Fry' : t === 'grill' ? 'Grill' : 'Cook'} → ${lc(step.label)}`;
      o.slot = h;
      o.slot.t = 0;
      o.slot.over = 0;
      p.hand = null;
      sfx(ctx, t === 'fryer' ? 'fry' : t === 'pot' ? 'pot' : 'sizzle', o);
      return 'ok';
    }
    const s = o.slot;
    if (!h) {
      const lbl = itemLabel(S, { ...s, n: 1 });
      if (dry) return `Take ${lc(lbl)}` + (s.st === 'raw' || stepFor(s.ing, s.st, t) ? ' (not done)' : '');
      const { one, left } = takePortion(s);
      p.hand = one;
      o.slot = left;
      sfx(ctx, 'pick', o);
      return 'ok';
    }
    // Add another identical portion to a pot or fryer basket.
    if (h.k === 'ing' && h.ing === s.ing && h.st === stepFrom(s, t) && !h.top && (s.n || 1) < stationCapacity(t) && s.t < 0.5 * (stepFor(s.ing, stepFrom(s, t), t) || { t: 0 }).t) {
      if (dry) return `Add another portion (${(s.n || 1) + 1}/${stationCapacity(t)})`;
      s.cost = (s.cost * (s.n || 1) + h.cost) / ((s.n || 1) + 1);
      s.n = (s.n || 1) + 1;
      p.hand = null;
      sfx(ctx, 'drop', o);
      return 'ok';
    }
    if (h.k === 'plate') {
      if (s.st === 'raw' || (stepFor(s.ing, s.st, t) && !isContainer(s))) return dry ? { blocked: 'Still cooking' } : null;
      return combine(ctx, p, s, (v) => { o.slot = v; }, dry);
    }
    return dry ? { blocked: `${name(t)} is busy` } : null;
  }

  if (t === 'well') {
    const w = o.well;
    if (!w) {
      if (!h || h.k !== 'ing' || h.top || h.st === 'burnt' || isContainer(h)) return h ? (dry ? { blocked: 'Wells hold prepped ingredients' } : null) : null;
      if (dry) return `Prep ${lc(ingName(h))} into the well`;
      o.well = { ing: h.ing, st: h.st, n: h.n || 1, cost: h.cost, day: S.day, hot: h.heat >= 0, q: h.q ?? 1 };
      p.hand = null;
      sfx(ctx, 'drop', o);
      return 'ok';
    }
    if (!h) {
      if (dry) return `Take ${lc(stateInfo(w.ing, w.st).label)} (${w.n} left)`;
      p.hand = wellPortion(o);
      sfx(ctx, 'pick', o);
      return 'ok';
    }
    if (h.k === 'ing' && h.ing === w.ing && h.st === w.st && !h.top) {
      const add = h.n || 1;
      if (w.n + add > CFG.wellMax) return dry ? { blocked: `Well is full (${CFG.wellMax})` } : null;
      if (dry) return `Add to well (${w.n + add}/${CFG.wellMax})`;
      w.cost = (w.cost * w.n + h.cost * add) / (w.n + add);
      w.n += add;
      w.day = Math.min(w.day, S.day);
      w.q = Math.min(w.q ?? 1, h.q ?? 1);
      p.hand = null;
      sfx(ctx, 'drop', o);
      return 'ok';
    }
    if (h.k === 'plate') {
      if (plateFull(h)) return dry ? { blocked: 'Plate is full' } : null;
      if (dry) return `Plate ${lc(stateInfo(w.ing, w.st).label)} (${w.n} left)`;
      addToPlate(h, wellPortion(o));
      sfx(ctx, 'plate', o);
      return 'ok';
    }
    if (canTop(h) && toppable({ k: 'ing', ing: w.ing, st: w.st })) {
      if (dry) return `Top the dough with ${lc(stateInfo(w.ing, w.st).label)}`;
      const one = wellPortion(o);
      h.top = h.top || [];
      h.top.push({ ing: one.ing, st: one.st, cost: one.cost });
      sfx(ctx, 'plate', o);
      return 'ok';
    }
    return dry ? { blocked: `Well holds ${lc(stateInfo(w.ing, w.st).label)}` } : null;
  }

  if (t === 'rack') {
    if (!h) {
      if (o.n <= 0) return dry ? { blocked: 'No clean plates. Wash some!' } : null;
      if (dry) return `Take a plate (${o.n})`;
      o.n -= 1;
      p.hand = { k: 'plate', items: [] };
      sfx(ctx, 'plateclink', o);
      return 'ok';
    }
    if (h.k === 'plate' && !h.items.length) {
      if (dry) return 'Put the plate back';
      o.n += 1;
      p.hand = null;
      sfx(ctx, 'plateclink', o);
      return 'ok';
    }
    if (h.k === 'dirty') return dry ? { blocked: 'Dirty plates go to the sink' } : null;
    return null;
  }

  if (t === 'sink') {
    if (h && h.k === 'dirty') {
      if (dry) return `Drop ${h.n} dirty plate${h.n > 1 ? 's' : ''} in the sink`;
      o.n += h.n;
      p.hand = null;
      sfx(ctx, 'plateclink', o);
      return 'ok';
    }
    return null;
  }

  if (t === 'bin') {
    if (!h) return null;
    if (h.k === 'plate') {
      if (!h.items.length) return dry ? { blocked: 'Put clean plates back on the rack' } : null;
      if (dry) return 'Scrape the plate into the bin';
      waste(ctx, h);
      h.items = [];
      sfx(ctx, 'bin', o);
      return 'ok';
    }
    if (h.k === 'dirty') return dry ? { blocked: 'Dirty plates go to the sink' } : null;
    if (dry) return `Throw away ${lc(itemLabel(S, h))}`;
    waste(ctx, h);
    p.hand = null;
    sfx(ctx, 'bin', o);
    return 'ok';
  }

  if (t === 'drinks') {
    if (h) return dry ? { blocked: 'Hands full' } : null;
    if (dry) return 'Pour a drink';
    ctx.emit({ type: 'picker', to: pid, store: 'drinks', obj: o.id });
    return 'ok';
  }

  if (t === 'dock') {
    if (!h) {
      if (!o.boxes.length) return null;
      const b = o.boxes[o.boxes.length - 1];
      if (dry) return `Pick up a case of ${lc(ING[b.ing].name)}` + (o.boxes.length > 1 ? ` (${o.boxes.length} cases)` : '');
      o.boxes.pop();
      p.hand = { k: 'box', ing: b.ing };
      sfx(ctx, 'box', o);
      return 'ok';
    }
    if (h.k === 'box') {
      if (dry) return 'Put the case back';
      o.boxes.push({ ing: h.ing });
      p.hand = null;
      sfx(ctx, 'box', o);
      return 'ok';
    }
    return null;
  }

  if (t === 'host') {
    const r = greet(ctx, pid, dry);
    if (r) return r;
    if (followingParty(S, pid)) return dry ? { blocked: 'Lead them to a free table' } : null;
    return dry ? { blocked: 'Nobody waiting' } : null;
  }

  if (t === 'table') {
    if (followingParty(S, pid)) return seatAt(ctx, pid, o, dry);
    if (h && (h.k === 'plate' || h.k === 'drink') && o.party) {
      const r = serveTo(ctx, pid, o, h, dry);
      if (r && !dry && r === 'served') p.hand = null;
      return r;
    }
    if (o.dirty > 0 && (!h || h.k === 'dirty')) {
      if (h && h.n + o.dirty > 8) return dry ? { blocked: 'Too many plates to carry' } : null;
      if (dry) return `Clear ${o.dirty} dirty plate${o.dirty > 1 ? 's' : ''}`;
      if (h) h.n += o.dirty; else p.hand = { k: 'dirty', n: o.dirty };
      o.dirty = 0;
      sfx(ctx, 'plateclink', o);
      return 'ok';
    }
    if (!o.party && waitingParty(S) && !h) return dry ? { blocked: 'Greet guests at the host stand first' } : null;
    return null;
  }
  return null;
}

/** The raw state a station's step starts from (for adding portions). */
function stepFrom(s, t) {
  if (s.t > 0 || stepFor(s.ing, s.st, t)) return s.st;
  return null;
}

function wellPortion(o) {
  const w = o.well;
  const it = ingItem(w.ing, w.st, w.cost);
  it.heat = w.hot ? 0 : -1;
  it.q = w.q ?? 1;
  w.n -= 1;
  if (w.n <= 0) o.well = null;
  return it;
}

// ------------------------------------------------------------------ Space

export function actSpace(ctx, pid, dt, dry, target) {
  const S = ctx.state;
  const p = S.players[pid];
  if (!p) return null;
  const o = target !== undefined ? target : findTarget(S, ctx.grid, p);
  if (!o) return null;
  if (o.type === 'board' && o.slot && o.slot.k === 'ing') {
    const step = stepFor(o.slot.ing, o.slot.st, 'board');
    if (!step) return null;
    if (dry) return `Hold to ${chopVerb(step)}`;
    const speed = S.upgrades.knife ? CFG.chopSpeedKnife : 1;
    o.slot.t += dt * speed;
    p.working = o.id;
    if (o.slot.t >= step.t) {
      o.slot.st = step.to;
      o.slot.t = 0;
      sfx(ctx, 'chopdone', o);
    }
    return 'work';
  }
  if (o.type === 'sink' && o.n > 0) {
    const r = rack(S);
    if (dry) return `Hold to wash (${o.n})`;
    o.wash += dt / CFG.work.wash;
    p.working = o.id;
    if (o.wash >= 1) {
      o.wash = 0;
      o.n -= 1;
      r.n += 1;
      sfx(ctx, 'plateclink', o);
    }
    return 'work';
  }
  if (o.type === 'table' && o.party) {
    const r = tableWork(ctx, pid, o, dt, dry);
    if (r && !dry) p.working = o.id;
    return r;
  }
  return null;
}

function chopVerb(step) {
  const l = step.label.toLowerCase();
  if (l.includes('grated')) return 'grate';
  if (l.includes('minced')) return 'mince';
  if (l.includes('shredded')) return 'shred';
  if (l.includes('crumbled')) return 'crumble';
  if (l.includes('diced')) return 'dice';
  if (l.includes('wedge')) return 'cut wedges';
  if (l.includes('chopped')) return 'chop';
  return 'slice';
}

// ------------------------------------------------------------------ pickers and Q

export function storeList(state, store) {
  const out = [];
  for (const [ing, d] of Object.entries(ING)) {
    if (d.store !== store) continue;
    const n = stockCount(state, ing);
    if (n > 0) out.push({ ing, n, name: d.name });
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

function near(ctx, p, o) {
  if (!o) return false;
  const cx = Math.max(o.x, Math.min(p.x, o.x + 1)), cz = Math.max(o.z, Math.min(p.z, o.z + 1));
  return Math.hypot(cx - p.x, cz - p.z) < CFG.move.reach + 0.6;
}

export function takeFromStore(ctx, pid, objId, ing) {
  const S = ctx.state;
  const p = S.players[pid];
  const o = objById(S, objId);
  if (!p || !o || !STORE_TYPES.has(o.type) || !near(ctx, p, o)) return false;
  if (!ING[ing] || ING[ing].store !== o.type) return false;
  if (!canReceive(p)) return false;
  const cost = takeStock(S, ing);
  if (cost == null) { ctx.emit({ type: 'toast', text: `Out of ${ING[ing].name.toLowerCase()}. Order more from the office or call a rush delivery.`, kind: 'bad', to: pid }); return false; }
  const it = ingItem(ing, 'raw', cost);
  if (!giveTo(ctx, p, it)) { returnStock(S, ing, cost); return false; }
  p.last = p.last || {};
  p.last[o.type] = ing;
  sfx(ctx, 'pick', o);
  return true;
}

export function takeDrink(ctx, pid, objId, id) {
  const S = ctx.state;
  const p = S.players[pid];
  const o = objById(S, objId);
  if (!p || !o || o.type !== 'drinks' || !near(ctx, p, o) || p.hand) return false;
  const d = drinkById(S, id);
  const m = S.menu.drinks.find((x) => x.id === id);
  if (!d || !m || !m.on) return false;
  p.hand = { k: 'drink', id, cost: d.cost };
  p.last = p.last || {};
  p.last.drinks = id;
  sfx(ctx, 'pour', o);
  return true;
}

export function actQ(ctx, pid, dry) {
  const S = ctx.state;
  const p = S.players[pid];
  if (!p) return null;
  const o = findTarget(S, ctx.grid, p);
  if (!o) return null;
  const last = p.last && p.last[o.type];
  if (!last) return null;
  if (STORE_TYPES.has(o.type)) {
    if (!canReceive(p)) return null;
    if (stockCount(S, last) <= 0) return dry ? { blocked: `Out of ${lc(ING[last].name)}` } : null;
    if (dry) return `Grab another ${lc(ING[last].name)}`;
    return takeFromStore(ctx, pid, o.id, last) ? 'ok' : null;
  }
  if (o.type === 'drinks') {
    if (p.hand) return null;
    if (dry) return `Pour another ${lc(drinkById(S, last).name)}`;
    return takeDrink(ctx, pid, o.id, last) ? 'ok' : null;
  }
  return null;
}

/** Prompt text for the HUD. */
export function describe(ctx, pid) {
  const S = ctx.state;
  const p = S.players[pid];
  if (!p) return null;
  const o = findTarget(S, ctx.grid, p);
  const e = o ? actE(ctx, pid, true, o) : null;
  const sp = o ? actSpace(ctx, pid, 0, true, o) : null;
  const q = o ? actQ(ctx, pid, true) : null;
  return { target: o ? o.id : null, type: o ? o.type : null, e, space: sp, q };
}

// ------------------------------------------------------------------ stations

export function tickStations(ctx, dt) {
  const S = ctx.state;
  const lampMult = S.upgrades.lamp ? CFG.coldAfter / CFG.coldAfterLamp : 1;
  for (const o of S.objects) {
    const it = o.slot;
    if (!it) continue;
    if (HEAT_TYPES.has(o.type) && it.k === 'ing') {
      if (it.st === 'burnt') continue;
      const step = stepFor(it.ing, it.st, o.type);
      it.heat = 0;
      if (step) {
        it.t += dt;
        if (it.t >= step.t) {
          it.st = step.to;
          it.t = 0;
          it.over = 0;
          it.q = it.q ?? 1;
          sfx(ctx, 'ding', o);
        }
      } else {
        it.over += dt;
        if (o.type === 'pot') {
          if (it.over > CFG.potOvercook && it.q > CFG.overdoneQuality) it.q = CFG.overdoneQuality;
        } else {
          const limit = CFG.burn[o.type] || 30;
          if (it.over > limit * 0.5 && it.q > CFG.overdoneQuality) it.q = CFG.overdoneQuality;
          if (it.over > limit) {
            it.st = 'burnt';
            it.q = 0;
            sfx(ctx, 'burn', o);
            ctx.emit({ type: 'toast', text: `Something burnt on the ${name(o.type).toLowerCase()}!`, kind: 'bad' });
          }
        }
      }
      continue;
    }
    ageItem(it, dt * (o.type === 'pass' ? lampMult : 1));
  }
  for (const p of Object.values(S.players)) if (p.hand) ageItem(p.hand, dt);
}

function ageItem(it, dt) {
  if (it.k === 'ing') { if (it.heat >= 0) it.heat += dt; }
  else if (it.k === 'plate') for (const x of it.items) if (x.heat >= 0) x.heat += dt;
}

/** Puts whatever a leaving chef was carrying somewhere sensible. */
export function dropHeld(ctx, pid) {
  const S = ctx.state;
  const p = S.players[pid];
  if (!p || !p.hand) return;
  const h = p.hand;
  p.hand = null;
  if (h.k === 'box') { S.objects.find((o) => o.type === 'dock').boxes.push({ ing: h.ing }); return; }
  if (h.k === 'dirty') { S.objects.find((o) => o.type === 'sink').n += h.n; return; }
  if (h.k === 'plate' && !h.items.length) { rack(S).n += 1; return; }
  const free = S.objects.find((o) => o.type === 'counter' && !o.slot);
  if (free) { free.slot = h; return; }
  waste(ctx, h);
  if (h.k === 'plate') rack(S).n += 1;
}

/** End-of-day: everything left out is thrown away and plates are cleaned. */
export function cleanup(ctx) {
  const S = ctx.state;
  const r = rack(S);
  let dirty = 0;
  let wasted = 0;
  for (const o of S.objects) {
    if (o.slot) {
      const it = o.slot;
      wasted += itemCost(it);
      if (it.k === 'plate') r.n += 1;
      if (it.k === 'dirty') dirty += it.n;
      if (it.k === 'box') { S.objects.find((q) => q.type === 'dock').boxes.push({ ing: it.ing }); wasted -= itemCost(it); }
      o.slot = null;
    }
    if (o.type === 'table') { dirty += o.dirty || 0; o.dirty = 0; o.plates = 0; o.served = []; o.party = null; }
    if (o.type === 'sink') { dirty += o.n; o.n = 0; o.wash = 0; }
  }
  for (const p of Object.values(S.players)) {
    if (!p.hand) continue;
    const h = p.hand;
    if (h.k === 'box') S.objects.find((q) => q.type === 'dock').boxes.push({ ing: h.ing });
    else {
      wasted += itemCost(h);
      if (h.k === 'plate') r.n += 1;
      if (h.k === 'dirty') dirty += h.n;
    }
    p.hand = null;
  }
  r.n += dirty;
  // Plates can't vanish: top the rack back up to the full set.
  const owned = CFG.plates;
  if (r.n < owned) r.n = owned;
  S.today.waste.cleanup = round2(S.today.waste.cleanup + wasted);
  S.today.dirtyLeft += dirty;
  return { wasted: round2(wasted), dirty };
}

export { shelfLife };
