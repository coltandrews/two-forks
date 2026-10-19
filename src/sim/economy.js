// Stock, supplier orders, forecasting, upgrades, layout changes, custom
// dishes and the end-of-day P&L.
import { CFG } from '../config.js';
import { ING, statesOf } from '../data/ingredients.js';
import { UPGRADES, MARKETING } from '../data/upgrades.js';
import { BUILDER, PAIRS } from '../data/cuisines.js';
import { KITCHEN_MAX_Z, LAYOUT_MIN_Z, LAYOUT_MAX_Z, FRONT_DOOR, QUEUE_SPOTS, HEAT_TYPES, SPAWN_POINTS } from '../data/layout.js';
import {
  allDishes, dishById, dishCost, cuisineOf, nextId, initObject, numberTables, courseSlot, menuLimits, drinkById,
} from './state.js';
import { validateLayout, fits, footprint } from './world.js';

const round2 = (v) => Math.round(v * 100) / 100;

// ---------------------------------------------------------------- stock

export function stockCount(state, ing) {
  return (state.stock[ing] || []).reduce((s, l) => s + l.n, 0);
}

export function shelfLife(state, ing) {
  const d = ING[ing];
  return d.keep + (d.store === 'fridge' && state.upgrades.fridge_temp ? 1 : 0);
}

export function addLot(state, ing, n, cost, exp) {
  const lots = state.stock[ing] || (state.stock[ing] = []);
  if (exp == null) exp = state.day + shelfLife(state, ing);
  const same = lots.find((l) => l.exp === exp && Math.abs(l.cost - cost) < 1e-6);
  if (same) same.n += n; else lots.push({ n, cost, exp });
  lots.sort((a, b) => a.exp - b.exp);
}

/** Takes one unit, oldest first. Returns its cost, or null if out. */
export function takeStock(state, ing) {
  const lots = state.stock[ing];
  if (!lots || !lots.length) return null;
  const lot = lots[0];
  lot.n -= 1;
  const cost = lot.cost;
  if (lot.n <= 0) lots.shift();
  return cost;
}

export function returnStock(state, ing, cost) {
  addLot(state, ing, 1, cost, state.day + Math.max(1, Math.min(2, shelfLife(state, ing))));
}

/** Units of an ingredient anywhere: storage, wells and stations. */
export function availableUnits(state) {
  const n = {};
  for (const [ing, lots] of Object.entries(state.stock)) n[ing] = lots.reduce((s, l) => s + l.n, 0);
  for (const o of state.objects) {
    if (o.well) n[o.well.ing] = (n[o.well.ing] || 0) + o.well.n;
    if (o.slot && o.slot.k === 'ing') n[o.slot.ing] = (n[o.slot.ing] || 0) + (o.slot.n || 1);
  }
  return n;
}

/** Morning spoilage of storage and prep wells. Returns lines for the report. */
export function spoil(state) {
  const lines = [];
  let total = 0;
  for (const [ing, lots] of Object.entries(state.stock)) {
    const keep = [];
    for (const l of lots) {
      if (l.exp < state.day) {
        const v = l.n * l.cost;
        total += v;
        lines.push({ ing, n: l.n, value: round2(v) });
      } else keep.push(l);
    }
    state.stock[ing] = keep;
  }
  for (const o of state.objects) {
    if (!o.well) continue;
    const age = state.day - o.well.day;
    const life = Math.min(2, shelfLife(state, o.well.ing));
    if (age >= life) {
      const v = o.well.n * o.well.cost;
      total += v;
      lines.push({ ing: o.well.ing, n: o.well.n, value: round2(v), well: true });
      o.well = null;
    }
  }
  return { lines, total: round2(total) };
}

// ---------------------------------------------------------------- orders

export function casePrice(ing, rush = false) {
  const d = ING[ing];
  return round2(d.cost * d.case * (rush ? CFG.money.rushMarkup : 1));
}

export function canSpend(state, amount) {
  return state.cash - amount >= -500;
}

