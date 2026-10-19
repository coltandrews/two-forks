// The starting restaurant, as a tile map (1 tile = 1 m). North (z = 0) is the
// back wall; the camera looks north from the dining room side.
//
//  #  wall          B  back door      D  front door (walkable)
//  F  fridge        Z  freezer        P  pantry
//  c  counter       b  cutting board  g  grill     p  stove (pan)
//  o  pot           f  fryer          v  oven      w  prep well
//  r  plate rack    s  sink           x  bin       k  pass
//  d  drink station h  host stand     l  delivery pallet

export const MAP = [
  '####################',
  '#FZPcbbcggppoofvcsx#',
  '#..................#',
  'B....wwwwcccr......#',
  '#l.................#',
  '####kkkkkk..d#######',
  '#..................#',
  '#..................#',
  '#..................#',
  '#..................#',
  '#..................#',
  '#..................#',
  '#..................#',
  '#...h..............#',
  '##D#################',
];

export const KITCHEN_MAX_Z = 4; // rows 1..4 are kitchen floor; 6..13 dining
export const LAYOUT_MIN_Z = 1;

export const CHAR_TYPES = {
  F: 'fridge', Z: 'freezer', P: 'pantry', c: 'counter', b: 'board', g: 'grill', p: 'pan', o: 'pot',
  f: 'fryer', v: 'oven', w: 'well', r: 'rack', s: 'sink', x: 'bin', k: 'pass', d: 'drinks', h: 'host', l: 'dock',
};

// Tables include their chairs in the footprint. A 2-top is 3 wide (chair,
// table, chair); a 4-top is 2 wide and 3 deep (chairs, table, chairs).
export const DEFAULT_TABLES = [
  { seats: 4, x: 5, z: 7 },
  { seats: 4, x: 9, z: 7 },
  { seats: 4, x: 13, z: 7 },
  { seats: 2, x: 6, z: 11 },
  { seats: 2, x: 11, z: 11 },
  { seats: 2, x: 15, z: 11 },
];

// Each cuisine starts with the same useful equipment and seat count, but the
// floor plan is different. Station rows are [start x, z, map characters].
// Storage stays by deliveries. Cooking lines face a clear back aisle; prep
// benches face the service aisle. The pass separates kitchen and dining.
const STARTING_LAYOUTS = {
  southern: {
    stations: [[1, 1, 'FZPcbbcggppoofvcsx'], [5, 3, 'wwwwcccr'], [1, 4, 'l'], [4, 5, 'kkkkkk'], [12, 5, 'd'], [4, 13, 'h']],
    tables: DEFAULT_TABLES,
  },
  italian: {
    // Dough prep beside the oven; pasta equipment and a separate plating bench.
    stations: [[1, 1, 'FZPccbbvooppggfcsx'], [6, 3, 'rccwwwwc'], [1, 4, 'l'], [4, 5, 'kkkkkk'], [12, 5, 'd'], [4, 13, 'h']],
    tables: [{ seats: 4, x: 3, z: 7 }, { seats: 4, x: 8, z: 7 }, { seats: 4, x: 13, z: 7 }, { seats: 2, x: 5, z: 11 }, { seats: 2, x: 10, z: 11 }, { seats: 2, x: 15, z: 11 }],
  },
  mexican: {
    // One prep and filling bench opposite the grill and rice/bean cooking line.
    stations: [[1, 1, 'FZPcccggppoofvccsx'], [4, 3, 'bbwwwwcr'], [1, 4, 'l'], [4, 5, 'kkkkkk'], [12, 5, 'd'], [3, 13, 'h']],
    tables: [{ seats: 4, x: 3, z: 7 }, { seats: 4, x: 8, z: 8 }, { seats: 4, x: 13, z: 7 }, { seats: 2, x: 4, z: 12 }, { seats: 2, x: 11, z: 12 }, { seats: 2, x: 16, z: 11 }],
  },
  diner: {
    // Two short work benches leave a wide central route to the griddle line.
    stations: [[1, 1, 'FZPcccggppfvoo'], [17, 1, 'sx'], [3, 3, 'bcwwc'], [12, 3, 'rwwbc'], [1, 4, 'l'], [4, 5, 'kkkkkk'], [12, 5, 'd'], [3, 13, 'h']],
    tables: [{ seats: 4, x: 5, z: 7 }, { seats: 4, x: 5, z: 11 }, { seats: 4, x: 10, z: 8 }, { seats: 2, x: 14, z: 7 }, { seats: 2, x: 14, z: 9 }, { seats: 2, x: 14, z: 11 }],
  },
  noodle: {
    // Broth and noodle pots face the topping bench and bowl assembly counter.
    stations: [[1, 1, 'FZPccccooppggfvsx'], [5, 3, 'bbwwwwcrc'], [1, 4, 'l'], [4, 5, 'kkkkkk'], [12, 5, 'd'], [8, 13, 'h']],
    tables: [{ seats: 4, x: 4, z: 7 }, { seats: 4, x: 8, z: 8 }, { seats: 4, x: 12, z: 7 }, { seats: 2, x: 4, z: 12 }, { seats: 2, x: 10, z: 12 }, { seats: 2, x: 15, z: 11 }],
  },
};

