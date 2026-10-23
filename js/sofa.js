// Procedural sofa: every part is a "soft box" (rounded, optionally pillow-bulged box),
// dressed with piping along the seams, fabric-covered buttons and light wrinkles.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SIZES, ARMS, DEPTHS, LEG_STYLES, PIPING, TUFTING, byId } from './config.js';

export function computeLayout(cfg) {
  const size = byId(SIZES, cfg.size);
  const arms = byId(ARMS, cfg.arms);
  const depth = byId(DEPTHS, cfg.depth);
  const leg = byId(LEG_STYLES, cfg.legStyle);
  const armW = arms.width;
  const seatW = size.seatWidth;
  const W = seatW + armW * 2;
  const D = depth.depth;
  const Lh = leg.height;
  // heights below are relative to the bottom of the frame (frame group sits at y = Lh)
  const baseH = 0.16, seatT = 0.17, backT = 0.17;
  return {
    size, arms, depth, leg, seats: size.seats, armW, seatW, W, D, Lh,
    piping: byId(PIPING, cfg.piping ?? 'tone').id,
    tufting: byId(TUFTING, cfg.tufting ?? 'off').id === 'on',
    baseH, seatT, backT, backH: 0.8, armH: 0.6,
    H: Lh + 0.8,
  };
}

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const AXIS = { x: 0, y: 1, z: 2 };
let wrinkleSeed = 1;

/**
 * Rounded box with dense edge bands.
 *  bulge   — pillow-like dome on both faces along `axis`
 *  wrinkle — low-frequency fabric undulation on those faces
 *  tufts   — [[u, v]] in -1..1 on the +axis face, pulled in like capitonné
 * geo.userData.tufts holds the resulting button anchor points.
 */
