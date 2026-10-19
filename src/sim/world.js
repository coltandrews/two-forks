// Tile grid, collision, pathfinding and placement rules. Pure functions over
// the game state; no rendering here.
import { TABLE_SIZE, roomSize, layoutTile, frontDoor } from '../data/layout.js';
import { ALLEY_SIZE, ALLEY_OBSTACLES, BACK_DOOR, areaObjects } from '../data/alley.js';

export function isWallChar(c) { return c === '#' || c === 'B'; }

export function isWallTile(state, x, z) { return isWallChar(layoutTile(state, x, z)); }

export function footprint(o) {
  if (o.type === 'table') {
    const s = TABLE_SIZE[o.seats];
    return { x: o.x, z: o.z, w: s.w, h: s.h };
  }
  return { x: o.x, z: o.z, w: o.w || 1, h: o.h || 1 };
}

/** Builds the blocked grid and the tile -> object lookup. */
export function buildGrid(state, area = 'restaurant') {
  const alley = area === 'alley';
  const { width: W, height: H } = alley ? ALLEY_SIZE : roomSize(state);
  const blocked = new Uint8Array(W * H);
  const owner = new Array(W * H).fill(null);
  for (let z = 0; z < H; z++) {
    for (let x = 0; x < W; x++) {
      if (alley ? x === 0 || z === 0 || x === W - 1 || z === H - 1 : isWallTile(state, x, z)) blocked[z * W + x] = 1;
    }
  }
  for (const o of [...areaObjects(state, area), ...(alley ? ALLEY_OBSTACLES : [])]) {
    const f = footprint(o);
    for (let dz = 0; dz < f.h; dz++) {
      for (let dx = 0; dx < f.w; dx++) {
        const x = f.x + dx, z = f.z + dz;
        if (x < 0 || z < 0 || x >= W || z >= H) continue;
        const i = z * W + x;
        blocked[i] = 1;
        owner[i] = o.id || null;
      }
    }
  }
  return { width: W, height: H, blocked, owner, area: alley ? 'alley' : 'restaurant' };
}

export function walkable(grid, x, z) {
  const { width: W, height: H } = grid;
  if (x < 0 || z < 0 || x >= W || z >= H) return false;
  return !grid.blocked[z * W + x];
}

/** Pushes a circle out of blocked tiles. Mutates and returns pos. */
export function collide(grid, pos, r) {
  const { width: W, height: H } = grid;
  for (let iter = 0; iter < 2; iter++) {
    const x0 = Math.floor(pos.x - r - 1), x1 = Math.floor(pos.x + r + 1);
    const z0 = Math.floor(pos.z - r - 1), z1 = Math.floor(pos.z + r + 1);
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        if (walkable(grid, x, z)) continue;
        const cx = Math.max(x, Math.min(pos.x, x + 1));
        const cz = Math.max(z, Math.min(pos.z, z + 1));
        const dx = pos.x - cx, dz = pos.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 < r * r) {
          const d = Math.sqrt(d2);
          if (d > 1e-5) {
            pos.x = cx + (dx / d) * r;
            pos.z = cz + (dz / d) * r;
          } else {
            // Center inside a tile: push out along the shortest axis.
            const left = pos.x - x, right = x + 1 - pos.x, up = pos.z - z, down = z + 1 - pos.z;
            const m = Math.min(left, right, up, down);
            if (m === left) pos.x = x - r; else if (m === right) pos.x = x + 1 + r;
            else if (m === up) pos.z = z - r; else pos.z = z + 1 + r;
          }
        }
      }
    }
  }
  pos.x = Math.max(r, Math.min(W - r, pos.x));
  pos.z = Math.max(r, Math.min(H - r + 1, pos.z));
  return pos;
}

/** 4-way BFS between tiles. Returns tile centers after the start, or null. */
export function findPath(grid, sx, sz, tx, tz) {
  const { width: W, height: H } = grid;
  sx = Math.floor(sx); sz = Math.floor(sz); tx = Math.floor(tx); tz = Math.floor(tz);
  if ([sx, sz, tx, tz].some((n) => !Number.isFinite(n)) || sx < 0 || sx >= W || tx < 0 || tx >= W || sz < 0 || sz >= H || tz < 0 || tz >= H) return null;
  if (sx === tx && sz === tz) return [];
  const prev = new Int32Array(W * H).fill(-2);
  const start = sz * W + sx, goal = tz * W + tx;
  const q = [start];
  prev[start] = -1;
  const ok = (x, z) => x >= 0 && z >= 0 && x < W && z < H && (!grid.blocked[z * W + x] || (x === tx && z === tz) || (x === sx && z === sz));
  while (q.length) {
    const i = q.shift();
    if (i === goal) break;
    const x = i % W, z = (i / W) | 0;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, nz = z + dz;
      if (!ok(nx, nz)) continue;
      const ni = nz * W + nx;
      if (prev[ni] !== -2) continue;
      prev[ni] = i;
      q.push(ni);
    }
  }
  if (prev[goal] === -2) return null;
  const path = [];
  for (let i = goal; i !== start; i = prev[i]) path.push({ x: (i % W) + 0.5, z: ((i / W) | 0) + 0.5 });
  path.reverse();
  return path;
}

