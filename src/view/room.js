// The building shell: floors, walls, windows, the name sign, lights and the
// cuisine's decor. Rebuilt when the layout or decor upgrades change.
import * as THREE from 'three';
import { Shape, MAT, meshOf, shade, mix } from './shape.js';
import { MAP, KITCHEN_MAX_Z } from '../data/layout.js';
import { lockedAreas } from '../data/progression.js';
import { isWallTile } from '../sim/world.js';

const W = MAP[0].length, H = MAP.length;
const WALL_H = 2.8, DIVIDER_H = 1.05, FRONT_H = 0.45;

function nameSign(name, style, pal) {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 192;
  const g = c.getContext('2d');
  const r = 28;
  const rr = (x, y, w, h, rad) => { g.beginPath(); g.moveTo(x + rad, y); g.arcTo(x + w, y, x + w, y + h, rad); g.arcTo(x + w, y + h, x, y + h, rad); g.arcTo(x, y + h, x, y, rad); g.arcTo(x, y, x + w, y, rad); g.closePath(); };
  g.fillStyle = '#2a1b12';
  rr(0, 0, 1024, 192, r); g.fill();
  g.fillStyle = '#7a4a2a';
  rr(10, 10, 1004, 172, r - 8); g.fill();
  g.fillStyle = '#8f5a33';
  for (let i = 0; i < 4; i++) g.fillRect(18, 24 + i * 40, 988, 3);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  let size = 104;
  const font = (n) => `${n}px "Lilita One", "Arial Rounded MT Bold", sans-serif`;
  g.font = font(size);
  while (g.measureText(name).width > 900 && size > 40) { size -= 4; g.font = font(size); }
  g.lineJoin = 'round';
  g.lineWidth = 16;
  g.strokeStyle = '#2a1b12';
  g.strokeText(name, 512, 84);
  g.fillStyle = '#ffc83c';
  g.fillText(name, 512, 80);
  g.font = font(30);
  g.fillStyle = '#ffe8c4';
  g.fillText(style.toUpperCase() + '  ★  EST. TODAY', 512, 154);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 0.98), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, transparent: true }));
  return m;
}