export function softBox(w, h, d, { r = 0.04, bulge = 0, axis = 'y', k = 5, step = 0.04, wrinkle = 0, tufts = [], tuftDepth = 0.028, tuftRadius = 0.06 } = {}) {
  const half = [w / 2, h / 2, d / 2];
  r = Math.min(r, ...half.map((v) => v - 1e-4));
  const segs = half.map((hv) => {
    const m = Math.max(1, Math.ceil((2 * (hv - r)) / step));
    return { n: 2 * k + m, m };
  });
  const geo = new THREE.BoxGeometry(w, h, d, segs[0].n, segs[1].n, segs[2].n);
  const pos = geo.attributes.position;

  // Box vertices are evenly spaced; pack k of them into each rounded band near the edges.
  const remap = (c, i) => {
    const hv = half[i], { n, m } = segs[i];
    const idx = Math.round(((c / hv + 1) / 2) * n);
    if (idx <= k) return -hv + r * (idx / k);
    if (idx >= n - k) return hv - r * ((n - idx) / k);
    return -hv + r + 2 * (hv - r) * ((idx - k) / m);
  };

  // which axis each BoxGeometry plane faces (px, nx, py, ny, pz, nz)
  const [sx, sy, sz] = segs.map((s) => s.n);
  const faceCounts = [(sz + 1) * (sy + 1), (sz + 1) * (sy + 1), (sx + 1) * (sz + 1), (sx + 1) * (sz + 1), (sx + 1) * (sy + 1), (sx + 1) * (sy + 1)];
  const faceAxis = [0, 0, 1, 1, 2, 2];

  const ai = AXIS[axis];
  const ui = (ai + 1) % 3, vi = (ai + 2) % 3;
  const dome = (u, v) => Math.pow(Math.max(0, 1 - u * u), 0.7) * Math.pow(Math.max(0, 1 - v * v), 0.7);
  const seed = wrinkleSeed++ * 1.7;
  const noise = (a, b) => 0.55 * Math.sin(a * 11 + seed) * Math.sin(b * 9 - seed * 0.7)
    + 0.3 * Math.sin((a + b) * 17 + seed * 2.3) + 0.15 * Math.sin((a - b) * 29 + seed);
  const sigma2 = 2 * (tuftRadius * 0.5) ** 2;
  const pinch = (pu, pv) => {
    let s = 0;
    for (const [tu, tv] of tufts) {
      const du = pu - tu * half[ui], dv = pv - tv * half[vi];
      s += Math.exp(-(du * du + dv * dv) / sigma2);
    }
    return Math.min(1, s);
  };

  const uv = new Float32Array(pos.count * 2);
  const p = [0, 0, 0];
  let face = 0, faceEnd = faceCounts[0];

  for (let i = 0; i < pos.count; i++) {
    while (i >= faceEnd) faceEnd += faceCounts[++face];
    p[0] = remap(pos.getX(i), 0);
    p[1] = remap(pos.getY(i), 1);
    p[2] = remap(pos.getZ(i), 2);
    const inner = p.map((v, j) => clamp(v, -(half[j] - r), half[j] - r));
    const dir = p.map((v, j) => v - inner[j]);
    const len = Math.hypot(...dir);
    if (len > 1e-7) for (let j = 0; j < 3; j++) p[j] = inner[j] + (dir[j] * r) / len;

    if (bulge || wrinkle) {
      const u = p[ui] / half[ui], v = p[vi] / half[vi];
      const f = dome(u, v);
      const sgn = Math.sign(p[ai]);
      p[ai] += sgn * (bulge * f + wrinkle * f * noise(p[ui], p[vi]));
      if (tufts.length && sgn > 0) p[ai] -= tuftDepth * pinch(p[ui], p[vi]) * Math.min(1, f * 3);
    }
    pos.setXYZ(i, p[0], p[1], p[2]);

    // UVs in metres so texture density is identical on every part
    const fa = faceAxis[face];
    uv[i * 2] = fa === 0 ? p[2] : p[0];
    uv[i * 2 + 1] = fa === 1 ? p[2] : p[1];
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.computeVertexNormals();
  smoothSeams(geo);

  geo.userData.tufts = tufts.map(([tu, tv]) => {
    const pt = [0, 0, 0];
    pt[ui] = tu * half[ui];
    pt[vi] = tv * half[vi];
    pt[ai] = half[ai] + bulge * dome(tu, tv) - tuftDepth * 0.85;
    return new THREE.Vector3(...pt);
  });
  return geo;
}

// BoxGeometry faces don't share vertices; average normals of coincident points to hide the seams.
function smoothSeams(geo) {
  const pos = geo.attributes.position, nor = geo.attributes.normal;
  const acc = new Map();
  const key = (i) => `${pos.getX(i).toFixed(4)}|${pos.getY(i).toFixed(4)}|${pos.getZ(i).toFixed(4)}`;
  for (let i = 0; i < pos.count; i++) {
    const kk = key(i);
    const a = acc.get(kk) ?? [0, 0, 0];
    a[0] += nor.getX(i); a[1] += nor.getY(i); a[2] += nor.getZ(i);
    acc.set(kk, a);
  }
  for (let i = 0; i < pos.count; i++) {
    const a = acc.get(key(i));
    const l = Math.hypot(a[0], a[1], a[2]) || 1;
    nor.setXYZ(i, a[0] / l, a[1] / l, a[2] / l);
  }
}

/* ------------------------------------------------------------------ details */

// Closed rounded-rectangle loop (in the plane perpendicular to `axis`, at offset `at` along it).
function roundedLoop(ha, hb, cr, axis, at) {
  const ai = AXIS[axis], ui = (ai + 1) % 3, vi = (ai + 2) % 3;
  const pts = [];
  const corners = [[1, 1, 0], [-1, 1, Math.PI / 2], [-1, -1, Math.PI], [1, -1, Math.PI * 1.5]];
  for (const [su, sv, a0] of corners) {
    for (let s = 0; s <= 8; s++) {
      const a = a0 + (s / 8) * (Math.PI / 2);
      const p = [0, 0, 0];
      p[ui] = su * (ha - cr) + Math.cos(a) * cr;
      p[vi] = sv * (hb - cr) + Math.sin(a) * cr;
      p[ai] = at;
      pts.push(new THREE.Vector3(...p));
    }
  }
  return new THREE.CatmullRomCurve3(pts, true, 'centripetal');
}

/**
 * Piping cord along the rounded edges of a soft box, at both ends of `axis`
 * (or only the + end with ends: 'pos'). With ends: 'mid' it runs around the middle (pillows).
 */
export function pipingGeometry(w, h, d, r, axis, { ends = 'both', radius = 0.0065 } = {}) {
  const half = [w / 2, h / 2, d / 2];
  r = Math.min(r, ...half.map((v) => v - 1e-4));
  const ai = AXIS[axis], ui = (ai + 1) % 3, vi = (ai + 2) % 3;
  const c45 = Math.SQRT1_2;
  const loops = [];
  if (ends === 'mid') {
    loops.push(roundedLoop(half[ui] + radius * 0.4, half[vi] + radius * 0.4, r + radius * 0.4, axis, 0));
  } else {
    const ha = half[ui] - r + r * c45 + radius * 0.5, hb = half[vi] - r + r * c45 + radius * 0.5;
    const at = half[ai] - r + r * c45 + radius * 0.5;
    loops.push(roundedLoop(ha, hb, r * c45 + radius * 0.5, axis, at));
    if (ends === 'both') loops.push(roundedLoop(ha, hb, r * c45 + radius * 0.5, axis, -at));
  }
  const geos = loops.map((c) => new THREE.TubeGeometry(c, 160, radius, 8, true));
  const merged = mergeGeometries(geos);
  geos.forEach((g) => g.dispose());
  return merged;
}

const buttonGeo = new THREE.SphereGeometry(0.017, 20, 12);
buttonGeo.scale(1, 1, 0.5);

function mesh(geo, mat, section) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  m.userData.section = section;
  return m;
}