export function placeOrder(state, ing, cases, rush = false, now = 0) {
  if (!ING[ing] || cases <= 0) return { ok: false, reason: 'Nothing to order.' };
  const price = casePrice(ing, rush) * cases;
  if (!canSpend(state, price)) return { ok: false, reason: 'Not enough cash for that order.' };
  state.cash = round2(state.cash - price);
  state.today.purchases = round2(state.today.purchases + price);
  if (rush) {
    state.today.rushSpend = round2(state.today.rushSpend + price);
    state.rush = state.rush || [];
    state.rush.push({ ing, cases, at: now + CFG.money.rushDelay });
  } else {
    const o = state.orders.find((x) => x.ing === ing);
    if (o) o.cases += cases; else state.orders.push({ ing, cases });
  }
  return { ok: true, price };
}

export function cancelOrder(state, ing, cases = Infinity) {
  const o = state.orders.find((x) => x.ing === ing);
  if (!o) return 0;
  const n = Math.min(cases, o.cases);
  o.cases -= n;
  if (o.cases <= 0) state.orders = state.orders.filter((x) => x !== o);
  const refund = casePrice(ing) * n;
  state.cash = round2(state.cash + refund);
  state.today.purchases = round2(state.today.purchases - refund);
  return n;
}

export function pendingCases(state, ing) {
  const o = state.orders.find((x) => x.ing === ing);
  return o ? o.cases : 0;
}

/** Moves tonight's orders onto the delivery pallet as boxes. */
export function deliverOrders(state) {
  const dock = state.objects.find((o) => o.type === 'dock');
  let n = 0;
  for (const o of state.orders) {
    for (let i = 0; i < o.cases; i++) { dock.boxes.push({ ing: o.ing }); n++; }
  }
  state.orders = [];
  return n;
}

// ---------------------------------------------------------------- demand

export function avgRating(state) {
  const r = state.rep.ratings;
  if (!r.length) return 0;
  return r.reduce((s, x) => s + x, 0) / r.length;
}

export function menuItemsOn(state, course) {
  return state.menu.dishes.filter((m) => {
    if (!m.on) return false;
    const d = dishById(state, m.id);
    return d && (!course || courseSlot(d.course) === course) && d.level <= state.rep.level;
  });
}

/** How menu prices compare to what guests think is fair (1 = fair). */
export function priceIndex(state) {
  const on = menuItemsOn(state);
  if (!on.length) return 1;
  let s = 0;
  for (const m of on) s += m.price / dishById(state, m.id).fair;
  return s / on.length;
}

export function expectedParties(state, day, players = 2) {
  const tables = state.objects.filter((o) => o.type === 'table');
  const T = CFG.traffic;
  const wd = T.weekday[(day - 1) % 7];
  const repMult = 0.75 + 0.09 * (state.rep.level - 1);
  const avg = avgRating(state);
  const ratingMult = avg ? Math.max(0.7, Math.min(1.15, 0.85 + 0.1 * (avg - 3))) : 1;
  const mk = state.marketing && state.marketing.days > 0 ? 1 + state.marketing.boost : 1;
  const pi = priceIndex(state);
  const priceMult = Math.max(0.45, Math.min(1.25, Math.pow(1 / pi, 1.4)));
  const solo = players <= 1 ? T.solo : 1;
  const menuMult = menuItemsOn(state, 'main').length ? 1 : 0;
  return tables.length * T.perTable * wd * repMult * ratingMult * mk * priceMult * solo * menuMult;
}

/** Expected portions of each on-menu dish for a day with this many parties. */
export function forecastDishes(state, parties) {
  const covers = parties * 2.35;
  const out = {};
  const share = { main: 0.95, starter: 0.42, dessert: 0.2 };
  for (const slot of ['main', 'starter', 'dessert']) {
    const items = menuItemsOn(state, slot);
    const w = items.map((m) => {
      const d = dishById(state, m.id);
      return Math.pow(d.appeal, 1.5) * Math.pow(d.fair / m.price, 1.3);
    });
    const tw = w.reduce((s, x) => s + x, 0) || 1;
    items.forEach((m, i) => { out[m.id] = covers * share[slot] * (w[i] / tw); });
  }
  return out;
}

