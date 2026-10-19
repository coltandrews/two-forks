// A separate exterior scene. All solid props share the restaurant material.
import * as THREE from 'three';
import { ALLEY_SIZE, ALLEY_OBJECTS, ALLEY_OBSTACLES } from '../data/alley.js';
import { Shape, MAT, meshOf, mix, shade } from './shape.js';

const STEEL = 0x747f82, DARK = 0x323b3f, WOOD = 0x8a7661;

function addBag(s, x, y, z, scale = 1) {
  s.sphere(0.27 * scale, 0x343e3e, x, y + 0.25 * scale, z, 1.05, 1.05, 0.92, 7);
  s.cone(0.19 * scale, 0.26 * scale, 7, 0x3d4847, x, y + 0.49 * scale, z);
  s.box(0.09 * scale, 0.06 * scale, 0.08 * scale, 0x6e7770, x, y + 0.59 * scale, z);
  s.cone(0.1 * scale, 0.12 * scale, 5, 0x43504c, x, y + 0.67 * scale, z, 0, 0, 0.25);
}

export function trashBagModel() {
  const s = new Shape();
  addBag(s, 0, -0.55, 0, 0.95);
  return meshOf(s);
}

export function cigaretteModel() {
  const s = new Shape();
  s.cyl(0.018, 0.018, 0.12, 6, 0xe7d3a5, 0, 0, 0.06, Math.PI / 2);
  s.cyl(0.018, 0.018, 0.15, 6, 0xf0e9d8, 0, 0, 0.19, Math.PI / 2);
  s.cyl(0.019, 0.019, 0.025, 6, 0xe39555, 0, 0, 0.275, Math.PI / 2);
  return meshOf(s);
}

function crate(s, x, y, z, size = 0.65) {
  s.box(size, size, size, 0x8d7154, x, y + size / 2, z);
  for (const side of [-1, 1]) {
    s.box(size + 0.03, 0.08, 0.04, 0xad8e65, x, y + 0.1, z + side * size / 2);
    s.box(size + 0.03, 0.08, 0.04, 0xad8e65, x, y + size - 0.1, z + side * size / 2);
    s.box(0.065, size, 0.035, 0x6e5846, x + side * size * 0.3, y + size / 2, z + size / 2 + 0.025);
  }
}

function dumpster(s, lid, x, z) {
  s.box(1.8, 1.05, 0.87, 0x496b60, x, 0.68, z);
  s.box(1.9, 0.09, 0.96, 0x354f47, x, 1.23, z);
  for (const sx of [-0.68, 0.68]) {
    s.box(0.06, 0.86, 0.035, 0x6a8775, x + sx, 0.7, z + 0.45);
    for (const sz of [-0.3, 0.3]) s.cyl(0.1, 0.1, 0.12, 8, DARK, x + sx, 0.12, z + sz, Math.PI / 2);
  }
  s.box(0.46, 0.22, 0.018, 0xc9c4a7, x, 0.81, z + 0.452);
  s.box(0.12, 0.035, 0.025, 0x5f7962, x - 0.08, 0.82, z + 0.465, 0, 0, 0.6);
  s.box(0.12, 0.035, 0.025, 0x5f7962, x + 0.04, 0.8, z + 0.465, 0, 0, -0.6);
  const top = new Shape();
  top.box(1.94, 0.1, 1.0, 0x313f3e, 0, 0.02, 0.47);
  for (let i = 0; i < 7; i++) top.box(0.07, 0.04, 0.83, 0x4c5a55, -0.78 + i * 0.26, 0.09, 0.47);
  top.box(0.36, 0.05, 0.1, 0x6f7971, 0, 0.12, 0.83);
  lid.add(meshOf(top));
  lid.position.set(x, 1.28, z - 0.47);
}

