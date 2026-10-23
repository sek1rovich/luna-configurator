import * as THREE from 'three';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import {
  SIZES, ARMS, DEPTHS, MATERIALS, COLORS, LEG_STYLES, LEG_FINISHES, PIPING, TUFTING, PILLOW_PRICE,
  DEFAULTS, PRESETS, byId, computePrice,
} from './config.js';
import { computeLayout, buildFrame, buildLegs, buildPillows, buildSofa } from './sofa.js';
import { openAR, arLink } from './ar.js';
import {
  createStudio, makeMaterials, applyFabric, applyLegFinish, tweenColor, disposeGroup,
  tween, tweens, runTweens, ease, lerp, deg,
} from './studio.js';
import { $, cart, bumpCart, toast, confetti, configTitle, rowLabel, leadText, monthlyText } from './shell.js';
import { t, opt, money, signed, delta } from './i18n.js';


/* ------------------------------------------------------------------ state */

const state = { ...DEFAULTS, ...readHash() };
clampPillows();
let L = computeLayout(state);

function readHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  const lists = { size: SIZES, arms: ARMS, depth: DEPTHS, material: MATERIALS, color: COLORS, legStyle: LEG_STYLES, legFinish: LEG_FINISHES, pillowColor: COLORS, piping: PIPING, tufting: TUFTING };
  const out = {};
  for (const [k, list] of Object.entries(lists)) if (list.some((o) => o.id === p.get(k))) out[k] = p.get(k);
  if (p.has('pillows')) out.pillows = Math.max(0, Math.min(4, parseInt(p.get('pillows'), 10) || 0));
  return out;
}
function writeHash() {
  history.replaceState(null, '', `#${new URLSearchParams(state)}`);
}
function clampPillows() {
  state.pillows = Math.min(state.pillows, byId(SIZES, state.size).maxPillows);
}

/* ------------------------------------------------------------------ renderer & scene */

const stage = $('#stage');
const viewport = $('#viewport');
const { renderer, scene, camera, controls, tex, contact } = createStudio(viewport);
contact.scale.set(L.W + 0.7, L.D + 0.7, 1);

const labels = new CSS2DRenderer();
labels.domElement.style.cssText = 'position:absolute;inset:0;pointer-events:none';
viewport.appendChild(labels.domElement);

const mats = makeMaterials(tex, {
  material: state.material,
  color: byId(COLORS, state.color).hex,
  pillowColor: byId(COLORS, state.pillowColor).hex,
  legFinish: state.legFinish,
});


/* ------------------------------------------------------------------ sofa assembly */

const sofa = new THREE.Group();
const upper = new THREE.Group(); // body + pillows, lifted by leg height
upper.position.y = L.Lh;
sofa.add(upper);
scene.add(sofa);
let frameGroup, legsGroup, pillowsGroup;

function squashOut(g) {
  if (!g) return;
  const s = g.scale.clone();
  tween({
    duration: 240, easing: ease.inCubic,
    update: (k) => g.scale.set(s.x * (1 - 0.08 * k), Math.max(0.001, s.y * (1 - k)), s.z * (1 - 0.08 * k)),
    complete: () => disposeGroup(g),
  });
}
// parts pop in from above one after another
function dropIn(g, delay = 0, stagger = 70) {
  g.children.forEach((m, i) => {
    const y = m.position.y;
    const lift = 0.5 + i * 0.04;
    m.position.y = y + lift;
    m.scale.setScalar(0.001);
    tween({
      duration: 750, delay: delay + i * stagger, easing: ease.outBack,
      update: (k) => {
        m.position.y = y + lift * (1 - k);
        m.scale.setScalar(Math.max(0.001, Math.min(1.05, 0.3 + 0.7 * k)));
      },
      complete: () => m.scale.setScalar(1),
    });
  });
}
function growUp(g, delay = 0) {
  g.scale.y = 0.001;
  tween({ duration: 650, delay, easing: ease.outBack, update: (k) => (g.scale.y = Math.max(0.001, k)) });
}
function pulse(g) {
  if (!g) return;
  tween({ duration: 520, easing: ease.outCubic, update: (k) => g.scale.setScalar(1 + 0.03 * Math.sin(Math.PI * k)) });
}