/** Suggested cases per ingredient for tomorrow. */
export function autofillPlan(state, players = 2) {
  const parties = expectedParties(state, state.day + 1, players) * 1.15;
  const portions = forecastDishes(state, parties);
  const need = {};
  for (const [id, n] of Object.entries(portions)) {
    const d = dishById(state, id);
    for (const [ing] of d.comps) need[ing] = (need[ing] || 0) + n;
  }
  const plan = [];
  for (const [ing, n] of Object.entries(need)) {
    const usable = (state.stock[ing] || []).filter((l) => l.exp >= state.day + 1).reduce((s, l) => s + l.n, 0);
    const pending = pendingCases(state, ing) * ING[ing].case;
    const short = Math.ceil(n * 1.1) - usable - pending;
    if (short > 0) plan.push({ ing, cases: Math.ceil(short / ING[ing].case), need: Math.ceil(n) });
  }
  plan.sort((a, b) => ING[a.ing].store.localeCompare(ING[b.ing].store) || a.ing.localeCompare(b.ing));
  return plan;
}

export function applyAutofill(state, players = 2) {
  const plan = autofillPlan(state, players);
  let spent = 0;
  const failed = [];
  for (const p of plan) {
    const r = placeOrder(state, p.ing, p.cases);
    if (r.ok) spent += r.price; else failed.push(p.ing);
  }
  return { spent: round2(spent), lines: plan.length, failed };
}

// ---------------------------------------------------------------- layout

const KITCHEN_TYPES = new Set(['fridge', 'freezer', 'pantry', 'counter', 'board', 'grill', 'pan', 'pot', 'fryer', 'oven', 'well', 'rack', 'sink', 'bin', 'dock']);
const DINING_TYPES = new Set(['table', 'host']);

export function zoneOf(type) {
  if (KITCHEN_TYPES.has(type)) return [1, KITCHEN_MAX_Z];
  if (DINING_TYPES.has(type)) return [6, 13];
  return null;
}

function protectedTile(x, z) {
  if (SPAWN_POINTS.some((s) => Math.floor(s.x) === x && Math.floor(s.z) === z)) return true;
  if (QUEUE_SPOTS.some((s) => Math.floor(s.x) === x && Math.floor(s.z) === z)) return true;
  if (x === FRONT_DOOR.x && z === FRONT_DOOR.z - 1) return true;
  return false;
}

function footprintFree(state, f, zone, ignoreId) {
  if (!fits(state, f, zone[0], zone[1], ignoreId)) return false;
  for (let dz = 0; dz < f.h; dz++) for (let dx = 0; dx < f.w; dx++) if (protectedTile(f.x + dx, f.z + dz)) return false;
  return true;
}

function tableSpacingOk(state, f, ignoreId) {
  for (const o of state.objects) {
    if (o.type !== 'table' && o.type !== 'host') continue;
    if (o.id === ignoreId) continue;
    const g = footprint(o);
    if (f.x < g.x + g.w + 1 && f.x + f.w + 1 > g.x && f.z < g.z + g.h + 1 && f.z + f.h + 1 > g.z) return false;
  }
  return true;
}

export function placementStatus(state, id, x, z) {
  const o = state.objects.find((q) => q.id === id);
  if (!o) return { ok: false, reason: 'Nothing there.' };
  if (o.type === 'table' && (o.party || o.dirty)) return { ok: false, reason: 'Clear the table first.' };
  const f = { ...footprint(o), x, z };
  const fullFloor = [LAYOUT_MIN_Z, LAYOUT_MAX_Z];
  if (!footprintFree(state, f, fullFloor, id)) return { ok: false, reason: "It doesn't fit there." };
  if (o.type === 'table' && !tableSpacingOk(state, f, id)) return { ok: false, reason: 'Tables need a walkway around them.' };
  const ox = o.x, oz = o.z;
  o.x = x; o.z = z;
  const result = validateLayout(state, FRONT_DOOR);
  o.x = ox; o.z = oz;
  return result;
}

export function tryMove(state, id, x, z) {
  const result = placementStatus(state, id, x, z);
  if (!result.ok) return result;
  const o = state.objects.find((q) => q.id === id);
  o.x = x; o.z = z;
  if (o.type === 'table') numberTables(state);
  return { ok: true };
}