/** Seat positions and facing for a table object. */
export function seatsOf(t) {
  const { x, z } = t;
  if (t.seats === 2) {
    return [
      { x: x + 0.5, z: z + 0.5, face: Math.PI / 2, tile: [x, z] },
      { x: x + 2.5, z: z + 0.5, face: -Math.PI / 2, tile: [x + 2, z] },
    ];
  }
  return [
    { x: x + 0.5, z: z + 0.45, face: 0, tile: [x, z] },
    { x: x + 1.5, z: z + 0.45, face: 0, tile: [x + 1, z] },
    { x: x + 0.5, z: z + 2.55, face: Math.PI, tile: [x, z + 2] },
    { x: x + 1.5, z: z + 2.55, face: Math.PI, tile: [x + 1, z + 2] },
  ];
}

export function tableCenter(t) {
  return t.seats === 2 ? { x: t.x + 1.5, z: t.z + 0.5 } : { x: t.x + 1, z: t.z + 1.5 };
}

/** A walkable tile next to a footprint tile, closest to (px, pz). */
export function approachTile(grid, tx, tz, px = tx, pz = tz) {
  let best = null, bd = Infinity;
  for (const [dx, dz] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
    const x = tx + dx, z = tz + dz;
    if (!walkable(grid, x, z)) continue;
    const d = (x + 0.5 - px) ** 2 + (z + 0.5 - pz) ** 2;
    if (d < bd) { bd = d; best = { x, z }; }
  }
  return best;
}

/**
 * Checks a layout: every walkable tile connected to the front door, and every
 * object usable from at least one walkable neighbor.
 */
export function validateLayout(state, door = frontDoor(state)) {
  const { width: W, height: H } = roomSize(state);
  const occupied = new Set();
  for (const o of state.objects) {
    const f = footprint(o);
    if (!Number.isInteger(f.x) || !Number.isInteger(f.z)) return { ok: false, reason: 'Place objects on whole floor cells.' };
    for (let dz = 0; dz < f.h; dz++) for (let dx = 0; dx < f.w; dx++) {
      const x = f.x + dx, z = f.z + dz, key = z * W + x;
      if (x < 1 || z < 1 || x >= W - 1 || z >= H - 1 || isWallTile(state, x, z)) return { ok: false, reason: 'Place objects inside the current walls.' };
      if (occupied.has(key)) return { ok: false, reason: 'Objects cannot share the same floor cell.' };
      occupied.add(key);
    }
  }
  const grid = buildGrid(state);
  if (!walkable(grid, BACK_DOOR.x + 1, BACK_DOOR.z)) return { ok: false, reason: 'Keep the back door clear.' };
  const seen = new Uint8Array(W * H);
  const q = [door.z * W + door.x];
  seen[q[0]] = 1;
  let count = 1;
  while (q.length) {
    const i = q.shift();
    const x = i % W, z = (i / W) | 0;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, nz = z + dz;
      if (!walkable(grid, nx, nz)) continue;
      const ni = nz * W + nx;
      if (seen[ni]) continue;
      seen[ni] = 1;
      count++;
      q.push(ni);
    }
  }
  let walkableCount = 0;
  for (let i = 0; i < W * H; i++) if (!grid.blocked[i]) walkableCount++;
  if (count !== walkableCount) return { ok: false, reason: 'That would wall off part of the floor.' };
  for (const o of state.objects) {
    const f = footprint(o);
    let usable = false;
    for (let dz = 0; dz < f.h && !usable; dz++) {
      for (let dx = 0; dx < f.w && !usable; dx++) {
        for (const [ax, az] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = f.x + dx + ax, nz = f.z + dz + az;
          if (walkable(grid, nx, nz) && seen[nz * W + nx]) { usable = true; break; }
        }
      }
    }
    if (!usable) return { ok: false, reason: 'Something would be impossible to reach.' };
  }
  return { ok: true };
}

/** Whether a footprint fits on plain floor in the given rows. */
export function fits(state, f, zMin, zMax, ignoreId = null) {
  const grid = buildGrid({ ...state, objects: state.objects.filter((o) => o.id !== ignoreId) });
  for (let dz = 0; dz < f.h; dz++) {
    for (let dx = 0; dx < f.w; dx++) {
      const x = f.x + dx, z = f.z + dz;
      if (z < zMin || z > zMax) return false;
      if (!walkable(grid, x, z)) return false;
      const c = layoutTile(state, x, z);
      if (c === 'D') return false;
    }
  }
  return true;
}