function rebuild(keys, animate = true) {
  const L0 = L;
  L = computeLayout(state);
  const has = (k) => keys.includes(k);
  if (has('frame')) {
    squashOut(frameGroup);
    frameGroup = buildFrame(L, mats);
    upper.add(frameGroup);
    if (animate) dropIn(frameGroup, 140);
  }
  if (has('legs')) {
    squashOut(legsGroup);
    legsGroup = buildLegs(L, mats);
    sofa.add(legsGroup);
    if (animate) growUp(legsGroup, 120);
  }
  if (has('pillows')) {
    squashOut(pillowsGroup);
    pillowsGroup = buildPillows(L, state.pillows, mats);
    upper.add(pillowsGroup);
    if (animate) dropIn(pillowsGroup, has('frame') ? 650 : 60, 90);
  }
  if (L0.Lh !== L.Lh) {
    const a = upper.position.y;
    tween({ duration: 700, easing: ease.inOutCubic, update: (k) => (upper.position.y = lerp(a, L.Lh, k)) });
  }
  if (L0.W !== L.W || L0.D !== L.D) {
    const sx = contact.scale.x, sy = contact.scale.y;
    tween({ duration: 700, update: (k) => contact.scale.set(lerp(sx, L.W + 0.7, k), lerp(sy, L.D + 0.7, k), 1) });
    goToView(currentView, { duration: 900 });
  }
  if (dimsOn) buildDims();
}

/* ------------------------------------------------------------------ dimensions */

let dimsOn = false;
let dimsGroup = null;
function buildDims() {
  if (dimsGroup) {
    dimsGroup.traverse((o) => o.isCSS2DObject && o.element.remove());
    disposeGroup(dimsGroup);
  }
  dimsGroup = new THREE.Group();
  if (!dimsOn) return;
  const mat = new THREE.LineBasicMaterial({ color: 0x141414, transparent: true, opacity: 0.55 });
  const { W, D, H } = L;
  const t = 0.04;
  const seg = (a, b, text) => {
    const pts = [a, b];
    const dir = b.clone().sub(a).normalize();
    const n = Math.abs(dir.y) > 0.5 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    for (const p of [a, b]) pts.push(p.clone().addScaledVector(n, t), p.clone().addScaledVector(n, -t));
    const geo = new THREE.BufferGeometry().setFromPoints([pts[0], pts[1], pts[2], pts[3], pts[4], pts[5]]);
    const line = new THREE.LineSegments(geo, mat);
    dimsGroup.add(line);
    const el = document.createElement('div');
    el.className = 'dim-label';
    el.textContent = text;
    const label = new CSS2DObject(el);
    label.position.copy(a).lerp(b, 0.5);
    dimsGroup.add(label);
  };
  const cm = (v) => `${Math.round(v * 100)} cm`;
  seg(new THREE.Vector3(-W / 2, 0.01, D / 2 + 0.22), new THREE.Vector3(W / 2, 0.01, D / 2 + 0.22), cm(W));
  seg(new THREE.Vector3(W / 2 + 0.22, 0.01, -D / 2), new THREE.Vector3(W / 2 + 0.22, 0.01, D / 2), cm(D));
  seg(new THREE.Vector3(W / 2 + 0.22, 0, -D / 2), new THREE.Vector3(W / 2 + 0.22, H, -D / 2), cm(H));
  scene.add(dimsGroup);
}

/* ------------------------------------------------------------------ camera views */

const VIEWS = {
  hero: { az: 32, polar: 72, dist: 1, ty: 0.42 },
  front: { az: 0, polar: 80, dist: 1, ty: 0.42 },
  side: { az: 82, polar: 80, dist: 0.9, ty: 0.42 },
  legs: { az: 28, polar: 86, dist: 0.6, ty: 0.18 },
};
let currentView = 'hero';
let camTween = null;

