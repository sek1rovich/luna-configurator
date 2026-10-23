import * as THREE from 'three';
import { MATERIALS, COLORS, LEG_FINISHES, byId, computePrice } from './config.js';
import { buildSofa } from './sofa.js';
import { openAR, arLink } from './ar.js';
import { createStudio, makeMaterials, disposeGroup, tween, runTweens, ease, lerp, deg } from './studio.js';
import { $, $$, cart, bumpCart, toast, confetti, configLink, reveal, monthlyText } from './shell.js';
import { t, opt, money } from './i18n.js';

const DESIGNS = [
  {
    id: 'morning',
    cfg: { size: 'armchair', arms: 'slim', depth: 'classic', material: 'linen', color: 'milk', legStyle: 'taper', legFinish: 'oak', pillows: 1, pillowColor: 'sage', piping: 'tone', tufting: 'off' },
  },
  {
    id: 'evening',
    cfg: { size: 'armchair', arms: 'round', depth: 'classic', material: 'velvet', color: 'bordeaux', legStyle: 'sled', legFinish: 'brass', pillows: 1, pillowColor: 'mustard', piping: 'contrast', tufting: 'on' },
  },
  {
    id: 'cloud',
    cfg: { size: 'armchair', arms: 'round', depth: 'lounge', material: 'boucle', color: 'milk', legStyle: 'plinth', legFinish: 'oak', pillows: 2, pillowColor: 'sand', piping: 'none', tufting: 'off' },
  },
  {
    id: 'study',
    cfg: { size: 'armchair', arms: 'slim', depth: 'classic', material: 'leather', color: 'terracotta', legStyle: 'taper', legFinish: 'walnut', pillows: 0, pillowColor: 'milk', piping: 'tone', tufting: 'on' },
  },
  {
    id: 'garden',
    cfg: { size: 'armchair', arms: 'round', depth: 'classic', material: 'velvet', color: 'sage', legStyle: 'taper', legFinish: 'oak', pillows: 1, pillowColor: 'milk', piping: 'tone', tufting: 'on' },
  },
  {
    id: 'harbor',
    cfg: { size: 'armchair', arms: 'slim', depth: 'lounge', material: 'linen', color: 'ocean', legStyle: 'sled', legFinish: 'black', pillows: 1, pillowColor: 'sand', piping: 'contrast', tufting: 'off' },
  },
];
const hexOf = (d) => byId(COLORS, d.cfg.color).hex;
const priceOf = (d) => computePrice(d.cfg).total;
const nameOf = (d) => t(`design.${d.id}.name`);
const renders = new Map(); // design id -> transparent PNG data URL

function fitDistance(L, camera) {
  const vHalf = deg(camera.fov / 2);
  const hHalf = Math.atan(Math.tan(vHalf) * camera.aspect);
  return Math.max((L.W / 2 + 0.4) / Math.tan(hHalf), (L.H / 2 + 0.4) / Math.tan(vHalf)) * 1.3;
}
function placeCamera(camera, controls, L, az = 32, polar = 72) {
  controls.target.set(0, L.H * 0.42, 0);
  const s = new THREE.Spherical(fitDistance(L, camera), deg(polar), deg(az));
  camera.position.setFromSpherical(s).add(controls.target);
  camera.lookAt(controls.target);
}

/* ------------------------------------------------------------------ hero viewer */

const viewport = $('#acViewport');
const { renderer, scene, camera, controls, tex, contact } = createStudio(viewport);
controls.enableZoom = false; // the page scrolls; don't hijack the wheel
controls.autoRotate = true;
controls.autoRotateSpeed = 1.1;
let model = null, modelMats = null, current = 0;