function placeNew(state, o) {
  const zone = zoneOf(o.type);
  const cands = [];
  for (let z = zone[0]; z <= zone[1]; z++) {
    for (let x = 1; x < 19; x++) cands.push({ x, z });
  }
  if (o.type === 'table') {
    cands.sort((a, b) => (Math.abs(a.z - 9) - Math.abs(b.z - 9)) || (Math.abs(a.x - 10) - Math.abs(b.x - 10)));
  } else {
    // Prefer the middle island row, near the existing stations.
    const pref = (c) => (c.z === 3 ? 0 : c.z === 4 ? 10 : 20) + Math.abs(c.x - 13);
    cands.sort((a, b) => pref(a) - pref(b));
  }
  state.objects.push(o);
  for (const c of cands) {
    const f = { ...footprint(o), x: c.x, z: c.z };
    if (!footprintFree(state, f, zone, o.id)) continue;
    if (o.type === 'table' && !tableSpacingOk(state, f, o.id)) continue;
    o.x = c.x; o.z = c.z;
    if (validateLayout(state, FRONT_DOOR).ok) {
      if (o.type === 'table') numberTables(state);
      return true;
    }
  }
  state.objects.pop();
  return false;
}

// ---------------------------------------------------------------- upgrades

export function upgradeStatus(state, u) {
  const n = state.upgrades[u.id] || 0;
  if (n >= u.max) return { can: false, reason: 'Owned' };
  if (u.needs && !state.upgrades[u.needs]) return { can: false, reason: 'Needs ' + UPGRADES.find((x) => x.id === u.needs).name };
  if (state.cash < u.price) return { can: false, reason: 'Not enough cash' };
  return { can: true };
}

export function buyUpgrade(state, id) {
  const u = UPGRADES.find((x) => x.id === id);
  if (!u) return { ok: false, reason: 'Unknown upgrade.' };
  const st = upgradeStatus(state, u);
  if (!st.can) return { ok: false, reason: st.reason };
  if (u.station || u.table) {
    const o = { id: nextId(state), type: u.station || 'table', x: 0, z: 0 };
    if (u.table) o.seats = u.table;
    initObject(o);
    if (!placeNew(state, o)) return { ok: false, reason: 'No room. Move things around in the layout editor first.' };
  }
  state.upgrades[id] = (state.upgrades[id] || 0) + 1;
  state.cash = round2(state.cash - u.price);
  state.spentUpgrades = round2((state.spentUpgrades || 0) + u.price);
  return { ok: true, layout: !!(u.station || u.table) };
}

export function buyMarketing(state, id) {
  const m = MARKETING.find((x) => x.id === id);
  if (!m) return { ok: false };
  if (state.marketing && state.marketing.days > 0) return { ok: false, reason: 'A campaign is already running.' };
  if (state.cash < m.price) return { ok: false, reason: 'Not enough cash.' };
  state.cash = round2(state.cash - m.price);
  state.marketing = { id, days: m.days, boost: m.boost, name: m.name };
  state.spentMarketing = round2((state.spentMarketing || 0) + m.price);
  return { ok: true };
}

// ---------------------------------------------------------------- menu

export function setPrice(state, id, price, drink = false) {
  const list = drink ? state.menu.drinks : state.menu.dishes;
  const m = list.find((x) => x.id === id);
  if (!m) return false;
  m.price = Math.max(1, Math.min(99, Math.round(price * 2) / 2));
  return true;
}

export function toggleDish(state, id, on, drink = false) {
  const list = drink ? state.menu.drinks : state.menu.dishes;
  const m = list.find((x) => x.id === id);
  if (!m) return { ok: false };
  if (!drink && on) {
    const d = dishById(state, id);
    if (d.level > state.rep.level) return { ok: false, reason: `Unlocks at reputation level ${d.level}.` };
    const slot = courseSlot(d.course);
    const lim = menuLimits(state)[slot];
    const used = state.menu.dishes.filter((x) => x.on && courseSlot(dishById(state, x.id).course) === slot).length;
    if (used >= lim) return { ok: false, reason: `The menu board fits ${lim} ${slot === 'starter' ? 'starters and sides' : slot + 's'}.` };
  }
  m.on = !!on;
  return { ok: true };
}