function fitDistance() {
  const aspect = camera.aspect;
  const vHalf = deg(camera.fov / 2);
  const hHalf = Math.atan(Math.tan(vHalf) * aspect);
  const byW = (Math.max(L.W, 1.2) / 2 + 0.45) / Math.tan(hHalf);
  const byH = (L.H / 2 + 0.45) / Math.tan(vHalf);
  return Math.max(byW, byH) * (aspect > 1.1 ? 1.22 : 1.1);
}

function goToView(name, { duration = 1100, from } = {}) {
  currentView = name;
  document.querySelectorAll('[data-view]').forEach((b) => b.classList.toggle('is-on', b.dataset.view === name));
  const v = VIEWS[name];
  const startT = controls.target.clone();
  const endT = new THREE.Vector3(0, L.H * v.ty, 0);
  const s0 = new THREE.Spherical().setFromVector3(from ?? camera.position.clone().sub(controls.target));
  const s1 = new THREE.Spherical(fitDistance() * v.dist, deg(v.polar), deg(v.az));
  let dTheta = s1.theta - s0.theta;
  dTheta = Math.atan2(Math.sin(dTheta), Math.cos(dTheta));
  if (camTween) tweens.delete(camTween);
  const wasAuto = controls.autoRotate;
  controls.autoRotate = false;
  const s = new THREE.Spherical();
  camTween = tween({
    duration, easing: ease.inOutCubic,
    update: (k) => {
      s.set(lerp(s0.radius, s1.radius, k), lerp(s0.phi, s1.phi, k), s0.theta + dTheta * k);
      controls.target.lerpVectors(startT, endT, k);
      camera.position.setFromSpherical(s).add(controls.target);
      camera.lookAt(controls.target);
    },
    complete: () => {
      camTween = null;
      controls.autoRotate = wasAuto || (autoOn && !userActive);
    },
  });
}

let autoOn = true;
let userActive = false;
let idleTimer;
controls.addEventListener('start', () => {
  userActive = true;
  controls.autoRotate = false;
  if (camTween) {
    tweens.delete(camTween);
    camTween = null;
  }
  clearTimeout(idleTimer);
  $('#hint').classList.add('is-gone');
});
controls.addEventListener('end', () => {
  idleTimer = setTimeout(() => {
    userActive = false;
    if (autoOn && !camTween) controls.autoRotate = true;
  }, 4500);
});

/* ------------------------------------------------------------------ hover & pick */

const SECTION_EL = { material: '#sec-material', size: '#sec-size', legs: '#sec-legs', pillows: '#sec-pillows' };
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const tooltip = $('#tooltip');
let hovered = null;
let downAt = null;

function pick(e) {
  const r = renderer.domElement.getBoundingClientRect();
  pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObject(sofa, true)[0];
  return hit?.object.userData.section ?? null;
}
const hoverMat = { material: mats.upholstery, size: mats.upholstery, legs: mats.legs, pillows: mats.pillows };
function setHover(section) {
  if (section === hovered) return;
  const prev = hovered;
  hovered = section;
  for (const [sec, m] of [[prev, 0], [section, 0.07]]) {
    if (!sec) continue;
    const mat = hoverMat[sec];
    const a = mat.emissiveIntensity, b = m;
    mat.emissive.set(0xffffff);
    tween({ duration: 220, update: (k) => (mat.emissiveIntensity = lerp(a, b, k)) });
  }
  viewport.classList.toggle('is-hover', !!section);
  tooltip.classList.toggle('is-on', !!section);
  if (section) tooltip.innerHTML = `${t(`cfg.tip.${section}`)}<small>${t(`cfg.tip.${section}Sub`)}</small>`;
}
renderer.domElement.addEventListener('pointermove', (e) => {
  const r = stage.getBoundingClientRect();
  tooltip.style.left = `${e.clientX - r.left}px`;
  tooltip.style.top = `${e.clientY - r.top}px`;
  if (e.buttons) return setHover(null);
  setHover(pick(e));
});
renderer.domElement.addEventListener('pointerleave', () => setHover(null));
renderer.domElement.addEventListener('pointerdown', (e) => (downAt = [e.clientX, e.clientY]));
renderer.domElement.addEventListener('pointerup', (e) => {
  if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5) return;
  const sec = pick(e);
  if (sec) focusSection(sec);
});
function focusSection(sec) {
  const el = $(SECTION_EL[sec]);
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  el.classList.remove('flash');
  void el.offsetWidth;
  el.classList.add('flash');
  if (sec === 'legs') goToView('legs');
}