function show(i, dir = 1) {
  current = (i + DESIGNS.length) % DESIGNS.length;
  const d = DESIGNS[current];
  const mats = makeMaterials(tex, {
    material: d.cfg.material, color: hexOf(d), pillowColor: byId(COLORS, d.cfg.pillowColor).hex, legFinish: d.cfg.legFinish,
  });
  const g = buildSofa(d.cfg, mats);
  g.traverse((o) => o.isMesh && (o.castShadow = o.receiveShadow = true));
  const L = g.userData.layout;

  if (model) {
    const old = model, oldMats = modelMats;
    tween({
      duration: 320, easing: ease.inCubic,
      update: (k) => {
        old.scale.setScalar(Math.max(0.001, 1 - k));
        old.rotation.y = dir * 0.9 * k;
      },
      complete: () => {
        disposeGroup(old);
        Object.values(oldMats).forEach((m) => m.dispose());
      },
    });
  }
  g.scale.setScalar(0.001);
  g.rotation.y = -dir * 0.9;
  scene.add(g);
  tween({
    delay: 200, duration: 950, easing: ease.outBack,
    update: (k) => {
      g.scale.setScalar(Math.max(0.001, k));
      g.rotation.y = -dir * 0.9 * (1 - k);
    },
  });
  const cs = contact.scale.x;
  tween({ duration: 700, update: (k) => contact.scale.set(lerp(cs, L.W + 0.8, k), L.D + 0.8, 1) });
  model = g;
  modelMats = mats;
  if (!show.placed) {
    placeCamera(camera, controls, L);
    show.placed = true;
  }
  renderCopy(d);
}

function renderCopy(d) {
  const card = $('.ac-current');
  card.classList.remove('swap');
  void card.offsetWidth;
  card.classList.add('swap');
  const c = d.cfg, total = priceOf(d);
  document.documentElement.style.setProperty('--tint', hexOf(d));
  $('#acIndex').textContent = `${String(current + 1).padStart(2, '0')} / ${String(DESIGNS.length).padStart(2, '0')}`;
  $('#acName').textContent = nameOf(d);
  $('#acMood').textContent = t(`design.${d.id}.mood`);
  $('#acSpecs').innerHTML = [
    `<li><i style="background:${hexOf(d)}"></i>${opt('material', c.material)} · ${opt('color', c.color)}</li>`,
    `<li><i class="f-${c.legFinish}"></i>${opt('leg', c.legStyle)} · ${opt('finish', c.legFinish)}</li>`,
    c.pillows ? `<li><i style="background:${byId(COLORS, c.pillowColor).hex}"></i>${t('ac.cushion')} · ${opt('color', c.pillowColor)}</li>` : '',
  ].join('');
  $('#acPrice').textContent = money(total);
  $('#acMonthly').textContent = `${t('price.inclVat')} · ${monthlyText(total)}`;
  $('#acConfigure').href = configLink(c);
  $$('.ac-card').forEach((el) => el.classList.toggle('is-active', Number(el.dataset.i) === current));
}

$('#acAr').addEventListener('click', () => {
  const d = DESIGNS[current];
  openAR({ build: () => buildSofa(d.cfg, modelMats), title: t('ar.title', { name: t('design.armchair', { name: nameOf(d) }) }), dims: model.userData.layout, shareUrl: arLink(d.cfg) });
});

$('#acPrev').addEventListener('click', () => show(current - 1, -1));
$('#acNext').addEventListener('click', () => show(current + 1, 1));

function thumbFor(d) {
  const c = document.createElement('canvas');
  c.width = 240;
  c.height = 180;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(120, 110, 0, 120, 110, 160);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(1, '#ebe5db');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 240, 180);
  const img = $(`.ac-card[data-i="${DESIGNS.indexOf(d)}"] img`);
  if (img?.complete && img.naturalWidth) ctx.drawImage(img, 0, 0, 240, 180);
  return c.toDataURL('image/jpeg', 0.82);
}

$('#acAdd').addEventListener('click', (e) => {
  const d = DESIGNS[current], btn = e.currentTarget;
  cart.add({ kind: 'sofa', design: d.id, cfg: { ...d.cfg }, thumb: thumbFor(d) });
  bumpCart();
  toast(t('ac.added', { name: nameOf(d) }));
  btn.classList.add('is-done');
  setTimeout(() => btn.classList.remove('is-done'), 1600);
  const r = btn.getBoundingClientRect();
  confetti(r.left + r.width / 2, r.top, [hexOf(d), byId(COLORS, d.cfg.pillowColor).hex, byId(LEG_FINISHES, d.cfg.legFinish).color, '#141414', '#fff']);
});