/** Appeal and fair price a guest would assign to a custom dish. */
export function rateCustom(comps) {
  const ings = comps.map((c) => c[0]);
  let pairs = 0;
  for (const [a, b] of PAIRS) if (ings.includes(a) && ings.includes(b)) pairs++;
  const kinds = new Set(ings.map((i) => ING[i].kind));
  let appeal = 4 + Math.min(3, pairs) + (kinds.has('protein') ? 1 : 0) + (kinds.size >= 3 ? 1 : 0);
  const dup = ings.length - new Set(ings).size;
  appeal -= dup;
  appeal = Math.max(2, Math.min(9, appeal));
  const cost = comps.reduce((s, [i]) => s + ING[i].cost, 0);
  const fair = Math.max(4, Math.round(cost * 3.2 + 3 + appeal * 0.4));
  return { appeal, fair, cost: round2(cost), pairs };
}

export function createDish(state, spec) {
  const tpl = BUILDER[spec.tpl];
  if (!tpl) return { ok: false, reason: 'Pick a dish type.' };
  const comps = (spec.comps || []).filter((c) => ING[c[0]] && statesOf(c[0]).includes(c[1]) && c[1] !== 'burnt');
  if (comps.length < 2) return { ok: false, reason: 'A dish needs at least two components.' };
  if (comps.length > tpl.max) return { ok: false, reason: `Keep it to ${tpl.max} components.` };
  if (!tpl.bases.some(([i, s]) => comps.some((c) => c[0] === i && c[1] === s))) {
    return { ok: false, reason: `A ${tpl.name.toLowerCase()} needs a base: ` + tpl.bases.map(([i]) => ING[i].name.toLowerCase()).join(' or ') + '.' };
  }
  if ((state.custom || []).length >= 8) return { ok: false, reason: 'Eight house specials is the limit. Delete one first.' };
  const course = ['main', 'starter', 'side', 'dessert'].includes(spec.course) ? spec.course : 'main';
  const name = String(spec.name || '').trim().slice(0, 28) || 'House special';
  const all = allDishes(state);
  if (all.some((d) => d.comps.length === comps.length && sameComps(d.comps, comps))) return { ok: false, reason: 'That dish is already on the list.' };
  const r = rateCustom(comps);
  const id = 'c' + nextId(state, '');
  const dish = { id, name, course, tpl: spec.tpl, comps, fair: r.fair, appeal: r.appeal, level: 1, custom: true };
  state.custom.push(dish);
  state.menu.dishes.push({ id, price: r.fair, on: false });
  return { ok: true, id };
}

function sameComps(a, b) {
  const k = (l) => l.map((c) => c[0] + ':' + c[1]).sort().join('|');
  return k(a) === k(b);
}

export function deleteDish(state, id) {
  const i = (state.custom || []).findIndex((d) => d.id === id);
  if (i < 0) return false;
  state.custom.splice(i, 1);
  state.menu.dishes = state.menu.dishes.filter((m) => m.id !== id);
  return true;
}

// ---------------------------------------------------------------- P&L

export function fixedCosts(state) {
  const M = CFG.money;
  const heat = state.objects.filter((o) => HEAT_TYPES.has(o.type)).length;
  const t = state.today;
  const revenue = t.foodRev + t.drinkRev;
  return {
    rent: M.rent,
    loan: M.loan,
    utilities: round2(M.utilities + heat * M.utilityPerStation + (state.upgrades.dishwasher ? 4 : 0)),
    cardFees: round2(revenue * M.cardFee),
    supplies: round2(t.covers * M.suppliesPerGuest),
    cleaning: round2(t.dirtyLeft * M.cleaningPerPlate),
  };
}

