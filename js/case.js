import * as THREE from 'three';
import { SIZES, ARMS, DEPTHS, MATERIALS, COLORS, LEG_STYLES, LEG_FINISHES, PIPING, TUFTING, DEFAULTS } from './config.js';
import { softBox, pipingGeometry, buildSofa } from './sofa.js';
import { createStudio, makeMaterials, disposeGroup, tween, runTweens, ease, deg } from './studio.js';
import { $, $$, reveal, REPO_URL } from './shell.js';
import { t, opt, locale, num } from './i18n.js';

$('#repoLink').href = REPO_URL;

/* ------------------------------------------------------------------ pipeline viewer */

const viewport = $('#pipeViewport');
const { renderer, scene, camera, controls, tex, contact } = createStudio(viewport, { envIntensity: 0.8 });
controls.enableZoom = false;
controls.autoRotate = true;
controls.autoRotateSpeed = 1.2;
controls.target.set(0, 0.12, 0);
camera.position.setFromSpherical(new THREE.Spherical(2.1, deg(58), deg(30))).add(controls.target);
contact.scale.set(1.1, 1.1, 1);

const clay = new THREE.MeshStandardMaterial({ color: 0xd9d3c8, roughness: 0.85 });
const fabric = makeMaterials(tex, { material: 'velvet', color: '#c8952a', pillowColor: '#b35a3a', legFinish: 'oak' });

const W = 0.72, H = 0.18, D = 0.72, R = 0.06;
const TUFTS = [[-0.45, -0.45], [0.45, -0.45], [-0.45, 0.45], [0.45, 0.45], [0, 0]];

const STEPS = [
  {
    title: t('case.s1'), text: t('case.s1Text'),
    code: 'new THREE.BoxGeometry(w, h, d, nx, ny, nz)',
    build: () => mesh(new THREE.BoxGeometry(W, H, D, 18, 5, 18), clay),
  },
  {
    title: t('case.s2'), text: t('case.s2Text'),
    code: 'p = inner + normalize(p − inner) · r',
    build: () => mesh(softBox(W, H, D, { r: R }), clay),
  },
  {
    title: t('case.s3'), text: t('case.s3Text'),
    code: 'y += bulge · (1−u²)^0.7 · (1−v²)^0.7 + noise(u, v)',
    build: () => mesh(softBox(W, H, D, { r: R, bulge: 0.035, wrinkle: 0.006 }), clay),
  },
  {
    title: t('case.s4'), text: t('case.s4Text'),
    code: 'y −= depth · Σ exp(−d² / 2σ²)',
    build: () => detailed(clay, clay),
  },
  {
    title: t('case.s5'), text: t('case.s5Text'),
    code: 'new MeshPhysicalMaterial({ sheen, normalMap })',
    build: () => detailed(fabric.upholstery, fabric.pillows),
  },
];

function mesh(geo, mat) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = m.receiveShadow = true;
  const g = new THREE.Group();
  g.add(m);
  return g;
}
const buttonGeo = new THREE.SphereGeometry(0.02, 20, 12);
buttonGeo.scale(1, 0.5, 1);
function detailed(body, trim) {
  const geo = softBox(W, H, D, { r: R, bulge: 0.035, wrinkle: 0.006, tufts: TUFTS, tuftDepth: 0.03, tuftRadius: 0.09 });
  const g = mesh(geo, body);
  const pipe = new THREE.Mesh(pipingGeometry(W, H, D, R, 'y', { radius: 0.008 }), trim);
  pipe.castShadow = true;
  g.add(pipe);
  for (const p of geo.userData.tufts) {
    const b = new THREE.Mesh(buttonGeo, trim);
    b.position.copy(p);
    b.castShadow = true;
    g.add(b);
  }
  return g;
}

$('#pipeSteps').innerHTML = STEPS.map((s, i) => `
  <li><button data-step="${i}"><i>${String(i + 1).padStart(2, '0')}</i><span><b>${s.title}</b><small>${s.text}</small></span></button></li>`).join('');

let current = -1, model = null, wire = false;
function showStep(i) {
  if (i === current) return;
  current = i;
  $$('#pipeSteps button').forEach((b) => b.classList.toggle('is-active', Number(b.dataset.step) === i));
  $('#pipeCode').textContent = STEPS[i].code;
  if (model) {
    const old = model;
    tween({ duration: 220, easing: ease.inCubic, update: (k) => old.scale.set(1, Math.max(0.001, 1 - k), 1), complete: () => disposeGroup(old) });
  }
  model = STEPS[i].build();
  model.position.y = H / 2 + 0.01;
  applyWire(model);
  model.scale.set(1, 0.001, 1);
  scene.add(model);
  const m = model;
  tween({ delay: 160, duration: 700, easing: ease.outBack, update: (k) => m.scale.set(1, Math.max(0.001, k), 1) });
}
function applyWire(g) {
  for (const mat of [clay, fabric.upholstery, fabric.pillows]) mat.wireframe = wire;
}
$('#pipeSteps').addEventListener('click', (e) => {
  const b = e.target.closest('[data-step]');
  if (b) {
    showStep(Number(b.dataset.step));
    autoplay = false;
  }
});
$('#pipeWire').addEventListener('click', (e) => {
  wire = !wire;
  e.currentTarget.classList.toggle('is-on', wire);
  e.currentTarget.setAttribute('aria-pressed', wire);
  applyWire(model);
});

