// The 3D view: renderer, camera, light rig, and syncing models to the game
// state every frame. Knows nothing about networking.
import * as THREE from 'three';
import { CUISINES } from '../data/cuisines.js';
import { MAP } from '../data/layout.js';
import { footprint, seatsOf, buildGrid, walkable } from '../sim/world.js';
import { itemSig } from '../sim/items.js';
import { stepFor } from '../data/ingredients.js';
import { stationModel, tableModel, makePerson, animatePerson, COUNTER_H } from './models.js';
import { buildRoom, skyColor } from './room.js';
import { itemMesh, potContents } from './food.js';
import { Shape, MAT, meshOf } from './shape.js';
import { mix } from './shape.js';

const RW = MAP[0].length, RH = MAP.length;
const _v = new THREE.Vector3();

export class View {
  constructor(container) {
    this.container = container;
    const r = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.NeutralToneMapping;
    r.toneMappingExposure = 1.08;
    r.domElement.id = 'game-canvas';
    container.prepend(r.domElement);
    this.renderer = r;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1e1a18);
    this.scene = scene;
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.5, 120);
    this.camMode = 'overview';
    this.camPos = new THREE.Vector3(10, 22, 30);
    this.camLook = new THREE.Vector3(10, 0, 7.5);

    this.hemi = new THREE.HemisphereLight(0xfff4e4, 0x8a6a50, 1.35);
    scene.add(this.hemi);
    const sun = new THREE.DirectionalLight(0xfff2dc, 2.1);
    sun.position.set(-6, 22, 16);
    sun.target.position.set(10, 0, 7);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -15, right: 15, top: 13, bottom: -13, near: 1, far: 60 });
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.03;
    scene.add(sun, sun.target);
    this.sun = sun;
    this.lamps = [];
    for (const [x, z] of [[6, 9.5], [14, 9.5], [10, 2.5]]) {
      const l = new THREE.PointLight(0xffd8a0, 0, 9, 1.6);
      l.position.set(x, 2.4, z);
      scene.add(l);
      this.lamps.push(l);
    }

    this.world = new THREE.Group();
    scene.add(this.world);
    this.objs = new Map();
    this.chefs = new Map();
    this.guests = new Map();
    this.layoutKey = '';
    this.roomKey = '';
    this.particles = new Particles(scene);
    this.t = 0;
    this.focus = null;
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = w + 'px';
    this.renderer.domElement.style.height = h + 'px';
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
    this.fitOverview();
  }

  /** Places the overview camera so the whole room fits between the HUD bars. */
  fitOverview() {
    const pitch = THREE.MathUtils.degToRad(54);
    const dir = new THREE.Vector3(0, Math.sin(pitch), Math.cos(pitch));
    const cam = this.camera;
    const pts = [];
    for (const x of [0.2, RW - 0.2]) {
      pts.push(new THREE.Vector3(x, 2.9, 0.5), new THREE.Vector3(x, 0, 0.5), new THREE.Vector3(x, 0.5, RH), new THREE.Vector3(x, 0, RH));
    }
    const mt = 0.13, mb = 0.1, ms = 0.015;
    const target = new THREE.Vector3();
    const fits = (tz, d) => {
      target.set(RW / 2, 0, tz);
      cam.position.copy(target).addScaledVector(dir, d);
      cam.lookAt(target);
      cam.updateMatrixWorld();
      for (const p of pts) {
        _v.copy(p).project(cam);
        const sx = (_v.x + 1) / 2, sy = (1 - _v.y) / 2;
        if (sx < ms || sx > 1 - ms || sy < mt || sy > 1 - mb) return false;
      }
      return true;
    };
    let best = { d: Infinity, tz: RH / 2 };
    for (let tz = RH / 2 - 3; tz <= RH / 2 + 3; tz += 0.25) {
      let lo = 6, hi = 90;
      if (!fits(tz, hi)) continue;
      for (let i = 0; i < 26; i++) { const d = (lo + hi) / 2; if (fits(tz, d)) hi = d; else lo = d; }
      if (hi < best.d) best = { d: hi, tz };
    }
    target.set(RW / 2, 0, best.tz);
    this.overview = { pos: target.clone().addScaledVector(dir, best.d), look: target.clone() };
    if (!this.camInit) { this.camPos.copy(this.overview.pos); this.camLook.copy(this.overview.look); this.camInit = true; }
    cam.position.copy(this.camPos);
    cam.lookAt(this.camLook);
  }

  toScreen(x, y, z) {
    _v.set(x, y, z).project(this.camera);
    const w = this.container.clientWidth, h = this.container.clientHeight;
    return { x: (_v.x + 1) / 2 * w, y: (1 - _v.y) / 2 * h, on: _v.z < 1 };
  }

  /** Mouse position to a floor point (for the layout editor). */
  floorAt(px, py) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((px - rect.left) / rect.width) * 2 - 1, -((py - rect.top) / rect.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const t = -ray.ray.origin.y / ray.ray.direction.y;
    if (!(t > 0)) return null;
    return { x: ray.ray.origin.x + ray.ray.direction.x * t, z: ray.ray.origin.z + ray.ray.direction.z * t };
  }

  // ------------------------------------------------------------ static build

  ensureLayout(state) {
    const decorKey = ['decor1', 'decor2', 'decor3'].map((k) => state.upgrades[k] ? 1 : 0).join('');
    const roomKey = state.cuisine + '|' + state.name + '|' + decorKey;
    if (roomKey !== this.roomKey) {
      if (this.room) { this.world.remove(this.room.root); disposeTree(this.room.root); }
      this.room = buildRoom(CUISINES[state.cuisine], state.name, state.upgrades);
      this.world.add(this.room.root);
      this.roomKey = roomKey;
      this.layoutKey = '';
    }
    const key = state.objects.map((o) => `${o.id}:${o.type}:${o.x}:${o.z}`).join('|');
    if (key === this.layoutKey) return;
    this.layoutKey = key;
    const pal = CUISINES[state.cuisine].palette;
    const grid = buildGrid(state);
    const seen = new Set();
    for (const o of state.objects) {
      seen.add(o.id);
      let e = this.objs.get(o.id);
      if (e && (e.x !== o.x || e.z !== o.z)) { this.world.remove(e.group); disposeTree(e.group); this.objs.delete(o.id); e = null; }
      if (e) continue;
      e = this.buildObject(o, pal, grid, state);
      this.objs.set(o.id, e);
      this.world.add(e.group);
    }
    for (const [id, e] of this.objs) {
      if (!seen.has(id)) { this.world.remove(e.group); disposeTree(e.group); this.objs.delete(id); }
    }
  }

  buildObject(o, pal, grid, state) {
    const e = { id: o.id, type: o.type, x: o.x, z: o.z, sig: '', item: null };
    if (o.type === 'table') {
      const cloth = CUISINES[state.cuisine].palette.cloth;
      e.group = tableModel(o.seats, pal, cloth);
      e.group.position.set(o.x, 0, o.z);
      e.top = e.group.userData.top;
      e.dyn = {};
      return e;
    }
    const m = stationModel(o.type, pal);
    e.group = m.group;
    e.dyn = m.dyn;
    e.slotY = m.slotY;
    // Face the side players use.
    let face = [0, 1];
    for (const [dx, dz] of [[0, 1], [-1, 0], [1, 0], [0, -1]]) {
      if (walkable(grid, o.x + dx, o.z + dz)) { face = [dx, dz]; break; }
    }
    if (o.type === 'pass' || o.type === 'drinks') face = [0, 1];
    e.group.position.set(o.x + 0.5, 0, o.z + 0.5);
    e.group.rotation.y = Math.atan2(face[0], face[1]);
    e.slot = new THREE.Group();
    e.slot.position.y = m.slotY;
    e.group.add(e.slot);
    return e;
  }

  // ------------------------------------------------------------ per frame

  sync(state, dt, opts = {}) {
    this.t += dt;
    this.ensureLayout(state);
    this.state = state;
    for (const o of state.objects) {
      const e = this.objs.get(o.id);
      if (e) this.syncObject(e, o, state, dt);
    }
    this.syncPeople(state, dt, opts);
    this.syncLighting(state, dt);
    this.particles.update(dt);
    this.updateCamera(dt, opts);
  }

  setSlotItem(e, it, state, k = 1.25) {
    const sig = it ? itemSig(it) : '';
    if (sig === e.sig) return;
    e.sig = sig;
    if (e.item) { e.slot.remove(e.item); e.item = null; }
    if (!it) return;
    if (e.type === 'pot') { e.item = potContents(it, 1); e.item.position.y = 0.0; }
    else e.item = itemMesh(state, it, k);
    e.slot.add(e.item);
  }

  syncObject(e, o, state, dt) {
    const t = this.t;
    switch (o.type) {
      case 'counter': case 'pass': case 'board':
        this.setSlotItem(e, o.slot, state);
        break;
      case 'grill': case 'pan': case 'pot': case 'fryer': case 'oven': {
        this.setSlotItem(e, o.slot, state, o.type === 'oven' ? 1.0 : 1.25);
        const it = o.slot;
        const cooking = it && it.k === 'ing' && it.st !== 'burnt';
        const active = cooking && (stepFor(it.ing, it.st, o.type) || it.over > 0);
        if (e.dyn.glow) e.dyn.glow.material.opacity += ((active ? 0.85 + Math.sin(t * 9) * 0.1 : 0) - e.dyn.glow.material.opacity) * Math.min(1, dt * 6);
        if (e.dyn.basket) e.dyn.basket.position.y = COUNTER_H + (active ? -0.08 : 0.03);
        if (o.type === 'oven' && e.item) e.item.visible = true;
        if (active) {
          const burning = it.over > 0 && o.type !== 'pot' && it.q < 1;
          e.puff = (e.puff || 0) - dt;
          if (e.puff <= 0) {
            e.puff = burning ? 0.12 : o.type === 'pot' ? 0.18 : 0.3;
            const p = e.group.position;
            this.particles.puff(p.x + (Math.random() - 0.5) * 0.3, e.slotY + 0.15, p.z + (Math.random() - 0.5) * 0.3, burning ? 0x3a3432 : 0xf4f0ea, burning ? 0.7 : 0.45);
          }
        } else if (it && it.st === 'burnt') {
          e.puff = (e.puff || 0) - dt;
          if (e.puff <= 0) { e.puff = 0.1; const p = e.group.position; this.particles.puff(p.x, e.slotY + 0.2, p.z, 0x2a2624, 0.9); }
        }
        break;
      }
      case 'well': {
        const w = o.well;
        const sig = w ? `${w.ing}:${w.st}:${Math.min(w.n, 8)}` : '';
        if (sig !== e.sig) {
          e.sig = sig;
          if (e.item) { e.slot.remove(e.item); e.item = null; }
          if (w) {
            const g = new THREE.Group();
            const n = Math.min(w.n, 8);
            for (let i = 0; i < n; i++) {
              const m = itemMesh(state, { k: 'ing', ing: w.ing, st: w.st }, 0.72);
              m.position.set(((i % 4) - 1.5) * 0.17, 0, ((i >> 2) - 0.5) * 0.24);
              m.rotation.y = i * 1.3;
              g.add(m);
            }
            e.item = g;
            e.slot.add(g);
          }
        }
        break;
      }
      case 'rack': {
        const n = Math.min(o.n, 14);
        if (e.sig !== 'r' + n) {
          e.sig = 'r' + n;
          if (e.item) e.slot.remove(e.item);
          const s = new Shape();
          for (let i = 0; i < n; i++) {
            s.cyl(0.24, 0.2, 0.025, 12, i % 2 ? 0xf6f3ec : 0xece7dc, 0, 0.0125 + (i % 7) * 0.03 + (i >= 7 ? 0.0 : 0), i >= 7 ? -0.12 : 0.12);
          }
          e.item = meshOf(s);
          if (n > 7) e.item.position.y = 0;
          e.slot.add(e.item);
        }
        break;
      }
      case 'sink': {
        const sig = 's' + Math.min(o.n, 8);
        if (e.sig !== sig) {
          e.sig = sig;
          if (e.item) e.slot.remove(e.item);
          e.item = o.n ? itemMesh(state, { k: 'dirty', n: Math.min(o.n, 8) }, 1) : null;
          if (e.item) { e.item.position.set(0, -0.02, 0.05); e.slot.add(e.item); }
        }
        if (o.wash > 0 && Math.random() < dt * 8) { const p = e.group.position; this.particles.puff(p.x, COUNTER_H + 0.1, p.z, 0xd8eef8, 0.3, true); }
        break;
      }
      case 'dock': {
        const sig = o.boxes.map((b) => b.ing).join(',');
        if (sig !== e.sig) {
          e.sig = sig;
          if (e.item) e.slot.remove(e.item);
          const g = new THREE.Group();
          o.boxes.slice(-12).forEach((b, i) => {
            const m = itemMesh(state, { k: 'box', ing: b.ing }, 1);
            const col = i % 2, row = (i >> 1) % 2, lvl = i >> 2;
            m.position.set((col - 0.5) * 0.45, lvl * 0.31, (row - 0.5) * 0.4);
            m.rotation.y = (i % 3 - 1) * 0.08;
            g.add(m);
          });
          e.item = g;
          e.slot.add(g);
        }
        break;
      }
      case 'table': {
        const served = (o.served || []).map((x) => x.dish + '@' + x.seat).join(',');
        const sig = served + '|' + (o.dirty || 0) + '|' + (o.plates || 0);
        if (sig !== e.sig) {
          e.sig = sig;
          if (e.item) { e.group.remove(e.item); e.item = null; }
          const g = new THREE.Group();
          const seats = seatsOf({ ...o, x: 0, z: 0 });
          (o.served || []).forEach((sv, i) => {
            const plate = fakePlate(state, sv.dish);
            const m = itemMesh(state, plate, 1.0);
            const s = seats[sv.seat] || seats[0];
            const cx = o.seats === 4 ? 1 : 1.5, cz = o.seats === 4 ? 1.5 : 0.5;
            const px = s.x + (cx - s.x) * 0.45 + (i % 2) * 0.06, pz = s.z + (cz - s.z) * 0.45;
            m.position.set(px, e.top, pz);
            g.add(m);
          });
          if (o.dirty) {
            const m = itemMesh(state, { k: 'dirty', n: o.dirty }, 0.9);
            m.position.set(o.seats === 4 ? 1 : 1.5, e.top, o.seats === 4 ? 1.5 : 0.5);
            g.add(m);
          }
          e.item = g;
          e.group.add(g);
        }
        break;
      }
    }
  }

  syncPeople(state, dt, opts) {
    const poses = opts.poses || {};
    // Chefs.
    const seen = new Set();
    for (const [pid, p] of Object.entries(state.players)) {
      seen.add(pid);
      let c = this.chefs.get(pid);
      const lookKey = JSON.stringify(p.look);
      if (c && c.lookKey !== lookKey) { this.world.remove(c.m.root); disposeTree(c.m.root); this.chefs.delete(pid); c = null; }
      if (!c) {
        const m = makePerson(p.look, true);
        this.world.add(m.root);
        c = { m, lookKey, x: p.x, z: p.z, rot: p.rot, sig: '', item: null };
        this.chefs.set(pid, c);
      }
      const pose = poses[pid] || p;
      const px = c.x, pz = c.z;
      const k = pid === opts.self ? 1 : Math.min(1, dt * 14);
      c.x += (pose.x - c.x) * k;
      c.z += (pose.z - c.z) * k;
      c.rot = lerpAngle(c.rot, pose.rot, pid === opts.self ? 1 : Math.min(1, dt * 14));
      const speed = Math.hypot(c.x - px, c.z - pz) / Math.max(dt, 1e-3);
      c.m.root.position.set(c.x, 0, c.z);
      c.m.root.rotation.y = c.rot;
      const sig = p.hand ? itemSig(p.hand) : '';
      if (sig !== c.sig) {
        c.sig = sig;
        if (c.item) { c.m.hand.remove(c.item); c.item = null; }
        if (p.hand) { c.item = itemMesh(state, p.hand, 1.05); c.m.hand.add(c.item); }
      }
      animatePerson(c.m, { speed, dt, carrying: !!p.hand, working: !!p.working, t: this.t });
    }
    for (const [pid, c] of this.chefs) if (!seen.has(pid)) { this.world.remove(c.m.root); disposeTree(c.m.root); this.chefs.delete(pid); }

    // Guests.
    const gseen = new Set();
    const gpos = opts.guestPoses || null;
    for (const party of state.parties) {
      const seated = ['browsing', 'ordering', 'waitingFood', 'eating', 'dessertReady', 'dessertWait', 'dessertEat', 'paying'].includes(party.state);
      for (const g of party.guests) {
        gseen.add(g.id);
        let c = this.guests.get(g.id);
        if (!c) {
          const m = makePerson(g.look, false);
          this.world.add(m.root);
          c = { m, x: g.x, z: g.z, rot: g.rot };
          this.guests.set(g.id, c);
        }
        const pose = (gpos && gpos[g.id]) || g;
        const px = c.x, pz = c.z;
        const k = Math.min(1, dt * 12);
        c.x += (pose.x - c.x) * k;
        c.z += (pose.z - c.z) * k;
        c.rot = lerpAngle(c.rot, pose.rot, Math.min(1, dt * 10));
        const speed = seated ? 0 : Math.hypot(c.x - px, c.z - pz) / Math.max(dt, 1e-3);
        c.m.root.position.set(c.x, 0, c.z);
        c.m.root.rotation.y = c.rot;
        c.m.root.scale.setScalar(g.look.h || 1);
        animatePerson(c.m, { speed, dt, sitting: seated, eating: g.eating && (party.state === 'eating' || party.state === 'dessertEat'), t: this.t });
      }
    }
    for (const [id, c] of this.guests) if (!gseen.has(id)) { this.world.remove(c.m.root); disposeTree(c.m.root); this.guests.delete(id); }
  }

  syncLighting(state, dt) {
    if (!this.room) return;
    const sky = skyColor(state.clock, state.phase);
    this.room.winMat.color.setHex(sky);
    const evening = state.phase === 'office' ? 1 : state.phase === 'service' ? THREE.MathUtils.clamp((state.clock - 17.5 * 60) / 180, 0, 1) : 0;
    const target = 1.35 - evening * 0.45;
    this.hemi.intensity += (target - this.hemi.intensity) * Math.min(1, dt * 2);
    this.sun.intensity += ((2.1 - evening * 1.5) - this.sun.intensity) * Math.min(1, dt * 2);
    for (const l of this.lamps) l.intensity += ((evening * 14) - l.intensity) * Math.min(1, dt * 2);
  }

  setCameraMode(mode) {
    this.camMode = mode;
    this.zoomTarget = mode === 'follow' ? 0.72 : 0;
  }

  /** Mouse wheel: positive delta zooms out. Zoom 0 = whole room, 1 = closest. */
  zoomBy(delta) {
    this.zoomTarget = Math.max(0, Math.min(1, (this.zoomTarget || 0) - delta));
    this.camMode = this.zoomTarget > 0.02 ? 'follow' : 'overview';
  }

  updateCamera(dt, opts) {
    if (!this.overview) return;
    if (this.zoom == null) { this.zoom = 0; this.zoomTarget = 0; }
    this.zoom += (this.zoomTarget - this.zoom) * Math.min(1, dt * 8);
    const O = this.overview.pos, OL = this.overview.look;
    const dir = _v.copy(O).sub(OL);
    const d0 = dir.length();
    dir.divideScalar(d0);
    let fx = OL.x, fz = OL.z;
    const c = opts.self && this.chefs.get(opts.self);
    if (c) {
      fx = THREE.MathUtils.clamp(c.x, 4, RW - 4);
      fz = THREE.MathUtils.clamp(c.z - 0.3, 2.5, RH - 3);
    }
    const z = this.zoom;
    const look = this._look || (this._look = new THREE.Vector3());
    look.set(OL.x + (fx - OL.x) * z, OL.y + (0.5 - OL.y) * z, OL.z + (fz - OL.z) * z);
    const dist = d0 * (1 - 0.62 * z);
    const pos = this._pos || (this._pos = new THREE.Vector3());
    pos.copy(look).addScaledVector(dir, dist);
    const k = Math.min(1, dt * 6);
    this.camPos.lerp(pos, k);
    this.camLook.lerp(look, k);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
  }

  render() { this.renderer.render(this.scene, this.camera); }

  /** World position of an object's slot (for overlay markers). */
  anchorOf(id) {
    const e = this.objs.get(id);
    if (!e) return null;
    if (e.type === 'table') {
      const o = this.state.objects.find((x) => x.id === id);
      const f = footprint(o);
      return { x: o.x + f.w / 2, y: 1.6, z: o.z + f.h / 2 };
    }
    const p = e.group.position;
    return { x: p.x, y: (e.slotY || 1) + 0.55, z: p.z };
  }

  chefAnchor(pid) {
    const c = this.chefs.get(pid);
    return c ? { x: c.x, y: 2.35, z: c.z } : null;
  }

  guestAnchor(id) {
    const c = this.guests.get(id);
    return c ? { x: c.x, y: 1.9, z: c.z } : null;
  }

  clear() {
    for (const [, e] of this.objs) { this.world.remove(e.group); disposeTree(e.group); }
    this.objs.clear();
    for (const [, c] of this.chefs) this.world.remove(c.m.root);
    this.chefs.clear();
    for (const [, c] of this.guests) this.world.remove(c.m.root);
    this.guests.clear();
    if (this.room) { this.world.remove(this.room.root); this.room = null; }
    this.layoutKey = ''; this.roomKey = '';
  }
}

