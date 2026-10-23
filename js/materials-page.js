import * as THREE from 'three';
import { MATERIALS, COLORS, LEG_FINISHES, DEFAULTS, byId } from './config.js';
import { softBox } from './sofa.js';
import { createStudio, makeMaterials, applyFabric, tweenColor, tween, tweens, runTweens, ease, lerp, deg } from './studio.js';
import { $, $$, cart, bumpCart, toast, confetti, configLink, reveal } from './shell.js';
import { t, opt, signed, num } from './i18n.js';

const state = { material: DEFAULTS.material, color: DEFAULTS.color, macro: false };

/* ------------------------------------------------------------------ 3D sample display */

const viewport = $('#mxViewport');
const { renderer, scene, camera, controls, tex, contact } = createStudio(viewport, { envIntensity: 0.8 });
controls.enableZoom = false;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.8;
controls.minDistance = 0.5;

const mats = makeMaterials(tex, { material: state.material, color: byId(COLORS, state.color).hex, legFinish: 'oak' });
const display = new THREE.Group();
const seat = new THREE.Mesh(softBox(1.0, 0.2, 0.72, { r: 0.07, bulge: 0.035, axis: 'y', step: 0.03 }), mats.upholstery);
seat.position.y = 0.1;
const pillow = new THREE.Mesh(softBox(0.52, 0.52, 0.15, { r: 0.05, bulge: 0.085, axis: 'z', step: 0.025 }), mats.upholstery);
pillow.position.set(0.16, 0.46, -0.08);
pillow.rotation.set(-0.38, 0.25, 0.08);
const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.62, 48, 8), mats.upholstery);
roll.position.set(-0.22, 0.29, 0.2);
roll.rotation.set(0, 0.15, Math.PI / 2);
for (const m of [seat, pillow, roll]) {
  m.castShadow = m.receiveShadow = true;
  display.add(m);
}
scene.add(display);
contact.scale.set(1.6, 1.3, 1);

const VIEW = {
  wide: { target: new THREE.Vector3(0, 0.28, 0), dist: 3.1, polar: 66 },
  macro: { target: new THREE.Vector3(0.12, 0.4, 0), dist: 1.3, polar: 70 },
};
let camTween = null;
function goTo(name, duration = 1100) {
  const v = VIEW[name];
  const startT = controls.target.clone();
  const s0 = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
  const s = new THREE.Spherical();
  if (camTween) tweens.delete(camTween);
  camTween = tween({
    duration, easing: ease.inOutCubic,
    update: (k) => {
      controls.target.lerpVectors(startT, v.target, k);
      s.set(lerp(s0.radius, v.dist, k), lerp(s0.phi, deg(v.polar), k), s0.theta);
      camera.position.setFromSpherical(s).add(controls.target);
    },
  });
}
camera.position.setFromSpherical(new THREE.Spherical(4.5, deg(60), deg(30))).add(VIEW.wide.target);
controls.target.copy(VIEW.wide.target);

$('#mxMacro').addEventListener('click', (e) => {
  state.macro = !state.macro;
  e.currentTarget.setAttribute('aria-pressed', state.macro);
  $('#mxMacroLabel').textContent = t(state.macro ? 'mx.overview' : 'mx.macro');
  controls.autoRotateSpeed = state.macro ? 0.35 : 0.8;
  goTo(state.macro ? 'macro' : 'wide');
});

function pulse() {
  tween({ duration: 520, update: (k) => display.scale.setScalar(1 + 0.04 * Math.sin(Math.PI * k)) });
}

/* ------------------------------------------------------------------ panel */

$('#mxTabs').innerHTML = MATERIALS.map((m) => `
  <button class="mx-tab" role="tab" data-mat="${m.id}">
    <canvas width="96" height="96" data-thumb="${m.id}"></canvas>
    <span>${opt('material', m.id)}</span>
  </button>`).join('');
$('#mxColors').innerHTML = COLORS.map((c) => `<button class="swatch" style="--c:${c.hex}" data-color="${c.id}" title="${opt('color', c.id)}" aria-label="${opt('color', c.id)}"></button>`).join('');

function drawThumbs() {
  const hex = byId(COLORS, state.color).hex;
  $$('[data-thumb]').forEach((cv) => {
    const ctx = cv.getContext('2d');
    const h = tex.heights[cv.dataset.thumb];
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.fillStyle = hex;
    ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.globalCompositeOperation = 'soft-light';
    ctx.globalAlpha = 0.8;
    ctx.drawImage(h, 0, 0, h.width * 0.45, h.height * 0.45);
  });
}