export function menuEngineering(state) {
  const t = state.today;
  const rows = [];
  for (const m of state.menu.dishes) {
    const d = dishById(state, m.id);
    const s = t.sold[m.id];
    if (!m.on && !s) continue;
    const n = s ? s.n : 0;
    const price = s && s.n ? s.rev / s.n : m.price;
    const cost = s && s.n ? s.cost / s.n : dishCost(d);
    rows.push({ id: m.id, name: d.name, course: courseSlot(d.course), n, price: round2(price), cost: round2(cost), cm: round2(price - cost) });
  }
  for (const slot of ['main', 'starter', 'dessert']) {
    const g = rows.filter((r) => r.course === slot);
    const total = g.reduce((s, r) => s + r.n, 0);
    if (!g.length) continue;
    const popLine = total ? (0.7 * total) / g.length : 0;
    const avgCm = total ? g.reduce((s, r) => s + r.cm * r.n, 0) / total : g.reduce((s, r) => s + r.cm, 0) / g.length;
    for (const r of g) {
      const pop = total > 0 && r.n >= popLine;
      const prof = r.cm >= avgCm;
      r.cls = pop ? (prof ? 'Star' : 'Plowhorse') : (prof ? 'Puzzle' : 'Dog');
      r.mix = total ? r.n / total : 0;
    }
  }
  return rows;
}

const CLASS_TIPS = {
  Star: 'Popular and profitable. Keep it exactly as it is.',
  Plowhorse: 'Popular but thin. Try a dollar or two more.',
  Puzzle: 'Profitable but overlooked. A small price cut can get it moving.',
  Dog: 'Neither popular nor profitable. Consider swapping it out.',
};
export function classTip(cls) { return CLASS_TIPS[cls] || ''; }

/** Settles the day. Charges fixed costs and returns the full report. */
export function closeBooks(state, extra = {}) {
  const t = state.today;
  const revenue = round2(t.foodRev + t.drinkRev);
  const cogs = round2(t.cogsFood + t.cogsDrink);
  const waste = round2(t.waste.binned + t.waste.spoiled + t.waste.cleanup);
  const fixed = fixedCosts(state);
  const fixedTotal = round2(Object.values(fixed).reduce((s, x) => s + x, 0));
  const gross = round2(revenue - cogs);
  const net = round2(gross - waste - fixedTotal);
  state.cash = round2(state.cash - fixedTotal);
  const ratings = t.ratings;
  const avg = ratings.length ? ratings.reduce((s, x) => s + x, 0) / ratings.length : 0;
  const ticket = t.ticketTimes.length ? t.ticketTimes.reduce((s, x) => s + x, 0) / t.ticketTimes.length : 0;
  const report = {
    day: state.day,
    weekday: (state.day - 1) % 7,
    revenue, foodRev: round2(t.foodRev), drinkRev: round2(t.drinkRev),
    cogs, cogsFood: round2(t.cogsFood), cogsDrink: round2(t.cogsDrink),
    gross, waste, wasteParts: { ...t.waste }, fixed, fixedTotal, net,
    foodCostPct: t.foodRev ? round2((t.cogsFood / t.foodRev) * 100) : 0,
    purchases: round2(t.purchases), cashEnd: state.cash,
    parties: t.parties, covers: t.covers, walkouts: t.walkouts, turnedAway: t.turnedAway,
    avgCheck: t.covers ? round2(revenue / t.covers) : 0,
    rating: round2(avg), ticketTime: Math.round(ticket),
    tips: { ...t.tips }, cold: t.cold, burnt: t.burnt,
    repGain: state.rep.points - t.repStart, repPoints: state.rep.points, level: state.rep.level,
    menu: menuEngineering(state),
    drinks: Object.entries(t.soldDrinks).map(([id, n]) => ({ id, name: (drinkById(state, id) || { name: id }).name, n })),
    ...extra,
  };
  state.history.push({
    day: report.day, revenue, cogs, waste, fixed: fixedTotal, net, covers: report.covers, rating: report.rating,
    cash: state.cash, walkouts: report.walkouts,
  });
  if (state.history.length > 120) state.history.shift();
  state.lifetime.guests += t.covers;
  state.lifetime.revenue = round2(state.lifetime.revenue + revenue);
  state.lifetime.days += 1;
  state.lifetime.bestDay = Math.max(state.lifetime.bestDay, net);
  state.report = report;
  return report;
}