// walk through the steps automatically the first time the viewer scrolls into view
let autoplay = true;
let visible = false;
new IntersectionObserver(([e]) => {
  visible = e.isIntersecting;
  if (visible && autoplay && current === 0) runAutoplay();
}, { threshold: 0.4 }).observe(viewport);
async function runAutoplay() {
  for (let i = 1; i < STEPS.length && autoplay; i++) {
    await new Promise((r) => setTimeout(r, 1900));
    if (autoplay) showStep(i);
  }
  autoplay = false;
}

/* ------------------------------------------------------------------ fabric maps */

$('#fabGrid').innerHTML = MATERIALS.map((m, i) => `
  <figure class="fab" data-reveal style="--d:${i * 0.06}s">
    <div class="fab-maps">
      <canvas width="180" height="180" data-h="${m.id}" aria-label="${t('case.heightMap')}: ${opt('material', m.id)}"></canvas>
      <span class="fab-arrow">→</span>
      <canvas width="180" height="180" data-n="${m.id}" aria-label="Normal map: ${opt('material', m.id)}"></canvas>
    </div>
    <figcaption><b>${opt('material', m.id)}</b><span>${t(`opt.materialDesc.${m.id}`)}</span></figcaption>
  </figure>`).join('');
for (const m of MATERIALS) {
  const draw = (sel, src) => {
    const c = $(sel);
    c.getContext('2d').drawImage(src, 0, 0, src.width * 0.7, src.height * 0.7, 0, 0, c.width, c.height);
  };
  draw(`[data-h="${m.id}"]`, tex.heights[m.id]);
  draw(`[data-n="${m.id}"]`, tex.normals[m.id].image);
}

/* ------------------------------------------------------------------ live numbers */

function countUp(el, to, format = (v) => num.format(Math.round(v))) {
  const t0 = performance.now();
  const step = (now) => {
    const k = Math.min(1, (now - t0) / 1400);
    el.textContent = format(to * (1 - Math.pow(1 - k, 3)));
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// every combination the configurator can produce (pillow count depends on size)
const perSize = ARMS.length * DEPTHS.length * MATERIALS.length * COLORS.length * LEG_STYLES.length
  * LEG_FINISHES.length * COLORS.length * PIPING.length * TUFTING.length;
const combos = SIZES.reduce((s, size) => s + (size.maxPillows + 1) * perSize, 0);

const probe = buildSofa({ ...DEFAULTS, size: 'sofa', pillows: 4, tufting: 'on' }, fabric);
let tris = 0;
probe.traverse((o) => {
  if (o.isMesh) tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
});
disposeGroup(probe);

const FILES = ['js/config.js', 'js/sofa.js', 'js/textures.js', 'js/studio.js', 'js/shell.js', 'js/ar.js', 'js/main.js',
  'js/armchairs.js', 'js/materials-page.js', 'js/showroom.js', 'js/case.js', 'js/i18n.js',
  'js/locales/en.js', 'js/locales/en.static.js', 'js/locales/de.js', 'js/locales/uk.js', 'styles.css', 'site.css', 'pages.css'];
const codeSize = Promise.all(FILES.map((f) => fetch(f).then((r) => r.blob()).then((b) => b.size).catch(() => 0)))
  .then((sizes) => sizes.reduce((a, b) => a + b, 0));

let counted = false;
new IntersectionObserver(async ([e]) => {
  if (!e.isIntersecting || counted) return;
  counted = true;
  const compact = new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 });
  countUp($('#numCombos'), combos, (v) => compact.format(v));
  countUp($('#numTris'), tris);
  countUp($('#numCode'), (await codeSize) / 1024, (v) => `${Math.round(v)} KB`);
}, { threshold: 0.3 }).observe($('#numbers'));

/* ------------------------------------------------------------------ loop */

function resize() {
  const w = viewport.clientWidth, h = viewport.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(viewport);
function loop(now) {
  runTweens(now);
  if (visible) {
    controls.update();
    renderer.render(scene, camera);
  }
  requestAnimationFrame(loop);
}

resize();
// #step=N deep-links to a pipeline step (and skips the autoplay)
const deep = Number(new URLSearchParams(location.hash.slice(1)).get('step'));
if (deep >= 1 && deep <= STEPS.length) {
  autoplay = false;
  showStep(deep - 1);
  requestAnimationFrame(() => $('#pipeline').scrollIntoView());
} else showStep(0);
reveal();
requestAnimationFrame(loop);