// background word parallax
stage.addEventListener('pointermove', (e) => {
  const r = stage.getBoundingClientRect();
  const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
  $('#bgWord').style.setProperty('--px', `${-x * 30}px`);
  $('#bgWord').style.setProperty('--py', `${-y * 18}px`);
});

/* ------------------------------------------------------------------ UI */

const sofaIcon = (n) => {
  const w = 12 + n * 16, x0 = (72 - w) / 2;
  let s = `<svg viewBox="0 0 72 36"><rect x="${x0 + 6}" y="6" width="${n * 16}" height="13" rx="3"/>`;
  s += `<rect x="${x0}" y="11" width="6" height="16" rx="3"/><rect x="${x0 + w - 6}" y="11" width="6" height="16" rx="3"/>`;
  for (let i = 0; i < n; i++) s += `<rect x="${x0 + 7 + i * 16}" y="17" width="14" height="7" rx="2.5"/>`;
  s += `<path d="M${x0 + 1} 27h${w - 2}M${x0 + 4} 27l-1 5M${x0 + w - 4} 27l1 5"/></svg>`;
  return s;
};
const LEG_ICONS = {
  taper: '<svg viewBox="0 0 72 36"><rect x="10" y="6" width="52" height="12" rx="4"/><path d="M16 18l-3 14M56 18l3 14M22 18l-1 10M50 18l1 10"/></svg>',
  sled: '<svg viewBox="0 0 72 36"><rect x="10" y="6" width="52" height="12" rx="4"/><path d="M16 18v10q0 3 3 3h34q3 0 3-3V18"/></svg>',
  plinth: '<svg viewBox="0 0 72 36"><rect x="10" y="6" width="52" height="14" rx="4"/><rect x="14" y="20" width="44" height="6" rx="1.5"/></svg>',
};

