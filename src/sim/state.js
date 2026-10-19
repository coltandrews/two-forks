// Creating a new restaurant, dish helpers, and save/load.
import { BUILD, CFG } from '../config.js';
import { CUISINES } from '../data/cuisines.js';
import { ING } from '../data/ingredients.js';
import { startingObjects, STORY_BUILDING } from '../data/layout.js';
import { legacyStartingObjects } from '../data/legacy-layouts.js';
import { isStory, storyObjects, STARTERS, startingDrinks, XP_LEVELS } from '../data/progression.js';
import { dailyGoal } from './progression.js';
import { TRASH_CAPACITY } from '../data/alley.js';
import { footprint, validateLayout } from './world.js';

export const SAVE_VERSION = 5;
export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function nextId(state, prefix = 'o') {
  state.seq = (state.seq || 0) + 1;
  return prefix + state.seq;
}

export function cuisineOf(state) { return CUISINES[state.cuisine]; }

export function allDishes(state) {
  return [...cuisineOf(state).dishes, ...(state.custom || [])];
}

export function dishById(state, id) {
  return allDishes(state).find((d) => d.id === id) || null;
}

export function drinkById(state, id) {
  return cuisineOf(state).drinks.find((d) => d.id === id) || null;
}

export function dishVeg(dish) {
  return dish.comps.every(([ing]) => ING[ing] && ING[ing].veg);
}

/** Ingredient cost of one plate of a dish. */
export function dishCost(dish) {
  let c = 0;
  for (const [ing] of dish.comps) c += ING[ing] ? ING[ing].cost : 0;
  return Math.round(c * 100) / 100;
}

/** Course bucket used for menu limits: sides count as starters. */
export function courseSlot(course) {
  return course === 'main' ? 'main' : course === 'dessert' ? 'dessert' : 'starter';
}

export function menuLimits(state) {
  const base = isStory(state) && !state.owned.areas.main_room ? { main: 2, starter: 1, dessert: state.level >= 4 ? 1 : 0 } : CFG.menuSlots;
  const extra = state.upgrades.menu_board ? CFG.menuBoardBonus : { main: 0, starter: 0, dessert: 0 };
  return {
    main: base.main + extra.main,
    starter: base.starter + extra.starter,
    dessert: base.dessert + extra.dessert,
  };
}

export function repLevel(points) {
  const L = CFG.rep.levels;
  let lv = 1;
  for (let i = 0; i < L.length; i++) if (points >= L[i]) lv = i + 1;
  return lv;
}

export function nextLevelAt(level) {
  const L = CFG.rep.levels;
  return level < L.length ? L[level] : null;
}

/** Ingredients any dish on the current menu needs, plus all drinks' nothing. */
export function menuIngredients(state) {
  const set = new Set();
  for (const m of state.menu.dishes) {
    if (!m.on) continue;
    const d = dishById(state, m.id);
    if (d) for (const [ing] of d.comps) set.add(ing);
  }
  return [...set];
}

function buildObjects(state) {
  return (isStory(state) ? storyObjects(state.cuisine) : startingObjects(state.cuisine)).map((spec) => initObject({ id: nextId(state), ...spec }));
}

export function initObject(o) {
  switch (o.type) {
    case 'well': o.well = null; break;          // { ing, st, n, cost, day }
    case 'rack': o.n = 0; break;
    case 'sink': o.n = 0; o.wash = 0; break;
    case 'dock': o.boxes = []; break;            // [{ ing, cases }]
    case 'table': o.dirty = 0; o.party = null; o.num = 0; break;
    case 'bin': o.trash = 0; break;
    case 'fridge': case 'freezer': case 'pantry': case 'host': case 'drinks': break;
    default: o.slot = null;
  }
  return o;
}

export function numberTables(state) {
  const tables = state.objects.filter((o) => o.type === 'table');
  tables.sort((a, b) => (a.z - b.z) || (a.x - b.x));
  tables.forEach((t, i) => { t.num = i + 1; });
}

