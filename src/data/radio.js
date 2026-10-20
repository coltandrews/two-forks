// The kitchen radio. Station 0 is the house jazz; 1..10 are synthesized songs;
// the last station is off. The radio sits on the kitchen half-wall by the
// delivery pallet; tap Q there for the next station, hold Q to switch it off.
//
// Song notation (all synthesized in audio.js):
//   key     MIDI note of the tonic; melody degrees count from it (1 = tonic,
//           8 = octave, 0 = the note below). Prefix b / # for flats / sharps.
//   bars    one chord name per bar, e.g. 'C', 'Am', 'G7', 'Fmaj7', 'Dm7'
//   melody  one string per bar: degrees per eighth note, '-' holds, '.' rests
//   bass    per-sixteenth pattern: R root, 3 third, 5 fifth, 6 sixth,
//           7 seventh, O octave, A approach to the next root, '.' rest;
//           or 'walk' for a walking bass
//   drums   per-sixteenth patterns: k kick, s snare, h hat, p rim/clave,
//           c clap, z shaker. 'X' accent, 'x' hit, 'g' ghost, '.' rest
//   comp    chord parts: { type: stab|pad|arp|strum|skank, pat, inst }

import { layoutTile, roomSize } from './layout.js';

export const SONGS = [
  { title: 'House Jazz', artist: 'The Two Forks Trio', legacy: true },
  {
    title: 'Grits & Glory', artist: 'The Skillet Kings',
    bpm: 128, swing: 0.55, key: 55, scale: 'major', lead: 'pluck', leadOct: 12,
    bars: ['G', 'G', 'C', 'C', 'G', 'D', 'C', 'G'],
    melody: ['5 6 8 6 5 3 1 .', '3 5 3 2 1 - . 5', '4 6 8 6 4 - 3 4', '6 - 5 4 3 - . .',
      '5 6 8 9 10 - 8 .', '9 - 7 5 2 - 5 .', '8 6 4 6 5 - 4 2', '1 - 3 5 8 - . .'],
    bass: 'R.3.5.6.O.6.5.3.', bassInst: 'bass',
    comp: [{ type: 'stab', pat: '..x...x...x...x.', inst: 'piano' }],
    drums: { k: 'x.......x.......', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.' },
  },
  {
    title: 'Meatball Mambo', artist: "Nonna's Night Out",
    bpm: 108, swing: 0, key: 57, scale: 'minor', lead: 'brass', leadOct: 12,
    bars: ['Am', 'Dm', 'G', 'C', 'F', 'Dm', 'E7', 'Am'],
    melody: ['5 . 5 6 5 3 . 1', '4 . 4 6 8 6 4 .', '7 . 7 5 2 . 7 .', '3 5 8 . 7 5 3 .',
      '6 . 8 10 9 8 6 .', '4 6 8 6 4 . 6 .', '#7 . 2 . 5 . #7 2', '1 - - . 5 . 1 .'],
    bass: 'R..5..R...5.O...', bassInst: 'bass',
    comp: [{ type: 'arp', pat: 'x.xx.x.xx.x.x.xx', inst: 'piano' }],
    drums: { k: 'x.....x.x.....x.', p: 'x..x...x..x.x...', z: 'xgxgxgxgxgxgxgxg' },
  },
  {
    title: 'Taco Tuesday Two-Step', artist: 'Los Tenedores',
    bpm: 148, swing: 0, key: 60, scale: 'major', lead: 'brass', leadOct: 12, harmony: -2,
    bars: ['C', 'C', 'G7', 'C', 'F', 'C', 'G7', 'C'],
    melody: ['5 3 5 8 . 8 7 8', '10 . 8 . 5 . 3 .', '4 2 4 7 . 7 6 7', '8 . 5 . 3 . . .',
      '6 4 6 8 . 8 9 10', '10 . 8 . 5 . 3 .', '2 4 7 9 11 9 7 5', '8 . 1 . 8 . . .'],
    bass: 'R...5...R...5...', bassInst: 'bass',
    comp: [{ type: 'strum', pat: '..x...x...x...x.', inst: 'pluck' }],
    drums: { k: 'x.......x.......', s: '....g.......g...', h: '..x...x...x...x.' },
  },
  {
    title: 'Noodle Wave', artist: 'Ramen Rider',
    bpm: 100, swing: 0, key: 60, scale: 'major', lead: 'square', leadOct: 12,
    bars: ['Fmaj7', 'Em7', 'Dm7', 'Cmaj7', 'Fmaj7', 'Em7', 'Dm7', 'G7'],
    melody: ['8 . 7 8 10 . 8 .', '7 . 5 . 3 . 2 3', '4 . 6 . 8 7 6 .', '5 - - . 3 5 7 .',
      '10 . 9 8 9 . 8 6', '7 . 5 . 7 9 . .', '8 . 6 4 6 . 8 9', '9 - 7 - 5 . . .'],
    bass: 'R..R..O.R..R.5..', bassInst: 'synthbass',
    comp: [{ type: 'pad', inst: 'pad' }, { type: 'arp', pat: 'x.x.x.x.x.x.x.x.', inst: 'bell', up: 12 }],
    drums: { k: 'x...x...x...x...', c: '....x.......x...', h: '..x...x...x...x.' },
  },
  {
    title: 'Order Up! (Disco Mix)', artist: 'The Ticket Rail',
    bpm: 120, swing: 0, key: 57, scale: 'minor', lead: 'bell', leadOct: 12,
    bars: ['Am7', 'Dm7', 'G', 'Cmaj7', 'Am7', 'Dm7', 'E7', 'Am7'],
    melody: ['8 . 8 . 10 8 7 5', '6 . 6 . 8 6 4 .', '7 . 7 . 9 7 5 2', '3 - 5 - 7 - 8 .',
      '12 . 10 . 8 . 10 12', '11 . 10 8 6 . 8 .', '#7 . 9 . 12 . #7 .', '8 - - - . . . .'],
    bass: 'R.O.R.O.R.O.R.O.', bassInst: 'synthbass',
    comp: [{ type: 'stab', pat: 'x..x..x...x..x..', inst: 'pad' }],
    drums: { k: 'x...x...x...x...', c: '....x.......x...', h: 'gxXxgxXxgxXxgxXx' },
  },
  {
    title: 'Burnt Toast Blues', artist: "Lonnie 'Two Slices' Pratt",
    bpm: 80, swing: 0.6, key: 52, scale: 'mixolydian', lead: 'harmonica', leadOct: 12,
    bars: ['E7', 'A7', 'E7', 'E7', 'A7', 'A7', 'E7', 'E7', 'B7', 'A7', 'E7', 'B7'],
    melody: ['8 b10 . 8 b7 5 . .', '4 6 8 6 4 - . .', '5 . b3 3 1 - . .', '. . 1 b3 4 #4 5 .',
      '8 . 8 6 4 . b3 .', '4 - 6 - 8 . . .', '5 b7 8 b7 5 b3 1 .', '. . . . 5 . b7 .',
      '5 . 7 . 9 . 11 .', '8 . 6 . 4 . b3 .', '1 b3 3 5 b7 8 . .', '7 . 5 . 2 . . .'],
    bass: 'walk', bassInst: 'bass',
    comp: [{ type: 'stab', pat: '....x.......x...', inst: 'organ' }],
    drums: { k: 'x.......x.......', s: '....g.......g...', h: 'x.x.x.x.x.x.x.x.' },
  },
  {
    title: 'Pass the Hot Sauce', artist: 'Scoville Brass Band',
    bpm: 100, swing: 0.25, key: 53, scale: 'major', lead: 'brass', leadOct: 12, harmony: -2,
    bars: ['F', 'F', 'Bb', 'F', 'C7', 'Bb', 'F', 'C7'],
    melody: ['5 . 6 8 . 6 5 .', '3 . 5 . b3 3 1 .', '4 . 6 8 . 6 4 .', '5 - 3 - 1 . . .',
      '5 . 7 9 . 11 9 .', '11 . 10 8 6 . 4 .', '8 . 6 5 3 . 5 6', '7 . 9 . 5 . . .'],
    bass: 'R..R..5.R.O...7.', bassInst: 'bass',
    comp: [{ type: 'stab', pat: '..x..x....x..x..', inst: 'piano' }],
    drums: { k: 'x..x..x...x..x..', s: '....X..g.g..X..g', h: 'x.x.x.x.x.x.x.x.' },
  },
  {
    title: 'Chip Kitchen', artist: '8-Bit Brigade',
    bpm: 144, swing: 0, key: 60, scale: 'major', lead: 'square', leadOct: 12,
    bars: ['C', 'Am', 'F', 'G', 'C', 'Am', 'F', 'G'],
    melody: ['8 . 5 . 8 10 12 .', '13 . 12 10 8 . 6 .', '11 . 13 . 15 13 11 .', '12 . 11 . 9 . 7 .',
      '8 10 12 15 . 12 10 8', '6 8 10 13 . 10 8 6', '4 6 8 11 . 8 6 4', '5 7 9 12 . . 12 .'],
    bass: 'R.O.R.O.R.O.R.O.', bassInst: 'chipbass',
    comp: [{ type: 'arp', pat: 'xxxxxxxxxxxxxxxx', inst: 'chip', up: 12 }],
    drums: { k: 'x.......x.x.....', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.' },
  },
  {
    title: 'Reggae Reservation', artist: 'Island Table for Two',
    bpm: 76, swing: 0.15, key: 55, scale: 'major', lead: 'organ', leadOct: 12,
    bars: ['G', 'C', 'G', 'D', 'G', 'C', 'D', 'G'],
    melody: ['5 . . 3 5 . 6 5', '4 . . 6 8 . 6 .', '5 . 3 . 1 . . .', '2 . . 5 7 . 9 .',
      '8 . . 10 8 . 5 .', '6 . . 8 10 . 8 6', '5 . 7 . 9 . 7 5', '1 - - . . . . .'],
    bass: 'R...R.5.....3.R.', bassInst: 'bass',
    comp: [{ type: 'skank', pat: '..x...x...x...x.', inst: 'organ' }],
    drums: { k: '........x.......', p: '........x.......', h: 'x.x.x.x.x.x.x.x.' },
  },
  {
    title: 'Last Call Lullaby', artist: 'The Closing Shift',
    bpm: 96, beats: 3, swing: 0, key: 53, scale: 'major', lead: 'bell', leadOct: 12,
    bars: ['F', 'Dm', 'Bb', 'C7', 'F', 'Am', 'Bb', 'C7'],
    melody: ['5 - 6 5 3 -', '6 - 8 6 3 -', '4 - 6 8 - 6', '5 - - 7 - -',
      '8 - 10 8 6 5', '3 - 5 - 7 -', '4 - 6 4 2 -', '5 - - - . .'],
    bass: 'R...5...5...', bassInst: 'bass',
    comp: [{ type: 'stab', pat: '....x...x...', inst: 'piano' }, { type: 'pad', inst: 'pad' }],
    drums: { h: '....g...g...' },
  },
];

export const RADIO_OFF = SONGS.length;

export function radioStation(state) {
  const n = state?.radio;
  return Number.isInteger(n) && n >= 0 && n <= RADIO_OFF ? n : 0;
}

export function stationLabel(n) {
  const s = SONGS[n];
  return s ? `"${s.title}" by ${s.artist}` : 'Off';
}

/** Fallback when the room has no kitchen half-wall: the counter nearest the pallet. */
export function radioCounter(state) {
  const objs = state?.objects || [];
  const dock = objs.find((o) => o.type === 'dock');
  let best = null, bd = Infinity;
  for (const o of objs) {
    if (o.type !== 'counter') continue;
    const d = dock ? Math.hypot(o.x - dock.x, o.z - dock.z) : o.z * 100 + o.x;
    if (d < bd || (d === bd && (o.z < best.z || (o.z === best.z && o.x < best.x)))) { bd = d; best = o; }
  }
  return best;
}

const spotCache = new WeakMap();

/**
 * The radio lives on the permanent half-wall between kitchen and dining
 * (row 5), on the tile nearest the delivery pallet that a chef can reach
 * from the kitchen side. Returns a fixed pseudo-object, or null.
 */
export function radioSpot(state) {
  if (!state?.objects) return null;
  const dock = state.objects.find((o) => o.type === 'dock');
  const key = `${state.mode}|${JSON.stringify(state.building || null)}|${dock ? dock.x + ',' + dock.z : ''}|` + state.objects.filter((o) => o.z === 4).map((o) => o.x).join(',');
  const hit = spotCache.get(state);
  if (hit && hit.key === key) return hit.spot;
  const { width } = roomSize(state);
  const taken = new Set(state.objects.filter((o) => o.type !== 'table').map((o) => o.x + ',' + o.z));
  const dx = dock ? dock.x : 1, dz = dock ? dock.z : 4;
  let spot = null, bd = Infinity;
  for (let x = 1; x < width - 1; x++) {
    if (layoutTile(state, x, 5) !== '#' || layoutTile(state, x, 4) === '#' || taken.has(x + ',4')) continue;
    const d = Math.hypot(x - dx, 5 - dz);
    if (d < bd) { bd = d; spot = { id: 'radio', type: 'radio', x, z: 5 }; }
  }
  spotCache.set(state, { key, spot });
  return spot;
}

/** World position of the radio for the view: { x, z, wall } or null. */
export function radioPlace(state) {
  const s = radioSpot(state);
  if (s) return { x: s.x, z: s.z, wall: true };
  const c = radioCounter(state);
  return c ? { x: c.x, z: c.z, wall: false, id: c.id } : null;
}

/** True when the object a chef faces is the radio. */
export function isRadio(state, o) {
  if (!o) return false;
  if (o.type === 'radio') return true;
  return o.type === 'counter' && !radioSpot(state) && radioCounter(state)?.id === o.id;
}