function renderStatic() {
  $('#presets').innerHTML =
    PRESETS.map((p) => {
      const dots = [p.cfg.color, p.cfg.pillowColor].map((c) => `<i style="background:${byId(COLORS, c).hex}"></i>`).join('')
        + `<i class="f-${p.cfg.legFinish}"></i>`;
      return `<button class="chip" data-preset="${p.id}"><span class="chip-dots">${dots}</span>${t(`preset.${p.id}`)}</button>`;
    }).join('') + `<button class="chip" data-preset="random"><span class="chip-dice">✦</span>${t('preset.random')}</button>`;

  $('#opt-size').innerHTML = SIZES.map((s) => `
    <button class="card" data-key="size" data-val="${s.id}">
      <span class="card-icon">${sofaIcon(s.seats)}</span>
      <span class="card-title">${opt('size', s.id)}</span>
      <span class="card-sub" data-width="${s.id}"></span>
      <span class="card-price">${t('price.from', { price: money(s.price) })}</span>
    </button>`).join('');

  $('#opt-arms').innerHTML = ARMS.map((a) => `<button data-key="arms" data-val="${a.id}">${opt('arms', a.id)}</button>`).join('') + '<span class="seg-pill"></span>';
  $('#opt-depth').innerHTML = DEPTHS.map((d) => `<button data-key="depth" data-val="${d.id}">${opt('depth', d.id)}</button>`).join('') + '<span class="seg-pill"></span>';
  $('#opt-piping').innerHTML = PIPING.map((p) => `<button data-key="piping" data-val="${p.id}">${opt('piping', p.id)}</button>`).join('') + '<span class="seg-pill"></span>';
  $('#opt-tufting').innerHTML = TUFTING.map((o) => `<button data-key="tufting" data-val="${o.id}">${opt('tufting', o.id)}</button>`).join('') + '<span class="seg-pill"></span>';

  $('#opt-material').innerHTML = MATERIALS.map((m) => `
    <button class="card mat-card" data-key="material" data-val="${m.id}">
      <canvas width="108" height="108" data-thumb="${m.id}"></canvas>
      <span class="mat-text">
        <span class="card-title">${opt('material', m.id)}</span>
        <span class="card-sub">${t(`opt.materialDesc.${m.id}`)}</span>
        <span class="card-price" data-mprice="${m.id}"></span>
      </span>
    </button>`).join('');

  const swatch = (key) => COLORS.map((c) => `<button class="swatch" style="--c:${c.hex}" data-key="${key}" data-val="${c.id}" title="${opt('color', c.id)}" aria-label="${opt('color', c.id)}"></button>`).join('');
  $('#opt-color').innerHTML = swatch('color');
  $('#opt-pillowColor').innerHTML = swatch('pillowColor');

  $('#opt-legStyle').innerHTML = LEG_STYLES.map((l) => `
    <button class="card" data-key="legStyle" data-val="${l.id}">
      <span class="card-icon">${LEG_ICONS[l.id]}</span>
      <span class="card-title">${opt('leg', l.id)}</span>
      <span class="card-price">${signed(l.price)}</span>
    </button>`).join('');

  $('#opt-legFinish').innerHTML = LEG_FINISHES.map((f) => `
    <button class="finish" data-key="legFinish" data-val="${f.id}"><i class="f-${f.id}"></i>${opt('finish', f.id)}<small>${signed(f.price)}</small></button>`).join('');

  $('#tuftingNote').textContent = t('cfg.tuftingSub', { price: money(byId(TUFTING, 'on').price) });
  $('#pillowNote').textContent = t('cfg.pillowsSub', { price: money(PILLOW_PRICE) });
}

function drawThumbs() {
  const hex = byId(COLORS, state.color).hex;
  document.querySelectorAll('[data-thumb]').forEach((cv) => {
    const id = cv.dataset.thumb;
    const ctx = cv.getContext('2d');
    const s = cv.width;
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.fillStyle = hex;
    ctx.fillRect(0, 0, s, s);
    ctx.globalCompositeOperation = 'soft-light';
    ctx.globalAlpha = id === 'boucle' ? 0.9 : 0.7;
    const h = tex.heights[id];
    const scale = { boucle: 0.45, velvet: 0.8, leather: 0.5, linen: 0.5 }[id];
    ctx.drawImage(h, 0, 0, h.width * scale, h.height * scale);
    ctx.drawImage(h, h.width * scale, 0, h.width * scale, h.height * scale);
    ctx.globalCompositeOperation = 'source-over';
    const g = ctx.createLinearGradient(0, 0, s, s);
    const glow = id === 'leather' ? 0.35 : id === 'velvet' ? 0.25 : 0.12;
    g.addColorStop(0, `rgba(255,255,255,${glow})`);
    g.addColorStop(0.55, 'rgba(255,255,255,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.18)');
    ctx.globalAlpha = 1;
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  });
}

function placeSegPills() {
  document.querySelectorAll('.seg').forEach((seg) => {
    const active = seg.querySelector('.is-active');
    const pill = seg.querySelector('.seg-pill');
    if (!active) return;
    pill.style.left = `${active.offsetLeft}px`;
    pill.style.width = `${active.offsetWidth}px`;
  });
}