function renderPanel() {
  const m = byId(MATERIALS, state.material), col = byId(COLORS, state.color);
  const info = (k) => t(`mat.${m.id}.${k}`);
  $$('.mx-tab').forEach((tab) => {
    const on = tab.dataset.mat === m.id;
    tab.classList.toggle('is-active', on);
    tab.setAttribute('aria-selected', on);
  });
  $$('#mxColors .swatch').forEach((s) => s.classList.toggle('is-active', s.dataset.color === col.id));
  const durability = Math.round((m.martindale / 100000) * 100);
  $('#mxInfo').innerHTML = `
    <h2>${opt('material', m.id)} <span>· ${opt('color', col.id)}</span></h2>
    <p class="mx-tagline">${info('tagline')}</p>
    <dl class="mx-specs">
      <div><dt>${t('mx.composition')}</dt><dd>${info('composition')}</dd></div>
      <div><dt>${t('mx.origin')}</dt><dd>${info('origin')}</dd></div>
      <div><dt>${t('mx.ideal')}</dt><dd>${info('ideal')}</dd></div>
      <div><dt>${t('mx.price')}</dt><dd>${m.price ? t('mx.perSeat', { price: signed(m.price) }) : t('mx.inBase')}</dd></div>
    </dl>
    <div class="meter">
      <div class="meter-head"><span>${t('mx.martindale')}</span><b>${t('mx.cycles', { n: num.format(m.martindale) })}</b></div>
      <div class="meter-bar"><i style="--w:${durability}%"></i></div>
    </div>`;
  $('#mxBadge').textContent = `${opt('material', m.id)} · ${opt('color', col.id)}`;
  $('#mxTry').href = configLink({ ...DEFAULTS, material: m.id, color: col.id });
  document.documentElement.style.setProperty('--tint', col.hex);
  drawThumbs();
}

$('#mxTabs').addEventListener('click', (e) => {
  const tab = e.target.closest('[data-mat]');
  if (!tab || tab.dataset.mat === state.material) return;
  state.material = tab.dataset.mat;
  applyFabric(mats.upholstery, tex, state.material);
  pulse();
  renderPanel();
});
$('#mxColors').addEventListener('click', (e) => {
  const s = e.target.closest('[data-color]');
  if (!s) return;
  state.color = s.dataset.color;
  tweenColor(mats.upholstery, byId(COLORS, state.color).hex);
  renderPanel();
});

$('#mxSamples').addEventListener('click', (e) => {
  if (cart.has('samples')) {
    toast(t('mx.samplesAlready'));
    return;
  }
  cart.add({ kind: 'samples' });
  bumpCart();
  toast(t('mx.samplesAdded'));
  const r = e.currentTarget.getBoundingClientRect();
  confetti(r.left + r.width / 2, r.top, COLORS.map((c) => c.hex));
});

/* ------------------------------------------------------------------ static sections */

$('#paletteGrid').innerHTML = COLORS.map((c, i) => `
  <a class="pal" href="${configLink({ ...DEFAULTS, color: c.id })}" style="--c:${c.hex}; --d:${(i % 5) * 0.05}s" data-reveal>
    <span class="pal-chip"></span>
    <span class="pal-name">${opt('color', c.id)}</span>
    <span class="pal-hex">${c.hex.toUpperCase()}</span>
    <span class="pal-try">${t('mx.tryOn')} →</span>
  </a>`).join('');

$('#finishGrid').innerHTML = LEG_FINISHES.map((f, i) => `
  <article class="finish-card" data-reveal style="--d:${i * 0.08}s">
    <i class="f-${f.id}"></i>
    <h3>${opt('finish', f.id)}</h3>
    <p>${t(`fin.${f.id}`)}</p>
    <b>${signed(f.price)}</b>
  </article>`).join('');

$('#careGrid').innerHTML = MATERIALS.map((m, i) => `
  <article class="care-card" data-reveal style="--d:${i * 0.08}s">
    <h3>${opt('material', m.id)}</h3>
    <p>${t(`mat.${m.id}.care`)}</p>
  </article>`).join('');

reveal();

/* ------------------------------------------------------------------ loop */

function resize() {
  const w = viewport.clientWidth, h = viewport.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(viewport);
let visible = true;
new IntersectionObserver(([e]) => (visible = e.isIntersecting)).observe(viewport);
function loop(now) {
  runTweens(now);
  if (visible) {
    controls.update();
    renderer.render(scene, camera);
  }
  requestAnimationFrame(loop);
}

resize();
renderPanel();
goTo('wide', 1800);
requestAnimationFrame(loop);
