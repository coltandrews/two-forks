// Story rules are shared by the host, the office and the floor planner.
import { CUISINES } from './cuisines.js';
import { ING } from './ingredients.js';
import { STATION_NAMES, roomSize, FLOOR_EXPANSION_WIDTH } from './layout.js';

export const XP_LEVELS = [0, 120, 480, 800, 1200, 1650, 2200, 2800, 3500, 4200, 4850, 5500, 6150, 6800, 7450, 8100, 8750, 9400, 10050, 10700];
export const STARTERS = {
  southern: ['classic_burger', 'grain_bowl', 'house_salad'],
  italian: ['pomodoro', 'margherita', 'caprese'],
  mexican: ['chicken_tacos', 'quesadilla', 'chips_salsa'],
  diner: ['classic_burger', 'blt', 'side_salad'],
  noodle: ['veggie_ramen', 'teriyaki_salmon', 'cucumber_salad'],
};
export const AREAS = [
  { id: 'main_room', name: 'Floor expansion 1', level: 4, price: 1500 },
  { id: 'kitchen_bay', name: 'Floor expansion 2', level: 8, price: 1000 },
  { id: 'dining_wing', name: 'Floor expansion 3', level: 13, price: 1100 },
];
export const CHAPTERS = [
  { id: 1, title: 'A small beginning', text: 'The landlord hands you $600 and the keys. Start with three tables. Serve your first regulars and save for your first floor expansion.', level: 4, price: 1500, goal: 'Serve 40 paying guests.', area: 'main_room' },
  { id: 2, title: 'The regulars', text: 'The neighbors now know your name. Your regulars bring friends. Build a steady service and add another section of floor space.', level: 8, price: 1000, goal: 'Serve 120 paying guests.', area: 'kitchen_bay' },
  { id: 3, title: 'A table for the critic', text: 'A local food critic wants to try your food. Expect a visit at the next service. Earn a good review and expand your floor again.', level: 13, price: 1100, goal: 'Earn a paid critic review of at least 4 stars.', area: 'dining_wing' },
  { id: 4, title: 'Your own place', text: 'Your small counter has grown into a full restaurant. Show that your crew can run a full service. Then keep growing for as long as you like.', level: 19, price: 300, goal: 'Serve 18 paying guests in one day.' },
];
export const LICENSES = [
  { id: 'fryer_basics', name: 'Fryer basics', level: 2, price: 80, ingredients: ['fries', 'rings', 'chicken_thigh', 'churros', 'gyoza', 'tenders'] },
  { id: 'pantry', name: 'Expanded pantry', level: 2, price: 80, ingredients: [] },
  { id: 'produce', name: 'Market produce', level: 3, price: 100, ingredients: [] },
  { id: 'dairy', name: 'Dairy', level: 3, price: 120, ingredients: ['cream', 'butter', 'cheddar', 'mozzarella', 'parmesan', 'queso', 'sour_cream', 'egg'] },
  { id: 'desserts', name: 'Desserts', level: 4, price: 150, ingredients: ['banana', 'wafers', 'ice_cream', 'pie', 'tiramisu', 'tres_leches', 'mochi', 'choc', 'syrup'] },
  { id: 'seafood', name: 'Seafood', level: 5, price: 300, ingredients: ['shrimp', 'salmon', 'fish'] },
  { id: 'premium_meat', name: 'Premium meat', level: 8, price: 400, ingredients: ['ribeye', 'flank', 'pork', 'sausage', 'bacon', 'pepperoni', 'meatballs', 'chicken', 'beef_patty'] },
  { id: 'bar', name: 'Bar', level: 10, price: 600, ingredients: [] },
];
const EQUIPMENT = [
  { id: 'freezer', level: 2, price: 250 },
  { id: 'fryer', level: 2, price: 400 },
  { id: 'pan', level: 3, price: 450 },
  { id: 'oven', level: 4, price: 1000 },
];
const FEATURES = [
  { id: 'marketing', name: 'Marketing', level: 3, price: 0 },
  { id: 'menu_report', name: 'Menu engineering report', level: 5, price: 0 },
  { id: 'house_dish', name: 'House-dish creator', level: 6, price: 0 },
];
export const isStory = (state) => state.mode === 'story';
export function isOwned(state, kind, id) {
  if (!isStory(state)) return true;
  if (kind === 'features') {
    const feature = FEATURES.find((f) => f.id === id);
    if (feature && !feature.price && state.level >= feature.level) return true;
  }
  return !!state.owned?.[kind]?.[id];
}