export function buildRoom(cuisine, name, upgrades, state) {
  const pal = cuisine.palette;
  const root = new THREE.Group();
  const s = new Shape();
  const glow = new Shape(false);
  const isWall = (x, z) => isWallTile(state, x, z);

  // Floors.
  for (let z = 0; z < H; z++) {
    for (let x = 0; x < W; x++) {
      if (isWall(x, z)) continue;
      const kitchen = z <= KITCHEN_MAX_Z || (z === 5);
      let c;
      if (kitchen) c = (x + z) % 2 ? pal.kitchenA : pal.kitchenB;
      else if (cuisine.id === 'diner') c = (x + z) % 2 ? pal.floorA : pal.floorB;
      else {
        // Plank rows with slight variation.
        const v = ((x * 7 + z * 13) % 5) / 40;
        c = shade(z % 2 ? pal.floorA : pal.floorB, 0.96 + v);
      }
      s.box(1, 0.06, 1, c, x + 0.5, -0.03, z + 0.5);
      if (!kitchen && cuisine.id !== 'diner') s.box(1, 0.005, 0.02, shade(pal.floorB, 0.8), x + 0.5, 0.001, z + 0.02);
    }
  }
  if (upgrades.decor3) {
    // Renovation: a big rug under the tables.
    s.box(13, 0.012, 6.2, mix(pal.accent, 0x2a2a2a, 0.35), 10.5, 0.006, 9.6);
    s.box(12.4, 0.014, 5.6, mix(pal.accent2, 0xf0e6d0, 0.4), 10.5, 0.008, 9.6);
  }

  // Walls.
  const wallC = pal.wall, trimC = pal.trim;
  for (let z = 0; z < H; z++) {
    for (let x = 0; x < W; x++) {
      if (!isWall(x, z)) continue;
      const cx = x + 0.5, cz = z + 0.5;
      if (MAP[z][x] === 'B') {
        // Back door: frame and a door slab.
        s.box(1, WALL_H, 1, wallC, cx, WALL_H / 2, cz);
        s.box(0.06, 2.1, 0.9, 0x7a5a3a, cx + 0.5, 1.05, cz);
        s.box(0.08, 0.12, 1.0, trimC, cx + 0.5, 2.15, cz);
        s.box(0.08, 0.06, 0.2, 0xd8c070, cx + 0.53, 1.0, cz + 0.3);
        continue;
      }
      if (z === H - 1) {
        // Front: cut away low so the camera can see in.
        s.box(1, FRONT_H, 1, wallC, cx, FRONT_H / 2, cz);
        s.box(1.02, 0.06, 1.04, trimC, cx, FRONT_H + 0.03, cz);
        continue;
      }
      if (z === 5) {
        s.box(1, DIVIDER_H, 1, wallC, cx, DIVIDER_H / 2, cz);
        s.box(1.02, 0.06, 1.04, trimC, cx, DIVIDER_H + 0.03, cz);
        s.box(1.0, 0.3, 0.02, shade(wallC, 0.85), cx, 0.15, cz + 0.51);
        continue;
      }
      const kitchen = z <= KITCHEN_MAX_Z;
      const h = WALL_H;
      s.box(1, h, 1, kitchen ? shade(pal.kitchenA, 0.97) : wallC, cx, h / 2, cz);
      if (!kitchen) {
        // Wainscot on the inside face of dining walls.
        const inner = x === 0 ? 0.51 : x === W - 1 ? -0.51 : 0;
        if (inner) {
          s.box(0.02, 0.9, 1.0, shade(trimC, 1.05), cx + inner, 0.45, cz);
          s.box(0.04, 0.06, 1.0, trimC, cx + inner, 0.92, cz);
        }
      }
    }
  }
  // Subway tile bands on the kitchen back wall.
  for (let i = 0; i < 8; i++) {
    const y = 0.95 + i * 0.16;
    s.box(18, 0.012, 0.01, shade(pal.kitchenA, 0.86), 10, y, 1.005);
  }
  // Shelves with pans either side of the name sign.
  for (const cx of [4.6, 15.4]) {
    s.box(4.2, 0.05, 0.3, 0x8a8f94, cx, 2.35, 1.15);
    for (let i = 0; i < 3; i++) {
      const x = cx - 1.3 + i * 1.3;
      if (i % 2) s.cyl(0.18, 0.15, 0.2, 8, 0x9aa0a6, x, 2.48, 1.15);
      else s.cyl(0.14, 0.14, 0.12, 8, 0x5a5654, x, 2.44, 1.15);
    }
  }
  // Fluorescent strips (glow).
  glow.box(3.6, 0.05, 0.08, 0xfffbf0, 4.6, 2.72, 1.1);
  glow.box(3.6, 0.05, 0.08, 0xfffbf0, 15.4, 2.72, 1.1);

  // Windows on the dining side walls.
  const winGeo = new Shape(false);
  const outside = new Shape(false);
  for (const z of [7.5, 10.5]) {
    for (const x of [0.5 + 0.52, W - 0.5 - 0.52]) {
      const face = x < W / 2 ? 1 : -1;
      const front = x + face * 0.018;
      winGeo.box(0.02, 1.0, 1.5, 0xbfe0f0, x, 1.55, z);
      outside.box(0.025, 0.24, 1.46, 0x667875, front, 1.17, z);
      outside.box(0.03, 0.42, 0.34, 0x536565, front, 1.31, z - 0.48);
      outside.box(0.03, 0.3, 0.42, 0x5e6f6d, front, 1.25, z - 0.08);
      outside.box(0.03, 0.5, 0.3, 0x4b5d5d, front, 1.35, z + 0.33);
      outside.sphere(0.18, 0x476455, front, 1.48, z + 0.56, 0.1, 1.25, 1, 6);
      s.box(0.06, 1.12, 0.08, trimC, x, 1.55, z - 0.79);
      s.box(0.06, 1.12, 0.08, trimC, x, 1.55, z + 0.79);
      s.box(0.06, 1.04, 0.045, trimC, x + face * 0.012, 1.55, z);
      s.box(0.065, 0.045, 1.58, trimC, x + face * 0.012, 1.55, z);
      s.box(0.06, 0.08, 1.66, trimC, x, 2.07, z);
      s.box(0.12, 0.06, 1.7, trimC, x, 1.02, z);
    }
  }
  const winMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  const outsideMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  root.add(new THREE.Mesh(winGeo.build(), winMat), new THREE.Mesh(outside.build(), outsideMat));

  // Front door gap: mat and an OPEN sign.
  s.box(1.0, 0.012, 0.7, 0x5a3a2a, 2.5, 0.006, 13.6);
  s.box(0.06, 0.6, 0.06, 0x5a4a3a, 1.95, 0.75, 14.5);
  s.box(0.06, 0.6, 0.06, 0x5a4a3a, 3.05, 0.75, 14.5);

  // Cuisine decor and upgrades.
  decor(s, glow, cuisine, pal, upgrades);

  root.add(meshOf(s, MAT.solid, false, true));
  if (glow.parts.length) root.add(new THREE.Mesh(glow.build(), MAT.glow));

  const sign = nameSign(name, cuisine.style, pal);
  sign.position.set(10, 2.3, 1.03);
  root.add(sign);

  const room = { root, winMat, outsideMat, pal, locks: new Map(), releasing: [] };
  syncRoomAreas(room, state, 0);
  return room;
}

