// The 3D view: renderer, camera, light rig, and syncing models to the game
// state every frame. Knows nothing about networking.
import * as THREE from 'three';
import { CUISINES } from '../data/cuisines.js';
import { roomSize, layoutTile } from '../data/layout.js';
import { ALLEY_SIZE, ALLEY_OBJECTS, BACK_DOOR, TRASH_CAPACITY, SMOKE_SECONDS, playerArea } from '../data/alley.js';
import { footprint, seatsOf, buildGrid, walkable, isWallTile } from '../sim/world.js';
import { itemSig } from '../sim/items.js';
import { stepFor } from '../data/ingredients.js';
import { stationModel, tableModel, makePerson, animatePerson, COUNTER_H } from './models.js';
import { buildRoom, skyColor, disposeRoom } from './room.js';
import { buildAlley, trashBagModel, cigaretteModel } from './alley.js';
import { itemMesh, potContents } from './food.js';
import { Shape, MAT, meshOf } from './shape.js';
import { mix } from './shape.js';

const DEFAULT_ZOOM = 0.55;
const _v = new THREE.Vector3();
const _shadowMatrix = new THREE.Matrix4();
const _shadowPosition = new THREE.Vector3();
const _shadowScale = new THREE.Vector3();
const _shadowRotation = new THREE.Quaternion();

