// Things that can be held, placed on stations or plated.
//   ingredient  { k:'ing', ing, st, cost, n?, t, over, q, heat, top? }
//   plate       { k:'plate', items: [ingredient...] }
//   drink       { k:'drink', id, cost }
//   box         { k:'box', ing }            one supplier case
//   dirty       { k:'dirty', n }            a stack of dirty plates
//   trash       { k:'trash', n }            a sealed bag of bin waste
// heat is -1 for food that was never cooked, otherwise seconds since it left
// the heat. top holds pizza toppings riding on raw dough.
import { CFG } from '../config.js';
import { ING, stateInfo } from '../data/ingredients.js';
import { HEAT_TYPES } from '../data/layout.js';
import { dishById, drinkById } from './state.js';

export const PLATE_MAX = 6;

export function ingItem(ing, st, cost) {
  return { k: 'ing', ing, st, cost: cost || 0, t: 0, over: 0, q: 1, heat: -1 };
}

export function cloneItem(it) { return JSON.parse(JSON.stringify(it)); }

/** One portion split from a multi-portion item (pot of rice). */
export function takePortion(it) {
  const one = cloneItem(it);
  delete one.n;
  if ((it.n || 1) > 1) { it.n -= 1; return { one, left: it }; }
  return { one, left: null };
}

export function isContainer(it) { return it && it.k === 'ing' && ING[it.ing] && ING[it.ing].container; }
export function canTop(dough) { return isContainer(dough) && dough.st === 'raw' && (dough.top || []).length < 4; }
export function toppable(it) { return it && it.k === 'ing' && !isContainer(it) && it.st !== 'burnt' && !it.top; }

export function itemCost(it) {
  if (!it) return 0;
  if (it.k === 'ing') return (it.cost || 0) * (it.n || 1) + (it.top || []).reduce((s, x) => s + (x.cost || 0), 0);
  if (it.k === 'plate') return it.items.reduce((s, x) => s + itemCost(x), 0);
  if (it.k === 'drink') return it.cost || 0;
  if (it.k === 'box') return ING[it.ing].cost * ING[it.ing].case;
  return 0;
}

export function itemLabel(state, it) {
  if (!it) return '';
  switch (it.k) {
    case 'ing': {
      let s = stateInfo(it.ing, it.st).label;
      if (it.top && it.top.length) s += ' + ' + it.top.map((x) => stateInfo(x.ing, x.st).label.toLowerCase()).join(', ');
      if ((it.n || 1) > 1) s += ` ×${it.n}`;
      return s;
    }
    case 'plate': {
      if (!it.items.length) return 'Clean plate';
      const m = matchAny(state, it);
      if (m) return dishById(state, m).name;
      return 'Plate: ' + it.items.map((x) => stateInfo(x.ing, x.st).label.toLowerCase()).join(', ');
    }
    case 'drink': { const d = drinkById(state, it.id); return d ? d.name : 'Drink'; }
    case 'box': return `Case of ${ING[it.ing].name.toLowerCase()}`;
    case 'dirty': return it.n > 1 ? `${it.n} dirty plates` : 'Dirty plate';
    case 'trash': return 'Trash bag';
  }
  return '';
}

/** Flattened [ing, st] list of a plate, with pizza toppings unpacked. */
export function plateComps(plate) {
  const out = [];
  for (const it of plate.items) {
    out.push([it.ing, it.st]);
    for (const t of it.top || []) out.push([t.ing, t.st]);
  }
  return out;
}

function key(c) { return c[0] + ':' + c[1]; }

export function compsMatch(a, b) {
  if (a.length !== b.length) return false;
  const m = new Map();
  for (const c of a) m.set(key(c), (m.get(key(c)) || 0) + 1);
  for (const c of b) {
    const k = key(c);
    const n = m.get(k);
    if (!n) return false;
    m.set(k, n - 1);
  }
  return true;
}

/** Which of the given dish ids this plate is, if any. */
export function matchDish(state, plate, ids) {
  if (!plate || plate.k !== 'plate' || !plate.items.length) return null;
  const comps = plateComps(plate);
  for (const id of ids) {
    const d = dishById(state, id);
    if (d && compsMatch(comps, d.comps)) return id;
  }
  return null;
}

export function matchAny(state, plate) {
  return matchDish(state, plate, state.menu.dishes.map((m) => m.id));
}

/** How far a plate is from a dish: what is missing and what is extra. */
export function plateDiff(plate, dish) {
  const have = new Map();
  for (const c of plateComps(plate)) have.set(key(c), (have.get(key(c)) || 0) + 1);
  const missing = [];
  for (const c of dish.comps) {
    const k = key(c);
    if (have.get(k)) have.set(k, have.get(k) - 1); else missing.push(c);
  }
  const extra = [];
  for (const [k, n] of have) for (let i = 0; i < n; i++) extra.push(k.split(':'));
  return { missing, extra };
}

export function isHot(it) { return it && it.k === 'ing' && it.heat >= 0; }
export function isCold(it, limit = CFG.coldAfter) { return isHot(it) && it.heat > limit; }

/** 0..1 quality of a finished plate, and whether it went cold. */
export function plateQuality(plate) {
  let q = 0, n = 0, cold = false;
  for (const it of plate.items) {
    q += it.q == null ? 1 : it.q;
    n++;
    if (isCold(it)) cold = true;
  }
  q = n ? q / n : 0;
  if (cold) q *= 0.8;
  return { q, cold };
}

/** True if an item may sit on a station of this type. */
export function stationAccepts(type, it) {
  if (!it) return false;
  if (it.k === 'trash') return false;
  if (type === 'counter' || type === 'pass') return true;
  if (it.k !== 'ing' || it.st === 'burnt') return false;
  if (type === 'board') return ING[it.ing].steps.some((s) => s.from === it.st && s.at === 'board') && !it.top;
  if (HEAT_TYPES.has(type)) return ING[it.ing].steps.some((s) => s.from === it.st && s.at === type);
  return false;
}

export function stationCapacity(type) {
  if (type === 'pot') return CFG.potMax;
  if (type === 'fryer') return CFG.fryerMax;
  return 1;
}

/** Short signature used by the renderer to know when to rebuild a mesh. */
export function itemSig(it) {
  if (!it) return '';
  switch (it.k) {
    case 'ing': return `i:${it.ing}:${it.st}:${it.n || 1}:${(it.top || []).map((t) => t.ing + t.st).join(',')}`;
    case 'plate': return 'p:' + it.items.map(itemSig).join('|');
    case 'drink': return 'd:' + it.id;
    case 'box': return 'b:' + it.ing;
    case 'dirty': return 'x:' + it.n;
    case 'trash': return 'trash:' + it.n;
  }
  return '?';
}
