// Food, plates, drinks, boxes. Every held or placed item gets a merged mesh
// built from its signature and cached, so identical items share geometry.
import * as THREE from 'three';
import { Shape, MAT, shade } from './shape.js';
import { ING, stateInfo } from '../data/ingredients.js';
import { CUISINES } from '../data/cuisines.js';
import { itemSig } from '../sim/items.js';

const WHITE = 0xf6f3ec, RIM = 0xe2ddd2, STEEL = 0xc5cbd0, CARD = 0xc8995c, CARD_D = 0xa87a44;

/** Adds one ingredient shape resting on y, centered on x/z, scaled by k. */
export function addIng(s, shape, c, x, y, z, k = 1) {
  const d = shade(c, 0.78), l = shade(c, 1.18);
  switch (shape) {
    case 'patty': s.cyl(0.15 * k, 0.15 * k, 0.06 * k, 9, c, x, y + 0.03 * k, z); break;
    case 'steak': s.add(new THREE.CylinderGeometry(0.15 * k, 0.15 * k, 0.06 * k, 7), c, x, y + 0.03 * k, z, 0, 0.4, 0, 1.35, 1, 0.85); s.box(0.03 * k, 0.065 * k, 0.12 * k, d, x - 0.05 * k, y + 0.03 * k, z); break;
    case 'breast': s.sphere(0.13 * k, c, x, y + 0.05 * k, z, 1.35, 0.45, 0.9); break;
    case 'cutlet': s.sphere(0.14 * k, c, x, y + 0.05 * k, z, 1.3, 0.38, 1); s.sphere(0.12 * k, l, x + 0.02 * k, y + 0.07 * k, z, 1.1, 0.25, 0.8); break;
    case 'drums': for (const o of [-1, 1]) { s.sphere(0.09 * k, c, x + o * 0.08 * k, y + 0.07 * k, z, 1, 0.85, 1.35); s.cyl(0.025 * k, 0.025 * k, 0.12 * k, 5, 0xf2e6d0, x + o * 0.08 * k, y + 0.06 * k, z + 0.15 * k, Math.PI / 2); } break;
    case 'shrimp': for (const o of [-1, 0, 1]) s.torus(0.06 * k, 0.03 * k, c, x + o * 0.08 * k, y + 0.03 * k, z + Math.abs(o) * 0.04 * k, Math.PI / 2, 0, o, Math.PI * 1.4, 7); break;
    case 'tempura': for (const o of [-1, 1]) { s.cyl(0.05 * k, 0.04 * k, 0.24 * k, 6, c, x + o * 0.06 * k, y + 0.05 * k, z, Math.PI / 2, o * 0.3); s.cone(0.04 * k, 0.06 * k, 4, 0xe85a30, x + o * 0.06 * k + o * 0.035 * k, y + 0.05 * k, z - 0.14 * k, -Math.PI / 2); } break;
    case 'fillet': s.box(0.28 * k, 0.06 * k, 0.15 * k, c, x, y + 0.03 * k, z); s.box(0.26 * k, 0.012 * k, 0.03 * k, l, x, y + 0.062 * k, z); break;
    case 'strips': for (let i = 0; i < 3; i++) s.box(0.26 * k, 0.025 * k, 0.05 * k, i % 2 ? l : c, x, y + 0.015 * k + i * 0.004 * k, z + (i - 1) * 0.065 * k, 0, (i - 1) * 0.12); break;
    case 'sausage': s.cyl(0.05 * k, 0.05 * k, 0.3 * k, 7, c, x, y + 0.05 * k, z, 0, 0, Math.PI / 2); s.sphere(0.05 * k, c, x + 0.15 * k, y + 0.05 * k, z); s.sphere(0.05 * k, c, x - 0.15 * k, y + 0.05 * k, z); break;
    case 'coins': for (let i = 0; i < 6; i++) s.cyl(0.045 * k, 0.045 * k, 0.025 * k, 7, i % 2 ? c : d, x + Math.cos(i * 1.7) * 0.09 * k, y + 0.013 * k + (i > 3 ? 0.02 * k : 0), z + Math.sin(i * 1.7) * 0.07 * k); break;
    case 'egg': s.sphere(0.07 * k, c, x, y + 0.08 * k, z, 0.85, 1.15, 0.85); break;
    case 'friedEgg': s.cyl(0.13 * k, 0.13 * k, 0.015 * k, 9, c, x, y + 0.008 * k, z); s.sphere(0.045 * k, 0xf4b42a, x + 0.02 * k, y + 0.02 * k, z, 1, 0.6, 1); break;
    case 'halfEgg': for (const o of [-1, 1]) { s.sphere(0.06 * k, c, x + o * 0.065 * k, y + 0.02 * k, z, 1, 0.55, 1.2); s.sphere(0.03 * k, 0xf0a020, x + o * 0.065 * k, y + 0.045 * k, z, 1, 0.5, 1); } break;
    case 'block': s.box(0.2 * k, 0.1 * k, 0.14 * k, c, x, y + 0.05 * k, z); break;
    case 'cubes': for (let i = 0; i < 7; i++) s.box(0.06 * k, 0.06 * k, 0.06 * k, i % 3 ? c : d, x + Math.cos(i * 2.3) * 0.08 * k, y + 0.03 * k + (i > 4 ? 0.05 * k : 0), z + Math.sin(i * 2.3) * 0.07 * k, 0, i); break;
    case 'roast': s.sphere(0.15 * k, c, x, y + 0.08 * k, z, 1.3, 0.75, 1); s.torus(0.13 * k, 0.012 * k, 0xf0e6d0, x, y + 0.08 * k, z, 0, Math.PI / 2, 0, Math.PI * 2, 8); break;
    case 'slabs': for (let i = 0; i < 4; i++) s.box(0.06 * k, 0.07 * k, 0.17 * k, i % 2 ? c : l, x + (i - 1.5) * 0.055 * k, y + 0.035 * k, z, 0, 0, -0.3); break;
    case 'balls': for (let i = 0; i < 4; i++) s.sphere(0.06 * k, c, x + (i % 2 - 0.5) * 0.12 * k, y + 0.055 * k + (i > 1 ? 0.0 : 0), z + ((i >> 1) - 0.5) * 0.12 * k); break;
    case 'carton': s.box(0.22 * k, 0.24 * k, 0.12 * k, c, x, y + 0.12 * k, z); s.box(0.226 * k, 0.07 * k, 0.126 * k, 0xf4f0e8, x, y + 0.13 * k, z); break;
    case 'tenders': for (let i = 0; i < 4; i++) s.sphere(0.05 * k, i % 2 ? c : l, x + (i - 1.5) * 0.06 * k, y + 0.04 * k, z, 0.8, 0.6, 2.2, 6, (i - 1.5) * 0.2); break;
    case 'dumplings': for (let i = 0; i < 5; i++) { s.sphere(0.055 * k, c, x + (i - 2) * 0.065 * k, y + 0.035 * k, z, 0.9, 0.7, 1.3); s.box(0.1 * k, 0.012 * k, 0.12 * k, shade(c, 0.6), x + (i - 2) * 0.065 * k, y + 0.006 * k, z); } break;
    case 'pods': for (let i = 0; i < 6; i++) s.sphere(0.03 * k, i % 2 ? c : d, x + Math.cos(i) * 0.08 * k, y + 0.025 * k, z + Math.sin(i * 1.3) * 0.07 * k, 1, 0.8, 3, 5, i); break;
    case 'cheese': s.add(new THREE.CylinderGeometry(0.15 * k, 0.15 * k, 0.1 * k, 3, 1, false, 0, Math.PI / 2.2), c, x - 0.04 * k, y + 0.05 * k, z - 0.04 * k); break;
    case 'ball': s.sphere(0.1 * k, c, x, y + 0.09 * k, z, 1, 0.9, 1); break;
    case 'butter': s.box(0.14 * k, 0.07 * k, 0.09 * k, c, x, y + 0.035 * k, z); s.box(0.145 * k, 0.02 * k, 0.095 * k, 0xf8f4e8, x, y + 0.02 * k, z); break;
    case 'jar': s.cyl(0.07 * k, 0.07 * k, 0.16 * k, 8, c, x, y + 0.08 * k, z); s.cyl(0.072 * k, 0.072 * k, 0.04 * k, 8, 0xd8d0c0, x, y + 0.17 * k, z); break;
    case 'onion': s.sphere(0.09 * k, c, x, y + 0.09 * k, z, 1, 0.95, 1); s.cone(0.03 * k, 0.06 * k, 5, d, x, y + 0.2 * k, z); break;
    case 'garlic': s.sphere(0.07 * k, c, x, y + 0.06 * k, z, 1, 0.85, 1); s.cone(0.025 * k, 0.05 * k, 5, c, x, y + 0.14 * k, z); break;
    case 'tomato': s.sphere(0.09 * k, c, x, y + 0.085 * k, z, 1, 0.9, 1); s.cone(0.04 * k, 0.02 * k, 5, 0x3a8a3a, x, y + 0.17 * k, z); break;
    case 'slices': for (let i = 0; i < 3; i++) s.cyl(0.065 * k, 0.065 * k, 0.02 * k, 8, i % 2 ? d : c, x + (i - 1) * 0.07 * k, y + 0.01 * k + i * 0.012 * k, z + (i - 1) * 0.02 * k, 0.15, 0, 0); break;
    case 'lettuce': s.ico(0.12 * k, c, x, y + 0.1 * k, z, 0.85, 0.3, 3); s.ico(0.08 * k, l, x + 0.03 * k, y + 0.16 * k, z, 0.8, 0.3, 5); break;
    case 'leaves': for (let i = 0; i < 6; i++) s.box(0.08 * k, 0.02 * k, 0.06 * k, i % 2 ? c : l, x + Math.cos(i * 2.1) * 0.08 * k, y + 0.012 * k + (i % 3) * 0.012 * k, z + Math.sin(i * 2.1) * 0.08 * k, 0.2, i, 0.1); break;
    case 'potato': s.sphere(0.1 * k, c, x, y + 0.07 * k, z, 1.3, 0.8, 1, 6); break;
    case 'mash': s.sphere(0.13 * k, c, x, y + 0.02 * k, z, 1, 0.55, 1); s.sphere(0.05 * k, l, x, y + 0.08 * k, z, 1, 0.6, 1); break;
    case 'pepper': s.sphere(0.09 * k, c, x, y + 0.09 * k, z, 1, 1.05, 1, 6); s.cyl(0.015 * k, 0.015 * k, 0.05 * k, 4, 0x3a7a2a, x, y + 0.2 * k, z); break;
    case 'mushroom': for (const o of [-1, 1]) { s.cyl(0.025 * k, 0.03 * k, 0.07 * k, 5, 0xf0e8dc, x + o * 0.07 * k, y + 0.035 * k, z); s.sphere(0.065 * k, c, x + o * 0.07 * k, y + 0.075 * k, z, 1, 0.6, 1); } break;
    case 'pile': s.cone(0.13 * k, 0.09 * k, 7, c, x, y + 0.045 * k, z); s.sphere(0.04 * k, l, x + 0.03 * k, y + 0.06 * k, z + 0.02 * k); break;
    case 'citrus': s.sphere(0.075 * k, c, x, y + 0.07 * k, z, 1.1, 0.95, 0.95); break;
    case 'wedge': for (const o of [-1, 1]) s.add(new THREE.CylinderGeometry(0.08 * k, 0.08 * k, 0.05 * k, 6, 1, false, 0, Math.PI / 3), c, x + o * 0.05 * k, y + 0.03 * k, z, Math.PI / 2, o, 0); break;
    case 'avocado': s.sphere(0.09 * k, c, x, y + 0.1 * k, z, 0.9, 1.2, 0.9); break;
    case 'herbs': for (let i = 0; i < 5; i++) { s.cyl(0.008 * k, 0.008 * k, 0.12 * k, 3, 0x4a7a2a, x + (i - 2) * 0.02 * k, y + 0.06 * k, z, 0, 0, (i - 2) * 0.15); s.sphere(0.04 * k, i % 2 ? c : shade(c, 1.25), x + (i - 2) * 0.035 * k, y + 0.14 * k, z, 1, 0.8, 1, 5); } break;
    case 'banana': s.torus(0.12 * k, 0.035 * k, c, x, y + 0.04 * k, z + 0.06 * k, Math.PI / 2, 0, 0, Math.PI * 0.8, 8); break;
    case 'scallion': for (let i = 0; i < 3; i++) { s.cyl(0.012 * k, 0.012 * k, 0.26 * k, 4, i % 2 ? c : 0xe8f0d0, x, y + 0.015 * k, z + (i - 1) * 0.03 * k, 0, 0, Math.PI / 2); } break;
    case 'corn': s.cyl(0.055 * k, 0.05 * k, 0.26 * k, 8, c, x, y + 0.055 * k, z, 0, 0, Math.PI / 2); s.cone(0.05 * k, 0.08 * k, 5, 0x9ab858, x + 0.16 * k, y + 0.055 * k, z, 0, 0, -Math.PI / 2); break;
    case 'cucumber': s.cyl(0.045 * k, 0.045 * k, 0.28 * k, 7, c, x, y + 0.045 * k, z, 0, 0, Math.PI / 2); break;
    case 'bun': s.cyl(0.13 * k, 0.13 * k, 0.04 * k, 9, l, x, y + 0.02 * k, z); s.sphere(0.13 * k, c, x, y + 0.05 * k, z, 1, 0.5, 1, 9); break;
    case 'bread': s.box(0.2 * k, 0.03 * k, 0.2 * k, l, x, y + 0.015 * k, z); s.box(0.21 * k, 0.034 * k, 0.03 * k, d, x, y + 0.015 * k, z - 0.1 * k); s.box(0.2 * k, 0.03 * k, 0.2 * k, c, x + 0.01 * k, y + 0.045 * k, z + 0.01 * k); break;
    case 'pasta': s.box(0.28 * k, 0.04 * k, 0.07 * k, c, x, y + 0.02 * k, z); s.box(0.2 * k, 0.045 * k, 0.075 * k, 0x2a5aa8, x, y + 0.02 * k, z); break;
    case 'nest': s.torus(0.08 * k, 0.04 * k, c, x, y + 0.04 * k, z, Math.PI / 2, 0, 0, Math.PI * 2, 9); s.sphere(0.07 * k, l, x, y + 0.04 * k, z, 1, 0.5, 1); break;
    case 'sack': s.box(0.2 * k, 0.24 * k, 0.14 * k, c, x, y + 0.12 * k, z); s.box(0.12 * k, 0.05 * k, 0.1 * k, d, x, y + 0.26 * k, z); s.box(0.21 * k, 0.06 * k, 0.145 * k, 0xc89a50, x, y + 0.12 * k, z); break;
    case 'dome': s.sphere(0.12 * k, c, x, y + 0.01 * k, z, 1, 0.75, 1, 8); break;
    case 'tortilla': for (let i = 0; i < 3; i++) s.cyl(0.14 * k, 0.14 * k, 0.012 * k, 10, i % 2 ? d : c, x, y + 0.006 * k + i * 0.013 * k, z); break;
    case 'dough': s.cyl(0.19 * k, 0.19 * k, 0.03 * k, 12, c, x, y + 0.015 * k, z); break;
    case 'pizza': s.cyl(0.2 * k, 0.2 * k, 0.03 * k, 12, c, x, y + 0.015 * k, z); s.torus(0.19 * k, 0.025 * k, shade(c, 0.85), x, y + 0.03 * k, z, Math.PI / 2, 0, 0, Math.PI * 2, 12); break;
    case 'can': s.cyl(0.075 * k, 0.075 * k, 0.18 * k, 8, STEEL, x, y + 0.09 * k, z); s.cyl(0.077 * k, 0.077 * k, 0.11 * k, 8, c, x, y + 0.09 * k, z); break;
    case 'liquid': s.cyl(0.13 * k, 0.09 * k, 0.1 * k, 9, 0xe8e4dc, x, y + 0.05 * k, z); s.cyl(0.12 * k, 0.12 * k, 0.01 * k, 9, c, x, y + 0.1 * k, z); break;
    case 'noodleBlock': s.box(0.18 * k, 0.07 * k, 0.14 * k, c, x, y + 0.035 * k, z); s.box(0.182 * k, 0.02 * k, 0.142 * k, 0xc83a2a, x, y + 0.035 * k, z); break;
    case 'bottle': s.cyl(0.05 * k, 0.05 * k, 0.18 * k, 7, c, x, y + 0.09 * k, z); s.cyl(0.02 * k, 0.04 * k, 0.07 * k, 6, c, x, y + 0.21 * k, z); s.cyl(0.022 * k, 0.022 * k, 0.03 * k, 6, 0xc83a2a, x, y + 0.255 * k, z); break;
    case 'chips': for (let i = 0; i < 8; i++) s.add(new THREE.CylinderGeometry(0.05 * k, 0.05 * k, 0.01 * k, 3), i % 2 ? c : l, x + Math.cos(i * 2.4) * 0.08 * k, y + 0.01 * k + (i % 3) * 0.015 * k, z + Math.sin(i * 2.4) * 0.07 * k, 0.3 * (i % 3), i); break;
    case 'sticks': for (let i = 0; i < 9; i++) s.box(0.025 * k, 0.025 * k, 0.16 * k, i % 3 ? c : l, x + (i % 5 - 2) * 0.035 * k, y + 0.015 * k + (i > 4 ? 0.025 * k : 0), z, 0.1 * (i % 2), (i - 4) * 0.15, 0); break;
    case 'rings': for (let i = 0; i < 4; i++) s.torus(0.055 * k, 0.022 * k, i % 2 ? c : d, x + (i % 2 - 0.5) * 0.1 * k, y + 0.022 * k + (i >> 1) * 0.035 * k, z + ((i >> 1) - 0.5) * 0.06 * k, Math.PI / 2, 0, 0, Math.PI * 2, 8); break;
    case 'biscuits': for (let i = 0; i < 3; i++) s.cyl(0.06 * k, 0.065 * k, 0.07 * k, 8, i === 2 ? l : c, x + (i - 1) * 0.08 * k, y + 0.035 * k + (i === 2 ? 0.0 : 0), z + (i === 1 ? 0.05 * k : 0)); break;
    case 'pancakes': for (let i = 0; i < 3; i++) s.cyl(0.13 * k, 0.13 * k, 0.03 * k, 10, i % 2 ? d : c, x, y + 0.015 * k + i * 0.032 * k, z); break;
    case 'scoop': s.sphere(0.08 * k, c, x, y + 0.07 * k, z, 1, 0.9, 1); break;
    case 'pie': s.add(new THREE.CylinderGeometry(0.17 * k, 0.17 * k, 0.07 * k, 4, 1, false, 0, Math.PI / 3), c, x - 0.05 * k, y + 0.035 * k, z + 0.05 * k); break;
    case 'cake': s.box(0.16 * k, 0.11 * k, 0.12 * k, c, x, y + 0.055 * k, z); s.box(0.162 * k, 0.02 * k, 0.122 * k, shade(c, 0.7), x, y + 0.07 * k, z); break;
    case 'mochi': for (let i = 0; i < 3; i++) s.sphere(0.055 * k, [c, 0xf4ecd0, 0xb8d8a0][i], x + (i - 1) * 0.08 * k, y + 0.05 * k, z, 1, 0.85, 1); break;
    default: s.box(0.15 * k, 0.12 * k, 0.15 * k, c, x, y + 0.06 * k, z);
  }
}