export class View {
  constructor(container) {
    this.container = container;
    this.dimensions = roomSize({ mode: 'arcade' });
    this.area = 'restaurant';
    const r = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    r.toneMapping = THREE.NeutralToneMapping;
    r.toneMappingExposure = 1.08;
    r.domElement.id = 'game-canvas';
    container.prepend(r.domElement);
    this.renderer = r;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x29252d);
    scene.fog = new THREE.Fog(0x29252d, 30, 68);
    this.scene = scene;
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.5, 120);
    this.camMode = 'overview';
    this.camPos = new THREE.Vector3(10, 22, 30);
    this.camLook = new THREE.Vector3(10, 0, 7.5);

    this.hemi = new THREE.HemisphereLight(0xfff1df, 0x536174, 1.2);
    scene.add(this.hemi);
    const sun = new THREE.DirectionalLight(0xffdfbd, 2.0);
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
    this.layoutGuide = new LayoutGuide();
    this.world.add(this.layoutGuide.root);
    this.contacts = new ContactShadows(scene);
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

  setInsetLeft(px) {
    if (Math.abs((this.insetLeft || 0) - px) < 4) return;
    this.insetLeft = px;
    this.fitOverview();
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
    const outside = this.area === 'alley';
    const { width: RW, height: RH } = outside ? ALLEY_SIZE : this.dimensions;
    const pitch = THREE.MathUtils.degToRad(outside ? 49 : 54);
    const dir = new THREE.Vector3(outside ? -0.24 : 0, Math.sin(pitch), Math.cos(pitch)).normalize();
    const cam = this.camera;
    cam.far = Math.max(120, Math.hypot(RW, RH) * 8);
    cam.updateProjectionMatrix();
    const pts = [];
    for (const x of [-0.05, RW + 0.05]) {
      pts.push(new THREE.Vector3(x, outside ? 3.75 : 2.9, 0.5), new THREE.Vector3(x, 0, 0.5), new THREE.Vector3(x, outside ? 3.75 : 0.5, RH + 0.05), new THREE.Vector3(x, 0, RH + 0.05));
    }
    const W = this.container.clientWidth || 1;
    const mt = 0.1, mb = 0.09, ms = 0.03, ml = Math.min(0.3, (this.insetLeft || 0) / W);
    const target = new THREE.Vector3();
    const fits = (tz, d, tx = RW / 2) => {
      target.set(tx, 0, tz);
      cam.position.copy(target).addScaledVector(dir, d);
      cam.lookAt(target);
      cam.updateMatrixWorld();
      for (const p of pts) {
        _v.copy(p).project(cam);
        const sx = (_v.x + 1) / 2, sy = (1 - _v.y) / 2;
        if (sx < ml + ms || sx > 1 - ms || sy < mt || sy > 1 - mb) return false;
      }
      return true;
    };
    let best = { d: Infinity, tz: RH / 2, tx: RW / 2 };
    const txs = ml > 0.01 ? [RW / 2, RW / 2 - 1, RW / 2 - 2, RW / 2 - 3, RW / 2 - 4] : [RW / 2];
    for (const tx of txs) {
      for (let tz = RH / 2 - 3; tz <= RH / 2 + 3; tz += 0.25) {
        let lo = 6, hi = Math.max(90, Math.hypot(RW, RH) * 6);
        if (!fits(tz, hi, tx)) continue;
        for (let i = 0; i < 24; i++) { const d = (lo + hi) / 2; if (fits(tz, d, tx)) hi = d; else lo = d; }
        if (hi < best.d) best = { d: hi, tz, tx };
      }
    }
    target.set(best.tx, 0, best.tz);
    this.scene.fog.near = Math.max(30, best.d - 12);
    this.scene.fog.far = Math.max(68, best.d + 26);
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
    const size = roomSize(state);
    const dimensionsChanged = size.width !== this.dimensions.width || size.height !== this.dimensions.height;
    if (dimensionsChanged) {
      this.dimensions = size;
      this.fitOverview();
    }
    const decorKey = ['decor1', 'decor2', 'decor3'].map((k) => state.upgrades[k] ? 1 : 0).join('');
    const roomKey = `${state.cuisine}|${state.name}|${decorKey}|${state.mode}|${JSON.stringify(state.building || null)}`;
    const roomChanged = roomKey !== this.roomKey;
    if (roomChanged) {
      if (this.room) { this.world.remove(this.room.root); disposeRoom(this.room); }
      this.room = buildRoom(CUISINES[state.cuisine], state.name, state.upgrades, state);
      this.world.add(this.room.root);
      this.roomKey = roomKey;
      this.layoutKey = '';
      this.placeLights(this.area === 'alley' ? ALLEY_SIZE : size);
    }
    if (this.alleyKey !== state.cuisine) {
      if (this.alley) { this.world.remove(this.alley.root); disposeTree(this.alley.root); }
      this.alley = buildAlley(CUISINES[state.cuisine]);
      this.world.add(this.alley.root);
      this.alleyKey = state.cuisine;
    }
    this.layoutGuide.setState(state);
    const key = `${size.width}:${size.height}|` + state.objects.map((o) => `${o.id}:${o.type}:${o.x}:${o.z}`).join('|');
    if (key === this.layoutKey) return;
    this.layoutKey = key;
    const pal = CUISINES[state.cuisine].palette;
    const grid = buildGrid(state);
    const seen = new Set();
    for (const o of state.objects) {
      seen.add(o.id);
      let e = this.objs.get(o.id);
      if (e && (roomChanged || e.x !== o.x || e.z !== o.z)) { this.world.remove(e.group); disposeTree(e.group); this.objs.delete(o.id); e = null; }
      if (e) continue;
      e = this.buildObject(o, pal, grid, state);
      this.objs.set(o.id, e);
      this.world.add(e.group);
    }
    for (const [id, e] of this.objs) {
      if (!seen.has(id)) { this.world.remove(e.group); disposeTree(e.group); this.objs.delete(id); }
    }
    this.contacts.syncStatic(state);
  }

  placeLights({ width, height }) {
    const centerX = width / 2, centerZ = height / 2;
    this.sun.position.set(centerX - 16, 22, centerZ + 8.5);
    this.sun.target.position.set(centerX, 0, centerZ - 0.5);
    const span = Math.max(15, width * 0.65);
    Object.assign(this.sun.shadow.camera, { left: -span, right: span, top: Math.max(13, height * 0.8), bottom: -Math.max(13, height * 0.8), far: Math.max(60, width + height) });
    this.sun.shadow.camera.updateProjectionMatrix();
    const diningZ = (6 + height - 1) / 2;
    for (const [index, [x, z]] of [[width * 0.3, diningZ], [width * 0.7, diningZ], [centerX, 2.5]].entries()) {
      this.lamps[index].position.set(x, 2.4, z);
      this.lamps[index].distance = Math.max(9, width * 0.4);
    }
  }

  buildObject(o, pal, grid, state) {
    const e = { id: o.id, type: o.type, x: o.x, z: o.z, sig: '', item: null };
    if (o.type === 'table') {
      const cloth = CUISINES[state.cuisine].palette.cloth;
      e.group = tableModel(o.seats, pal, cloth, state.cuisine);
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
    const area = opts.area === 'alley' ? 'alley' : 'restaurant';
    const areaChanged = area !== this.area;
    if (areaChanged) {
      if (area === 'alley') this.restaurantZoom = this.zoomTarget;
      this.area = area;
      this.zoom = this.zoomTarget = area === 'alley' ? 1 : (this.restaurantZoom ?? DEFAULT_ZOOM);
      this.camMode = this.zoomTarget > 0.02 ? 'follow' : 'overview';
      this.snapCamera = true;
    }
    this.ensureLayout(state);
    this.state = state;
    if (areaChanged) {
      this.placeLights(area === 'alley' ? ALLEY_SIZE : this.dimensions);
      this.fitOverview();
      this.camPos.copy(this.overview.pos);
      this.camLook.copy(this.overview.look);
    }
    const inside = this.area === 'restaurant';
    this.room.root.visible = inside;
    this.alley.root.visible = !inside;
    this.contacts.staticLayer.visible = inside;
    for (const o of state.objects) {
      const e = this.objs.get(o.id);
      if (e) { e.group.visible = inside; this.syncObject(e, o, state, dt); }
    }
    this.syncPeople(state, dt, opts);
    this.contacts.syncPeople(this.chefs, this.guests);
    this.syncLighting(state, dt);
    this.particles.update(dt, this.area);
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
        if (active && this.area === 'restaurant') {
          const burning = it.over > 0 && o.type !== 'pot' && it.q < 1;
          e.puff = (e.puff || 0) - dt;
          if (e.puff <= 0) {
            e.puff = burning ? 0.12 : o.type === 'pot' ? 0.18 : 0.3;
            const p = e.group.position;
            this.particles.puff(p.x + (Math.random() - 0.5) * 0.3, e.slotY + 0.15, p.z + (Math.random() - 0.5) * 0.3, burning ? 0x3a3432 : 0xf4f0ea, burning ? 0.7 : 0.45);
          }
        } else if (it && it.st === 'burnt' && this.area === 'restaurant') {
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
        if (this.area === 'restaurant' && o.wash > 0 && Math.random() < dt * 8) { const p = e.group.position; this.particles.puff(p.x, COUNTER_H + 0.1, p.z, 0xd8eef8, 0.3, true); }
        break;
      }
      case 'bin': {
        const full = (o.trash || 0) >= TRASH_CAPACITY;
        if (e.sig !== String(full)) {
          e.sig = String(full);
          if (e.item) { e.slot.remove(e.item); disposeTree(e.item); e.item = null; }
          if (full) {
            e.item = trashBagModel();
            e.item.scale.setScalar(0.7);
            e.item.position.y = 0.65;
            e.slot.add(e.item);
          }
        }
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
      const area = playerArea(p);
      const pose = poses[pid] && playerArea(poses[pid]) === area ? poses[pid] : p;
      if (c.area !== area || c.areaRev !== p.areaRev) { c.x = pose.x; c.z = pose.z; c.rot = pose.rot; }
      c.area = area;
      c.areaRev = p.areaRev;
      c.m.root.visible = area === this.area;
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
        if (c.item) { c.m.hand.remove(c.item); disposeTree(c.item); c.item = null; }
        if (p.hand) { c.item = p.hand.k === 'trash' ? trashBagModel() : itemMesh(state, p.hand, 1.05); c.m.hand.add(c.item); }
      }
      animatePerson(c.m, { speed, dt, carrying: !!p.hand, working: !!p.working, t: this.t });
      const arm = c.m.arms[1];
      arm.rotation.z = 0;
      arm.scale.y = 1;
      if (!c.cigarette) {
        c.cigarette = cigaretteModel();
        c.m.body.add(c.cigarette);
      }
      c.cigarette.visible = !!p.smoking;
      if (p.smoking) {
        const age = Math.max(0, SMOKE_SECONDS - p.smoking.left);
        const cycle = age % 6, cycleId = Math.floor(age / 6);
        const canGesture = !p.hand && !p.working;
        c.cigarette.position.set(0.025, c.m.top + 0.71, 0.15);
        c.cigarette.rotation.set(-0.08, 0, -0.06);
        if (canGesture && cycle >= 2.4 && cycle < 5.8) {
          const reach = THREE.MathUtils.smoothstep(cycle, 2.4, 3) * (1 - THREE.MathUtils.smoothstep(cycle, 5.2, 5.8));
          const away = THREE.MathUtils.smoothstep(cycle, 3, 3.6) * (1 - THREE.MathUtils.smoothstep(cycle, 4.6, 5.2));
          arm.rotation.x = THREE.MathUtils.lerp(arm.rotation.x, -2.46 + away * 1.25, reach);
          arm.rotation.z = (-0.83 + away * 0.68) * reach;
          arm.scale.y = 1 - 0.23 * reach;
          if (cycle >= 3 && cycle < 5.2) {
            arm.updateWorldMatrix(true, false);
            arm.localToWorld(_v.set(0, -0.47, 0.015));
            c.m.body.worldToLocal(_v);
            c.cigarette.position.copy(_v);
          }
        }
        if (c.m.root.visible) {
          c.smokePuff = (c.smokePuff || 0) - dt;
          if (c.smokePuff <= 0) {
            c.smokePuff = 0.45;
            c.cigarette.updateWorldMatrix(true, false);
            c.cigarette.localToWorld(_v.set(0, 0, 0.27));
            this.particles.puff(_v.x, _v.y, _v.z, 0xe2ded4, 0.25, false, area);
          }
          if (cycle >= 3.6 && c.exhaleCycle !== cycleId) {
            c.exhaleCycle = cycleId;
            c.m.body.updateWorldMatrix(true, false);
            c.m.body.localToWorld(_v.set(0, c.m.top + 0.72, 0.24));
            this.particles.exhale(_v.x, _v.y, _v.z, c.rot, area);
          }
        }
      } else {
        c.exhaleCycle = null;
        c.smokePuff = 0;
      }
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
        c.m.root.visible = this.area === 'restaurant';
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
    if (this.room.outsideMat) this.room.outsideMat.color.setHex(mix(0xffffff, 0x68718c, evening * 0.7));
    const target = 1.2 - evening * 0.35;
    this.hemi.intensity += (target - this.hemi.intensity) * Math.min(1, dt * 2);
    this.sun.intensity += ((2.0 - evening * 1.35) - this.sun.intensity) * Math.min(1, dt * 2);
    for (const l of this.lamps) l.intensity += ((this.area === 'restaurant' ? evening * 12 : 0) - l.intensity) * Math.min(1, dt * 2);
    for (const l of this.alley.lights) l.intensity = 2 + evening * 5;
  }

  setCameraMode(mode) {
    this.camMode = mode;
    this.zoomTarget = mode === 'follow' ? DEFAULT_ZOOM : 0;
  }

  /** Mouse wheel: positive delta zooms out. Zoom 0 = whole room, 1 = closest. */
  zoomBy(delta) {
    this.zoomTarget = Math.max(0, Math.min(1, (this.zoomTarget || 0) - delta));
    this.camMode = this.zoomTarget > 0.02 ? 'follow' : 'overview';
  }

  updateCamera(dt, opts) {
    if (!this.overview) return;
    const { width: RW, height: RH } = this.area === 'alley' ? ALLEY_SIZE : this.dimensions;
    if (this.zoom == null) { this.zoom = 0; }
    if (this.zoomTarget == null) this.zoomTarget = DEFAULT_ZOOM;
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
    const follow = Math.min(1, z / DEFAULT_ZOOM);
    look.set(OL.x + (fx - OL.x) * follow, OL.y + (0.5 - OL.y) * z, OL.z + (fz - OL.z) * follow);
    // Gameplay zoom has a fixed scale even after the building grows.
    const followDistance = Math.min(d0, 28), closeDistance = Math.min(d0, 16);
    const dist = z <= DEFAULT_ZOOM
      ? THREE.MathUtils.lerp(d0, followDistance, z / DEFAULT_ZOOM)
      : THREE.MathUtils.lerp(followDistance, closeDistance, (z - DEFAULT_ZOOM) / (1 - DEFAULT_ZOOM));
    const pos = this._pos || (this._pos = new THREE.Vector3());
    pos.copy(look).addScaledVector(dir, dist);
    const k = this.snapCamera ? 1 : Math.min(1, dt * 6);
    this.snapCamera = false;
    this.camPos.lerp(pos, k);
    this.camLook.lerp(look, k);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
  }

  setLayoutMode(on, state) {
    if (on) {
      if (this.layoutZoom == null) this.layoutZoom = this.zoomTarget == null ? DEFAULT_ZOOM : this.zoomTarget;
      this.zoom = this.zoomTarget = 0;
      this.fitOverview();
      this.camPos.copy(this.overview.pos);
      this.camLook.copy(this.overview.look);
      this.camera.position.copy(this.camPos);
      this.camera.lookAt(this.camLook);
      this.layoutGuide.setPalette(CUISINES[state.cuisine].palette.accent);
      this.layoutGuide.setState(state);
    } else if (this.layoutZoom != null) {
      this.zoomTarget = this.layoutZoom;
      this.layoutZoom = null;
      this.clearLayoutPreview();
    }
    this.layoutGuide.root.visible = !!on;
    this.renderer.domElement.classList.toggle('layout-edit', !!on);
    if (!on) { this.renderer.domElement.classList.remove('layout-dragging'); this.layoutGuide.clear(); }
  }

  setLayoutSelection(state, id) {
    const o = id && state && state.objects.find((item) => item.id === id);
    this.layoutGuide.setOrigin(o ? footprint(o) : null);
  }

  previewLayoutObject(state, id, x, z, valid) {
    this.clearObjectPreview();
    const o = state.objects.find((item) => item.id === id);
    const e = this.objs.get(id);
    if (!o || !e) return;
    this.previewId = id;
    if (o.type === 'table') e.group.position.set(x, 0, z);
    else e.group.position.set(x + 0.5, 0, z + 0.5);
    this.layoutGuide.setTarget({ ...footprint(o), x, z }, valid);
  }

  clearObjectPreview() {
    if (!this.previewId || !this.state) return;
    const o = this.state.objects.find((item) => item.id === this.previewId);
    const e = this.objs.get(this.previewId);
    if (o && e) {
      if (o.type === 'table') e.group.position.set(o.x, 0, o.z);
      else e.group.position.set(o.x + 0.5, 0, o.z + 0.5);
    }
    this.previewId = null;
  }

  clearLayoutPreview() {
    this.clearObjectPreview();
    this.layoutGuide.setTarget(null);
  }

  render() { this.renderer.render(this.scene, this.camera); }

  /** World position of an object's slot (for overlay markers). */
  anchorOf(id) {
    if (this.area === 'alley') {
      const o = ALLEY_OBJECTS.find((item) => item.id === id);
      return o ? { x: o.x + (o.type === 'backdoor' ? 0.1 : (o.w || 1) / 2), y: o.type === 'backdoor' ? 2.5 : 1.8, z: o.z + (o.h || 1) / 2 } : null;
    }
    if (id === BACK_DOOR.id) return { x: BACK_DOOR.x + 0.95, y: 2.5, z: BACK_DOOR.z + 0.5 };
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
    return c && c.m.root.visible ? { x: c.x, y: 2.35, z: c.z } : null;
  }

  guestAnchor(id) {
    const c = this.guests.get(id);
    return c && c.m.root.visible ? { x: c.x, y: 1.9, z: c.z } : null;
  }

  clear() {
    for (const [, e] of this.objs) { this.world.remove(e.group); disposeTree(e.group); }
    this.objs.clear();
    for (const [, c] of this.chefs) { this.world.remove(c.m.root); disposeTree(c.m.root); }
    this.chefs.clear();
    for (const [, c] of this.guests) { this.world.remove(c.m.root); disposeTree(c.m.root); }
    this.guests.clear();
    if (this.room) { this.world.remove(this.room.root); disposeRoom(this.room); this.room = null; }
    if (this.alley) { this.world.remove(this.alley.root); disposeTree(this.alley.root); this.alley = null; }
    this.alleyKey = '';
    this.particles.clear();
    this.contacts.clear();
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
    // Food meshes with a signature share cached geometry between instances.
    if (!o.isMesh || o.userData.sig) return;
    if (o.geometry) o.geometry.dispose();
    if (o.material && o.material !== MAT.solid && o.material !== MAT.glow && o.material !== MAT.glass && o.material.dispose) {
      if (o.material.map) o.material.map.dispose();
      o.material.dispose();
    }
  });
}