// A cushion = soft box + optional piping + buttons, wrapped in one group so it animates as a unit.
function cushion(w, h, d, opts, mats, section, L, { pipingEnds = 'both', buttons = true } = {}) {
  const g = new THREE.Group();
  const geo = softBox(w, h, d, opts);
  g.add(mesh(geo, mats.upholstery, section));
  const trim = L.piping === 'contrast' ? mats.pillows : mats.upholstery;
  if (L.piping !== 'none') g.add(mesh(pipingGeometry(w, h, d, opts.r ?? 0.04, opts.axis ?? 'y', { ends: pipingEnds }), trim, section));
  if (buttons) {
    const ai = AXIS[opts.axis ?? 'y'];
    for (const p of geo.userData.tufts) {
      const b = mesh(buttonGeo, trim, section);
      b.position.copy(p);
      if (ai === 1) b.rotation.x = -Math.PI / 2;
      if (ai === 0) b.rotation.y = Math.PI / 2;
      g.add(b);
    }
  }
  return g;
}

// even grid of tufts on a face: cols × rows, kept away from the edges
function tuftGrid(cols, rows, mu = 0.62, mv = 0.5) {
  const out = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const u = cols === 1 ? 0 : -mu + (2 * mu * c) / (cols - 1);
      const v = rows === 1 ? 0 : -mv + (2 * mv * r) / (rows - 1);
      out.push([u, v]);
    }
  }
  return out;
}

/* ------------------------------------------------------------------ assemblies */

// Upholstered body, built from y = 0 (the group is lifted by the leg height)
export function buildFrame(L, mats) {
  const g = new THREE.Group();
  const { W, D, armW, seatW, seats, baseH, seatT, backT, backH, armH } = L;

  const base = new THREE.Group();
  base.add(mesh(softBox(W, baseH, D, { r: 0.045 }), mats.upholstery, 'material'));
  base.position.set(0, baseH / 2, 0);
  g.add(base);

  if (armW > 0) {
    const trim = L.piping === 'contrast' ? mats.pillows : mats.upholstery;
    for (const s of [-1, 1]) {
      const arm = new THREE.Group();
      arm.add(mesh(softBox(armW, armH, D, { r: L.arms.radius, bulge: 0.01, axis: 'x', wrinkle: 0.002 }), mats.upholstery, 'size'));
      // piping on the arm runs around its front face only
      if (L.piping !== 'none') arm.add(mesh(pipingGeometry(armW, armH, D, L.arms.radius, 'z', { ends: 'pos' }), trim, 'size'));
      arm.position.set(s * (W / 2 - armW / 2), armH / 2, 0);
      g.add(arm);
    }
  }

  const back = new THREE.Group();
  back.add(mesh(softBox(W, backH, backT, { r: 0.065 }), mats.upholstery, 'material'));
  back.position.set(0, backH / 2, -D / 2 + backT / 2);
  g.add(back);

  const gap = 0.012;
  const cw = (seatW - gap * (seats - 1) - 0.008) / seats;
  const seatD = D - backT + 0.012;
  const xAt = (i) => -seatW / 2 + cw / 2 + 0.004 + i * (cw + gap);
  for (let i = 0; i < seats; i++) {
    const seat = cushion(cw, seatT, seatD, { r: 0.06, bulge: 0.028, axis: 'y', wrinkle: 0.004 }, mats, 'material', L, { buttons: false });
    seat.position.set(xAt(i), baseH + seatT / 2, (D / 2 + 0.012 + (-D / 2 + backT)) / 2);
    g.add(seat);
  }
  const cols = Math.max(2, Math.round(cw / 0.24));
  for (let i = 0; i < seats; i++) {
    const tufts = L.tufting ? tuftGrid(cols, 2, 0.6, 0.42) : [];
    const bc = cushion(cw, 0.46, 0.2, { r: 0.075, bulge: 0.04, axis: 'z', wrinkle: 0.005, tufts }, mats, 'material', L);
    bc.position.set(xAt(i), baseH + seatT - 0.02 + 0.23, -D / 2 + backT + 0.1);
    bc.rotation.x = -0.12;
    g.add(bc);
  }
  return g;
}