const LIQUIDS = new Set(['broth', 'tomato_soup', 'curry']);
const STACK_BASES = { bun: 'burger', bread: 'sandwich' };

function addIngItem(s, it, x, y, z, k) {
  const info = stateInfo(it.ing, it.st);
  addIng(s, info.shape, info.color, x, y, z, k);
  if (it.top && it.top.length) {
    const r = 0.11 * k;
    it.top.forEach((t, i) => {
      const ti = stateInfo(t.ing, t.st);
      const a = (i / it.top.length) * Math.PI * 2 + 0.4;
      if (t.ing === 'tomatoes') s.cyl(0.165 * k, 0.165 * k, 0.012 * k, 12, ti.color, x, y + 0.036 * k, z);
      else if (t.ing === 'mozzarella') for (let j = 0; j < 5; j++) s.cyl(0.04 * k, 0.04 * k, 0.012 * k, 6, it.st === 'raw' ? 0xfaf6ea : 0xf4e4b0, x + Math.cos(j * 1.3 + i) * r, y + 0.045 * k, z + Math.sin(j * 1.3 + i) * r);
      else for (let j = 0; j < 4; j++) s.box(0.04 * k, 0.015 * k, 0.04 * k, ti.color, x + Math.cos(a + j * 1.6) * r * 0.9, y + 0.05 * k, z + Math.sin(a + j * 1.6) * r * 0.9, 0, j);
    });
  }
}

