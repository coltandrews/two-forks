// The five restaurants you can open. A save's cuisine is fixed once chosen.
// Dish components are [ingredientId, state]. Pizza toppings ride on the
// dough and bake with it, so a pizza lists the baked dough plus its toppings.

const D = (id, name, course, tpl, comps, fair, appeal, level) => ({ id, name, course, tpl, comps, fair, appeal, level });
const drink = (id, name, cost, price, glass, color) => ({ id, name, cost, price, glass, color });

export const CUISINES = {
  southern: {
    id: 'southern',
    name: 'Magnolia Kitchen',
    style: 'Southern bistro',
    blurb: 'Fried chicken, shrimp and grits, burgers and banana pudding in a sunny corner bistro.',
    palette: {
      wall: 0xdfe6cf, trim: 0x8aa37c, floorA: 0xc9935a, floorB: 0xb98450, kitchenA: 0xe8eadf, kitchenB: 0xb9c9b0,
      counter: 0x7f9a74, top: 0xe8e2d2, accent: 0xc8643c, accent2: 0xf0c060, table: 0x9a6a3e, cloth: null, chair: 0x6e4a2c,
      lamp: 0xffd9a0, ui: '#c8643c', uiDark: '#2f3a2c',
    },
    decor: 'southern',
    drinks: [
      drink('sweet_tea', 'Sweet tea', 0.1, 3, 'tall', 0x9a5a20),
      drink('lemonade', 'Lemonade', 0.35, 4, 'tall', 0xf4e070),
      drink('coffee', 'Coffee', 0.25, 3, 'mug', 0x3a2418),
      drink('soda', 'Soda', 0.3, 3, 'tall', 0x5a2a18),
      drink('beer', 'Craft beer', 1.3, 6, 'bottle', 0xd89a30),
      drink('wine', 'House wine', 2.4, 10, 'wine', 0x8a1e2e),
    ],
    dishes: [
      D('house_salad', 'House salad', 'starter', 'salad', [['lettuce', 'chopped'], ['tomato', 'sliced'], ['lemon', 'wedge']], 8, 5, 1),
      D('fries', 'Fries', 'side', 'side', [['fries', 'fried']], 4, 6, 1),
      D('tomato_soup', 'Tomato soup', 'starter', 'soup', [['tomato_soup', 'hot'], ['cream', 'raw'], ['herbs', 'chopped']], 7, 5, 1),
      D('biscuits', 'Biscuits & honey butter', 'starter', 'side', [['biscuits', 'baked'], ['butter', 'raw']], 6, 7, 2),
      D('classic_burger', 'Classic burger', 'main', 'burger', [['bun', 'toasted'], ['beef_patty', 'grilled'], ['cheddar', 'raw'], ['lettuce', 'chopped'], ['tomato', 'sliced']], 14, 8, 1),
      D('fried_chicken', 'Fried chicken & mash', 'main', 'plate', [['chicken_thigh', 'fried'], ['potato', 'mashed'], ['butter', 'raw']], 17, 8, 1),
      D('grain_bowl', 'Garden grits bowl', 'main', 'bowl', [['grits', 'cooked'], ['mushrooms', 'sauteed'], ['pepper', 'sauteed'], ['scallion', 'sliced']], 15, 6, 1),
      D('bacon_cheeseburger', 'Bacon cheeseburger', 'main', 'burger', [['bun', 'toasted'], ['beef_patty', 'grilled'], ['cheddar', 'raw'], ['bacon', 'crispy'], ['onion', 'caramelized']], 16, 8, 2),
      D('shrimp_grits', 'Shrimp & grits', 'main', 'bowl', [['grits', 'cooked'], ['shrimp', 'sauteed'], ['sausage', 'seared'], ['scallion', 'sliced']], 22, 8, 2),
      D('salmon', 'Grilled salmon', 'main', 'plate', [['salmon', 'grilled'], ['rice', 'cooked'], ['lemon', 'wedge'], ['herbs', 'chopped']], 26, 7, 3),
      D('ribeye', 'Ribeye & potatoes', 'main', 'plate', [['ribeye', 'seared'], ['potato', 'roasted'], ['mushrooms', 'sauteed'], ['butter', 'raw']], 36, 8, 4),
      D('banana_pudding', 'Banana pudding', 'dessert', 'dessert', [['banana', 'sliced'], ['wafers', 'raw'], ['cream', 'raw']], 7, 7, 1),
      D('pie', 'Apple pie à la mode', 'dessert', 'dessert', [['pie', 'warm'], ['ice_cream', 'raw']], 8, 8, 2),
    ],
  },

  italian: {
    id: 'italian',
    name: 'Trattoria Due Forchette',
    style: 'Italian trattoria',
    blurb: 'Pizza from the oven, pasta from the pot, tiramisù to finish. Checkered tablecloths included.',
    palette: {
      wall: 0xe9cfae, trim: 0xa8532e, floorA: 0xb8603e, floorB: 0xa65638, kitchenA: 0xece6da, kitchenB: 0xc9b89c,
      counter: 0x6d7a3e, top: 0xefe8da, accent: 0xa8322a, accent2: 0x6d7a3e, table: 0x7a4a2e, cloth: 0xc83a30, chair: 0x5a3820,
      lamp: 0xffcf90, ui: '#a8322a', uiDark: '#3a2a20',
    },
    decor: 'italian',
    drinks: [
      drink('espresso', 'Espresso', 0.3, 3, 'cup', 0x2a1810),
      drink('limonata', 'Limonata', 0.35, 4, 'tall', 0xf2e060),
      drink('sparkling', 'Sparkling water', 0.3, 3, 'tall', 0xd8eef0),
      drink('soda', 'Aranciata', 0.3, 3, 'tall', 0xf08a2a),
      drink('beer', 'Lager', 1.3, 6, 'bottle', 0xe0b040),
      drink('wine', 'House red', 2.4, 10, 'wine', 0x7a1428),
    ],
    dishes: [
      D('bruschetta', 'Bruschetta', 'starter', 'side', [['bread', 'toasted'], ['tomato', 'sliced'], ['garlic', 'minced'], ['herbs', 'chopped']], 9, 7, 1),
      D('caprese', 'Caprese salad', 'starter', 'salad', [['tomato', 'sliced'], ['mozzarella', 'raw'], ['herbs', 'chopped']], 10, 6, 1),
      D('garlic_bread', 'Garlic bread', 'side', 'side', [['bread', 'toasted'], ['butter', 'raw'], ['garlic', 'minced']], 6, 7, 2),
      D('pomodoro', 'Spaghetti pomodoro', 'main', 'pasta', [['spaghetti', 'cooked'], ['tomatoes', 'simmered'], ['herbs', 'chopped'], ['parmesan', 'grated']], 15, 7, 1),
      D('margherita', 'Margherita pizza', 'main', 'pizza', [['dough', 'baked'], ['tomatoes', 'raw'], ['mozzarella', 'raw'], ['herbs', 'chopped']], 14, 8, 1),
      D('meatballs', 'Spaghetti & meatballs', 'main', 'pasta', [['spaghetti', 'cooked'], ['meatballs', 'baked'], ['tomatoes', 'simmered'], ['parmesan', 'grated']], 17, 8, 1),
      D('carbonara', 'Carbonara', 'main', 'pasta', [['spaghetti', 'cooked'], ['bacon', 'crispy'], ['egg', 'raw'], ['parmesan', 'grated']], 17, 7, 2),
      D('risotto', 'Mushroom risotto', 'main', 'bowl', [['rice', 'cooked'], ['mushrooms', 'sauteed'], ['parmesan', 'grated'], ['butter', 'raw']], 18, 6, 2),
      D('pepperoni', 'Pepperoni pizza', 'main', 'pizza', [['dough', 'baked'], ['tomatoes', 'raw'], ['mozzarella', 'raw'], ['pepperoni', 'sliced']], 16, 8, 2),
      D('chicken_parm', 'Chicken parmigiana', 'main', 'plate', [['chicken', 'fried'], ['tomatoes', 'simmered'], ['mozzarella', 'raw'], ['spaghetti', 'cooked']], 21, 8, 3),
      D('tiramisu', 'Tiramisù', 'dessert', 'dessert', [['tiramisu', 'raw']], 8, 8, 1),
      D('gelato', 'Gelato al cioccolato', 'dessert', 'dessert', [['ice_cream', 'raw'], ['choc', 'raw']], 6, 6, 2),
    ],
  },

  mexican: {
    id: 'mexican',
    name: 'Dos Tenedores Taquería',
    style: 'Taquería',
    blurb: 'Tacos four ways, elote off the grill and churros with chocolate under papel picado.',
    palette: {
      wall: 0xf4e3c4, trim: 0x2a9a8e, floorA: 0xc87048, floorB: 0xb8623e, kitchenA: 0xf0e8dc, kitchenB: 0x7ac0b8,
      counter: 0x2a8a80, top: 0xf2ece0, accent: 0xe0407a, accent2: 0xf2c030, table: 0x8a5a34, cloth: null, chair: 0x2a8a80,
      lamp: 0xffd890, ui: '#d8346e', uiDark: '#183a38',
    },
    decor: 'mexican',
    drinks: [
      drink('horchata', 'Horchata', 0.3, 4, 'tall', 0xf2ead8),
      drink('agua', 'Agua fresca', 0.25, 4, 'tall', 0xe8506a),
      drink('cola', 'Mexican cola', 0.4, 3, 'bottle', 0x3a1a10),
      drink('jarrito', 'Fruit soda', 0.35, 3, 'bottle', 0xf0a020),
      drink('beer', 'Lager', 1.3, 6, 'bottle', 0xe8c050),
      drink('margarita', 'Margarita', 1.8, 10, 'cocktail', 0xd8e890),
    ],
    dishes: [
      D('chips_salsa', 'Chips & salsa', 'starter', 'side', [['chips', 'raw'], ['salsa', 'raw']], 5, 7, 1),
      D('elote', 'Elote', 'side', 'side', [['corn', 'charred'], ['queso', 'crumbled'], ['lime', 'wedge']], 6, 7, 1),
      D('rice_beans', 'Rice & beans', 'side', 'bowl', [['rice', 'cooked'], ['beans', 'hot']], 5, 5, 1),
      D('guac', 'Guacamole & chips', 'starter', 'side', [['avocado', 'sliced'], ['onion', 'chopped'], ['lime', 'wedge'], ['chips', 'raw']], 9, 8, 2),
      D('chicken_tacos', 'Chicken tacos', 'main', 'tacos', [['tortillas', 'warm'], ['chicken', 'sliced'], ['onion', 'chopped'], ['herbs', 'chopped'], ['lime', 'wedge']], 14, 8, 1),
      D('veggie_tacos', 'Veggie tacos', 'main', 'tacos', [['tortillas', 'warm'], ['pepper', 'sauteed'], ['beans', 'hot'], ['avocado', 'sliced']], 13, 6, 1),
      D('quesadilla', 'Chicken quesadilla', 'main', 'tacos', [['tortillas', 'warm'], ['cheddar', 'raw'], ['chicken', 'sliced'], ['sour_cream', 'raw']], 13, 7, 1),
      D('asada', 'Carne asada tacos', 'main', 'tacos', [['tortillas', 'warm'], ['flank', 'sliced'], ['onion', 'chopped'], ['herbs', 'chopped'], ['salsa', 'raw']], 16, 8, 2),
      D('carnitas', 'Carnitas tacos', 'main', 'tacos', [['tortillas', 'warm'], ['pork', 'sliced'], ['onion', 'chopped'], ['herbs', 'chopped'], ['lime', 'wedge']], 15, 8, 2),
      D('burrito_bowl', 'Burrito bowl', 'main', 'bowl', [['rice', 'cooked'], ['beans', 'hot'], ['chicken', 'sliced'], ['salsa', 'raw'], ['cheddar', 'raw']], 15, 7, 2),
      D('fish_tacos', 'Baja fish tacos', 'main', 'tacos', [['tortillas', 'warm'], ['fish', 'fried'], ['cabbage', 'shredded'], ['sour_cream', 'raw'], ['lime', 'wedge']], 17, 8, 3),
      D('churros', 'Churros', 'dessert', 'dessert', [['churros', 'fried'], ['choc', 'raw']], 6, 8, 1),
      D('tres_leches', 'Tres leches cake', 'dessert', 'dessert', [['tres_leches', 'raw']], 7, 7, 2),
    ],
  },

  diner: {
    id: 'diner',
    name: 'Two Forks Diner',
    style: 'Classic diner',
    blurb: 'Burgers, pancakes all day, patty melts and pie under neon and chrome.',
    palette: {
      wall: 0xf2ece0, trim: 0xc8282e, floorA: 0xf2ede4, floorB: 0x24262a, kitchenA: 0xe8eaec, kitchenB: 0xb8c0c8,
      counter: 0xc8282e, top: 0xd8dde2, accent: 0xc8282e, accent2: 0x3ab0c8, table: 0xd8dde2, cloth: null, chair: 0xc8282e,
      lamp: 0xfff0d0, ui: '#c8282e', uiDark: '#1e2228',
    },
    decor: 'diner',
    drinks: [
      drink('coffee', 'Bottomless coffee', 0.25, 3, 'mug', 0x3a2418),
      drink('shake', 'Vanilla shake', 0.9, 6, 'tall', 0xf6eedc),
      drink('soda', 'Cola', 0.3, 3, 'tall', 0x4a2010),
      drink('iced_tea', 'Iced tea', 0.1, 3, 'tall', 0xa8641e),
      drink('lemonade', 'Lemonade', 0.35, 4, 'tall', 0xf4e070),
      drink('beer', 'Beer', 1.3, 5, 'bottle', 0xe0a830),
    ],
    dishes: [
      D('fries', 'Fries', 'side', 'side', [['fries', 'fried']], 4, 7, 1),
      D('rings', 'Onion rings', 'side', 'side', [['rings', 'fried']], 6, 7, 1),
      D('side_salad', 'Side salad', 'starter', 'salad', [['lettuce', 'chopped'], ['tomato', 'sliced'], ['cucumber', 'sliced']], 5, 4, 2),
      D('classic_burger', 'Classic burger', 'main', 'burger', [['bun', 'toasted'], ['beef_patty', 'grilled'], ['cheddar', 'raw'], ['lettuce', 'chopped'], ['tomato', 'sliced']], 14, 8, 1),
      D('pancakes', 'Pancake stack', 'main', 'plate', [['pancake', 'cooked'], ['butter', 'raw'], ['syrup', 'raw']], 11, 7, 1),
      D('blt', 'BLT', 'main', 'sandwich', [['bread', 'toasted'], ['bacon', 'crispy'], ['lettuce', 'chopped'], ['tomato', 'sliced']], 12, 7, 1),
      D('grilled_cheese', 'Grilled cheese & tomato soup', 'main', 'sandwich', [['bread', 'toasted'], ['cheddar', 'raw'], ['tomato_soup', 'hot']], 12, 7, 2),
      D('patty_melt', 'Patty melt', 'main', 'sandwich', [['bread', 'toasted'], ['beef_patty', 'grilled'], ['cheddar', 'raw'], ['onion', 'caramelized']], 14, 7, 2),
      D('tenders', 'Chicken tenders & fries', 'main', 'plate', [['tenders', 'fried'], ['fries', 'fried']], 13, 8, 2),
      D('steak_eggs', 'Steak & eggs', 'main', 'plate', [['ribeye', 'seared'], ['egg', 'fried'], ['potato', 'homefries']], 28, 7, 3),
      D('pie', 'Apple pie à la mode', 'dessert', 'dessert', [['pie', 'warm'], ['ice_cream', 'raw']], 8, 8, 1),
      D('banana_split', 'Banana split', 'dessert', 'dessert', [['banana', 'sliced'], ['ice_cream', 'raw'], ['choc', 'raw']], 8, 8, 2),
    ],
  },

  noodle: {
    id: 'noodle',
    name: 'Two Chopsticks Noodle Bar',
    style: 'Noodle bar',
    blurb: 'Ramen bowls, crispy gyoza and katsu curry under red paper lanterns.',
    palette: {
      wall: 0xe8dcc6, trim: 0x3a2a22, floorA: 0x7a5a3e, floorB: 0x6a4c34, kitchenA: 0xe6e2da, kitchenB: 0xa8a29a,
      counter: 0x3a2a22, top: 0xd8c8a8, accent: 0xc8302a, accent2: 0x2a4a5a, table: 0x5a4030, cloth: null, chair: 0x2a1e18,
      lamp: 0xffb070, ui: '#c8302a', uiDark: '#241a16',
    },
    decor: 'noodle',
    drinks: [
      drink('green_tea', 'Green tea', 0.15, 3, 'cup', 0x9ab858),
      drink('ramune', 'Ramune soda', 0.6, 4, 'bottle', 0xa8d8f0),
      drink('oolong', 'Iced oolong', 0.15, 3, 'tall', 0xb07830),
      drink('yuzu', 'Yuzu lemonade', 0.4, 4, 'tall', 0xf0e050),
      drink('beer', 'Japanese lager', 1.4, 6, 'bottle', 0xe8c050),
      drink('sake', 'Sake', 2.2, 9, 'cup', 0xf4f0e0),
    ],
    dishes: [
      D('gyoza', 'Gyoza', 'starter', 'side', [['gyoza', 'fried']], 8, 8, 1),
      D('edamame', 'Edamame', 'starter', 'side', [['edamame', 'boiled']], 5, 6, 1),
      D('cucumber_salad', 'Cucumber salad', 'starter', 'salad', [['cucumber', 'sliced'], ['sesame', 'raw'], ['scallion', 'sliced']], 6, 5, 2),
      D('shoyu_ramen', 'Shoyu ramen', 'main', 'ramen', [['broth', 'hot'], ['ramen', 'cooked'], ['pork', 'sliced'], ['egg', 'boiled'], ['scallion', 'sliced']], 16, 9, 1),
      D('veggie_ramen', 'Veggie ramen', 'main', 'ramen', [['broth', 'hot'], ['ramen', 'cooked'], ['tofu', 'seared'], ['bokchoy', 'sauteed'], ['scallion', 'sliced']], 15, 6, 1),
      D('katsu_curry', 'Chicken katsu curry', 'main', 'bowl', [['chicken', 'fried'], ['rice', 'cooked'], ['curry', 'hot']], 16, 8, 1),
      D('teriyaki_salmon', 'Teriyaki salmon bowl', 'main', 'bowl', [['rice', 'cooked'], ['salmon', 'grilled'], ['teriyaki', 'raw'], ['scallion', 'sliced']], 19, 7, 2),
      D('gyudon', 'Gyudon beef bowl', 'main', 'bowl', [['rice', 'cooked'], ['flank', 'sliced'], ['onion', 'caramelized'], ['egg', 'boiled']], 15, 7, 2),
      D('yakisoba', 'Yakisoba', 'main', 'pasta', [['ramen', 'stirfried'], ['cabbage', 'stirfried'], ['pork', 'sliced'], ['teriyaki', 'raw']], 14, 7, 2),
      D('tempura_ramen', 'Shrimp tempura ramen', 'main', 'ramen', [['broth', 'hot'], ['ramen', 'cooked'], ['shrimp', 'fried'], ['scallion', 'sliced']], 18, 8, 3),
      D('mochi', 'Mochi ice cream', 'dessert', 'dessert', [['mochi', 'raw']], 6, 7, 1),
      D('banana_tempura', 'Banana tempura', 'dessert', 'dessert', [['banana', 'fried'], ['ice_cream', 'raw']], 7, 7, 2),
    ],
  },
};