function truck(s, x, z, accent) {
  // The truck faces down the alley. The short cab keeps the doorway clear.
  const paint = 0xddd3bc, trim = mix(accent, 0x687579, 0.65);
  s.box(2.55, 0.19, 1.65, DARK, x, 0.38, z);
  s.box(1.64, 1.62, 1.61, paint, x + 0.39, 1.29, z);
  s.box(0.8, 0.92, 1.58, paint, x - 0.84, 0.93, z);
  s.box(0.78, 0.63, 1.52, paint, x - 0.84, 1.69, z);
  s.box(0.035, 0.43, 1.32, 0x627c83, x - 1.25, 1.72, z);
  for (const side of [-1, 1]) {
    const edge = z + side * 0.82;
    s.box(0.55, 0.43, 0.025, 0x6c858a, x - 0.83, 1.72, edge);
    s.box(0.12, 0.025, 0.045, STEEL, x - 0.52, 1.31, edge);
    s.box(1.64, 0.24, 0.035, trim, x + 0.39, 1.4, edge);
    s.box(0.055, 1.53, 0.04, 0xc2bcae, x + 1.19, 1.3, edge);
    for (const wx of [-0.86, 0.83]) {
      s.cyl(0.31, 0.31, 0.2, 10, 0x2c3032, x + wx, 0.35, z + side * 0.8, Math.PI / 2);
      s.cyl(0.17, 0.17, 0.22, 8, STEEL, x + wx, 0.35, z + side * 0.82, Math.PI / 2);
    }
    s.box(0.06, 0.13, 0.19, 0xd6b875, x - 1.29, 0.92, z + side * 0.54);
    s.box(0.06, 0.12, 0.14, 0xa9543d, x + 1.24, 0.68, z + side * 0.58);
  }
  s.box(0.1, 0.15, 1.69, STEEL, x - 1.3, 0.6, z);
  s.box(0.03, 0.2, 0.68, DARK, x - 1.31, 0.86, z);
  s.box(0.04, 0.13, 0.32, 0xdad5bc, x - 1.37, 0.58, z);
  s.box(1.73, 0.08, 1.7, 0xf0e7d3, x + 0.39, 2.14, z);
}