class LayoutGuide {
  constructor() {
    this.root = new THREE.Group();
    this.root.visible = false;
    this.gridMat = new THREE.MeshBasicMaterial({ color: 0x48b7c4, vertexColors: true, transparent: true, opacity: 0.58, depthWrite: false });
    this.grid = new THREE.Mesh(new THREE.BufferGeometry(), this.gridMat);
    this.grid.renderOrder = 4;
    this.root.add(this.grid);
    this.origin = this.marker(0xf0c060, 0.28);
    this.target = this.marker(0x54bd68, 0.52);
    this.root.add(this.origin, this.target);
    this.key = '';
  }

  setState(state) {
    const { width: RW, height: RH } = roomSize(state);
    const key = `${state.mode}:${RW}:${RH}:${JSON.stringify(state.building?.divider || null)}`;
    if (key === this.key) return;
    this.key = key;
    const gridShape = new Shape(false);
    for (let z = 1; z < RH - 1; z++) {
      for (let x = 1; x < RW - 1; x++) {
        if (isWallTile(state, x, z) || layoutTile(state, x, z) === 'D') continue;
        gridShape.box(0.9, 0.018, 0.025, 0xffffff, x + 0.5, 0.035, z + 0.06);
        gridShape.box(0.9, 0.018, 0.025, 0xffffff, x + 0.5, 0.035, z + 0.94);
        gridShape.box(0.025, 0.018, 0.9, 0xffffff, x + 0.06, 0.035, z + 0.5);
        gridShape.box(0.025, 0.018, 0.9, 0xffffff, x + 0.94, 0.035, z + 0.5);
      }
    }
    this.grid.geometry.dispose();
    this.grid.geometry = gridShape.build();
  }