export function starterIngredients(cuisine) {
  return [...new Set(CUISINES[cuisine].dishes.filter((d) => STARTERS[cuisine].includes(d.id)).flatMap((d) => d.comps.map(([i]) => i)))];
}
export function ingredientLicense(id) {
  const explicit = LICENSES.find((l) => l.ingredients.includes(id));
  return explicit || LICENSES.find((l) => l.id === (ING[id]?.kind === 'veg' ? 'produce' : 'pantry'));
}
export function ingredientAllowed(state, id) {
  return !!ING[id] && (!isStory(state) || starterIngredients(state.cuisine).includes(id) || isOwned(state, 'licenses', ingredientLicense(id).id));
}
export function requiredStations(dish) {
  const result = new Set();
  for (const [id, target] of dish.comps) {
    if (ING[id]) result.add(ING[id].store);
    let current = target;
    const seen = new Set();
    while (current !== 'raw' && !seen.has(current)) {
      seen.add(current);
      const step = ING[id]?.steps.find((s) => s.to === current);
      if (!step) break;
      result.add(step.at);
      current = step.from;
    }
  }
  return [...result];
}
export function recipeLevel(state, dish) {
  if (STARTERS[state.cuisine].includes(dish.id)) return 1;
  if (dish.custom) return 6;
  return Math.min(20, 2 + (dish.level - 1) * 5);
}
export function recipeRequirements(state, dish) {
  if (!isStory(state)) return [];
  const needs = [];
  const level = recipeLevel(state, dish);
  if (state.level < level) needs.push(`Chef Level ${level}`);
  for (const [id] of dish.comps) if (!ingredientAllowed(state, id)) needs.push(`${ingredientLicense(id).name} license`);
  for (const type of requiredStations(dish)) if (!state.objects.some((o) => o.type === type)) needs.push(STATION_NAMES[type]);
  return [...new Set(needs)];
}
export function startingDrinks(cuisine) {
  const drinks = CUISINES[cuisine].drinks;
  return cuisine === 'southern' ? ['sweet_tea', 'soda'] : drinks.filter((d) => !['beer', 'wine', 'margarita', 'sake'].includes(d.id)).slice(0, 2).map((d) => d.id);
}
export function drinkRequirements(state, drink) {
  if (!isStory(state) || startingDrinks(state.cuisine).includes(drink.id)) return [];
  if (['beer', 'wine', 'margarita', 'sake'].includes(drink.id)) return isOwned(state, 'licenses', 'bar') ? [] : ['Bar license'];
  return state.level >= 3 ? [] : ['Chef Level 3'];
}
export function storyObjects(cuisine) {
  const stations = new Set(['board', 'grill', 'pot']);
  for (const d of CUISINES[cuisine].dishes.filter((d) => STARTERS[cuisine].includes(d.id))) {
    for (const type of requiredStations(d)) if (!['fridge', 'pantry'].includes(type)) stations.add(type);
  }
  const types = ['fridge', 'pantry', 'board', 'grill', 'pot', ...[...stations].filter((s) => !['board', 'grill', 'pot'].includes(s)), 'sink', 'rack', 'bin'];
  const objects = types.map((type, i) => ({ type, x: i + 1, z: 1 }));
  // A five-counter prep bench in the middle of the kitchen.
  for (let x = 4; x <= 8; x++) objects.push({ type: 'counter', x, z: 3 });
  objects.push({ type: 'pass', x: 7, z: 5 }, { type: 'dock', x: 1, z: 4 }, { type: 'drinks', x: 9, z: 5 }, { type: 'host', x: 4, z: 10 });
  for (const [x, z] of [[4, 7], [8, 7], [6, 9]]) objects.push({ type: 'table', seats: 2, x, z });
  return objects;
}
export function chapterInfo(state) {
  const c = CHAPTERS[(state.chapter || 1) - 1];
  if (!isStory(state) || !c) return null;
  const stats = state.storyStats || {};
  const met = c.id === 1 ? stats.paidGuests >= 40 : c.id === 2 ? stats.paidGuests >= 120 : c.id === 3 ? stats.criticPassed : stats.bestPaidDay >= 18;
  const reason = state.level < c.level ? `Reach Chef Level ${c.level}.` : !met ? c.goal : state.cash < c.price ? `Save $${c.price}.` : '';
  return { ...c, ready: !reason, reason };
}
export function unlockList(state) {
  if (!isStory(state)) return [];
  const rows = [
    ...LICENSES.map((l) => ({ ...l, kind: 'licenses', desc: l.id === 'bar' ? 'Add beer, wine and cocktails to your menu.' : 'Order this ingredient group from the supplier.' })),
    ...EQUIPMENT.map((e) => ({ ...e, name: STATION_NAMES[e.id], kind: 'stations', desc: 'Adds one station to your kitchen.' })),
    ...AREAS.map((a) => ({ ...a, kind: 'areas', desc: `Add ${FLOOR_EXPANSION_WIDTH} × ${roomSize(state).height - 2} floor cells. The outside wall moves and your furniture stays in place.` })),
    ...FEATURES.map((f) => ({ ...f, kind: 'features', desc: 'Available at this Chef Level.' })),
    ...CUISINES[state.cuisine].dishes.map((d) => ({ id: d.id, name: d.name, level: recipeLevel(state, d), price: 0, kind: 'recipes', desc: recipeRequirements(state, d).join(' · ') || 'Ready for your menu.' })),
  ];
  return rows.map((r) => {
    const owned = r.kind === 'recipes' ? state.level >= r.level : r.kind === 'stations' ? state.objects.some((o) => o.type === r.id) : isOwned(state, r.kind, r.id);
    let reason = owned ? 'Owned' : state.level < r.level ? `Chef Level ${r.level}` : state.cash < r.price ? 'Not enough cash' : '';
    if (r.kind === 'areas' && !owned) {
      const chapter = chapterInfo(state);
      reason = chapter?.area === r.id ? chapter.reason : 'Complete the earlier chapter.';
    }
    return { ...r, owned, can: !reason, reason };
  });
}
export function upgradeRequirements(state, u) {
  if (!isStory(state)) return [];
  const levels = { knife: 2, counter: 2, well: 3, board: 3, pot: 4, lamp: 4, grill: 7, burner: 5, fryer: 7, oven: 8, fridge_temp: 5, dishwasher: 10, table2: 2, table4: 3, menu_board: 3, decor1: 3, decor2: 6, decor3: 12 };
  const needs = [];
  if (state.level < levels[u.id]) needs.push(`Chef Level ${levels[u.id]}`);
  if (u.station && !state.objects.some((o) => o.type === u.station) && ['fryer', 'oven', 'pan'].includes(u.station)) needs.push(`Buy the first ${STATION_NAMES[u.station].toLowerCase()} in Unlocks`);
  // Tables need no floor expansion: free floor space is the only limit (buyUpgrade checks it).
  return needs;
}
export function storyRent(state) { return 40 + (isOwned(state, 'areas', 'main_room') ? 40 : 0) + (isOwned(state, 'areas', 'kitchen_bay') ? 20 : 0) + (isOwned(state, 'areas', 'dining_wing') ? 20 : 0); }
