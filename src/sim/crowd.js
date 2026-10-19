// Guest movement uses the same floor grid as chefs, with space for each person.
import { CFG } from '../config.js';
import { findPath, seatsOf, walkable } from './world.js';

const SEATED = new Set(['browsing', 'ordering', 'waitingFood', 'eating', 'dessertReady', 'dessertWait', 'dessertEat', 'paying']);
const TURNS = [0, 0.4, -0.4, 0.8, -0.8, 1.2, -1.2, 1.6, -1.6];

function clearFloor(grid, x, z, radius) {
  for (let iz = Math.floor(z - radius); iz <= Math.floor(z + radius); iz++) {
    for (let ix = Math.floor(x - radius); ix <= Math.floor(x + radius); ix++) {
      if (walkable(grid, ix, iz)) continue;
      const dx = x - Math.max(ix, Math.min(x, ix + 1));
      const dz = z - Math.max(iz, Math.min(z, iz + 1));
      if (dx * dx + dz * dz < radius * radius - 1e-8) return false;
    }
  }
  return true;
}

function clearLine(grid, a, b, radius) {
  const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.2));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    if (!clearFloor(grid, a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t, radius)) return false;
  }
  return true;
}

function distanceToSegment(a, b, p) {
  const dx = b.x - a.x, dz = b.z - a.z;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(p.x - a.x - dx * t, p.z - a.z - dz * t);
}

function guestGrid(sim, party, guest) {
  if (!['seating', 'leaving'].includes(party.state)) return sim.grid;
  const table = sim.state.objects.find((o) => o.id === party.table);
  const seat = table && seatsOf(table)[guest.seat];
  if (!seat) return sim.grid;
  // Only this guest may cross their chair tile to sit down or get up.
  const blocked = sim.grid.blocked.slice();
  blocked[seat.tile[1] * sim.grid.width + seat.tile[0]] = 0;
  return { ...sim.grid, blocked };
}

function targetOf(actor, actors) {
  const g = actor.g, radius = CFG.party.radius;
  while (g.path.length && Math.hypot(g.path[0].x - g.x, g.path[0].z - g.z) < 0.06) g.path.shift();
  // Do not force everyone through the same tile center on open floor.
  while (g.path.length > 1 && clearLine(actor.grid, g, g.path[1], radius)
    && actors.every((other) => other === actor || other.g.exited || distanceToSegment(g, g.path[1], other.g) >= radius * 2)) g.path.shift();
  if (g.path.length) return g.path[0];
  if (g.tx == null) return null;
  if (Math.hypot(g.tx - g.x, g.tz - g.z) < 0.04) {
    g.tx = null; g.tz = null;
    return null;
  }
  return { x: g.tx, z: g.tz };
}

function reroute(actor, actors) {
  const g = actor.g;
  if (g.tx == null) return;
  const blocked = actor.grid.blocked.slice();
  const others = actors.filter((other) => other !== actor && !other.g.exited);
  for (const other of others) {
    const x = Math.floor(other.g.x), z = Math.floor(other.g.z);
    blocked[z * actor.grid.width + x] = 1;
  }
  const grid = { ...actor.grid, blocked }, radius = CFG.party.radius;
  const clear = (point) => clearLine(actor.grid, g, point, radius)
    && others.every((other) => distanceToSegment(g, point, other.g) >= radius * 2 - 1e-6);
  let best = null, cost = Infinity;
  // A guest can share a tile with someone at its far edge. Choose an escape
  // from the actual body position before asking tile pathfinding for a route.
  for (let z = Math.floor(g.z) - 1; z <= Math.floor(g.z) + 1; z++) {
    for (let x = Math.floor(g.x) - 1; x <= Math.floor(g.x) + 1; x++) {
      const start = { x: x + 0.5, z: z + 0.5 };
      if (!walkable(grid, x, z) || !clear(start)) continue;
      const path = findPath(grid, start.x, start.z, g.tx, g.tz);
      if (!path) continue;
      const distance = Math.hypot(start.x - g.x, start.z - g.z) + path.length;
      if (distance < cost) { cost = distance; best = [start, ...path]; }
    }
  }
  if (best) g.path = best;
}