  marker(color, opacity) {
    const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 0.035, 1), material);
    mesh.visible = false;
    mesh.renderOrder = 5;
    return mesh;
  }

  setPalette(color) { this.gridMat.color.setHex(color); }

  place(mesh, f, y) {
    if (!f) { mesh.visible = false; return; }
    mesh.visible = true;
    mesh.position.set(f.x + f.w / 2, y, f.z + f.h / 2);
    mesh.scale.set(Math.max(0.08, f.w - 0.1), 1, Math.max(0.08, f.h - 0.1));
  }

  setOrigin(f) { this.place(this.origin, f, 0.055); }

  setTarget(f, valid = true) {
    this.target.material.color.setHex(valid ? 0x54bd68 : 0xd84c3f);
    this.place(this.target, f, 0.08);
  }

  clear() { this.setOrigin(null); this.setTarget(null); }
}

class ContactShadows {
  constructor(scene) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createRadialGradient(32, 32, 3, 32, 32, 31);
    gradient.addColorStop(0, 'rgba(0,0,0,0.62)');
    gradient.addColorStop(0.55, 'rgba(0,0,0,0.24)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
    const texture = new THREE.CanvasTexture(canvas);
    const geometry = new THREE.PlaneGeometry(1, 1);
    geometry.rotateX(-Math.PI / 2);
    this.staticLayer = this.makeLayer(geometry, texture, 96, 0.25);
    this.peopleLayer = this.makeLayer(geometry, texture, 40, 0.32);
    scene.add(this.staticLayer, this.peopleLayer);
  }