/** A flat layer used when stacking a burger or sandwich. Returns its height. */
function layer(s, it, x, y, z, k) {
  const info = stateInfo(it.ing, it.st);
  const c = info.color;
  switch (info.shape) {
    case 'patty': case 'steak': s.cyl(0.14 * k, 0.14 * k, 0.05 * k, 9, c, x, y + 0.025 * k, z); return 0.05 * k;
    case 'cheese': s.box(0.25 * k, 0.012 * k, 0.25 * k, c, x, y + 0.006 * k, z, 0, 0.4, 0); return 0.012 * k;
    case 'leaves': case 'lettuce': s.cyl(0.16 * k, 0.15 * k, 0.025 * k, 7, c, x, y + 0.012 * k, z); return 0.025 * k;
    case 'slices': s.cyl(0.12 * k, 0.12 * k, 0.02 * k, 8, c, x, y + 0.01 * k, z); return 0.02 * k;
    case 'strips': for (let i = 0; i < 2; i++) s.box(0.28 * k, 0.015 * k, 0.05 * k, c, x, y + 0.008 * k + i * 0.01 * k, z + (i - 0.5) * 0.06 * k, 0, 0.3); return 0.025 * k;
    case 'pile': s.cyl(0.12 * k, 0.13 * k, 0.025 * k, 7, c, x, y + 0.012 * k, z); return 0.025 * k;
    case 'friedEgg': s.cyl(0.14 * k, 0.14 * k, 0.015 * k, 9, c, x, y + 0.008 * k, z); s.sphere(0.04 * k, 0xf4b42a, x, y + 0.015 * k, z, 1, 0.5, 1); return 0.02 * k;
    default: addIng(s, info.shape, c, x, y, z, k * 0.7); return 0.04 * k;
  }
}