function leaseSign(name) {
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 160;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#eee1bc';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#66543a';
  ctx.lineWidth = 10;
  ctx.strokeRect(5, 5, canvas.width - 10, canvas.height - 10);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#473a2b';
  ctx.font = 'bold 52px sans-serif';
  ctx.fillText('FOR LEASE', 256, 69);
  ctx.font = '28px sans-serif';
  ctx.fillText(name, 256, 120, 460);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(2.5, 0.78), new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }));
}

/** One merged mesh per fence edge; all boards share the room's flat material. */
function lockedAreaModel(area, pal) {
  const root = new THREE.Group();
  root.position.set(area.x, 0, area.z);
  const ground = new Shape();
  const panels = [];
  const covers = [];
  ground.box(area.w - 0.08, 0.014, area.h - 0.08, area.kind === 'kitchen' ? 0x5d686b : mix(pal.floorB, 0x665b4c, 0.65), area.w / 2, 0.012, area.h / 2);
  const edges = [
    [area.w / 2, area.h - 0.09, area.w - 0.18, 0],
    [area.w / 2, 0.09, area.w - 0.18, Math.PI],
    [0.09, area.h / 2, area.h - 0.18, -Math.PI / 2],
    [area.w - 0.09, area.h / 2, area.h - 0.18, Math.PI / 2],
  ];
  for (const [x, z, length, yaw] of edges) {
    const panel = new THREE.Group();
    panel.position.set(x, 0, z);
    panel.rotation.order = 'YXZ';
    panel.rotation.y = yaw;
    const s = new Shape();
    if (area.kind === 'dining') {
      for (const y of [0.24, 0.65, 1.06]) {
        s.box(length, 0.36, 0.075, y === 0.65 ? 0xad8759 : 0xbd9869, 0, y, 0);
        s.box(length, 0.025, 0.08, 0xcba77a, 0, y + 0.16, 0);
      }
      const count = Math.ceil(length / 2);
      for (let i = 0; i <= count; i++) {
        const px = -length / 2 + i * length / count;
        s.box(0.095, 1.28, 0.13, 0x7e6343, px, 0.64, -0.02);
      }
    } else {
      // A tape border stays low, so the covered kitchen bays remain visible.
      s.box(length, 0.018, 0.13, 0xe2ba59, 0, 0.035, 0);
      for (let px = -length / 2 + 0.16; px < length / 2; px += 0.5) {
        s.box(0.23, 0.019, 0.13, 0x3f4544, px, 0.038, 0);
      }
    }
    panel.add(meshOf(s));
    root.add(panel);
    panels.push(panel);
  }
  if (area.kind === 'dining') {
    const sign = leaseSign(area.name);
    sign.position.set(0, 0.8, 0.075);
    panels[0].add(sign);
  } else {
    // Four-sided draped covers give the bay a clear silhouette at a distance.
    const count = Math.max(1, Math.floor(area.w / 2.5));
    for (let i = 0; i < count; i++) {
      const s = new Shape();
      const x = (i + 0.5) * area.w / count;
      s.cyl(0.6, 0.88, 0.85, 4, i % 2 ? 0x748c94 : 0x657e89, 0, 0.43, 0, 0, Math.PI / 4);
      s.box(1.0, 0.03, 0.78, 0x899fa5, 0, 0.87, 0);
      const cover = meshOf(s);
      cover.position.set(x, 0, area.h / 2);
      root.add(cover);
      covers.push(cover);
    }
  }
  root.add(meshOf(ground, MAT.solid, false, true));
  return { root, panels, covers, elapsed: 0 };
}

function disposeLockedArea(lock) {
  lock.root.traverse((o) => {
    if (!o.isMesh) return;
    o.geometry.dispose();
    if (o.material === MAT.solid) return;
    if (o.material.map) o.material.map.dispose();
    o.material.dispose();
  });
}

export function disposeRoomAreas(room) {
  for (const lock of [...room.locks.values(), ...room.releasing]) {
    room.root.remove(lock.root);
    disposeLockedArea(lock);
  }
  room.locks.clear();
  room.releasing.length = 0;
}