  makeLayer(geometry, texture, count, opacity) {
    const material = new THREE.MeshBasicMaterial({ color: 0x2a1b18, map: texture, transparent: true, opacity, depthWrite: false, toneMapped: false });
    const layer = new THREE.InstancedMesh(geometry, material, count);
    layer.count = 0;
    layer.frustumCulled = false;
    layer.renderOrder = 1;
    return layer;
  }

  set(layer, index, x, z, sx, sz) {
    _shadowMatrix.compose(_shadowPosition.set(x, 0.012, z), _shadowRotation.identity(), _shadowScale.set(sx, 1, sz));
    layer.setMatrixAt(index, _shadowMatrix);
  }

  syncStatic(state) {
    let n = 0;
    for (const o of state.objects) {
      if (n >= this.staticLayer.instanceMatrix.count) break;
      if (o.type === 'table') {
        if (o.seats === 4) this.set(this.staticLayer, n++, o.x + 1, o.z + 1.5, 2.15, 1.65);
        else this.set(this.staticLayer, n++, o.x + 1.5, o.z + 0.5, 1.65, 0.92);
      } else {
        this.set(this.staticLayer, n++, o.x + 0.5, o.z + 0.5, 0.86, 0.72);
      }
    }
    this.staticLayer.count = n;
    this.staticLayer.instanceMatrix.needsUpdate = true;
  }