export function buildAlley(cuisine) {
  const { width: W, height: H } = ALLEY_SIZE;
  const root = new THREE.Group(), s = new Shape(), glow = new Shape(false);
  const wall = mix(cuisine.palette.trim, 0x987667, 0.78);
  const mortar = shade(wall, 0.8), pavement = 0x78817f;
  s.box(W, 0.22, H, 0x525d60, W / 2, -0.14, H / 2);
  s.box(W - 0.6, 0.06, H - 0.6, pavement, W / 2, -0.03, H / 2);
  // Broad slabs and a drain read at the same scale as the interior floor.
  for (let x = 1; x < W - 1; x += 2) s.box(0.025, 0.008, H - 0.7, 0x656f6e, x, 0.006, H / 2);
  for (let z = 1; z < H; z += 2) s.box(W - 0.7, 0.008, 0.025, 0x656f6e, W / 2, 0.006, z);
  s.box(0.7, 0.015, 0.48, 0x434e51, 5.3, 0.035, 5.35);
  for (let i = 0; i < 7; i++) s.box(0.035, 0.02, 0.45, 0x87908c, 5.04 + i * 0.085, 0.05, 5.35);
  for (const x of [0.35, W - 0.65]) s.box(0.3, 0.18, H - 0.2, 0xa0a394, x, 0.05, H / 2);
  s.box(W, 0.15, 0.25, 0xa0a394, W / 2, 0.04, H - 0.2);

  // Right-hand wall is the restaurant exterior. Its door matches the sim tile.
  s.box(0.65, 3.55, H, wall, W - 0.35, 1.775, H / 2);
  s.box(0.7, 0.22, H, 0xc0b49b, W - 0.35, 3.55, H / 2);
  s.box(0.69, 0.4, H, 0x746e63, W - 0.35, 0.2, H / 2);
  for (let y = 0.55; y < 3.5; y += 0.3) {
    s.box(0.012, 0.02, H - 0.1, mortar, W - 0.682, y, H / 2);
    for (let z = 0.5 + (Math.round(y * 10) % 2) * 0.32; z < H; z += 0.75) s.box(0.015, 0.27, 0.02, mortar, W - 0.685, y + 0.15, z);
  }
  const door = ALLEY_OBJECTS.find((o) => o.type === 'backdoor');
  const dz = door.z + 0.5, dx = W - 0.72;
  s.box(0.07, 2.28, 1.14, 0x3c4c4b, dx, 1.14, dz);
  s.box(0.095, 0.1, 1.3, 0xd2c5a5, dx - 0.025, 2.3, dz);
  for (const side of [-1, 1]) s.box(0.095, 2.3, 0.1, 0xd2c5a5, dx - 0.025, 1.15, dz + side * 0.62);
  s.box(0.11, 0.06, 0.46, STEEL, dx - 0.06, 1.03, dz);
  s.box(0.42, 0.08, 1.32, 0xaaa68e, dx - 0.16, 0.055, dz);
  s.box(0.08, 0.32, 0.3, 0x263c41, dx - 0.045, 1.83, dz);
  // Pipework, meter, and wall-mounted extraction fan.
  for (const z of [0.8, 6.85]) {
    s.cyl(0.055, 0.055, 3.2, 7, 0x6b7675, W - 0.82, 1.65, z);
    for (const y of [0.55, 1.8, 2.9]) s.box(0.16, 0.06, 0.17, 0x4e5b5d, W - 0.79, y, z);
  }
  s.box(0.26, 0.6, 0.45, 0xa1aaa3, W - 0.84, 1.28, 5.1);
  s.cyl(0.13, 0.13, 0.05, 10, 0xd2d4bd, W - 1, 1.35, 5.1, 0, 0, Math.PI / 2);
  s.box(0.25, 0.72, 1.05, 0x717c7a, W - 0.8, 2.65, 1.7);
  for (let i = 0; i < 6; i++) s.box(0.035, 0.035, 0.86, 0x3b4848, W - 0.95, 2.4 + i * 0.1, 1.7);
  const lights = [];
  for (const z of [3.5, 6.2]) {
    s.box(0.18, 0.12, 0.32, 0x3a4446, W - 0.79, 2.72, z);
    s.box(0.38, 0.08, 0.4, 0x47514e, W - 0.92, 2.68, z);
    glow.box(0.22, 0.075, 0.27, 0xffd79b, W - 0.92, 2.61, z);
    const light = new THREE.PointLight(0xffd7a1, 3, 4.5, 2);
    light.position.set(W - 1.1, 2.5, z);
    root.add(light); lights.push(light);
  }

  // Timber end fence and a low side wall enclose the yard without hiding play.
  s.box(W - 0.9, 0.11, 0.12, 0x645849, W / 2 - 0.2, 0.55, 0.55);
  s.box(W - 0.9, 0.11, 0.12, 0x645849, W / 2 - 0.2, 1.45, 0.55);
  for (let x = 0.5; x < W - 0.7; x += 0.33) s.box(0.29, 1.85, 0.08, shade(WOOD, 0.93 + (Math.round(x * 10) % 3) * 0.05), x, 0.95, 0.43);
  for (let x = 0.5; x < W - 0.5; x += 2.6) s.box(0.14, 2.0, 0.17, 0x675c4e, x, 1, 0.5);
  s.box(0.5, 0.66, H - 0.7, wall, 0.4, 0.33, H / 2);
  s.box(0.57, 0.1, H - 0.65, 0xa69e89, 0.4, 0.71, H / 2);

  const bin = ALLEY_OBJECTS.find((o) => o.type === 'dumpster'), lid = new THREE.Group();
  dumpster(s, lid, bin.x + bin.w / 2, bin.z + 0.5);
  root.add(lid);
  addBag(s, 1.5, 0.05, 1.48, 0.8);
  const smoke = ALLEY_OBJECTS.find((o) => o.type === 'smoking');
  s.cyl(0.17, 0.23, 0.12, 10, DARK, smoke.x + 0.5, 0.08, smoke.z + 0.5);
  s.cyl(0.055, 0.055, 0.89, 8, STEEL, smoke.x + 0.5, 0.56, smoke.z + 0.5);
  s.cyl(0.18, 0.14, 0.09, 10, STEEL, smoke.x + 0.5, 1.04, smoke.z + 0.5);
  s.cyl(0.13, 0.13, 0.012, 10, 0x3b4241, smoke.x + 0.5, 1.09, smoke.z + 0.5);
  const van = ALLEY_OBSTACLES.find((o) => o.type === 'truck');
  truck(s, van.x + van.w / 2, van.z + van.h / 2, cuisine.palette.accent);
  const boxes = ALLEY_OBSTACLES.find((o) => o.type === 'crates');
  crate(s, boxes.x + 0.5, 0.06, boxes.z + 0.5);
  crate(s, boxes.x + 0.5, 0.71, boxes.z + 0.5, 0.55);
  crate(s, boxes.x + 0.5, 0.06, boxes.z + 1.4, 0.7);
  for (const [x, z] of [[0.9, 2.8], [4.8, 0.8], [10.8, 7.25], [0.9, 6.9]]) {
    for (let i = 0; i < 4; i++) s.cone(0.035, 0.24 + i * 0.03, 3, i % 2 ? 0x6a7955 : 0x839168, x + (i - 1.5) * 0.055, 0.16, z, 0.15, i, (i - 1.5) * 0.25);
  }
  // Small, grounded litter and pavement repairs keep the main path readable.
  for (const [x, z, turn] of [[4.3, 1.2, 0.4], [1.1, 4, -0.3], [7.4, 6.8, 0.9]]) s.box(0.2, 0.012, 0.15, 0xc4bda5, x, 0.01, z, 0, turn);
  s.box(1.4, 0.008, 0.9, 0x6d7777, 4.7, 0.006, 3.4, 0, 0.1);
  root.add(meshOf(s), meshOf(glow, MAT.glow, false, false));
  root.visible = false;
  return { root, lights, lid };
}