function fakePlate(state, dishId) {
  const all = [...CUISINES[state.cuisine].dishes, ...(state.custom || [])];
  const d = all.find((x) => x.id === dishId);
  if (!d) return { k: 'plate', items: [] };
  const items = [];
  const container = d.comps.find(([i]) => i === 'dough');
  if (container) {
    items.push({ k: 'ing', ing: 'dough', st: 'baked', top: d.comps.filter((c) => c !== container).map(([ing, st]) => ({ ing, st })) });
  } else for (const [ing, st] of d.comps) items.push({ k: 'ing', ing, st });
  return { k: 'plate', items };
}

function lerpAngle(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

function disposeTree(obj) {
  obj.traverse((o) => {
    if (o.isMesh && o.material && o.material !== MAT.solid && o.material !== MAT.glow && o.material.dispose && !o.userData.sig) {
      if (o.material.map) o.material.map.dispose();
      o.material.dispose();
    }
  });
}

/** Cheap steam and smoke puffs. */
class Particles {
  constructor(scene) {
    this.pool = [];
    this.live = [];
    this.geo = new THREE.IcosahedronGeometry(0.09, 0);
    this.scene = scene;
  }
  puff(x, y, z, color, size = 0.5, small = false) {
    let p = this.pool.pop();
    if (!p) {
      p = new THREE.Mesh(this.geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6, depthWrite: false }));
      this.scene.add(p);
    }
    p.material.color.setHex(color);
    p.visible = true;
    p.position.set(x, y, z);
    p.userData.life = 0;
    p.userData.max = small ? 0.5 : 1.2;
    p.userData.size = size * (small ? 0.5 : 1);
    p.userData.vx = (Math.random() - 0.5) * 0.2;
    p.userData.vz = (Math.random() - 0.5) * 0.2;
    this.live.push(p);
  }
  update(dt) {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const p = this.live[i];
      const u = p.userData;
      u.life += dt;
      const t = u.life / u.max;
      if (t >= 1) { p.visible = false; this.live.splice(i, 1); this.pool.push(p); continue; }
      p.position.x += u.vx * dt;
      p.position.z += u.vz * dt;
      p.position.y += dt * 0.7;
      p.scale.setScalar(u.size * (0.6 + t * 1.8));
      p.material.opacity = 0.55 * (1 - t);
    }
  }
}
