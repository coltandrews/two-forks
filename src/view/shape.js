// Code-built low-poly geometry. Every model is vertex-colored and shares one
// flat-shaded material, so the whole restaurant renders in few draw calls.
import * as THREE from 'three';

export const MAT = {
  solid: new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
  glow: new THREE.MeshBasicMaterial({ vertexColors: true }),
  glass: new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, transparent: true, opacity: 0.55 }),
};

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

function hash3(x, y, z) {
  const h = Math.sin(Math.round(x * 1000) * 12.9898 + Math.round(y * 1000) * 78.233 + Math.round(z * 1000) * 37.719) * 43758.5453;
  return h - Math.floor(h);
}

/** Collects colored, transformed parts and merges them into one geometry. */
export class Shape {
  constructor(shaded = true) { this.parts = []; this.shaded = shaded; }

  add(geo, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (g !== geo) geo.dispose();
    if (!g.attributes.normal) g.computeVertexNormals();
    _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz));
    g.applyMatrix4(_m);
    _c.set(color);
    const pos = g.attributes.position;
    const normal = g.attributes.normal;
    const n = pos.count;
    let minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < n; i++) {
      minY = Math.min(minY, pos.getY(i));
      maxY = Math.max(maxY, pos.getY(i));
    }
    const height = Math.max(0.001, maxY - minY);
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const rise = (pos.getY(i) - minY) / height;
      const face = Math.max(0, normal.getY(i)) * 0.045 + normal.getX(i) * -0.018 + normal.getZ(i) * 0.012;
      const k = this.shaded ? THREE.MathUtils.clamp(0.92 + rise * 0.075 + face, 0.84, 1.06) : 1;
      col[i * 3] = Math.min(1, _c.r * k);
      col[i * 3 + 1] = Math.min(1, _c.g * k);
      col[i * 3 + 2] = Math.min(1, _c.b * k);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    if (g.attributes.uv) g.deleteAttribute('uv');
    this.parts.push(g);
    return this;
  }

  box(w, h, d, color, x, y, z, rx, ry, rz) { return this.add(new THREE.BoxGeometry(w, h, d), color, x, y, z, rx, ry, rz); }

  cyl(rt, rb, h, seg, color, x, y, z, rx, ry, rz) {
    return this.add(new THREE.CylinderGeometry(rt, rb, h, seg), color, x, y, z, rx, ry, rz);
  }

  cone(r, h, seg, color, x, y, z, rx, ry, rz) { return this.add(new THREE.ConeGeometry(r, h, seg), color, x, y, z, rx, ry, rz); }

  sphere(r, color, x, y, z, sx = 1, sy = 1, sz = 1, seg = 7, ry = 0) {
    return this.add(new THREE.SphereGeometry(r, seg, Math.max(4, seg - 2)), color, x, y, z, 0, ry, 0, sx, sy, sz);
  }

  ico(r, color, x, y, z, sy = 1, jitter = 0.2, seed = 1) {
    const g = new THREE.IcosahedronGeometry(r, 0);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const px = pos.getX(i), py = pos.getY(i), pz = pos.getZ(i);
      const k = 1 + (hash3(px + seed, py, pz) - 0.5) * 2 * jitter;
      pos.setXYZ(i, px * k, py * k, pz * k);
    }
    g.computeVertexNormals();
    return this.add(g, color, x, y, z, 0, 0, 0, 1, sy, 1);
  }

  torus(r, t, color, x, y, z, rx = Math.PI / 2, ry = 0, rz = 0, arc = Math.PI * 2, seg = 10) {
    return this.add(new THREE.TorusGeometry(r, t, 4, seg, arc), color, x, y, z, rx, ry, rz);
  }

  /** Merges another shape's parts into this one with an offset. */
  merge(other, x = 0, y = 0, z = 0, ry = 0, scale = 1) {
    _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(0, ry, 0)), _s.set(scale, scale, scale));
    for (const g of other.parts) {
      const c = g.clone();
      c.applyMatrix4(_m);
      this.parts.push(c);
    }
    return this;
  }

  build() { return mergeGeometries(this.parts); }
}

export function mergeGeometries(parts) {
  let count = 0;
  for (const g of parts) count += g.attributes.position.count;
  const pos = new Float32Array(count * 3), nor = new Float32Array(count * 3), col = new Float32Array(count * 3);
  let o = 0;
  for (const g of parts) {
    pos.set(g.attributes.position.array, o);
    nor.set(g.attributes.normal.array, o);
    col.set(g.attributes.color.array, o);
    o += g.attributes.position.count * 3;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.computeBoundingSphere();
  return out;
}

export function meshOf(shape, material = MAT.solid, cast = true, receive = true) {
  const mesh = new THREE.Mesh(shape instanceof Shape ? shape.build() : shape, material);
  mesh.castShadow = cast;
  mesh.receiveShadow = receive;
  return mesh;
}

export function shade(color, k) {
  _c.set(color);
  _c.r = Math.min(1, _c.r * k); _c.g = Math.min(1, _c.g * k); _c.b = Math.min(1, _c.b * k);
  return _c.getHex();
}

export function mix(a, b, t) {
  const ca = new THREE.Color(a), cb = new THREE.Color(b);
  return ca.lerp(cb, t).getHex();
}