export function buildLegs(L, mats) {
  const g = new THREE.Group();
  const { W, D, Lh } = L;
  const style = L.leg.id;

  if (style === 'taper') {
    const geo = new THREE.CylinderGeometry(0.027, 0.015, Lh, 28);
    const xs = W > 2 ? [-1, 0, 1] : [-1, 1];
    for (const sx of xs) {
      for (const sz of [-1, 1]) {
        if (sx === 0 && sz === 1) continue;
        const leg = mesh(geo, mats.legs, 'legs');
        leg.position.set(sx * (W / 2 - 0.09), Lh / 2, sz * (D / 2 - 0.09));
        leg.rotation.set(-sz * 0.07, 0, sx * 0.07);
        g.add(leg);
      }
    }
  } else if (style === 'sled') {
    const dz = D / 2 - 0.1;
    for (const sx of [-1, 1]) {
      const x = sx * (W / 2 - 0.1);
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(x, Lh + 0.02, -dz),
        new THREE.Vector3(x, 0.05, -dz),
        new THREE.Vector3(x, 0.013, -dz + 0.05),
        new THREE.Vector3(x, 0.012, 0),
        new THREE.Vector3(x, 0.013, dz - 0.05),
        new THREE.Vector3(x, 0.05, dz),
        new THREE.Vector3(x, Lh + 0.02, dz),
      ], false, 'centripetal');
      g.add(mesh(new THREE.TubeGeometry(curve, 96, 0.012, 14), mats.legs, 'legs'));
    }
  } else {
    const plinth = mesh(softBox(W - 0.14, Lh, D - 0.14, { r: 0.02, step: 0.08 }), mats.legs, 'legs');
    plinth.position.y = Lh / 2;
    g.add(plinth);
  }
  return g;
}

export function buildPillows(L, count, mats) {
  const g = new THREE.Group();
  if (!count) return g;
  const { seatW, D, baseH, seatT, backT } = L;
  const a = Math.max(0.06, seatW / 2 - 0.26);
  for (let i = 0; i < count; i++) {
    const x = count === 1 ? -seatW / 2 + 0.3 : -a + (2 * a * i) / (count - 1);
    const pl = new THREE.Group();
    const geo = softBox(0.46, 0.46, 0.13, { r: 0.05, bulge: 0.075, axis: 'z', step: 0.03, wrinkle: 0.006, tufts: [[0, 0]], tuftDepth: 0.03, tuftRadius: 0.09 });
    pl.add(mesh(geo, mats.pillows, 'pillows'));
    if (L.piping !== 'none') pl.add(mesh(pipingGeometry(0.46, 0.46, 0.13, 0.05, 'z', { ends: 'mid', radius: 0.007 }), mats.pillows, 'pillows'));
    const btn = mesh(buttonGeo, mats.pillows, 'pillows');
    btn.position.copy(geo.userData.tufts[0]);
    pl.add(btn);
    const alt = i % 2 ? 1 : -1;
    pl.position.set(x, baseH + seatT + 0.22, -D / 2 + backT + 0.29 + (alt > 0 ? 0.03 : 0));
    pl.rotation.set(-0.3, alt * 0.12, alt * 0.06 + (count === 1 ? 0.08 : 0));
    g.add(pl);
  }
  return g;
}

// Complete, static model (used by catalogue renders and AR export); the configurator assembles parts itself to animate them.
export function buildSofa(cfg, mats) {
  const L = computeLayout(cfg);
  const g = new THREE.Group();
  const upper = new THREE.Group();
  upper.position.y = L.Lh;
  upper.add(buildFrame(L, mats), buildPillows(L, cfg.pillows, mats));
  g.add(upper, buildLegs(L, mats));
  g.userData.layout = L;
  return g;
}