let shownPrice = computePrice(state).total;
let priceTween = null;
function updateUI() {
  document.querySelectorAll('[data-key]').forEach((b) => {
    const on = String(state[b.dataset.key]) === b.dataset.val;
    b.classList.toggle('is-active', on);
    b.setAttribute('aria-pressed', on);
  });
  placeSegPills();

  const size = byId(SIZES, state.size), arms = byId(ARMS, state.arms);
  for (const s of SIZES) $(`[data-width="${s.id}"]`).textContent = `${t(`opt.sizeSub.${s.id}`)} · ${Math.round((s.seatWidth + arms.width * 2) * 100)} cm`;
  for (const m of MATERIALS) $(`[data-mprice="${m.id}"]`).textContent = signed(m.price * size.seats);

  const mat = byId(MATERIALS, state.material), col = byId(COLORS, state.color);
  $('#val-size').textContent = `${opt('size', size.id)} · ${Math.round(L.W * 100)}×${Math.round(L.D * 100)} cm`;
  $('#val-material').textContent = `${opt('material', mat.id)} · ${opt('color', col.id)}`;
  $('#val-legs').textContent = `${opt('leg', state.legStyle)} · ${opt('finish', state.legFinish)}`;
  $('#val-pillows').textContent = [
    state.tufting === 'on' ? t('cfg.val.tufted') : null,
    t(`cfg.val.piping.${state.piping}`),
    state.pillows ? t('cfg.val.pillows', { n: state.pillows }) : null,
  ].filter(Boolean).join(' · ');
  $('#pillowCount').textContent = state.pillows;
  $('[data-step="-1"]').disabled = state.pillows <= 0;
  $('[data-step="1"]').disabled = state.pillows >= size.maxPillows;
  $('#opt-pillowColor').classList.toggle('is-disabled', state.pillows === 0 && state.piping !== 'contrast');

  document.querySelectorAll('[data-preset]').forEach((b) => {
    const p = PRESETS.find((x) => x.id === b.dataset.preset);
    b.classList.toggle('is-active', !!p && Object.entries(p.cfg).every(([k, v]) => state[k] === v));
  });

  document.documentElement.style.setProperty('--tint', col.hex);
  drawThumbs();
  updatePrice();
}

function updatePrice() {
  const { rows, total } = computePrice(state);
  $('#breakdown').innerHTML = `<div><ul>${rows
    .filter((r, i) => i < 4 || r.value !== 0)
    .map((r) => `<li><span>${rowLabel(r)}</span><b>${signed(r.value)}</b></li>`)
    .join('')}<li><span>${t('price.delivery')}</span><b>${t('price.free')}</b></li></ul><p class="vat">${t('price.vatNote')}</p></div>`;
  $('#monthly').textContent = `${t('price.inclVat')} · ${monthlyText(total)}`;
  $('#meta').innerHTML = `
    <span><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>${t('meta.made', { lead: leadText(state.material) })}</span>
    <span><svg viewBox="0 0 24 24"><path d="M3 7h11v9H3zM14 10h4l3 3v3h-7"/><circle cx="7" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/></svg>${t('meta.delivery')}</span>
    <span><svg viewBox="0 0 24 24"><path d="M12 3 4 6v6c0 4.5 3.4 8 8 9 4.6-1 8-4.5 8-9V6l-8-3Z"/><path d="m9 12 2 2 4-4"/></svg>${t('meta.warranty')}</span>`;

  const from = shownPrice;
  const diff = total - from;
  if (diff === 0) return void ($('#price').textContent = money(total));
  const d = $('#priceDelta');
  d.className = 'price-delta';
  void d.offsetWidth;
  d.textContent = delta(diff);
  d.classList.add(diff > 0 ? 'up' : 'down');
  if (priceTween) tweens.delete(priceTween);
  priceTween = tween({
    duration: 800, easing: ease.outQuart,
    update: (k) => {
      shownPrice = lerp(from, total, k);
      $('#price').textContent = money(shownPrice);
    },
  });
}

/* ------------------------------------------------------------------ changes */

