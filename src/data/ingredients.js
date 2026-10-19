// The full pantry. Each ingredient has a raw look and a list of steps:
// { from, at, to, t, label, shape, color }. "at" is the station that performs
// the step: board (hold Space), grill, pan, pot, fryer or oven (automatic).
// kind is used by the dish builder: protein, veg, dairy, starch, sauce, sweet.
import { CFG } from '../config.js';
import { HEAT_TYPES } from './layout.js';

const L = (label, shape, color) => ({ label, shape, color });
const step = (from, at, to, t, label, shape, color) => ({ from, at, to, t: HEAT_TYPES.has(at) ? Math.round(t * CFG.cookTimeMultiplier * 10) / 10 : t, label, shape, color });

export const ING = {
  beef_patty: { name: 'Beef patty', store: 'fridge', cost: 1.9, keep: 3, case: 20, kind: 'protein', look: L('Beef patty', 'patty', 0xc4574e),
    steps: [step('raw', 'grill', 'grilled', 30, 'Grilled patty', 'patty', 0x6e3b25)] },
  ribeye: { name: 'Ribeye steak', store: 'fridge', cost: 9.5, keep: 4, case: 8, kind: 'protein', look: L('Ribeye steak', 'steak', 0xb84a48),
    steps: [step('raw', 'pan', 'seared', 38, 'Seared ribeye', 'steak', 0x5e3322)] },
  chicken: { name: 'Chicken breast', store: 'fridge', cost: 1.8, keep: 3, case: 10, kind: 'protein', look: L('Chicken breast', 'breast', 0xf0c4a8),
    steps: [
      step('raw', 'grill', 'grilled', 28, 'Grilled chicken', 'breast', 0xd59a52),
      step('grilled', 'board', 'sliced', 2.2, 'Sliced chicken', 'pile', 0xd9a05a),
      step('raw', 'fryer', 'fried', 38, 'Chicken cutlet', 'cutlet', 0xd8962e),
    ] },
  chicken_thigh: { name: 'Chicken thighs', store: 'fridge', cost: 2.2, keep: 3, case: 10, kind: 'protein', look: L('Chicken thighs', 'drums', 0xeab4a2),
    steps: [step('raw', 'fryer', 'fried', 45, 'Fried chicken', 'drums', 0xbf7a2c)] },
  shrimp: { name: 'Shrimp', store: 'freezer', cost: 3.6, keep: 30, case: 10, kind: 'protein', look: L('Shrimp', 'shrimp', 0xf2a99a),
    steps: [
      step('raw', 'pan', 'sauteed', 18, 'Sautéed shrimp', 'shrimp', 0xf07848),
      step('raw', 'fryer', 'fried', 24, 'Shrimp tempura', 'tempura', 0xe8c070),
    ] },
  salmon: { name: 'Salmon fillet', store: 'fridge', cost: 5.4, keep: 2, case: 10, kind: 'protein', look: L('Salmon fillet', 'fillet', 0xf08a6a),
    steps: [step('raw', 'grill', 'grilled', 32, 'Grilled salmon', 'fillet', 0xc96a40)] },
  bacon: { name: 'Bacon', store: 'fridge', cost: 0.7, keep: 7, case: 20, kind: 'protein', look: L('Bacon', 'strips', 0xe89a90),
    steps: [step('raw', 'grill', 'crispy', 18, 'Crispy bacon', 'strips', 0xa84a30)] },
  sausage: { name: 'Andouille sausage', store: 'fridge', cost: 1.2, keep: 7, case: 10, kind: 'protein', look: L('Andouille sausage', 'sausage', 0xa8503c),
    steps: [
      step('raw', 'board', 'sliced', 2, 'Sliced sausage', 'coins', 0xb05a42),
      step('sliced', 'pan', 'seared', 18, 'Seared sausage', 'coins', 0x7a3424),
    ] },
  egg: { name: 'Egg', store: 'fridge', cost: 0.35, keep: 14, case: 30, kind: 'protein', veg: true, look: L('Egg', 'egg', 0xf4ead8),
    steps: [
      step('raw', 'pan', 'fried', 14, 'Fried egg', 'friedEgg', 0xfaf6ee),
      step('raw', 'pot', 'boiled', 28, 'Soft-boiled egg', 'halfEgg', 0xf6efe0),
    ] },
  tofu: { name: 'Tofu', store: 'fridge', cost: 0.8, keep: 7, case: 10, kind: 'protein', veg: true, look: L('Tofu', 'block', 0xf0ead0),
    steps: [
      step('raw', 'board', 'diced', 2, 'Diced tofu', 'cubes', 0xf0ead0),
      step('diced', 'pan', 'seared', 18, 'Seared tofu', 'cubes', 0xd8a860),
    ] },
  pork: { name: 'Pork shoulder', store: 'fridge', cost: 2.1, keep: 4, case: 10, kind: 'protein', look: L('Pork shoulder', 'roast', 0xe8a090),
    steps: [
      step('raw', 'oven', 'roasted', 52, 'Roast pork', 'roast', 0x9a5a34),
      step('roasted', 'board', 'sliced', 2, 'Sliced pork', 'slabs', 0xb8784c),
    ] },
  flank: { name: 'Flank steak', store: 'fridge', cost: 3.2, keep: 4, case: 10, kind: 'protein', look: L('Flank steak', 'steak', 0xb0463e),
    steps: [
      step('raw', 'grill', 'grilled', 28, 'Grilled steak', 'steak', 0x5a3020),
      step('grilled', 'board', 'sliced', 2, 'Sliced steak', 'slabs', 0x7a4630),
    ] },
  meatballs: { name: 'Meatballs', store: 'fridge', cost: 1.7, keep: 3, case: 20, kind: 'protein', look: L('Meatballs', 'balls', 0xb86a58),
    steps: [step('raw', 'oven', 'baked', 40, 'Baked meatballs', 'balls', 0x7a4028)] },
  fish: { name: 'White fish', store: 'fridge', cost: 2.4, keep: 2, case: 10, kind: 'protein', look: L('White fish', 'fillet', 0xf0e6dc),
    steps: [step('raw', 'fryer', 'fried', 30, 'Fried fish', 'cutlet', 0xd8a050)] },
  tenders: { name: 'Chicken tenders', store: 'freezer', cost: 1.6, keep: 60, case: 20, kind: 'protein', look: L('Chicken tenders', 'carton', 0x5a8ac8),
    steps: [step('raw', 'fryer', 'fried', 32, 'Crispy tenders', 'tenders', 0xd09040)] },
  pepperoni: { name: 'Pepperoni', store: 'fridge', cost: 0.6, keep: 14, case: 20, kind: 'protein', look: L('Pepperoni', 'sausage', 0xb03a30),
    steps: [step('raw', 'board', 'sliced', 1.5, 'Sliced pepperoni', 'coins', 0xb83a2c)] },
  gyoza: { name: 'Gyoza', store: 'freezer', cost: 1.1, keep: 60, case: 20, kind: 'protein', look: L('Frozen gyoza', 'carton', 0x8ab0d0),
    steps: [step('raw', 'pan', 'fried', 26, 'Pan-fried gyoza', 'dumplings', 0xe0b878)] },
  edamame: { name: 'Edamame', store: 'freezer', cost: 0.45, keep: 60, case: 20, kind: 'veg', veg: true, look: L('Frozen edamame', 'carton', 0x6aa050),
    steps: [step('raw', 'pot', 'boiled', 20, 'Steamed edamame', 'pods', 0x7ab848)] },

  cheddar: { name: 'Cheddar', store: 'fridge', cost: 0.4, keep: 14, case: 20, kind: 'dairy', veg: true, look: L('Cheddar', 'cheese', 0xf0a830), steps: [] },
  parmesan: { name: 'Parmesan', store: 'fridge', cost: 0.55, keep: 30, case: 20, kind: 'dairy', veg: true, look: L('Parmesan', 'cheese', 0xf2e2a0),
    steps: [step('raw', 'board', 'grated', 1.5, 'Grated parmesan', 'pile', 0xf6eab8)] },
  mozzarella: { name: 'Mozzarella', store: 'fridge', cost: 0.7, keep: 7, case: 20, kind: 'dairy', veg: true, look: L('Mozzarella', 'ball', 0xfaf6ea), steps: [] },
  butter: { name: 'Butter', store: 'fridge', cost: 0.15, keep: 30, case: 40, kind: 'dairy', veg: true, look: L('Butter', 'butter', 0xf6e08a), steps: [] },
  cream: { name: 'Cream', store: 'fridge', cost: 0.45, keep: 7, case: 20, kind: 'dairy', veg: true, look: L('Cream', 'jar', 0xfaf8f0), steps: [] },
  queso: { name: 'Queso fresco', store: 'fridge', cost: 0.5, keep: 10, case: 20, kind: 'dairy', veg: true, look: L('Queso fresco', 'cheese', 0xf8f4ea),
    steps: [step('raw', 'board', 'crumbled', 1.5, 'Crumbled queso', 'pile', 0xfaf6ee)] },
  sour_cream: { name: 'Sour cream', store: 'fridge', cost: 0.3, keep: 10, case: 20, kind: 'sauce', veg: true, look: L('Sour cream', 'jar', 0xf8f6f0), steps: [] },

  onion: { name: 'Onion', store: 'pantry', cost: 0.2, keep: 14, case: 20, kind: 'veg', veg: true, look: L('Onion', 'onion', 0xe8d0a0),
    steps: [
      step('raw', 'board', 'chopped', 2.5, 'Chopped onion', 'pile', 0xf0e6c8),
      step('chopped', 'pan', 'caramelized', 22, 'Caramelized onion', 'pile', 0xa8682c),
    ] },
  garlic: { name: 'Garlic', store: 'pantry', cost: 0.1, keep: 21, case: 30, kind: 'veg', veg: true, look: L('Garlic', 'garlic', 0xf4ecdc),
    steps: [step('raw', 'board', 'minced', 2, 'Minced garlic', 'pile', 0xf8f0d8)] },
  tomato: { name: 'Tomato', store: 'pantry', cost: 0.4, keep: 5, case: 10, kind: 'veg', veg: true, look: L('Tomato', 'tomato', 0xd8382a),
    steps: [step('raw', 'board', 'sliced', 2, 'Sliced tomato', 'slices', 0xe0483a)] },
  lettuce: { name: 'Lettuce', store: 'fridge', cost: 0.45, keep: 4, case: 10, kind: 'veg', veg: true, look: L('Lettuce', 'lettuce', 0x6ab848),
    steps: [step('raw', 'board', 'chopped', 2, 'Chopped lettuce', 'leaves', 0x7cc858)] },
  potato: { name: 'Potato', store: 'pantry', cost: 0.4, keep: 21, case: 20, kind: 'starch', veg: true, look: L('Potato', 'potato', 0xc8a060),
    steps: [
      step('raw', 'pot', 'mashed', 36, 'Mashed potatoes', 'mash', 0xf4e6b0),
      step('raw', 'board', 'cut', 2, 'Cut potatoes', 'cubes', 0xe8d090),
      step('cut', 'oven', 'roasted', 42, 'Roast potatoes', 'cubes', 0xc8883a),
      step('cut', 'pan', 'homefries', 24, 'Home fries', 'cubes', 0xd09a48),
    ] },
  pepper: { name: 'Bell pepper', store: 'fridge', cost: 0.5, keep: 6, case: 10, kind: 'veg', veg: true, look: L('Bell pepper', 'pepper', 0xd84a30),
    steps: [
      step('raw', 'board', 'sliced', 2, 'Sliced pepper', 'strips', 0xe05a3a),
      step('sliced', 'pan', 'sauteed', 18, 'Sautéed peppers', 'strips', 0xa8402a),
    ] },
  mushrooms: { name: 'Mushrooms', store: 'fridge', cost: 0.7, keep: 4, case: 10, kind: 'veg', veg: true, look: L('Mushrooms', 'mushroom', 0xd8c8b0),
    steps: [
      step('raw', 'board', 'sliced', 2, 'Sliced mushrooms', 'pile', 0xd8c8b0),
      step('sliced', 'pan', 'sauteed', 18, 'Sautéed mushrooms', 'pile', 0x8a6a48),
    ] },
  lemon: { name: 'Lemon', store: 'fridge', cost: 0.25, keep: 14, case: 20, kind: 'veg', veg: true, look: L('Lemon', 'citrus', 0xf4dc40),
    steps: [step('raw', 'board', 'wedge', 1.5, 'Lemon wedge', 'wedge', 0xf4dc40)] },
  lime: { name: 'Lime', store: 'fridge', cost: 0.2, keep: 14, case: 20, kind: 'veg', veg: true, look: L('Lime', 'citrus', 0x7ac040),
    steps: [step('raw', 'board', 'wedge', 1.5, 'Lime wedge', 'wedge', 0x7ac040)] },
  avocado: { name: 'Avocado', store: 'pantry', cost: 1.1, keep: 3, case: 10, kind: 'veg', veg: true, look: L('Avocado', 'avocado', 0x4a6a2a),
    steps: [step('raw', 'board', 'sliced', 2, 'Sliced avocado', 'slices', 0xa8c868)] },
  herbs: { name: 'Fresh herbs', store: 'fridge', cost: 0.25, keep: 4, case: 20, kind: 'veg', veg: true, look: L('Fresh herbs', 'herbs', 0x3a8a3a),
    steps: [step('raw', 'board', 'chopped', 1.5, 'Chopped herbs', 'leaves', 0x4aa04a)] },
  banana: { name: 'Banana', store: 'pantry', cost: 0.2, keep: 4, case: 10, kind: 'sweet', veg: true, look: L('Banana', 'banana', 0xf4d850),
    steps: [
      step('raw', 'board', 'sliced', 1.5, 'Sliced banana', 'slices', 0xf8ecb0),
      step('sliced', 'fryer', 'fried', 18, 'Banana tempura', 'tempura', 0xe0b050),
    ] },
  scallion: { name: 'Scallions', store: 'fridge', cost: 0.15, keep: 5, case: 20, kind: 'veg', veg: true, look: L('Scallions', 'scallion', 0x5ab048),
    steps: [step('raw', 'board', 'sliced', 1.5, 'Sliced scallions', 'leaves', 0x6ac058)] },
  cabbage: { name: 'Cabbage', store: 'fridge', cost: 0.3, keep: 10, case: 10, kind: 'veg', veg: true, look: L('Cabbage', 'lettuce', 0xb8d890),
    steps: [
      step('raw', 'board', 'shredded', 2.5, 'Shredded cabbage', 'leaves', 0xd0e8b0),
      step('shredded', 'pan', 'stirfried', 18, 'Stir-fried cabbage', 'leaves', 0x98b060),
    ] },
  corn: { name: 'Corn on the cob', store: 'fridge', cost: 0.45, keep: 5, case: 10, kind: 'veg', veg: true, look: L('Corn on the cob', 'corn', 0xf0d040),
    steps: [step('raw', 'grill', 'charred', 24, 'Charred corn', 'corn', 0xd09a30)] },
  bokchoy: { name: 'Bok choy', store: 'fridge', cost: 0.45, keep: 4, case: 10, kind: 'veg', veg: true, look: L('Bok choy', 'herbs', 0x6ab850),
    steps: [step('raw', 'pan', 'sauteed', 16, 'Sautéed bok choy', 'leaves', 0x4a8a38)] },
  cucumber: { name: 'Cucumber', store: 'fridge', cost: 0.3, keep: 7, case: 10, kind: 'veg', veg: true, look: L('Cucumber', 'cucumber', 0x4a8a3a),
    steps: [step('raw', 'board', 'sliced', 2, 'Sliced cucumber', 'slices', 0xc8e0a0)] },

  bun: { name: 'Burger bun', store: 'pantry', cost: 0.45, keep: 4, case: 20, kind: 'starch', veg: true, look: L('Burger bun', 'bun', 0xe0a050),
    steps: [step('raw', 'grill', 'toasted', 10, 'Toasted bun', 'bun', 0xc07a30)] },
  bread: { name: 'Bread', store: 'pantry', cost: 0.25, keep: 4, case: 20, kind: 'starch', veg: true, look: L('Bread', 'bread', 0xf0d8a0),
    steps: [step('raw', 'grill', 'toasted', 10, 'Toast', 'bread', 0xd09a48)] },
  spaghetti: { name: 'Spaghetti', store: 'pantry', cost: 0.35, keep: 180, case: 40, kind: 'starch', veg: true, look: L('Spaghetti', 'pasta', 0xf0d890),
    steps: [step('raw', 'pot', 'cooked', 36, 'Cooked spaghetti', 'nest', 0xf4e0a0)] },
  rice: { name: 'Rice', store: 'pantry', cost: 0.15, keep: 180, case: 40, kind: 'starch', veg: true, look: L('Rice', 'sack', 0xf4f0e8),
    steps: [step('raw', 'pot', 'cooked', 38, 'Steamed rice', 'dome', 0xfaf8f0)] },
  grits: { name: 'Stone-ground grits', store: 'pantry', cost: 0.25, keep: 120, case: 30, kind: 'starch', veg: true, look: L('Stone-ground grits', 'sack', 0xe8d8a0),
    steps: [step('raw', 'pot', 'cooked', 38, 'Creamy grits', 'mash', 0xf4e8b0)] },
  tortillas: { name: 'Tortillas', store: 'pantry', cost: 0.45, keep: 10, case: 20, kind: 'starch', veg: true, look: L('Tortillas', 'tortilla', 0xf0e0b0),
    steps: [step('raw', 'grill', 'warm', 8, 'Warm tortillas', 'tortilla', 0xe8c888)] },
  dough: { name: 'Pizza dough', store: 'fridge', cost: 0.6, keep: 3, case: 20, kind: 'starch', veg: true, container: true, look: L('Pizza dough', 'dough', 0xf4e8c8),
    steps: [step('raw', 'oven', 'baked', 46, 'Baked pizza', 'pizza', 0xe0a850)] },
  tomatoes: { name: 'Crushed tomatoes', store: 'pantry', cost: 0.35, keep: 365, case: 30, kind: 'sauce', veg: true, look: L('Tomato sauce', 'can', 0xc83a2a),
    steps: [step('raw', 'pot', 'simmered', 28, 'Marinara', 'liquid', 0xb8301e)] },
  tomato_soup: { name: 'Tomato soup base', store: 'fridge', cost: 0.9, keep: 7, case: 20, kind: 'sauce', veg: true, look: L('Tomato soup base', 'carton', 0xd8482e),
    steps: [step('raw', 'pot', 'hot', 32, 'Tomato soup', 'liquid', 0xd0502e)] },
  broth: { name: 'Ramen broth', store: 'fridge', cost: 0.8, keep: 7, case: 20, kind: 'sauce', veg: true, look: L('Ramen broth', 'carton', 0xc8a060),
    steps: [step('raw', 'pot', 'hot', 32, 'Hot broth', 'liquid', 0xc89a5a)] },
  ramen: { name: 'Ramen noodles', store: 'pantry', cost: 0.4, keep: 30, case: 30, kind: 'starch', veg: true, look: L('Ramen noodles', 'noodleBlock', 0xf0e0a0),
    steps: [
      step('raw', 'pot', 'cooked', 24, 'Cooked noodles', 'nest', 0xf4e4a8),
      step('cooked', 'pan', 'stirfried', 18, 'Stir-fried noodles', 'nest', 0xc89040),
    ] },
  curry: { name: 'Curry roux', store: 'pantry', cost: 0.4, keep: 90, case: 30, kind: 'sauce', veg: true, look: L('Curry roux', 'carton', 0xa86a20),
    steps: [step('raw', 'pot', 'hot', 28, 'Curry sauce', 'liquid', 0x9a6a1a)] },
  teriyaki: { name: 'Teriyaki sauce', store: 'pantry', cost: 0.15, keep: 90, case: 40, kind: 'sauce', veg: true, look: L('Teriyaki sauce', 'bottle', 0x4a2a1a), steps: [] },
  sesame: { name: 'Sesame dressing', store: 'pantry', cost: 0.15, keep: 60, case: 40, kind: 'sauce', veg: true, look: L('Sesame dressing', 'bottle', 0xd8b070), steps: [] },
  beans: { name: 'Black beans', store: 'pantry', cost: 0.25, keep: 365, case: 30, kind: 'starch', veg: true, look: L('Black beans', 'can', 0x3a3530),
    steps: [step('raw', 'pot', 'hot', 26, 'Hot black beans', 'liquid', 0x3a2a26)] },
  chips: { name: 'Tortilla chips', store: 'pantry', cost: 0.2, keep: 30, case: 40, kind: 'starch', veg: true, look: L('Tortilla chips', 'chips', 0xf0c040), steps: [] },
  salsa: { name: 'Salsa', store: 'fridge', cost: 0.3, keep: 7, case: 20, kind: 'sauce', veg: true, look: L('Salsa', 'jar', 0xc8402a), steps: [] },
  fries: { name: 'Frozen fries', store: 'freezer', cost: 0.45, keep: 60, case: 40, kind: 'starch', veg: true, look: L('Frozen fries', 'carton', 0xd84a3a),
    steps: [step('raw', 'fryer', 'fried', 30, 'Fries', 'sticks', 0xf0c048)] },
  rings: { name: 'Onion rings', store: 'freezer', cost: 0.55, keep: 60, case: 30, kind: 'starch', veg: true, look: L('Frozen onion rings', 'carton', 0xe0a040),
    steps: [step('raw', 'fryer', 'fried', 26, 'Onion rings', 'rings', 0xd8a040)] },
  biscuits: { name: 'Biscuit dough', store: 'freezer', cost: 0.35, keep: 60, case: 30, kind: 'starch', veg: true, look: L('Biscuit dough', 'carton', 0xe8d8b0),
    steps: [step('raw', 'oven', 'baked', 30, 'Baked biscuits', 'biscuits', 0xe0a850)] },
  pancake: { name: 'Pancake batter', store: 'fridge', cost: 0.3, keep: 5, case: 20, kind: 'starch', veg: true, look: L('Pancake batter', 'jar', 0xf4e8c0),
    steps: [step('raw', 'pan', 'cooked', 22, 'Pancakes', 'pancakes', 0xd8a048)] },
  syrup: { name: 'Maple syrup', store: 'pantry', cost: 0.2, keep: 90, case: 40, kind: 'sweet', veg: true, look: L('Maple syrup', 'bottle', 0xa85a1a), steps: [] },
  wafers: { name: 'Vanilla wafers', store: 'pantry', cost: 0.3, keep: 60, case: 30, kind: 'sweet', veg: true, look: L('Vanilla wafers', 'carton', 0xf4e0a0), steps: [] },
  ice_cream: { name: 'Vanilla ice cream', store: 'freezer', cost: 0.7, keep: 60, case: 30, kind: 'sweet', veg: true, look: L('Scoop of ice cream', 'scoop', 0xfaf2dc), steps: [] },
  pie: { name: 'Apple pie slice', store: 'fridge', cost: 1.4, keep: 3, case: 8, kind: 'sweet', veg: true, look: L('Apple pie slice', 'pie', 0xe0b060),
    steps: [step('raw', 'oven', 'warm', 16, 'Warm apple pie', 'pie', 0xd09040)] },
  tiramisu: { name: 'Tiramisù', store: 'fridge', cost: 1.3, keep: 3, case: 12, kind: 'sweet', veg: true, look: L('Tiramisù', 'cake', 0xc8a888), steps: [] },
  churros: { name: 'Churro dough', store: 'freezer', cost: 0.5, keep: 60, case: 30, kind: 'sweet', veg: true, look: L('Frozen churros', 'carton', 0xd8a868),
    steps: [step('raw', 'fryer', 'fried', 22, 'Churros', 'sticks', 0xc88838)] },
  tres_leches: { name: 'Tres leches cake', store: 'fridge', cost: 1.1, keep: 3, case: 12, kind: 'sweet', veg: true, look: L('Tres leches cake', 'cake', 0xf8f0d8), steps: [] },
  mochi: { name: 'Mochi ice cream', store: 'freezer', cost: 0.9, keep: 60, case: 20, kind: 'sweet', veg: true, look: L('Mochi ice cream', 'mochi', 0xf0b8c8), steps: [] },
  choc: { name: 'Chocolate sauce', store: 'pantry', cost: 0.15, keep: 90, case: 40, kind: 'sweet', veg: true, look: L('Chocolate sauce', 'bottle', 0x4a2a1a), steps: [] },
};