export const CUISINE_ORDER = ['southern', 'italian', 'mexican', 'diner', 'noodle'];

/** Templates the dish builder can start from, and what each needs. */
export const BUILDER = {
  burger: { name: 'Burger', bases: [['bun', 'toasted']], max: 5 },
  sandwich: { name: 'Sandwich', bases: [['bread', 'toasted']], max: 5 },
  tacos: { name: 'Tacos', bases: [['tortillas', 'warm']], max: 5 },
  bowl: { name: 'Bowl', bases: [['rice', 'cooked'], ['grits', 'cooked'], ['ramen', 'cooked']], max: 5 },
  pasta: { name: 'Pasta', bases: [['spaghetti', 'cooked'], ['ramen', 'stirfried']], max: 5 },
  ramen: { name: 'Noodle soup', bases: [['broth', 'hot']], max: 5 },
  pizza: { name: 'Pizza', bases: [['dough', 'baked']], max: 5 },
  salad: { name: 'Salad', bases: [['lettuce', 'chopped'], ['cucumber', 'sliced'], ['cabbage', 'shredded']], max: 5 },
};

/** Pairings guests love; each adds appeal to a custom dish. */
export const PAIRS = [
  ['bacon', 'cheddar'], ['tomato', 'mozzarella'], ['shrimp', 'grits'], ['avocado', 'lime'], ['egg', 'scallion'],
  ['garlic', 'mushrooms'], ['onion', 'beef_patty'], ['herbs', 'tomato'], ['salsa', 'chips'], ['cheddar', 'beef_patty'],
  ['chicken', 'avocado'], ['pork', 'onion'], ['salmon', 'teriyaki'], ['tofu', 'bokchoy'], ['flank', 'salsa'],
  ['fish', 'cabbage'], ['meatballs', 'tomatoes'], ['parmesan', 'spaghetti'], ['pepperoni', 'mozzarella'], ['sausage', 'pepper'],
  ['broth', 'ramen'], ['curry', 'rice'], ['beans', 'rice'], ['butter', 'potato'], ['sour_cream', 'chicken'],
];