export function newState({ cuisine, name, mode = 'arcade', cash = 3000 }) {
  const c = CUISINES[cuisine];
  const state = {
    v: SAVE_VERSION,
    build: BUILD,
    seq: 0,
    cuisine,
    name: (name || c.name).slice(0, 32),
    created: Date.now(),
    day: 1,
    phase: 'morning',
    clock: 8 * 60,
    paused: false,
    mode: mode === 'story' ? 'story' : 'arcade',
    cash: mode === 'story' ? 600 : [1500, 3000, 5000].includes(cash) ? cash : 3000,
    rep: { points: 0, level: 1, ratings: [] },
    upgrades: {},
    marketing: null,                 // { id, days, boost }
    custom: [],
    menu: { dishes: [], drinks: [] },
    stock: {},                       // ing -> [{ n, cost, exp }]
    orders: [],                      // [{ ing, cases, rush?, at? }] arriving next morning
    objects: [],
    players: {},
    parties: [],
    tickets: [],
    ready: {},
    today: null,
    history: [],
    reviews: [],                     // last few written reviews
    lifetime: { guests: 0, revenue: 0, days: 0, bestDay: 0 },
    unlocked: [],                    // dish ids announced as unlocked
    tip: 0,                          // tutorial step
  };
  if (isStory(state)) state.building = { ...STORY_BUILDING, divider: { ...STORY_BUILDING.divider } };
  state.objects = buildObjects(state);
  if (isStory(state)) {
    Object.assign(state, { xp: 0, level: 1, prestige: 0, owned: { licenses: {}, stations: {}, areas: {}, features: {} }, chapter: 1, storyStats: { paidGuests: 0, bestPaidDay: 0, criticPassed: false }, debt: 600, debtDays: 0 });
    for (const o of state.objects) if (o.type !== 'table') state.owned.stations[o.type] = true;
    state.goal = dailyGoal(state);
  }
  numberTables(state);
  state.objects.find((o) => o.type === 'rack').n = CFG.plates;

  for (const d of c.dishes) {
    state.menu.dishes.push({ id: d.id, price: d.fair, on: isStory(state) ? STARTERS[cuisine].includes(d.id) : d.level <= 1 });
  }
  for (const d of c.drinks) state.menu.drinks.push({ id: d.id, price: d.price, on: !isStory(state) || startingDrinks(cuisine).includes(d.id) });
  state.unlocked = c.dishes.filter((d) => d.level <= 1).map((d) => d.id);
  state.today = freshToday();
  return state;
}

export function freshToday() {
  return {
    parties: 0, covers: 0, walkouts: 0, turnedAway: 0,
    foodRev: 0, drinkRev: 0, cogsFood: 0, cogsDrink: 0,
    waste: { binned: 0, spoiled: 0, cleanup: 0 },
    rushSpend: 0, purchases: 0,
    tips: {}, sold: {}, soldDrinks: {}, ratings: [], ticketTimes: [], cold: 0, burnt: 0,
    dirtyLeft: 0, peakQueue: 0, repStart: 0,
    paidGuests: 0, hotPaid: 0, dessertsPaid: 0, xpLines: [], contributions: {},
  };
}

/** Routine waste fills the bin. A full bin must be emptied before discards. */
export function addTrash(state, units) {
  const bin = state.objects.find((o) => o.type === 'bin');
  if (!bin || !Number.isFinite(units) || units <= 0) return;
  if ((bin.trash || 0) < TRASH_CAPACITY) bin.trash = Math.min(TRASH_CAPACITY, (bin.trash || 0) + Math.ceil(units));
}

/** Preserve carried bags when a chef leaves or a save removes live players. */
export function returnTrashBag(state, bag) {
  const bin = state.objects.find((o) => o.type === 'bin');
  if (!bin || bag?.k !== 'trash') return;
  const units = Number.isFinite(bag.n) && bag.n > 0 ? Math.min(TRASH_CAPACITY, Math.ceil(bag.n)) : TRASH_CAPACITY;
  bin.trash = (bin.trash || 0) + units;
}

/** Plain JSON copy for saving. Players and live guests are dropped. */
export function serialize(state) {
  const s = JSON.parse(JSON.stringify(state));
  for (const p of Object.values(s.players || {})) if (p.hand?.k === 'trash') returnTrashBag(s, p.hand);
  s.players = {};
  s.parties = [];
  s.tickets = [];
  s.ready = {};
  delete s.pendingPurchase;
  for (const o of s.objects) {
    if (o.type === 'table') { o.party = null; }
  }
  return s;
}

function layoutSignature(objects) {
  return JSON.stringify(objects.map((o) => {
    const f = footprint(o);
    return [o.type, f.x, f.z, f.w, f.h, o.seats || 0];
  }).sort());
}

/** Repair only unchanged starter floors; old saves do not record furniture moves. */
function repairStartingHost(state) {
  if (!['italian', 'mexican', 'diner'].includes(state.cuisine)) return;
  if (layoutSignature(state.objects) !== layoutSignature(legacyStartingObjects(state.cuisine, 3))) return;
  const host = state.objects.find((o) => o.type === 'host');
  const target = legacyStartingObjects(state.cuisine).find((o) => o.type === 'host');
  host.x = target.x; host.z = target.z;
  if (!validateLayout(state).ok) { host.x = 18; host.z = 13; }
}