for (const [id, d] of Object.entries(ING)) d.id = id;

export const STORES = {
  fridge: { name: 'Walk-in fridge' },
  freezer: { name: 'Freezer' },
  pantry: { name: 'Pantry' },
};

/** Look and label for an ingredient in a given state. */
export function stateInfo(ingId, st) {
  const d = ING[ingId];
  if (!d) return { label: ingId, shape: 'box', color: 0x999999 };
  if (st === 'burnt') return { label: `Burnt ${d.name.toLowerCase()}`, shape: d.look.shape, color: 0x2a221e };
  if (st === 'raw') return d.look;
  const s = d.steps.find((x) => x.to === st);
  return s ? { label: s.label, shape: s.shape, color: s.color } : d.look;
}

/** The step this station can do to an ingredient in its current state, if any. */
export function stepFor(ingId, st, station) {
  const d = ING[ingId];
  if (!d) return null;
  return d.steps.find((s) => s.from === st && s.at === station) || null;
}

/** Seconds of station time to take an ingredient from raw to a target state. */
export function chainTime(ingId, target) {
  const d = ING[ingId];
  if (!d || target === 'raw') return 0;
  let t = 0, cur = target, guard = 0;
  while (cur !== 'raw' && guard++ < 6) {
    const s = d.steps.find((x) => x.to === cur);
    if (!s) break;
    t += s.t;
    cur = s.from;
  }
  return t;
}

/** Every state an ingredient can reach (including raw). */
export function statesOf(ingId) {
  const d = ING[ingId];
  return ['raw', ...d.steps.map((s) => s.to)];
}
