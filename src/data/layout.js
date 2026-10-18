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

export const TABLE_SIZE = { 2: { w: 3, h: 1 }, 4: { w: 2, h: 3 } };

export const FRONT_DOOR = { x: 2, z: 14 };
export const QUEUE_SPOTS = [
  { x: 2.5, z: 12.9 }, { x: 1.6, z: 12.9 }, { x: 1.6, z: 12.0 }, { x: 2.5, z: 12.0 },
  { x: 1.6, z: 11.1 }, { x: 2.5, z: 11.1 }, { x: 1.6, z: 10.2 }, { x: 2.5, z: 10.2 },
];
export const SPAWN_POINTS = [{ x: 10.5, z: 4.5 }, { x: 11.5, z: 4.5 }];

/** Static station types that use a single item slot. */
export const SLOT_TYPES = new Set(['counter', 'board', 'grill', 'pan', 'pot', 'fryer', 'oven', 'pass']);
export const HEAT_TYPES = new Set(['grill', 'pan', 'pot', 'fryer', 'oven']);
export const STORE_TYPES = new Set(['fridge', 'freezer', 'pantry']);

export const STATION_NAMES = {
  fridge: 'Walk-in fridge', freezer: 'Freezer', pantry: 'Pantry', counter: 'Counter', board: 'Cutting board',
  grill: 'Grill', pan: 'Stove', pot: 'Pot', fryer: 'Fryer', oven: 'Oven', well: 'Prep well', rack: 'Clean plates',
  sink: 'Sink', bin: 'Bin', pass: 'The pass', drinks: 'Drink station', host: 'Host stand', dock: 'Deliveries', table: 'Table',
};