function plateBase(s, bowl, k) {
  if (bowl) {
    s.add(new THREE.CylinderGeometry(0.2 * k, 0.12 * k, 0.12 * k, 12, 1, true), WHITE, 0, 0.06 * k, 0);
    s.add(new THREE.CylinderGeometry(0.195 * k, 0.115 * k, 0.118 * k, 12, 1, true), RIM, 0, 0.061 * k, 0, Math.PI);
    s.cyl(0.12 * k, 0.12 * k, 0.01 * k, 12, WHITE, 0, 0.005 * k, 0);
    return 0.02 * k;
  }
  s.cyl(0.25 * k, 0.2 * k, 0.025 * k, 14, WHITE, 0, 0.0125 * k, 0);
  s.cyl(0.18 * k, 0.18 * k, 0.004 * k, 14, RIM, 0, 0.026 * k, 0);
  return 0.028 * k;
}

/** Arranges a plate's contents: stacked burgers, bowls, tacos, pizza, or a plated meal. */
function plateShape(s, plate, k) {
  const items = plate.items;
  const liquid = items.find((i) => LIQUIDS.has(i.ing));
  const bunBase = items.find((i) => STACK_BASES[i.ing]);
  const tort = items.find((i) => i.ing === 'tortillas');
  const pizza = items.find((i) => ING[i.ing] && ING[i.ing].container);
  const sideLiquid = bunBase && liquid;
  const bowl = (!!liquid && !sideLiquid) || (items.some((i) => i.ing === 'rice' || i.ing === 'grits') && items.length > 2);
  let y = plateBase(s, bowl, k);
  if (!items.length) return;
  if (pizza) {
    addIngItem(s, pizza, 0, y, 0, k * 1.05);
    const rest = items.filter((i) => i !== pizza);
    rest.forEach((it, i) => addIngItem(s, it, (i - (rest.length - 1) / 2) * 0.1 * k, y + 0.05 * k, 0.05 * k, k * 0.45));
    return;
  }
  if (bunBase) {
    // Bottom half, fillings, top half.
    const base = bunBase;
    const info = stateInfo(base.ing, base.st);
    const others = items.filter((i) => i !== base && i !== sideLiquid);
    const ox = sideLiquid ? -0.07 * k : 0;
    if (base.ing === 'bun') s.cyl(0.13 * k, 0.13 * k, 0.045 * k, 9, shade(info.color, 1.15), ox, y + 0.022 * k, 0);
    else s.box(0.22 * k, 0.035 * k, 0.22 * k, info.color, ox, y + 0.017 * k, 0);
    let h = y + (base.ing === 'bun' ? 0.045 : 0.035) * k;
    for (const it of others) h += layer(s, it, ox, h, 0, k);
    if (base.ing === 'bun') s.sphere(0.135 * k, info.color, ox, h, 0, 1, 0.55, 1, 9);
    else s.box(0.22 * k, 0.035 * k, 0.22 * k, shade(info.color, 1.08), ox, h + 0.017 * k, 0, 0, 0.2, 0);
    if (sideLiquid) {
      const li = stateInfo(sideLiquid.ing, sideLiquid.st);
      s.cyl(0.08 * k, 0.06 * k, 0.07 * k, 9, WHITE, 0.16 * k, y + 0.035 * k, 0.05 * k);
      s.cyl(0.075 * k, 0.075 * k, 0.01 * k, 9, li.color, 0.16 * k, y + 0.07 * k, 0.05 * k);
    }
    return;
  }
  if (tort) {
    const fill = items.filter((i) => i !== tort);
    for (let t = 0; t < 2; t++) {
      const tx = (t - 0.5) * 0.17 * k;
      s.add(new THREE.CylinderGeometry(0.09 * k, 0.09 * k, 0.2 * k, 8, 1, true, Math.PI / 2, Math.PI), stateInfo(tort.ing, tort.st).color, tx, y + 0.08 * k, 0, Math.PI / 2, 0, 0);
      fill.forEach((it, i) => {
        const c = stateInfo(it.ing, it.st).color;
        s.box(0.09 * k, 0.04 * k, 0.16 * k, c, tx + ((i % 3) - 1) * 0.025 * k, y + 0.09 * k + i * 0.012 * k, 0, 0, 0, 0);
      });
    }
    return;
  }
  if (bowl) {
    const base = liquid || items[0];
    const bi = stateInfo(base.ing, base.st);
    s.cyl(0.18 * k, 0.18 * k, 0.012 * k, 12, bi.color, 0, 0.095 * k, 0);
    const others = items.filter((i) => i !== base);
    others.forEach((it, i) => {
      const a = (i / Math.max(1, others.length)) * Math.PI * 2 + 0.6;
      addIngItem(s, it, Math.cos(a) * 0.08 * k, 0.1 * k, Math.sin(a) * 0.08 * k, k * 0.55);
    });
    return;
  }
  if (items.length === 1) { addIngItem(s, items[0], 0, y, 0, k * 0.9); return; }
  items.forEach((it, i) => {
    const a = (i / items.length) * Math.PI * 2 + 0.3;
    const r = items.length > 2 ? 0.1 * k : 0.08 * k;
    addIngItem(s, it, Math.cos(a) * r, y, Math.sin(a) * r, k * 0.62);
  });
}

