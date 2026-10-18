// Stations, tables and characters. Each builder returns a THREE.Group whose
// origin is the tile center at floor level, facing +Z (toward its front).
import * as THREE from 'three';
import { Shape, MAT, meshOf, shade } from './shape.js';

export const COUNTER_H = 0.92;
const STEEL = 0xc8cdd2, STEEL_D = 0x8e959c, DARK = 0x2c2a2a, WOOD = 0x9a6a3e, WOOD_D = 0x6e4a2c;

function counterBase(s, pal, h = COUNTER_H) {
  s.box(0.98, h - 0.06, 0.94, pal.counter, 0, (h - 0.06) / 2, -0.01);
  s.box(0.9, 0.08, 0.04, shade(pal.counter, 0.7), 0, 0.04, 0.45);
  s.box(1.0, 0.06, 1.0, pal.top, 0, h - 0.03, 0);
  s.box(0.6, 0.03, 0.02, shade(pal.counter, 1.25), 0, h - 0.2, 0.47);
}

function glowMesh(shape) {
  const m = new THREE.Mesh(shape.build(), new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0 }));
  return m;
}

/** Station models. Returns { group, slotY, dyn } where dyn holds animated parts. */
export function stationModel(type, pal) {
  const g = new THREE.Group();
  const s = new Shape();
  const dyn = {};
  let slotY = COUNTER_H;
  switch (type) {
    case 'fridge':
    case 'freezer': {
      const body = type === 'fridge' ? STEEL : 0xc0d4e2;
      s.box(0.96, 2.1, 0.86, body, 0, 1.05, -0.05);
      s.box(0.46, 1.9, 0.04, shade(body, 1.08), -0.235, 1.07, 0.4);
      s.box(0.46, 1.9, 0.04, shade(body, 1.04), 0.235, 1.07, 0.4);
      s.box(0.04, 0.5, 0.06, STEEL_D, -0.04, 1.2, 0.44);
      s.box(0.04, 0.5, 0.06, STEEL_D, 0.04, 1.2, 0.44);
      s.box(0.5, 0.16, 0.02, type === 'fridge' ? 0x3a7ac8 : 0x5ab0e0, 0, 1.82, 0.43);
      s.box(0.96, 0.08, 0.86, STEEL_D, 0, 2.14, -0.05);
      if (type === 'freezer') { s.box(0.08, 0.08, 0.02, 0xffffff, -0.1, 1.82, 0.445, 0, 0, Math.PI / 4); s.box(0.08, 0.08, 0.02, 0xffffff, 0.1, 1.82, 0.445, 0, 0, Math.PI / 4); }
      break;
    }
    case 'pantry': {
      s.box(0.96, 2.0, 0.7, WOOD_D, 0, 1.0, -0.12);
      for (let i = 0; i < 4; i++) s.box(0.92, 0.04, 0.66, WOOD, 0, 0.2 + i * 0.5, -0.1);
      const goods = [0xe8d8a0, 0xc83a2a, 0xf0d890, 0x3a3530, 0xa86a20, 0xf4f0e8, 0xd8b070, 0x4a2a1a];
      for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 3; j++) {
          const c = goods[(i * 3 + j) % goods.length];
          if ((i + j) % 2) s.cyl(0.07, 0.07, 0.2, 7, c, -0.3 + j * 0.3, 0.32 + i * 0.5, 0);
          else s.box(0.2, 0.26, 0.16, c, -0.3 + j * 0.3, 0.35 + i * 0.5, 0);
        }
      }
      break;
    }
    case 'counter':
      counterBase(s, pal);
      break;
    case 'board':
      counterBase(s, pal);
      s.box(0.7, 0.04, 0.55, 0xc89a60, 0, COUNTER_H + 0.02, 0.05);
      s.box(0.66, 0.005, 0.51, 0xd8aa70, 0, COUNTER_H + 0.042, 0.05);
      s.box(0.04, 0.02, 0.24, DARK, 0.42, COUNTER_H + 0.015, -0.2);
      s.box(0.035, 0.01, 0.2, STEEL, 0.42, COUNTER_H + 0.012, 0.0);
      slotY = COUNTER_H + 0.04;
      break;
    case 'grill': {
      counterBase(s, pal);
      s.box(0.86, 0.06, 0.8, DARK, 0, COUNTER_H + 0.03, 0);
      for (let i = 0; i < 7; i++) s.box(0.04, 0.025, 0.74, 0x4a4442, -0.33 + i * 0.11, COUNTER_H + 0.07, 0);
      s.box(0.9, 0.18, 0.08, STEEL, 0, COUNTER_H + 0.09, -0.42);
      const glow = new Shape();
      for (let i = 0; i < 6; i++) glow.box(0.05, 0.01, 0.7, 0xff6a20, -0.275 + i * 0.11, COUNTER_H + 0.062, 0);
      dyn.glow = glowMesh(glow);
      g.add(dyn.glow);
      slotY = COUNTER_H + 0.085;
      break;
    }
    case 'pan': {
      counterBase(s, pal);
      s.box(0.86, 0.04, 0.8, DARK, 0, COUNTER_H + 0.02, 0);
      s.cyl(0.2, 0.2, 0.02, 10, 0x3a3634, 0, COUNTER_H + 0.05, 0);
      s.cyl(0.25, 0.21, 0.06, 12, 0x2a2828, 0, COUNTER_H + 0.08, 0);
      s.cyl(0.22, 0.22, 0.01, 12, 0x4a4644, 0, COUNTER_H + 0.11, 0);
      s.box(0.05, 0.03, 0.35, 0x2a2828, 0.0, COUNTER_H + 0.1, 0.4, 0.15);
      for (const k of [-1, 1]) s.cyl(0.04, 0.04, 0.05, 6, DARK, k * 0.3, COUNTER_H - 0.2, 0.47, Math.PI / 2);
      const flame = new Shape();
      for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; flame.cone(0.03, 0.06, 4, 0x4ab0ff, Math.cos(a) * 0.17, COUNTER_H + 0.06, Math.sin(a) * 0.17); }
      dyn.glow = glowMesh(flame);
      g.add(dyn.glow);
      slotY = COUNTER_H + 0.11;
      break;
    }
    case 'pot': {
      counterBase(s, pal);
      s.box(0.86, 0.04, 0.8, DARK, 0, COUNTER_H + 0.02, 0);
      s.add(new THREE.CylinderGeometry(0.27, 0.25, 0.36, 12, 1, true), STEEL, 0, COUNTER_H + 0.22, 0);
      s.add(new THREE.CylinderGeometry(0.26, 0.24, 0.36, 12, 1, true), STEEL_D, 0, COUNTER_H + 0.22, 0, Math.PI);
      s.cyl(0.25, 0.25, 0.02, 12, STEEL_D, 0, COUNTER_H + 0.05, 0);
      s.torus(0.27, 0.015, STEEL, 0, COUNTER_H + 0.4, 0);
      for (const k of [-1, 1]) s.box(0.1, 0.03, 0.04, DARK, k * 0.32, COUNTER_H + 0.34, 0);
      const flame = new Shape();
      for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; flame.cone(0.03, 0.06, 4, 0x4ab0ff, Math.cos(a) * 0.2, COUNTER_H + 0.06, Math.sin(a) * 0.2); }
      dyn.glow = glowMesh(flame);
      g.add(dyn.glow);
      slotY = COUNTER_H + 0.33;
      break;
    }
    case 'fryer': {
      s.box(0.98, COUNTER_H, 0.94, STEEL, 0, COUNTER_H / 2, -0.01);
      s.box(1.0, 0.05, 1.0, STEEL_D, 0, COUNTER_H, 0);
      s.box(0.8, 0.03, 0.7, 0xd8a838, 0, COUNTER_H - 0.03, 0);
      s.box(0.84, 0.2, 0.06, STEEL_D, 0, COUNTER_H + 0.1, -0.42);
      s.box(0.2, 0.08, 0.02, 0xc83a2a, 0, COUNTER_H - 0.25, 0.47);
      const basket = new Shape();
      basket.box(0.5, 0.02, 0.45, 0x8a8a8a, 0, 0, 0);
      for (const k of [-1, 1]) basket.box(0.5, 0.12, 0.02, 0x8a8a8a, 0, 0.06, k * 0.22);
      for (const k of [-1, 1]) basket.box(0.02, 0.12, 0.45, 0x8a8a8a, k * 0.25, 0.06, 0);
      basket.box(0.04, 0.04, 0.35, DARK, 0, 0.1, 0.38);
      dyn.basket = meshOf(basket);
      dyn.basket.position.y = COUNTER_H + 0.03;
      g.add(dyn.basket);
      const glow = new Shape();
      glow.box(0.78, 0.01, 0.68, 0xffd060, 0, COUNTER_H - 0.012, 0);
      dyn.glow = glowMesh(glow);
      g.add(dyn.glow);
      slotY = COUNTER_H + 0.06;
      break;
    }
    case 'oven': {
      s.box(0.98, 1.0, 0.94, DARK, 0, 0.5, -0.01);
      s.box(0.9, 0.06, 0.04, STEEL, 0, 0.78, 0.47);
      s.box(0.8, 0.5, 0.03, 0x3a3634, 0, 0.42, 0.47);
      s.box(1.0, 0.06, 1.0, STEEL_D, 0, 1.0, 0);
      s.box(1.0, 0.5, 0.12, DARK, 0, 1.28, -0.44);
      for (let i = 0; i < 3; i++) s.cyl(0.035, 0.035, 0.03, 8, STEEL, -0.25 + i * 0.25, 1.3, -0.37, Math.PI / 2);
      const win = new Shape();
      win.box(0.55, 0.3, 0.01, 0xff9a40, 0, 0.44, 0.49);
      dyn.glow = glowMesh(win);
      g.add(dyn.glow);
      slotY = 1.03;
      break;
    }
    case 'well': {
      counterBase(s, pal);
      s.box(0.8, 0.02, 0.7, STEEL_D, 0, COUNTER_H + 0.005, 0);
      s.box(0.82, 0.08, 0.04, STEEL, 0, COUNTER_H + 0.04, 0.36);
      s.box(0.82, 0.08, 0.04, STEEL, 0, COUNTER_H + 0.04, -0.36);
      s.box(0.04, 0.08, 0.7, STEEL, 0.41, COUNTER_H + 0.04, 0);
      s.box(0.04, 0.08, 0.7, STEEL, -0.41, COUNTER_H + 0.04, 0);
      slotY = COUNTER_H + 0.01;
      break;
    }
    case 'rack':
      counterBase(s, pal);
      for (const k of [-1, 1]) s.box(0.04, 0.5, 0.6, STEEL, k * 0.32, COUNTER_H + 0.25, 0);
      s.box(0.68, 0.04, 0.6, STEEL, 0, COUNTER_H + 0.5, 0);
      break;
    case 'sink': {
      s.box(0.98, COUNTER_H - 0.06, 0.94, STEEL, 0, (COUNTER_H - 0.06) / 2, -0.01);
      s.box(1.0, 0.06, 1.0, STEEL, 0, COUNTER_H - 0.03, 0);
      s.box(0.7, 0.04, 0.6, 0x9aa8b0, 0, COUNTER_H - 0.02, 0.05);
      s.box(0.66, 0.012, 0.56, 0x8ab8d0, 0, COUNTER_H, 0.05);
      s.cyl(0.025, 0.025, 0.4, 6, STEEL_D, 0, COUNTER_H + 0.2, -0.36);
      s.box(0.04, 0.04, 0.25, STEEL_D, 0, COUNTER_H + 0.4, -0.25);
      slotY = COUNTER_H;
      break;
    }
    case 'bin':
      s.cyl(0.3, 0.26, 0.85, 10, 0x4a6a5a, 0, 0.425, 0);
      s.cyl(0.32, 0.32, 0.06, 10, 0x3a5a4a, 0, 0.87, 0);
      s.box(0.2, 0.04, 0.04, 0x2a3a32, 0, 0.92, 0);
      break;
    case 'pass': {
      s.box(1.0, 1.0, 0.7, pal.trim, 0, 0.5, 0);
      s.box(1.04, 0.06, 0.9, STEEL, 0, 1.03, 0);
      s.box(1.0, 0.05, 0.2, shade(pal.trim, 0.8), 0, 0.08, 0.36);
      slotY = 1.06;
      break;
    }
    case 'drinks': {
      counterBase(s, pal, 0.95);
      s.box(0.5, 0.55, 0.4, STEEL, -0.2, 1.25, -0.2);
      s.box(0.36, 0.3, 0.02, 0x2a2a2a, -0.2, 1.3, 0.01);
      for (let i = 0; i < 3; i++) s.box(0.05, 0.1, 0.05, STEEL_D, -0.32 + i * 0.12, 1.0, 0.05);
      for (let i = 0; i < 3; i++) s.cyl(0.05, 0.05, 0.12, 7, [0xe0a040, 0xc83a2a, 0x3a8a3a][i], 0.22, 1.01 + i * 0.12, 0.2 - i * 0.12);
      s.cyl(0.12, 0.12, 0.28, 8, 0xf0eae0, 0.3, 1.09, -0.25);
      break;
    }
    case 'host': {
      s.box(0.7, 1.05, 0.5, WOOD, 0, 0.525, 0);
      s.box(0.8, 0.06, 0.6, WOOD_D, 0, 1.08, 0, -0.2);
      s.box(0.36, 0.03, 0.26, pal.accent, 0.05, 1.13, 0.02, -0.2);
      s.box(0.5, 0.06, 0.4, WOOD_D, 0, 0.03, 0);
      break;
    }
    case 'dock':
      for (let i = 0; i < 3; i++) s.box(0.95, 0.04, 0.16, WOOD, 0, 0.13, -0.38 + i * 0.38);
      for (let i = 0; i < 3; i++) s.box(0.12, 0.09, 0.95, WOOD_D, -0.4 + i * 0.4, 0.055, 0);
      for (let i = 0; i < 5; i++) s.box(0.95, 0.03, 0.12, WOOD, 0, 0.02, -0.42 + i * 0.21);
      slotY = 0.15;
      break;
  }
  if (s.parts.length) g.add(meshOf(s));
  g.userData.slotY = slotY;
  return { group: g, slotY, dyn };
}