export function startingObjects(cuisine) {
  const plan = STARTING_LAYOUTS[cuisine] || STARTING_LAYOUTS.southern;
  const objects = [];
  for (const [startX, z, cells] of plan.stations) {
    [...cells].forEach((char, dx) => objects.push({ type: CHAR_TYPES[char], x: startX + dx, z }));
  }
  for (const table of plan.tables) objects.push({ type: 'table', ...table });
  return objects;
}

export const TABLE_SIZE = { 2: { w: 3, h: 1 }, 4: { w: 2, h: 3 } };

export const FRONT_DOOR = { x: 2, z: 14 };
export const QUEUE_SPOTS = [
  { x: 2.5, z: 12.9 }, { x: 1.6, z: 12.9 }, { x: 1.6, z: 12.0 }, { x: 2.5, z: 12.0 },
  { x: 1.6, z: 11.1 }, { x: 2.5, z: 11.1 }, { x: 1.6, z: 10.2 }, { x: 2.5, z: 10.2 },
];
export const SPAWN_POINTS = [{ x: 10.5, z: 4.5 }, { x: 11.5, z: 4.5 }];

export const STORY_BUILDING = { width: 14, height: 12, divider: { from: 4, to: 10 } };
export const FLOOR_EXPANSION_WIDTH = 10;

/** Saved dimensions keep furniture coordinates stable when the room grows. */
export function roomSize(state) {
  const building = state.mode === 'story' && state.building;
  return building ? { width: building.width, height: building.height } : { width: MAP[0].length, height: MAP.length };
}

export function frontDoor(state) { return { x: FRONT_DOOR.x, z: roomSize(state).height - 1 }; }

export function spawnPoints(state) {
  return state.mode === 'story' && state.building?.height === STORY_BUILDING.height
    ? [{ x: 9.5, z: 4.5 }, { x: 10.5, z: 4.5 }]
    : SPAWN_POINTS;
}

export function queueSpots(state) {
  const offset = roomSize(state).height - MAP.length;
  return QUEUE_SPOTS.map((spot) => ({ x: spot.x, z: spot.z + offset }));
}

export function layoutTile(state, x, z) {
  const { width, height } = roomSize(state);
  if (x < 0 || z < 0 || x >= width || z >= height) return '#';
  if (state.mode !== 'story') return MAP[z][x];
  if (x === FRONT_DOOR.x && z === height - 1) return 'D';
  if (x === 0 && z === 3) return 'B';
  if (x === 0 || z === 0 || x === width - 1 || z === height - 1) return '#';
  const divider = state.building?.divider || { from: 1, to: 12 };
  if (z === 5 && (x < divider.from || x > divider.to)) return '#';
  return '.';
}

/** Static station types that use a single item slot. */
export const SLOT_TYPES = new Set(['counter', 'board', 'grill', 'pan', 'pot', 'fryer', 'oven', 'pass']);
export const HEAT_TYPES = new Set(['grill', 'pan', 'pot', 'fryer', 'oven']);
export const STORE_TYPES = new Set(['fridge', 'freezer', 'pantry']);

export const STATION_NAMES = {
  fridge: 'Walk-in fridge', freezer: 'Freezer', pantry: 'Pantry', counter: 'Counter', board: 'Cutting board',
  grill: 'Grill', pan: 'Stove', pot: 'Pot', fryer: 'Fryer', oven: 'Oven', well: 'Prep well', rack: 'Clean plates',
  sink: 'Sink', bin: 'Bin', pass: 'The pass', drinks: 'Drink station', host: 'Host stand', dock: 'Deliveries', table: 'Table',
};
