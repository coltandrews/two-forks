// Saved starter floors before version 5. Keep these separate from new layouts
// so save repairs can identify unchanged furniture without moving custom rooms.
import { CHAR_TYPES } from './layout.js';

const LEGACY_LAYOUTS = {
  southern: {
    stations: [[1, 1, 'FZPcbbcggppoofvcsx'], [5, 3, 'wwwwcccr'], [1, 4, 'l'], [4, 5, 'kkkkkk'], [12, 5, 'd'], [4, 13, 'h']],
    tables: [{ seats: 4, x: 5, z: 7 }, { seats: 4, x: 9, z: 7 }, { seats: 4, x: 13, z: 7 }, { seats: 2, x: 6, z: 11 }, { seats: 2, x: 11, z: 11 }, { seats: 2, x: 15, z: 11 }],
  },
  italian: {
    stations: [[1, 1, 'FZPlsxccbbvfopggcc'], [4, 3, 'kkkkkk'], [2, 4, 'wwwwc'], [14, 4, 'copr'], [12, 5, 'd'], [4, 13, 'h']],
    tables: [{ seats: 4, x: 3, z: 7 }, { seats: 4, x: 8, z: 7 }, { seats: 4, x: 13, z: 7 }, { seats: 2, x: 5, z: 11 }, { seats: 2, x: 10, z: 11 }, { seats: 2, x: 15, z: 11 }],
  },
  mexican: {
    stations: [[1, 1, 'lFZ'], [5, 1, 'ccsxbbggpp'], [16, 1, 'ofv'], [4, 3, 'w'], [7, 3, 'Pccrcco'], [15, 3, 'w'], [4, 4, 'w'], [15, 4, 'w'], [4, 5, 'kkkkkk'], [12, 5, 'd'], [3, 13, 'h']],
    tables: [{ seats: 4, x: 3, z: 7 }, { seats: 4, x: 8, z: 8 }, { seats: 4, x: 13, z: 7 }, { seats: 2, x: 4, z: 12 }, { seats: 2, x: 11, z: 12 }, { seats: 2, x: 16, z: 11 }],
  },
  diner: {
    stations: [[1, 1, 'FZPlsxccbbggppofvc'], [2, 3, 'wwccorw'], [13, 3, 'wc'], [4, 4, 'kkkkkk'], [12, 5, 'd'], [3, 13, 'h']],
    tables: [{ seats: 4, x: 5, z: 7 }, { seats: 4, x: 5, z: 11 }, { seats: 4, x: 10, z: 8 }, { seats: 2, x: 14, z: 7 }, { seats: 2, x: 14, z: 9 }, { seats: 2, x: 14, z: 11 }],
  },
  noodle: {
    stations: [[1, 1, 'FZ'], [4, 1, 'lsxcbbggppofv'], [18, 1, 'c'], [3, 3, 'w'], [7, 3, 'Pccorcc'], [17, 3, 'w'], [3, 4, 'w'], [6, 4, 'kkkk'], [13, 4, 'kk'], [17, 4, 'w'], [12, 5, 'd'], [8, 13, 'h']],
    tables: [{ seats: 4, x: 4, z: 7 }, { seats: 4, x: 8, z: 8 }, { seats: 4, x: 12, z: 7 }, { seats: 2, x: 4, z: 12 }, { seats: 2, x: 10, z: 12 }, { seats: 2, x: 15, z: 11 }],
  },
};

export function legacyStartingObjects(cuisine, version = 4) {
  const plan = LEGACY_LAYOUTS[cuisine] || LEGACY_LAYOUTS.southern;
  const objects = [];
  for (const [startX, z, cells] of plan.stations) {
    [...cells].forEach((char, dx) => objects.push({ type: CHAR_TYPES[char], x: startX + dx, z }));
  }
  for (const table of plan.tables) objects.push({ type: 'table', ...table });
  if (version < 4 && ['italian', 'mexican', 'diner'].includes(cuisine)) {
    objects.find((o) => o.type === 'host').x = 18;
  }
  return objects;
}