// ------------------------------------------------------------------ tables

export function tableModel(seats, pal, cloth) {
  const g = new THREE.Group();
  const s = new Shape();
  const tH = 0.76;
  const chair = (x, z, face) => {
    const c = new Shape();
    c.box(0.42, 0.06, 0.42, pal.chair, 0, 0.46, 0);
    for (const a of [-1, 1]) for (const b of [-1, 1]) c.box(0.05, 0.46, 0.05, shade(pal.chair, 0.75), a * 0.17, 0.23, b * 0.17);
    c.box(0.42, 0.5, 0.05, pal.chair, 0, 0.75, -0.19);
    c.box(0.36, 0.06, 0.06, shade(pal.chair, 1.2), 0, 0.98, -0.19);
    s.merge(c, x, 0, z, face);
  };
  if (seats === 4) {
    // Footprint 2 x 3: chairs on rows 0 and 2, table on row 1 (local origin = footprint corner).
    s.box(1.9, 0.06, 1.15, pal.table, 1, tH, 1.5);
    if (cloth) s.box(1.95, 0.02, 1.2, cloth, 1, tH + 0.035, 1.5);
    for (const a of [-1, 1]) for (const b of [-1, 1]) s.box(0.07, tH, 0.07, shade(pal.table, 0.7), 1 + a * 0.85, tH / 2, 1.5 + b * 0.48);
    chair(0.5, 0.42, 0); chair(1.5, 0.42, 0); chair(0.5, 2.58, Math.PI); chair(1.5, 2.58, Math.PI);
  } else {
    // Footprint 3 x 1: chair, table, chair.
    s.box(1.0, 0.06, 0.95, pal.table, 1.5, tH, 0.5);
    if (cloth) s.box(1.05, 0.02, 1.0, cloth, 1.5, tH + 0.035, 0.5);
    s.cyl(0.06, 0.06, tH, 6, shade(pal.table, 0.7), 1.5, tH / 2, 0.5);
    s.cyl(0.3, 0.3, 0.04, 8, shade(pal.table, 0.7), 1.5, 0.02, 0.5);
    chair(0.42, 0.5, Math.PI / 2); chair(2.58, 0.5, -Math.PI / 2);
  }
  // Salt, pepper and a small vase.
  const cx = seats === 4 ? 1 : 1.5, cz = seats === 4 ? 1.5 : 0.5;
  s.cyl(0.025, 0.025, 0.08, 6, 0xf4f0e8, cx - 0.06, tH + 0.08, cz);
  s.cyl(0.025, 0.025, 0.08, 6, 0x3a3634, cx + 0.0, tH + 0.08, cz);
  s.cyl(0.035, 0.03, 0.12, 6, pal.accent2, cx + 0.08, tH + 0.1, cz);
  s.sphere(0.04, pal.accent, cx + 0.08, tH + 0.19, cz);
  g.add(meshOf(s));
  g.userData.top = tH + (cloth ? 0.045 : 0.03);
  return g;
}