function move(actor, actors, dt) {
  const g = actor.g, motion = actor.motion, radius = CFG.party.radius;
  const target = targetOf(actor, actors);
  if (!target) return;
  const dx = target.x - g.x, dz = target.z - g.z, distance = Math.hypot(dx, dz);
  const step = Math.min(distance, CFG.party.walkSpeed * dt);
  const angle = Math.atan2(dx, dz);
  let best = null, bestScore = -Infinity;
  const neighbors = actors.filter((other) => other !== actor && !other.g.exited && Math.hypot(other.g.x - g.x, other.g.z - g.z) < 2);
  const blocker = neighbors.find((other) => other.g.id < g.id && (other.g.x - g.x) * dx + (other.g.z - g.z) * dz > 0 && Math.hypot(other.g.x - g.x, other.g.z - g.z) < radius * 2 + 0.3);
  const yielding = motion.stuck > 0.45 && blocker && !blocker.fixed;
  for (const turn of yielding ? [1.6, -1.6, 2.2, -2.2, Math.PI] : TURNS) {
    const a = angle + turn;
    const next = { x: g.x + Math.sin(a) * step, z: g.z + Math.cos(a) * step };
    if (!clearFloor(actor.grid, next.x, next.z, radius)) continue;
    if (neighbors.some((other) => distanceToSegment(g, next, other.g) < radius * 2 - 1e-6)) continue;
    let score = distance - Math.hypot(target.x - next.x, target.z - next.z);
    // Pass on the right. A small bias prevents head-on pairs choosing the same side.
    score -= Math.abs(turn) * step * 0.04 + (turn < 0 ? step * 0.02 : 0);
    if (yielding) score = Math.hypot(next.x - blocker.g.x, next.z - blocker.g.z) - Math.hypot(g.x - blocker.g.x, g.z - blocker.g.z);
    if (score > bestScore) { bestScore = score; best = next; }
  }
  if (best) {
    const progress = distance - Math.hypot(target.x - best.x, target.z - best.z);
    g.rot = Math.atan2(best.x - g.x, best.z - g.z);
    g.x = best.x; g.z = best.z; g.moving = true;
    motion.stuck = progress > step * 0.2 ? 0 : motion.stuck + dt;
  } else motion.stuck += dt;
  motion.repath -= dt;
  const blockedRoute = neighbors.some((other) => distanceToSegment(g, target, other.g) < radius * 2);
  if ((motion.stuck > 0.25 || blockedRoute) && motion.repath <= 0) {
    reroute(actor, actors);
    motion.repath = 0.5;
  }
}

export function moveGuests(sim, dt) {
  const actors = [];
  for (const party of sim.state.parties) for (const g of party.guests) {
    g.moving = false;
    if (g.exited || party.gone) continue;
    if (!sim.guestMotion.has(g.id)) sim.guestMotion.set(g.id, { stuck: 0, repath: 0 });
    actors.push({ g, party, fixed: SEATED.has(party.state), grid: guestGrid(sim, party, g), motion: sim.guestMotion.get(g.id) });
  }
  const live = new Set(actors.map(({ g }) => g.id));
  for (const id of sim.guestMotion.keys()) if (!live.has(id)) sim.guestMotion.delete(id);
  // Small steps stop guests crossing through each other during a long frame.
  const steps = Math.max(1, Math.ceil(dt / (1 / 30))), step = dt / steps;
  for (let i = 0; i < steps; i++) for (const actor of actors) {
    if (actor.fixed || actor.g.exited) continue;
    move(actor, actors, step);
    if (actor.party.state === 'leaving' && !targetOf(actor, actors)) actor.g.exited = true;
  }
}