function set(patch) {
  const prev = { ...state };
  Object.assign(state, patch);
  clampPillows();
  const changed = (...ks) => ks.some((k) => prev[k] !== state[k]);
  const keys = [];
  if (changed('size', 'arms', 'depth')) keys.push('frame', 'legs', 'pillows');
  else {
    if (changed('piping', 'tufting')) keys.push('frame', 'pillows');
    if (changed('legStyle')) keys.push('legs');
    if (changed('pillows') && !keys.includes('pillows')) keys.push('pillows');
  }
  if (keys.length) rebuild(keys);
  if (changed('material')) {
    applyFabric(mats.upholstery, tex, state.material);
    applyFabric(mats.pillows, tex, state.material);
    pulse(frameGroup);
  }
  if (changed('color')) tweenColor(mats.upholstery, byId(COLORS, state.color).hex);
  if (changed('pillowColor')) {
    tweenColor(mats.pillows, byId(COLORS, state.pillowColor).hex);
    pulse(pillowsGroup);
  }
  if (changed('legFinish')) {
    applyLegFinish(mats.legs, tex, state.legFinish);
    tweenColor(mats.legs, byId(LEG_FINISHES, state.legFinish).color, 500);
  }
  updateUI();
  writeHash();
}

function randomConfig() {
  const pick = (list) => list[Math.floor(Math.random() * list.length)].id;
  const size = pick(SIZES);
  const colors = COLORS.map((c) => c.id);
  const color = pick(COLORS);
  return {
    size, arms: pick(ARMS), depth: pick(DEPTHS), material: pick(MATERIALS), color,
    legStyle: pick(LEG_STYLES), legFinish: pick(LEG_FINISHES), piping: pick(PIPING), tufting: pick(TUFTING),
    pillows: Math.floor(Math.random() * (byId(SIZES, size).maxPillows + 1)),
    pillowColor: colors.filter((c) => c !== color)[Math.floor(Math.random() * (colors.length - 1))],
  };
}

$('#panel').addEventListener('click', (e) => {
  const opt = e.target.closest('[data-key]');
  if (opt) {
    const k = opt.dataset.key;
    set({ [k]: opt.dataset.val });
    if (k === 'legStyle' || k === 'legFinish') {
      if (currentView !== 'legs') goToView('legs');
    } else if (currentView === 'legs') goToView('hero');
    return;
  }
  const step = e.target.closest('[data-step]');
  if (step) return set({ pillows: Math.max(0, state.pillows + Number(step.dataset.step)) });
  const preset = e.target.closest('[data-preset]');
  if (preset) {
    const cfg = preset.dataset.preset === 'random' ? randomConfig() : PRESETS.find((p) => p.id === preset.dataset.preset).cfg;
    set(cfg);
    if (currentView !== 'hero') goToView('hero');
  }
});

$('#detailsBtn').addEventListener('click', (e) => {
  const open = $('#breakdown').classList.toggle('is-open');
  e.currentTarget.setAttribute('aria-expanded', open);
});

document.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => goToView(b.dataset.view)));

$('#autoBtn').addEventListener('click', (e) => {
  autoOn = !autoOn;
  controls.autoRotate = autoOn;
  userActive = false;
  e.currentTarget.classList.toggle('is-on', autoOn);
  e.currentTarget.setAttribute('aria-pressed', autoOn);
});

$('#dimsBtn').addEventListener('click', (e) => {
  dimsOn = !dimsOn;
  e.currentTarget.classList.toggle('is-on', dimsOn);
  e.currentTarget.setAttribute('aria-pressed', dimsOn);
  buildDims();
});

// Renders the current view onto a branded background; `width` downsizes it (e.g. for cart thumbnails).
function composeShot(width, type = 'image/png') {
  renderer.render(scene, camera);
  const src = renderer.domElement;
  const k = width ? width / src.width : 1;
  const out = document.createElement('canvas');
  out.width = Math.round(src.width * k);
  out.height = Math.round(src.height * k);
  const ctx = out.getContext('2d');
  const hex = byId(COLORS, state.color).hex;
  const g = ctx.createRadialGradient(out.width / 2, out.height * 0.58, 0, out.width / 2, out.height * 0.58, out.width * 0.7);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.35, `${hex}55`);
  g.addColorStop(1, '#efebe4');
  ctx.fillStyle = '#efebe4';
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(src, 0, 0, out.width, out.height);
  if (!width) {
    ctx.fillStyle = '#141414';
    ctx.font = `700 ${Math.round(out.width / 40)}px Unbounded, sans-serif`;
    ctx.fillText('luna.', out.width * 0.04, out.height * 0.08);
  }
  return out.toDataURL(type, 0.82);
}