// ------------------------------------------------------------------ people

function hex(c) { return typeof c === 'string' ? parseInt(c.slice(1), 16) : c; }

/** A chef or a guest. Forward is +Z; feet at y = 0. */
export function makePerson(look, chef) {
  const material = MAT.solid.clone();
  material.emissive = new THREE.Color(0xffffff);
  material.emissiveIntensity = 0;
  const skin = hex(look.skin), shirt = hex(look.shirt), hair = hex(look.hair);
  const pants = chef ? 0x2a2c34 : hex(look.pants || 0x2a3040);
  const H = look.h || 1;
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const mk = (sh) => { const m = meshOf(sh, material); return m; };

  const legs = [];
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.11, 0.78 * H, 0);
    const s = new Shape();
    s.box(0.16, 0.7 * H, 0.19, pants, 0, -0.35 * H, 0);
    s.box(0.18, 0.1, 0.27, chef ? 0x1e1e22 : 0x3a2a20, 0, -0.73 * H, 0.03);
    pivot.add(mk(s));
    body.add(pivot);
    legs.push(pivot);
  }

  const t = new Shape();
  const top = 0.78 * H;
  t.box(0.44, 0.56, 0.26, shirt, 0, top + 0.3, 0);
  if (chef) {
    // Double-breasted buttons.
    for (const y of [0.16, 0.3, 0.44]) for (const x of [-0.07, 0.07]) t.box(0.03, 0.03, 0.02, shade(shirt, 0.7), x, top + y, 0.135);
    t.box(0.3, 0.07, 0.29, look.apron ? hex(look.apronColor) : shade(shirt, 0.92), 0, top + 0.58, 0);
    if (look.apron) {
      const ac = hex(look.apronColor);
      t.box(0.42, 0.62, 0.02, ac, 0, top + 0.12, 0.14);
      t.box(0.32, 0.22, 0.02, ac, 0, top + 0.45, 0.14);
      t.box(0.46, 0.05, 0.28, shade(ac, 0.85), 0, top + 0.18, 0);
      t.box(0.12, 0.08, 0.01, shade(ac, 0.8), 0.08, top + 0.0, 0.152);
    }
  } else {
    t.box(0.18, 0.12, 0.02, shade(shirt, 1.2), 0, top + 0.52, 0.13);
    if (look.critic) t.box(0.08, 0.1, 0.02, 0xf4f0e8, 0.12, top + 0.38, 0.135);
  }
  // Head.
  const hy = top + 0.78;
  t.box(0.27, 0.28, 0.26, skin, 0, hy, 0);
  t.box(0.035, 0.035, 0.02, 0x2a2020, -0.065, hy + 0.02, 0.135);
  t.box(0.035, 0.035, 0.02, 0x2a2020, 0.065, hy + 0.02, 0.135);
  t.box(0.08, 0.02, 0.02, shade(skin, 0.75), 0, hy - 0.07, 0.132);
  const style = look.hairStyle ?? look.style ?? 0;
  const hatOn = chef && look.hat;
  if (style !== 3 || !hatOn) {
    if (style === 0) { t.box(0.29, 0.09, 0.28, hair, 0, hy + 0.14, -0.01); t.box(0.29, 0.18, 0.06, hair, 0, hy + 0.04, -0.12); }
    if (style === 1) { t.box(0.3, 0.1, 0.29, hair, 0, hy + 0.14, -0.01); t.box(0.3, 0.38, 0.08, hair, 0, hy - 0.06, -0.13); t.box(0.06, 0.24, 0.24, hair, -0.15, hy, -0.02); t.box(0.06, 0.24, 0.24, hair, 0.15, hy, -0.02); }
    if (style === 2) { t.box(0.29, 0.09, 0.28, hair, 0, hy + 0.14, -0.01); t.sphere(0.09, hair, 0, hy + 0.2, -0.14); }
    if (style === 3 && !chef) t.box(0.28, 0.04, 0.27, hair, 0, hy + 0.13, 0);
  }
  if (look.critic) { t.cyl(0.17, 0.17, 0.05, 10, 0x2a2a30, 0.02, hy + 0.17, 0, 0, 0, 0.15); t.sphere(0.03, 0x2a2a30, 0.03, hy + 0.21, 0); }
  body.add(mk(t));

  // Hat as its own mesh so it can be toggled without a rebuild.
  let hat = null;
  if (chef) {
    const hs = new Shape();
    const hc = hex(look.hatColor);
    hs.cyl(0.155, 0.155, 0.1, 10, shade(hc, 0.95), 0, 0, 0);
    hs.cyl(0.17, 0.15, 0.2, 10, hc, 0, 0.14, 0);
    hs.sphere(0.2, hc, 0, 0.27, 0, 1, 0.55, 1, 8);
    hat = mk(hs);
    hat.position.y = hy + 0.17;
    hat.visible = !!look.hat;
    body.add(hat);
  }

  // Arms pivot at the shoulders so they can reach forward to carry things.
  const arms = [];
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.29, top + 0.52, 0);
    const a = new Shape();
    a.box(0.12, 0.46, 0.14, shirt, 0, -0.21, 0);
    a.box(0.11, 0.1, 0.12, skin, 0, -0.47, 0);
    pivot.add(mk(a));
    body.add(pivot);
    arms.push(pivot);
  }
  const hand = new THREE.Group();
  hand.position.set(0, top + 0.18, 0.42);
  body.add(hand);
  return { root, body, legs, arms, hat, hand, material, top, phase: Math.random() * 6, chef };
}