function drinkShape(s, color, glass, k) {
  const G = 0xdfe9ee;
  switch (glass) {
    case 'mug':
      s.cyl(0.07 * k, 0.065 * k, 0.14 * k, 9, 0xf2ece0, 0, 0.07 * k, 0);
      s.torus(0.04 * k, 0.015 * k, 0xf2ece0, 0.08 * k, 0.075 * k, 0, 0, 0, 0, Math.PI * 2, 6);
      s.cyl(0.062 * k, 0.062 * k, 0.01 * k, 9, color, 0, 0.14 * k, 0);
      break;
    case 'cup':
      s.cyl(0.06 * k, 0.045 * k, 0.08 * k, 9, 0xf4f0e8, 0, 0.04 * k, 0);
      s.cyl(0.055 * k, 0.055 * k, 0.008 * k, 9, color, 0, 0.078 * k, 0);
      s.cyl(0.1 * k, 0.1 * k, 0.01 * k, 10, 0xf4f0e8, 0, 0.005 * k, 0);
      break;
    case 'bottle':
      s.cyl(0.05 * k, 0.05 * k, 0.2 * k, 8, color, 0, 0.1 * k, 0);
      s.cyl(0.022 * k, 0.045 * k, 0.09 * k, 7, color, 0, 0.245 * k, 0);
      s.cyl(0.051 * k, 0.051 * k, 0.07 * k, 8, 0xf4ecd8, 0, 0.11 * k, 0);
      break;
    case 'wine':
      s.cyl(0.05 * k, 0.05 * k, 0.008 * k, 8, G, 0, 0.004 * k, 0);
      s.cyl(0.01 * k, 0.01 * k, 0.1 * k, 5, G, 0, 0.055 * k, 0);
      s.sphere(0.065 * k, color, 0, 0.15 * k, 0, 1, 0.9, 1, 8);
      s.cyl(0.06 * k, 0.065 * k, 0.05 * k, 8, G, 0, 0.2 * k, 0);
      break;
    case 'cocktail':
      s.cyl(0.05 * k, 0.05 * k, 0.008 * k, 8, G, 0, 0.004 * k, 0);
      s.cyl(0.01 * k, 0.01 * k, 0.08 * k, 5, G, 0, 0.045 * k, 0);
      s.cone(0.09 * k, 0.09 * k, 9, color, 0, 0.13 * k, 0, Math.PI);
      s.add(new THREE.CylinderGeometry(0.04 * k, 0.04 * k, 0.012 * k, 6, 1, false, 0, Math.PI), 0x7ac040, 0.07 * k, 0.17 * k, 0, Math.PI / 2, 0, 0);
      break;
    default:
      s.cyl(0.065 * k, 0.055 * k, 0.2 * k, 9, G, 0, 0.1 * k, 0);
      s.cyl(0.058 * k, 0.05 * k, 0.17 * k, 9, color, 0, 0.09 * k, 0);
      s.cyl(0.008 * k, 0.008 * k, 0.12 * k, 4, 0xe85a5a, 0.03 * k, 0.22 * k, 0, 0, 0, 0.25);
  }
}

