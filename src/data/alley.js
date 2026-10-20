// The alley uses its own coordinates. Only the back door joins the two areas.
import { radioSpot } from './radio.js';
export const ALLEY_SIZE = { width: 12, height: 8 };
export const ALLEY_SPAWN = { x: 10.5, z: 3.5, rot: -Math.PI / 2 };
export const BACK_DOOR = { id: 'back-door', type: 'backdoor', x: 0, z: 3 };
export const ALLEY_OBJECTS = [
  { id: 'alley-door', type: 'backdoor', x: 11, z: 3 },
  { id: 'alley-dumpster', type: 'dumpster', x: 2, z: 1, w: 2, h: 1 },
  { id: 'alley-smoke', type: 'smoking', x: 10, z: 5 },
];
export const ALLEY_OBSTACLES = [
  { type: 'truck', x: 8, z: 1, w: 3, h: 2 },
  { type: 'crates', x: 1, z: 5, w: 1, h: 2 },
];
export const TRASH_CAPACITY = 8;
export const SMOKE_SECONDS = 20;
export const SMOKE_BOOST_SECONDS = 300;

export function hasSmokeBoost(state, player) {
  return Number.isFinite(player?.smokeBoostUntil) && player.smokeBoostUntil > (state.t || 0);
}

export function movementMultiplier(state, player) { return hasSmokeBoost(state, player) ? 1.1 : 1; }

export function cookingMultiplier(state) {
  return Object.values(state.players || {}).some((player) => hasSmokeBoost(state, player)) ? 1 / 0.8 : 1;
}

export function playerArea(player) { return player?.area === 'alley' ? 'alley' : 'restaurant'; }

export function areaObjects(state, area = 'restaurant') {
  if (area === 'alley') return ALLEY_OBJECTS;
  const radio = radioSpot(state);
  return radio ? [...state.objects, BACK_DOOR, radio] : [...state.objects, BACK_DOOR];
}