$('#shotBtn').addEventListener('click', () => {
  const a = document.createElement('a');
  a.href = composeShot();
  a.download = `luna-${state.size}-${state.material}-${state.color}.png`;
  a.click();
  toast(t('cfg.toast.photo'));
});

function startAR() {
  setHover(null);
  openAR({
    build: () => buildSofa(state, mats),
    title: t('ar.title', { name: configTitle(state) }),
    dims: L,
    shareUrl: arLink(state),
  });
}
$('#arBtn').addEventListener('click', startAR);

$('#shareBtn').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(location.href);
    toast(t('cfg.toast.link'));
  } catch {
    toast(t('cfg.toast.linkFail'));
  }
});

/* ------------------------------------------------------------------ add to cart + confetti */

$('#ctaBtn').addEventListener('click', (e) => {
  const btn = e.currentTarget;
  cart.add({ kind: 'sofa', cfg: { ...state }, thumb: composeShot(360, 'image/jpeg') });
  bumpCart();
  btn.classList.add('is-done');
  btn.querySelector('.cta-label').textContent = t('cfg.added');
  clearTimeout(btn.timer);
  btn.timer = setTimeout(() => {
    btn.classList.remove('is-done');
    btn.querySelector('.cta-label').textContent = t('cfg.cta');
  }, 2200);
  const r = btn.getBoundingClientRect();
  confetti(r.left + r.width / 2, r.top + r.height / 2, [
    byId(COLORS, state.color).hex, byId(COLORS, state.pillowColor).hex, byId(LEG_FINISHES, state.legFinish).color, '#141414', '#ffffff',
  ]);
});

/* ------------------------------------------------------------------ resize & loop */

function resize() {
  const w = viewport.clientWidth, h = viewport.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  renderer.domElement.style.width = `${w}px`;
  renderer.domElement.style.height = `${h}px`;
  labels.setSize(w, h);
  camera.aspect = w / h;
  // nudge the product right/down so it doesn't collide with the heading
  const wide = w > 700;
  camera.setViewOffset(w, h, wide ? -w * 0.07 : 0, wide ? -h * 0.05 : -h * 0.02, w, h);
  camera.updateProjectionMatrix();
  placeSegPills();
}
new ResizeObserver(() => {
  resize();
  if (!camTween && !userActive) {
    const sp = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
    sp.radius = fitDistance() * VIEWS[currentView].dist;
    camera.position.setFromSpherical(sp).add(controls.target);
  }
}).observe(viewport);

function loop(now) {
  runTweens(now);
  controls.update();
  renderer.render(scene, camera);
  labels.render(scene, camera);
  requestAnimationFrame(loop);
}

/* ------------------------------------------------------------------ boot */

renderStatic();
resize();
rebuild(['frame', 'legs', 'pillows'], false);
legsGroup.scale.y = 0.001;
frameGroup.visible = false;
pillowsGroup.visible = false;
updateUI();
requestAnimationFrame(loop);

// intro: fly in from afar while the sofa assembles itself
requestAnimationFrame(() => {
  $('#loader').classList.add('is-done');
  frameGroup.visible = pillowsGroup.visible = true;
  dropIn(frameGroup, 350, 90);
  growUp(legsGroup, 250);
  dropIn(pillowsGroup, 1100, 110);
  const far = new THREE.Spherical(fitDistance() * 2.1, deg(55), deg(-40));
  camera.position.setFromSpherical(far).add(controls.target);
  goToView('hero', { duration: 2200 });
  camTween.complete = () => {
    camTween = null;
    controls.autoRotate = autoOn && !userActive;
  };
});

// opened from the AR QR code on a phone: show the AR dialog once the sofa has assembled
if (new URLSearchParams(location.hash.slice(1)).has('ar')) {
  setTimeout(() => {
    writeHash();
    startAR();
  }, 2400);
}