function boxShape(s, ing, k) {
  const d = ING[ing];
  s.box(0.42 * k, 0.3 * k, 0.34 * k, CARD, 0, 0.15 * k, 0);
  // Keep tape and labels above the box faces, below the next stack layer.
  s.box(0.06 * k, 0.006 * k, 0.34 * k, CARD_D, 0, 0.303 * k, 0);
  for (const side of [-1, 1]) s.box(0.06 * k, 0.3 * k, 0.006 * k, CARD_D, 0, 0.15 * k, side * 0.173 * k);
  s.box(0.16 * k, 0.12 * k, 0.006 * k, 0xf4f0e6, 0, 0.16 * k, 0.179 * k);
  s.box(0.1 * k, 0.07 * k, 0.004 * k, d.look.color, 0, 0.16 * k, 0.184 * k);
}

function dirtyShape(s, n, k) {
  for (let i = 0; i < Math.min(n, 8); i++) {
    s.cyl(0.24 * k, 0.2 * k, 0.025 * k, 12, i % 2 ? 0xe8e2d4 : 0xdcd4c4, 0, 0.0125 * k + i * 0.028 * k, 0);
    s.cyl(0.06 * k, 0.06 * k, 0.004 * k, 6, 0x8a6a48, 0.06 * k * Math.cos(i * 2), 0.027 * k + i * 0.028 * k, 0.06 * k * Math.sin(i * 2));
  }
}