/** Area ownership is shared state, so the same transition runs on each client. */
export function syncRoomAreas(room, state, dt) {
  const areas = lockedAreas(state);
  const ids = new Set(areas.map((area) => area.id));
  for (const [id, lock] of room.locks) {
    if (ids.has(id)) continue;
    room.locks.delete(id);
    room.releasing.push(lock);
  }
  for (const area of areas) {
    if (room.locks.has(area.id)) continue;
    const lock = lockedAreaModel(area, room.pal);
    room.locks.set(area.id, lock);
    room.root.add(lock.root);
  }
  for (let i = room.releasing.length - 1; i >= 0; i--) {
    const lock = room.releasing[i];
    lock.elapsed += dt;
    const t = Math.min(1, lock.elapsed / 0.75);
    for (const panel of lock.panels) panel.rotation.x = -Math.PI / 2 * t * t;
    for (const cover of lock.covers) cover.scale.y = Math.max(0.02, 1 - t * t);
    if (t < 1) continue;
    room.root.remove(lock.root);
    disposeLockedArea(lock);
    room.releasing.splice(i, 1);
  }
}

function frame(s, x, y, z, w, h, c, face) {
  // face: +1 on the left wall (facing +x), -1 on the right wall.
  s.box(0.04, h + 0.08, w + 0.08, 0x3a2a20, x, y, z);
  s.box(0.05, h, w, c, x + face * 0.01, y, z);
  s.box(0.055, h * 0.4, w * 0.5, shade(c, 0.7), x + face * 0.012, y - h * 0.1, z + w * 0.1);
}

function plant(s, x, z, big = 1) {
  s.cyl(0.18 * big, 0.14 * big, 0.32 * big, 8, 0xb8643a, x, 0.16 * big, z);
  for (let i = 0; i < 6; i++) {
    const a = i * 1.05;
    s.sphere(0.16 * big, i % 2 ? 0x4a8a3a : 0x3a7a32, x + Math.cos(a) * 0.12 * big, 0.48 * big + (i % 3) * 0.1 * big, z + Math.sin(a) * 0.12 * big, 1, 1.2, 1, 6);
  }
}