/** Update unchanged kitchen furniture while keeping custom dining layouts. */
function repairStartingKitchen(state) {
  const isKitchen = (o) => o.type !== 'table' && o.type !== 'host';
  const oldKitchen = legacyStartingObjects(state.cuisine).filter(isKitchen);
  const kitchen = state.objects.filter(isKitchen);
  if (layoutSignature(kitchen) !== layoutSignature(oldKitchen)) return;

  const targets = new Map();
  for (const o of startingObjects(state.cuisine).filter(isKitchen)) {
    if (!targets.has(o.type)) targets.set(o.type, []);
    targets.get(o.type).push(o);
  }
  const moves = new Map();
  for (const old of oldKitchen) {
    const target = targets.get(old.type)?.shift();
    if (!target) return;
    const object = kitchen.find((o) => o.type === old.type && o.x === old.x && o.z === old.z);
    moves.set(object, { x: target.x, z: target.z });
  }
  if ([...targets.values()].some((objects) => objects.length)) return;
  const objects = state.objects.map((o) => moves.has(o) ? { ...o, ...moves.get(o) } : o);
  if (!validateLayout({ ...state, objects }).ok) return;
  for (const [object, position] of moves) Object.assign(object, position);
}

export function deserialize(obj) {
  if (!obj || typeof obj !== 'object' || !obj.cuisine || !CUISINES[obj.cuisine]) throw new Error('Not a Two Forks save');
  const s = obj;
  s.mode = s.mode === 'story' ? 'story' : 'arcade';
  if ((s.v || 0) < 4 && s.mode === 'arcade') repairStartingHost(s);
  if ((s.v || 0) < 5 && s.mode === 'arcade') repairStartingKitchen(s);
  s.v = SAVE_VERSION;
  delete s.pendingPurchase;
  for (const o of s.objects) if (o.type === 'bin') {
    const units = Number(o.trash);
    o.trash = Number.isFinite(units) ? Math.max(0, Math.ceil(units)) : 0;
  }
  for (const p of Object.values(s.players || {})) if (p.hand?.k === 'trash') returnTrashBag(s, p.hand);
  if (isStory(s)) {
    // Old saves keep the original footprint and all furniture coordinates.
    s.building ||= { width: 20, height: 15, divider: { from: 1, to: 12 } };
    const b = s.building;
    if (!Number.isInteger(b.width) || b.width < 14 || b.width > 64 || !Number.isInteger(b.height) || b.height < 12 || b.height > 24 || !Number.isInteger(b.divider?.from) || !Number.isInteger(b.divider?.to) || b.divider.from < 1 || b.divider.to < b.divider.from || b.divider.to >= b.width - 1) throw new Error('Invalid restaurant floor dimensions');
    s.xp = Math.max(0, Number(s.xp) || 0);
    s.level = XP_LEVELS.reduce((level, at, i) => s.xp >= at ? i + 1 : level, 1);
    s.prestige = Math.floor(Math.max(0, s.xp - XP_LEVELS[19]) / 2000);
    s.owned = s.owned || {};
    for (const kind of ['licenses', 'stations', 'areas', 'features']) s.owned[kind] ||= {};
    s.chapter = Math.max(1, Math.min(5, Number(s.chapter) || 1));
    s.storyStats ||= { paidGuests: 0, bestPaidDay: 0, criticPassed: false };
    s.debt = Math.max(0, Number(s.debt) || 0);
    s.debtDays = Math.max(0, Number(s.debtDays) || 0);
  }
  s.players = {};
  s.parties = [];
  s.tickets = [];
  s.ready = {};
  s.paused = false;
  if (s.phase === 'service' || s.phase === 'closing') {
    // A save made mid-service resumes at the start of that morning.
    s.phase = 'morning';
    s.clock = 8 * 60;
    s.today = freshToday();
  }
  if (isStory(s) && (!s.goal || s.phase === 'morning')) s.goal = dailyGoal(s);
  s.build = BUILD;
  return s;
}

export async function encodeSave(state) {
  const json = JSON.stringify(serialize(state));
  if (typeof CompressionStream !== 'undefined') {
    const cs = new CompressionStream('gzip');
    const stream = new Blob([json]).stream().pipeThrough(cs);
    const buf = new Uint8Array(await new Response(stream).arrayBuffer());
    let bin = '';
    for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
    return 'TF1.' + btoa(bin);
  }
  return 'TF0.' + btoa(unescape(encodeURIComponent(json)));
}

export async function decodeSave(code) {
  code = code.trim();
  if (code.startsWith('TF1.')) {
    const bin = atob(code.slice(4));
    const buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    const ds = new DecompressionStream('gzip');
    const stream = new Blob([buf]).stream().pipeThrough(ds);
    const text = await new Response(stream).text();
    return deserialize(JSON.parse(text));
  }
  if (code.startsWith('TF0.')) return deserialize(JSON.parse(decodeURIComponent(escape(atob(code.slice(4))))));
  return deserialize(JSON.parse(code));
}