const geoCache = new Map();

/** Builds (or fetches) the mesh for any item. Scale k is 1 for in-world size. */
export function itemMesh(state, it, k = 1.25) {
  const key = itemSig(it) + '@' + k + (it.k === 'drink' ? state.cuisine : '');
  let geo = geoCache.get(key);
  if (!geo) {
    const s = new Shape();
    switch (it.k) {
      case 'ing': addIngItem(s, it, 0, 0, 0, k); break;
      case 'plate': plateShape(s, it, k); break;
      case 'drink': {
        const c = state && CUISINES[state.cuisine];
        const d = c ? c.drinks.find((x) => x.id === it.id) : null;
        drinkShape(s, d ? d.color : 0x8a5a2a, d ? d.glass : 'tall', k);
        break;
      }
      case 'box': boxShape(s, it.ing, k); break;
      case 'dirty': dirtyShape(s, it.n, k); break;
      default: s.box(0.2, 0.2, 0.2, 0xff00ff, 0, 0.1, 0);
    }
    geo = s.build();
    geoCache.set(key, geo);
    if (geoCache.size > 600) {
      const first = geoCache.keys().next().value;
      geoCache.get(first).dispose();
      geoCache.delete(first);
    }
  }
  const m = new THREE.Mesh(geo, MAT.solid);
  m.castShadow = true;
  m.userData.sig = key;
  return m;
}

/** Content shown floating inside a pot (portions bobbing in water). */
export function potContents(it, k = 1) {
  const s = new Shape();
  const info = stateInfo(it.ing, it.st);
  const water = info.shape === 'liquid' ? info.color : 0xb8d0d8;
  s.cyl(0.21 * k, 0.21 * k, 0.01 * k, 12, water, 0, 0, 0);
  if (info.shape !== 'liquid') {
    const n = it.n || 1;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      addIng(s, info.shape, info.color, n > 1 ? Math.cos(a) * 0.08 * k : 0, -0.02 * k, n > 1 ? Math.sin(a) * 0.08 * k : 0, k * 0.55);
    }
  }
  const m = new THREE.Mesh(s.build(), MAT.solid);
  return m;
}