/* ------------------------------------------------------------------ catalogue grid */

const filters = ['all', ...MATERIALS.filter((m) => DESIGNS.some((d) => d.cfg.material === m.id)).map((m) => m.id)];
$('#acFilters').innerHTML = filters.map((id, i) => `<button class="chip${i ? '' : ' is-active'}" data-filter="${id}">${id === 'all' ? t('ac.all') : opt('material', id)}</button>`).join('');
$('#acFilters').addEventListener('click', (e) => {
  const b = e.target.closest('[data-filter]');
  if (!b) return;
  $$('#acFilters .chip').forEach((c) => c.classList.toggle('is-active', c === b));
  $$('.ac-card').forEach((card, n) => {
    const hide = b.dataset.filter !== 'all' && DESIGNS[card.dataset.i].cfg.material !== b.dataset.filter;
    card.classList.toggle('is-hidden', hide);
    if (!hide) card.style.setProperty('--d', `${n * 0.04}s`);
  });
});

$('#acGrid').innerHTML = DESIGNS.map((d, i) => `
  <button class="ac-card" data-i="${i}" style="--c:${hexOf(d)}; --d:${(i % 3) * 0.08}s" data-reveal>
    <span class="ac-card-img"><span class="skeleton"></span><img alt="${t('design.armchair', { name: nameOf(d) })}" hidden /></span>
    <span class="ac-card-body">
      <span class="ac-card-top"><h3>${nameOf(d)}</h3><b>${money(priceOf(d))}</b></span>
      <span class="ac-card-mood">${t(`design.${d.id}.mood`)}</span>
      <span class="ac-card-tags">
        <span><i style="background:${hexOf(d)}"></i>${opt('material', d.cfg.material)}</span>
        <span><i class="f-${d.cfg.legFinish}"></i>${opt('leg', d.cfg.legStyle)}</span>
      </span>
    </span>
  </button>`).join('');
reveal();
$('#acGrid').addEventListener('click', (e) => {
  const card = e.target.closest('.ac-card');
  if (!card) return;
  const i = Number(card.dataset.i);
  if (i !== current) show(i, i > current ? 1 : -1);
  $('#acHero').scrollIntoView({ behavior: 'smooth', block: 'start' });
});

// Renders every look offscreen, one per frame, so the page stays responsive.
async function renderCatalogue() {
  const off = createStudio(null, { envIntensity: 0.75 });
  off.renderer.setPixelRatio(1.5);
  off.renderer.setSize(560, 420, false);
  off.camera.aspect = 560 / 420;
  off.camera.updateProjectionMatrix();
  for (const [i, d] of DESIGNS.entries()) {
    await new Promise(requestAnimationFrame);
    const mats = makeMaterials(off.tex, {
      material: d.cfg.material, color: hexOf(d), pillowColor: byId(COLORS, d.cfg.pillowColor).hex, legFinish: d.cfg.legFinish,
    });
    const g = buildSofa(d.cfg, mats);
    const L = g.userData.layout;
    off.contact.scale.set(L.W + 0.8, L.D + 0.8, 1);
    off.scene.add(g);
    placeCamera(off.camera, off.controls, L, 28, 74);
    off.renderer.render(off.scene, off.camera);
    const url = off.renderer.domElement.toDataURL('image/png');
    renders.set(d.id, url);
    const img = $(`.ac-card[data-i="${i}"] img`);
    img.onload = () => {
      img.hidden = false;
      img.previousElementSibling.remove();
    };
    img.src = url;
    disposeGroup(g);
    Object.values(mats).forEach((m) => m.dispose());
  }
  off.renderer.dispose();
  off.renderer.forceContextLoss();
}

/* ------------------------------------------------------------------ loop */

function resize() {
  const w = viewport.clientWidth, h = viewport.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  if (model) {
    const sp = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
    sp.radius = fitDistance(model.userData.layout, camera);
    camera.position.setFromSpherical(sp).add(controls.target);
  }
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

const start = DESIGNS.findIndex((d) => d.id === location.hash.slice(1));
resize();
show(Math.max(0, start));
requestAnimationFrame(loop);
renderCatalogue();