function decor(s, glow, cuisine, pal, up) {
  const id = cuisine.id;
  const L = 1.02, R = W - 1.02;
  // Art on dining walls between windows.
  frame(s, L, 1.7, 9.0, 0.9, 0.7, pal.accent, 1);
  frame(s, R, 1.7, 9.0, 0.9, 0.7, pal.accent2, -1);
  if (id === 'southern') {
    for (const z of [6.4, 12.6]) { plant(s, 1.4, z, 0.9); }
    for (const x of [6, 10, 14]) { s.cyl(0.004, 0.004, 0.5, 3, 0x3a3a3a, x, 2.55, 9.6); glow.cyl(0.07, 0.09, 0.16, 7, 0xffe0a0, x, 2.25, 9.6); }
    for (const x of [6, 14]) {
      s.cyl(0.035, 0.035, 0.3, 7, 0x594435, x, 2.62, 10.6);
      s.cyl(0.11, 0.13, 0.08, 8, 0x6f5038, x, 2.45, 10.6);
      s.box(1.35, 0.045, 0.14, 0x7b593e, x, 2.43, 10.6, 0, 0.28);
      s.box(1.35, 0.045, 0.14, 0x7b593e, x, 2.43, 10.6, 0, Math.PI / 2 + 0.28);
    }
    s.box(0.04, 0.9, 1.3, 0x2a3a2a, R + 0.01, 1.6, 12.4);
  } else if (id === 'italian') {
    for (let i = 0; i < 18; i++) { const t = i / 17; glow.sphere(0.05, i % 3 === 0 ? 0xffe4a0 : i % 3 === 1 ? 0xfff0c8 : 0xffd080, 1.5 + t * 17, 2.6 - Math.sin(t * Math.PI) * 0.35, 6.4); }
    for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) s.cyl(0.04, 0.04, 0.3, 6, j % 2 ? 0x5a1a24 : 0x2a4a2a, R - 0.1, 0.9 + i * 0.3, 12.0 + j * 0.15, 0, 0, Math.PI / 2);
    s.box(0.04, 1.3, 0.6, 0x6a4a2a, R + 0.0, 1.35, 12.15);
    for (const x of [6, 10, 14]) { s.cyl(0.012, 0.012, 0.38, 5, 0x3b3029, x, 2.62, 10.4); glow.cone(0.17, 0.18, 10, 0xffcf82, x, 2.35, 10.4); }
    for (const z of [6.7, 11.8]) { s.box(0.045, 1.15, 0.66, 0x6d4a31, L, 1.5, z); s.torus(0.32, 0.035, pal.accent, L + 0.025, 2.05, z, 0, Math.PI / 2, 0, Math.PI, 12); }
  } else if (id === 'mexican') {
    const colors = [0xe0407a, 0xf2c030, 0x2a9a8e, 0xf07830, 0x8a4ac8];
    for (const zz of [7.0, 10.0, 12.6]) for (let i = 0; i < 16; i++) s.box(0.3, 0.3, 0.018, colors[i % 5], 2 + i * 1.05, 2.45, zz, 0, 0, Math.PI / 4);
    for (const x of [L, R]) for (let i = 0; i < 13; i++) s.box(0.045, 0.18, 0.42, colors[i % 5], x, 0.72, 6.3 + i * 0.5);
    plant(s, 1.4, 6.4, 0.8);
    s.cyl(0.14, 0.18, 0.5, 8, 0x3a8a3a, R - 0.4, 0.25, 12.8);
  } else if (id === 'diner') {
    glow.box(0.04, 0.5, 2.0, 0xff3a4a, R - 0.03, 2.2, 12.0);
    glow.box(0.04, 0.06, 2.2, 0x3ad0f0, R - 0.035, 1.9, 12.0);
    s.box(0.7, 1.4, 0.5, 0xc8282e, R - 0.4, 0.7, 6.4);
    glow.box(0.5, 0.4, 0.02, 0xffd060, R - 0.4, 1.0, 6.66);
    for (const x of [L, R]) { s.box(0.05, 0.06, 7.1, 0xc8d0d3, x, 0.8, 9.7); s.box(0.052, 0.035, 7.1, pal.accent, x, 0.88, 9.7); }
    for (const x of [5.5, 10, 14.5]) glow.box(1.8, 0.045, 0.1, 0xfff0cf, x, 2.58, 10.4);
  } else if (id === 'noodle') {
    for (const [x, z] of [[4, 8.5], [10, 8.5], [16, 8.5], [7, 11.5], [13, 11.5]]) {
      s.cyl(0.004, 0.004, 0.4, 3, 0x2a2a2a, x, 2.6, z);
      glow.sphere(0.2, 0xff5a3a, x, 2.25, z, 1, 1.25, 1, 8);
      s.cyl(0.12, 0.12, 0.04, 8, 0x2a1e18, x, 2.5, z);
    }
    // Noren curtain over the kitchen opening.
    for (let i = 0; i < 4; i++) s.box(0.48, 0.55, 0.02, i % 2 ? 0x2a4a5a : 0x24404e, 10.25 + i * 0.5, 2.0, 5.5);
    for (const x of [L, R]) for (let i = 0; i < 13; i++) s.box(0.045, 1.0, 0.055, i % 2 ? 0x68472f : 0x795239, x, 1.4, 6.3 + i * 0.52);
    for (const z of [6.6, 12.5]) { s.box(0.04, 0.82, 1.05, 0x29231f, R, 1.72, z); for (let i = 0; i < 4; i++) s.box(0.045, 0.055, 0.72, 0xd9b867, R - 0.025, 1.95 - i * 0.17, z); }
  }
  if (up.decor1) {
    plant(s, 18.3, 6.5, 1.1);
    plant(s, 18.3, 12.8, 1.0);
    frame(s, L, 1.6, 12.2, 0.7, 0.9, mix(pal.accent2, 0xffffff, 0.3), 1);
  }
  if (up.decor2) {
    for (const x of [5, 9, 13, 17]) {
      s.cyl(0.004, 0.004, 0.45, 3, 0x2a2a2a, x, 2.6, 11.2);
      glow.cone(0.16, 0.14, 8, 0xffd890, x, 2.32, 11.2);
    }
    s.box(0.25, 0.4, 0.2, 0x2a2a2a, 1.25, 2.3, 6.3);
  }
  if (up.decor3) {
    glow.sphere(0.25, 0xfff0c0, 10, 2.3, 9.2, 1, 0.6, 1, 8);
    s.cyl(0.4, 0.3, 0.1, 10, 0xc8a050, 10, 2.45, 9.2);
  }
}

/** Window color for a time of day (minutes). */
export function skyColor(clock, phase) {
  const day = 0xbfe6f6, dusk = 0xf0a070, night = 0x2a3050;
  if (phase === 'morning') return 0xd8eef8;
  if (phase === 'office') return night;
  if (clock < 17 * 60) return day;
  if (clock < 19 * 60) return mix(day, dusk, (clock - 17 * 60) / 120);
  if (clock < 20.5 * 60) return mix(dusk, night, (clock - 19 * 60) / 90);
  return night;
}