  syncPeople(chefs, guests) {
    let n = 0;
    for (const people of [chefs, guests]) {
      for (const [, person] of people) {
        if (!person.m.root.visible) continue;
        if (n >= this.peopleLayer.instanceMatrix.count) break;
        this.set(this.peopleLayer, n++, person.x, person.z, 0.62, 0.42);
      }
    }
    this.peopleLayer.count = n;
    this.peopleLayer.instanceMatrix.needsUpdate = true;
  }

  clear() {
    this.staticLayer.count = 0;
    this.peopleLayer.count = 0;
  }
}

/** Cheap steam and smoke puffs. */
function smallFade(t) { return Math.min(1, t * 8); }

class Particles {
  constructor(scene) {
    this.pool = [];
    this.live = [];
    this.geo = new THREE.IcosahedronGeometry(0.09, 0);
    this.smokeGeo = new THREE.SphereGeometry(0.09, 7, 5);
    this.scene = scene;
  }
  puff(x, y, z, color, size = 0.5, small = false, area = 'restaurant') {
    let p = this.pool.pop();
    if (!p) {
      p = new THREE.Mesh(this.geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6, depthWrite: false }));
      this.scene.add(p);
    }
    p.material.color.setHex(color);
    p.geometry = this.geo;
    p.visible = true;
    p.position.set(x, y, z);
    p.userData.life = 0;
    p.userData.area = area;
    p.userData.max = small ? 0.5 : 1.2;
    p.userData.size = size * (small ? 0.5 : 1);
    p.userData.opacity = 0.48;
    p.userData.rise = 0.58;
    p.userData.vx = (Math.random() - 0.5) * 0.2;
    p.userData.vz = (Math.random() - 0.5) * 0.2;
    p.userData.wobble = Math.random() * Math.PI * 2;
    p.userData.spin = (Math.random() - 0.5) * 1.8;
    this.live.push(p);
  }
  exhale(x, y, z, rot, area) {
    for (let i = 0; i < 3; i++) {
      this.puff(x + Math.sin(rot) * i * 0.05, y + i * 0.035, z + Math.cos(rot) * i * 0.05, 0xe5e3d9, 1.15 - i * 0.12, false, area);
      const p = this.live[this.live.length - 1];
      p.geometry = this.smokeGeo;
      p.userData.max = 1.8;
      p.userData.opacity = 0.22;
      p.userData.rise = 0.65;
      p.userData.vx = Math.sin(rot) * 0.18 + (i - 1) * 0.05;
      p.userData.vz = Math.cos(rot) * 0.18;
    }
  }
  update(dt, area) {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const p = this.live[i];
      const u = p.userData;
      p.visible = u.area === area;
      u.life += dt;
      const t = u.life / u.max;
      if (t >= 1) { p.visible = false; this.live.splice(i, 1); this.pool.push(p); continue; }
      p.position.x += u.vx * dt;
      p.position.z += u.vz * dt;
      p.position.y += dt * (u.rise + t * 0.25);
      p.position.x += Math.sin(u.life * 5 + u.wobble) * dt * 0.035;
      p.rotation.y += u.spin * dt;
      const grow = u.size * (0.55 + t * 1.45);
      p.scale.set(grow * (0.82 + t * 0.18), grow * (1.0 + t * 0.55), grow * (0.82 + t * 0.18));
      p.material.opacity = u.opacity * (1 - t) * (smallFade(t));
    }
  }
  clear() {
    for (const p of this.live) { p.visible = false; this.pool.push(p); }
    this.live.length = 0;
  }
}