/**
 * Procedural animation. s: { speed, dt, carrying, working, sitting, eating, t }
 */
export function animatePerson(m, s) {
  const moving = Math.min(1, s.speed / 2.5);
  m.phase += s.dt * (3 + s.speed * 2.6);
  const swing = Math.sin(m.phase) * 0.7 * moving;
  if (s.sitting) {
    m.legs[0].rotation.x = -1.45; m.legs[1].rotation.x = -1.45;
    m.body.position.y = -0.32;
    m.body.position.z = -0.05;
  } else {
    m.legs[0].rotation.x = swing;
    m.legs[1].rotation.x = -swing;
    m.body.position.y = Math.abs(Math.sin(m.phase)) * 0.05 * moving;
    m.body.position.z = 0;
  }
  let la = 0, ra = 0;
  if (s.carrying) { la = -1.25; ra = -1.25; }
  else if (s.working) { const w = Math.sin(s.t * 18) * 0.35; la = -1.0 + w; ra = -1.1 - w; }
  else if (s.eating) { la = -0.5; ra = -0.9 - Math.max(0, Math.sin(s.t * 3 + m.phase)) * 0.7; }
  else if (s.sitting) { la = -0.6; ra = -0.6; }
  else { la = -swing * 0.8; ra = swing * 0.8; }
  m.arms[0].rotation.x += (la - m.arms[0].rotation.x) * Math.min(1, s.dt * 14);
  m.arms[1].rotation.x += (ra - m.arms[1].rotation.x) * Math.min(1, s.dt * 14);
  m.body.rotation.z = Math.sin(m.phase) * 0.03 * moving;
}
