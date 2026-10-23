// Site chrome shared by every page: header with language switcher + mobile menu, persistent cart drawer
// with an EU checkout, toast, confetti, footer and scroll reveal.
import { MATERIALS, INSTALMENTS, byId, computePrice } from './config.js';
import { t, opt, money, lang, locale, LANGS, setLang } from './i18n.js';

// Shown in the footer — change to your own name and portfolio link.
export const AUTHOR = { name: 'Rostyslav', url: 'https://github.com/sek1rovich' };
export const REPO_URL = 'https://github.com/sek1rovich/luna-configurator';

export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/* ------------------------------------------------------------------ copy helpers */

export function describeConfig(cfg) {
  const parts = [
    `${opt('material', cfg.material)}, ${opt('color', cfg.color)}`,
    t('desc.legs', { style: opt('leg', cfg.legStyle), finish: opt('finish', cfg.legFinish) }),
  ];
  if (cfg.tufting === 'on') parts.push(t('desc.tufted'));
  if (cfg.piping === 'contrast') parts.push(t('desc.piping', { color: opt('color', cfg.pillowColor) }));
  if (cfg.pillows) parts.push(t('desc.pillows', { n: cfg.pillows, color: opt('color', cfg.pillowColor) }));
  return parts.join(' · ');
}
export const configTitle = (cfg) => `Luna · ${opt('size', cfg.size)}`;
export const configLink = (cfg) => `index.html#${new URLSearchParams(cfg)}`;
export const rowLabel = (r) => (r.group === 'pillows' ? t('price.row.pillows', { n: r.count }) : `${t(`price.row.${r.group}`)} · ${opt(r.kind, r.id)}`);
export function leadText(materialId) {
  const [a, b] = byId(MATERIALS, materialId).leadWeeks;
  return t('lead.weeks', { a, b });
}
export const monthlyText = (total) => t('price.monthly', { amount: money(Math.ceil(total / INSTALMENTS)), n: INSTALMENTS });

/* ------------------------------------------------------------------ storage */

function load(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}
function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode or quota — cart simply won't persist */
  }
}

/* ------------------------------------------------------------------ cart store */

// Items keep data, not text, so the cart re-translates when the language changes:
// { id, kind: 'sofa' | 'samples', cfg?, design?, qty, thumb? }
const CART_KEY = 'luna.cart.v2';
const listeners = new Set();
let items = load(CART_KEY, []);

const priceOf = (it) => (it.kind === 'sofa' ? computePrice(it.cfg).total : 0);
const maxQtyOf = (it) => (it.kind === 'samples' ? 1 : 9);
export const itemTitle = (it) => {
  if (it.kind === 'samples') return t('cart.samples');
  return it.design ? t('design.armchair', { name: t(`design.${it.design}.name`) }) : configTitle(it.cfg);
};
const itemSubtitle = (it) => (it.kind === 'samples' ? t('cart.samplesSub') : describeConfig(it.cfg));
const sameItem = (a, b) => a.kind === b.kind && a.design === b.design && JSON.stringify(a.cfg ?? null) === JSON.stringify(b.cfg ?? null);

export const cart = {
  get items() { return items; },
  count: () => items.reduce((s, i) => s + i.qty, 0),
  total: () => items.reduce((s, i) => s + i.qty * priceOf(i), 0),
  has: (kind) => items.some((i) => i.kind === kind),
  add(item) {
    const existing = items.find((i) => sameItem(i, item));
    if (existing) existing.qty = Math.min(maxQtyOf(item), existing.qty + 1);
    else items.push({ id: crypto.randomUUID?.() ?? String(Date.now() + Math.random()), qty: 1, ...item });
    commit();
  },
  setQty(id, qty) {
    const it = items.find((i) => i.id === id);
    if (!it) return;
    it.qty = Math.max(1, Math.min(maxQtyOf(it), qty));
    commit();
  },
  remove(id) {
    items = items.filter((i) => i.id !== id);
    commit();
  },
  clear() {
    items = [];
    commit();
  },
  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};
function commit() {
  save(CART_KEY, items);
  listeners.forEach((fn) => fn());
}
// keep several open tabs in sync
addEventListener('storage', (e) => {
  if (e.key !== CART_KEY) return;
  items = load(CART_KEY, []);
  listeners.forEach((fn) => fn());
});

/* ------------------------------------------------------------------ header */

const PAGES = [
  { id: 'sofas', href: 'index.html' },
  { id: 'armchairs', href: 'armchairs.html' },
  { id: 'materials', href: 'materials.html' },
  { id: 'showroom', href: 'showroom.html' },
  { id: 'case', href: 'case.html', extra: true },
];

function renderHeader() {
  const bar = $('#topbar');
  if (!bar) return;
  const page = document.body.dataset.page;
  const current = LANGS.find((l) => l.id === lang);
  bar.innerHTML = `
    <a class="logo" href="index.html" aria-label="${t('nav.home')}">luna<span>.</span></a>
    <nav class="nav" id="nav" aria-label="${t('nav.main')}">
      ${PAGES.map((p) => `<a href="${p.href}" class="${[p.id === page ? 'is-current' : '', p.extra ? 'nav-extra' : ''].join(' ').trim()}"${p.id === page ? ' aria-current="page"' : ''}>${t(`nav.${p.id}`)}</a>`).join('')}
    </nav>
    <div class="topbar-end">
      <div class="lang" id="lang">
        <button class="lang-btn" id="langBtn" aria-haspopup="true" aria-expanded="false" aria-label="${t('nav.language')}: ${current.label}">
          <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3Z"/></svg>
          <span>${current.short}</span>
        </button>
        <ul class="lang-menu" role="menu" aria-label="${t('nav.language')}">
          ${LANGS.map((l) => `<li><button role="menuitemradio" aria-checked="${l.id === lang}" data-lang="${l.id}" lang="${l.id}"><b>${l.short}</b>${l.label}</button></li>`).join('')}
        </ul>
      </div>
      <button class="cart-btn" id="cartBtn" aria-label="${t('nav.openCart')}">
        <svg viewBox="0 0 24 24"><path d="M6 7h12l-1 13H7L6 7Z"/><path d="M9 7a3 3 0 0 1 6 0"/></svg>
        <span>${t('nav.cart')}</span><b id="cartCount">0</b>
      </button>
      <button class="burger" id="burger" aria-label="${t('nav.menu')}" aria-expanded="false" aria-controls="nav"><i></i><i></i></button>
    </div>`;
  $('#burger').addEventListener('click', () => {
    const open = bar.classList.toggle('menu-open');
    $('#burger').setAttribute('aria-expanded', open);
  });
  const langBox = $('#lang');
  const toggleLang = (open) => {
    langBox.classList.toggle('is-open', open);
    $('#langBtn').setAttribute('aria-expanded', open);
    if (open) langBox.querySelector('[aria-checked="true"]').focus();
  };
  $('#langBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    toggleLang(!langBox.classList.contains('is-open'));
  });
  langBox.addEventListener('click', (e) => {
    const b = e.target.closest('[data-lang]');
    if (b && b.dataset.lang !== lang) setLang(b.dataset.lang);
    else if (b) toggleLang(false);
  });
  langBox.addEventListener('keydown', (e) => {
    const opts = $$('[data-lang]', langBox);
    const i = opts.indexOf(document.activeElement);
    if (e.key === 'ArrowDown' && i >= 0) opts[(i + 1) % opts.length].focus();
    else if (e.key === 'ArrowUp' && i >= 0) opts[(i - 1 + opts.length) % opts.length].focus();
    else if (e.key === 'Escape') {
      toggleLang(false);
      $('#langBtn').focus();
    } else return;
    e.preventDefault();
  });
  document.addEventListener('click', (e) => !langBox.contains(e.target) && toggleLang(false));

  $('#cartBtn').addEventListener('click', () => openDrawer('cart'));
  const sync = () => ($('#cartCount').textContent = cart.count());
  sync();
  cart.subscribe(sync);
}

export function bumpCart() {
  const b = $('#cartBtn');
  if (!b) return;
  b.classList.remove('bump');
  void b.offsetWidth;
  b.classList.add('bump');
}

/* ------------------------------------------------------------------ drawer: cart → checkout → done */

let drawerView = 'cart';
let lastOrder = null;

function mountDrawer() {
  document.body.insertAdjacentHTML('beforeend', `
    <div class="drawer-backdrop" id="drawerBackdrop"></div>
    <aside class="drawer" id="drawer" role="dialog" aria-modal="true" aria-labelledby="drawerTitle" aria-hidden="true">
      <header class="drawer-head">
        <button class="icon-btn" id="drawerBack" aria-label="${t('common.back')}" hidden><svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></svg></button>
        <h2 id="drawerTitle"></h2>
        <button class="icon-btn" id="drawerClose" aria-label="${t('common.close')}"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
      </header>
      <div class="drawer-body" id="drawerBody"></div>
      <footer class="drawer-foot" id="drawerFoot"></footer>
    </aside>`);
  $('#drawerBackdrop').addEventListener('click', closeDrawer);
  $('#drawerClose').addEventListener('click', closeDrawer);
  $('#drawerBack').addEventListener('click', () => setView('cart'));
  addEventListener('keydown', (e) => e.key === 'Escape' && closeDrawer());

  $('#drawerBody').addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const id = b.closest('[data-id]')?.dataset.id;
    const it = items.find((i) => i.id === id);
    if (b.dataset.act === 'inc') cart.setQty(id, it.qty + 1);
    if (b.dataset.act === 'dec') cart.setQty(id, it.qty - 1);
    if (b.dataset.act === 'rm') cart.remove(id);
  });
  cart.subscribe(() => drawerView === 'cart' && renderDrawer());
}

export function openDrawer(view = 'cart') {
  setView(view);
  document.documentElement.classList.add('drawer-open');
  $('#drawer').setAttribute('aria-hidden', 'false');
  setTimeout(() => $('#drawerClose').focus(), 50);
}
function closeDrawer() {
  document.documentElement.classList.remove('drawer-open');
  $('#drawer').setAttribute('aria-hidden', 'true');
  $('#topbar')?.classList.remove('menu-open');
  if (drawerView === 'done') drawerView = 'cart';
}
function setView(v) {
  drawerView = v;
  renderDrawer();
}

const sampleThumb = () => `<span class="item-samples">${['#e8e2d6', '#b35a3a', '#2c5a70', '#c8952a'].map((c) => `<i style="background:${c}"></i>`).join('')}</span>`;

// EU + EEA + Switzerland + UK + Ukraine; names come from the browser in the current language
const COUNTRIES = ['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE', 'NO', 'CH', 'GB', 'UA'];
function countryOptions() {
  let names;
  try {
    names = new Intl.DisplayNames([locale], { type: 'region' });
  } catch {
    names = { of: (c) => c };
  }
  const guess = { de: 'DE', uk: 'UA' }[lang] ?? (navigator.language.split('-')[1] ?? '').toUpperCase();
  return COUNTRIES.map((c) => ({ c, name: names.of(c) }))
    .sort((a, b) => a.name.localeCompare(b.name, locale))
    .map(({ c, name }) => `<option value="${c}"${c === guess ? ' selected' : ''}>${name}</option>`).join('');
}

function renderDrawer() {
  const body = $('#drawerBody'), foot = $('#drawerFoot');
  $('#drawerBack').hidden = drawerView !== 'checkout';
  $('#drawerTitle').textContent = t(`cart.title.${drawerView}`);
  body.scrollTop = 0;

  if (drawerView === 'cart') {
    if (!items.length) {
      body.innerHTML = `
        <div class="empty">
          <div class="empty-art">${sampleThumb()}</div>
          <h3>${t('cart.empty')}</h3>
          <p>${t('cart.emptyText')}</p>
          <a class="btn btn-dark" href="index.html">${t('cart.emptyCta')}</a>
          <a class="btn btn-ghost" href="materials.html">${t('cart.emptySamples')}</a>
        </div>`;
      foot.innerHTML = '';
      return;
    }
    body.innerHTML = `<ul class="items">${items.map((it) => `
      <li class="item" data-id="${it.id}">
        <div class="item-thumb">${it.thumb ? `<img src="${it.thumb}" alt="">` : sampleThumb()}</div>
        <div class="item-main">
          <div class="item-title">${esc(itemTitle(it))}</div>
          <div class="item-sub">${esc(itemSubtitle(it))}</div>
          ${it.cfg ? `<a class="item-link" href="${configLink(it.cfg)}">${t('cart.edit')}</a>` : ''}
          <div class="item-row">
            ${maxQtyOf(it) > 1 ? `<div class="stepper stepper-sm">
              <button data-act="dec" aria-label="${t('common.less')}" ${it.qty <= 1 ? 'disabled' : ''}>−</button>
              <output>${it.qty}</output>
              <button data-act="inc" aria-label="${t('common.more')}">+</button>
            </div>` : `<span class="item-free">${t('cart.oneKit')}</span>`}
            <b class="item-price">${priceOf(it) ? money(priceOf(it) * it.qty) : t('price.free')}</b>
          </div>
        </div>
        <button class="icon-btn item-rm" data-act="rm" aria-label="${t('cart.remove')}"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
      </li>`).join('')}</ul>`;
    const total = cart.total();
    foot.innerHTML = `
      <div class="sum-row"><span>${t('cart.items', { n: cart.count() })}</span><b>${money(total)}</b></div>
      <div class="sum-row"><span>${t('price.delivery')}</span><b>${t('price.free')}</b></div>
      <div class="sum-row sum-total"><span>${t('cart.total')} <small>${t('price.inclVat')}</small></span><b>${money(total)}</b></div>
      <button class="cta" id="toCheckout"><span class="cta-label">${t('cart.checkout')}</span><svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg></button>`;
    $('#toCheckout').addEventListener('click', () => setView('checkout'));
    return;
  }

  if (drawerView === 'checkout') {
    const total = cart.total();
    body.innerHTML = `
      <form class="form" id="checkoutForm" novalidate>
        <fieldset>
          <legend>${t('co.contact')}</legend>
          <label class="field"><span>${t('co.name')}</span><input name="name" autocomplete="name" required minlength="2" placeholder="${t('co.namePh')}"></label>
          <label class="field"><span>${t('co.email')}</span><input name="email" type="email" autocomplete="email" required placeholder="you@example.com"></label>
          <label class="field"><span>${t('co.phone')} <small>${t('co.phoneHint')}</small></span><input name="phone" type="tel" autocomplete="tel" required placeholder="+49 30 1234567" data-phone></label>
        </fieldset>
        <fieldset>
          <legend>${t('co.delivery')}</legend>
          <div class="radio-cards">
            <label><input type="radio" name="delivery" value="courier" checked><span><b>${t('co.courier')}</b><small>${t('co.courierSub')}</small></span></label>
            <label><input type="radio" name="delivery" value="pickup"><span><b>${t('co.pickup')}</b><small>${t('co.pickupSub')}</small></span></label>
          </div>
          <div data-address>
            <label class="field"><span>${t('co.country')}</span><select name="country" autocomplete="country" required>${countryOptions()}</select></label>
            <div class="form-row form-row-pc">
              <label class="field"><span>${t('co.postcode')}</span><input name="postcode" autocomplete="postal-code" required pattern="[A-Za-z0-9 \\-]{3,10}" placeholder="10115"></label>
              <label class="field"><span>${t('co.city')}</span><input name="city" autocomplete="address-level2" required placeholder="${t('co.cityPh')}"></label>
            </div>
            <label class="field"><span>${t('co.address')}</span><input name="address" autocomplete="street-address" required placeholder="${t('co.addressPh')}"></label>
          </div>
          <label class="field" data-pickup hidden><span>${t('co.showroom')}</span>
            <select name="showroom"><option value="berlin">${t('sr.berlin.city')}</option><option value="warsaw">${t('sr.warsaw.city')}</option></select>
          </label>
        </fieldset>
        <fieldset>
          <legend>${t('co.payment')}</legend>
          <div class="radio-cards">
            <label><input type="radio" name="pay" value="card" checked><span><b>${t('co.card')}</b><small>Apple Pay, Google Pay, Visa, Mastercard</small></span></label>
            <label><input type="radio" name="pay" value="paypal"><span><b>PayPal</b><small>${t('co.paypalSub')}</small></span></label>
            <label><input type="radio" name="pay" value="parts"><span><b>${t('co.parts')}</b><small>${monthlyText(total)}</small></span></label>
          </div>
        </fieldset>
        <label class="field"><span>${t('co.comment')}</span><textarea name="comment" rows="2" placeholder="${t('co.commentPh')}"></textarea></label>
        <label class="check field-check"><input type="checkbox" name="consent" required><span>${t('co.consent')}</span></label>
      </form>`;
    foot.innerHTML = `
      <div class="sum-row sum-total"><span>${t('co.toPay')} <small>${t('price.inclVat')}</small></span><b>${money(total)}</b></div>
      <button class="cta" type="submit" form="checkoutForm"><span class="cta-label">${t('co.submit')}</span><svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg></button>
      <p class="fine">${t('co.demo')}</p>`;
    const form = $('#checkoutForm');
    bindPhoneFields(form);
    const sync = () => {
      const courier = form.delivery.value === 'courier';
      $('[data-address]', form).hidden = !courier;
      $('[data-pickup]', form).hidden = courier;
    };
    form.addEventListener('change', sync);
    sync();
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!validate(form)) return;
      const data = Object.fromEntries(new FormData(form));
      lastOrder = {
        number: `LN-${String(Date.now()).slice(-6)}`,
        items: items.map((i) => ({ ...i, thumb: undefined })),
        total, name: data.name, email: data.email, delivery: data.delivery,
        place: data.delivery === 'courier' ? `${data.city}, ${data.country}` : t(`sr.${data.showroom}.city`),
        createdAt: new Date().toISOString(),
      };
      save('luna.orders.v2', [...load('luna.orders.v2', []), lastOrder]);
      cart.clear();
      setView('done');
      const r = $('#drawer').getBoundingClientRect();
      confetti(r.left + r.width / 2, r.top + 160);
    });
    return;
  }

  // done
  const first = lastOrder.name.split(' ')[0];
  body.innerHTML = `
    <div class="done">
      <div class="done-badge"><svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg></div>
      <h3>${t('done.title', { name: esc(first) })}</h3>
      <p>${t('done.text', { number: `<b>${lastOrder.number}</b>`, email: esc(lastOrder.email) })}</p>
      <ol class="timeline">
        <li class="is-done"><b>${t('done.step1')}</b><small>${t('done.step1Sub')}</small></li>
        <li><b>${t('done.step2')}</b><small>${t('done.step2Sub')}</small></li>
        <li><b>${t(lastOrder.delivery === 'courier' ? 'done.step3' : 'done.step3Pickup')}</b><small>${esc(lastOrder.place)}</small></li>
      </ol>
    </div>`;
  foot.innerHTML = `<button class="cta" id="doneClose"><span class="cta-label">${t('done.close')}</span><svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg></button>`;
  $('#doneClose').addEventListener('click', closeDrawer);
}

/* ------------------------------------------------------------------ forms */

// international numbers: keep +, digits, spaces and separators only
export function bindPhoneFields(root) {
  $$('[data-phone]', root).forEach((input) => {
    input.addEventListener('input', () => {
      const clean = input.value.replace(/[^\d+\s()\-/]/g, '').replace(/(?!^)\+/g, '');
      if (clean !== input.value) input.value = clean;
    });
  });
}

export function validate(form) {
  let firstBad = null;
  $$('.field, .field-check', form).forEach((f) => {
    f.classList.remove('is-invalid');
    f.querySelector('.field-err')?.remove();
  });
  for (const el of form.elements) {
    if (!el.name || el.closest('[hidden]')) continue;
    let ok = el.checkValidity();
    if (el.dataset.phone !== undefined) {
      const digits = el.value.replace(/\D/g, '').length;
      ok = digits === 0 ? !el.required : digits >= 8 && digits <= 15;
    }
    if (ok) continue;
    const field = el.closest('.field, .field-check') ?? el.closest('fieldset');
    if (field && !field.classList.contains('is-invalid')) {
      field.classList.add('is-invalid');
      field.insertAdjacentHTML('beforeend', `<span class="field-err">${t(`err.${el.name}`)}</span>`);
    }
    firstBad ??= el;
  }
  if (firstBad) {
    firstBad.focus();
    return false;
  }
  return true;
}

/* ------------------------------------------------------------------ toast */

export function toast(msg) {
  let el = $('#toast');
  if (!el) {
    document.body.insertAdjacentHTML('beforeend', '<div class="toast" id="toast" role="status" aria-live="polite"></div>');
    el = $('#toast');
  }
  el.textContent = msg;
  el.classList.add('is-on');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('is-on'), 2400);
}

/* ------------------------------------------------------------------ confetti */

let particles = [];
let confettiCanvas, cctx, confettiRunning = false;
export function confetti(x, y, palette = ['#b35a3a', '#c8952a', '#2c5a70', '#879079', '#141414', '#ffffff']) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (!confettiCanvas) {
    confettiCanvas = $('#confetti') ?? document.body.appendChild(Object.assign(document.createElement('canvas'), { className: 'confetti' }));
    cctx = confettiCanvas.getContext('2d');
  }
  for (let i = 0; i < 140; i++) {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.9;
    const v = 7 + Math.random() * 10;
    particles.push({
      x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
      w: 5 + Math.random() * 7, h: 3 + Math.random() * 5,
      rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4,
      c: palette[i % palette.length], life: 1,
    });
  }
  if (!confettiRunning) {
    confettiRunning = true;
    requestAnimationFrame(drawConfetti);
  }
}
function drawConfetti() {
  const dpr = Math.min(devicePixelRatio, 2);
  if (confettiCanvas.width !== innerWidth * dpr || confettiCanvas.height !== innerHeight * dpr) {
    confettiCanvas.width = innerWidth * dpr;
    confettiCanvas.height = innerHeight * dpr;
  }
  cctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  cctx.clearRect(0, 0, innerWidth, innerHeight);
  particles = particles.filter((p) => p.life > 0);
  for (const p of particles) {
    p.vy += 0.32;
    p.vx *= 0.985;
    p.x += p.vx;
    p.y += p.vy;
    p.rot += p.vr;
    p.life -= 0.009;
    cctx.save();
    cctx.globalAlpha = Math.min(1, p.life * 2);
    cctx.translate(p.x, p.y);
    cctx.rotate(p.rot);
    cctx.fillStyle = p.c;
    cctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.rot * 2)));
    cctx.restore();
  }
  if (particles.length) requestAnimationFrame(drawConfetti);
  else confettiRunning = false;
}

/* ------------------------------------------------------------------ footer */

function renderFooter() {
  const f = $('#footer');
  if (!f) return;
  f.innerHTML = `
    <div class="footer-inner">
      <div class="footer-brand">
        <a class="logo" href="index.html">luna<span>.</span></a>
        <p>${t('footer.about')}</p>
        <ul class="footer-trust">
          <li>${t('footer.trust1')}</li>
          <li>${t('footer.trust2')}</li>
          <li>${t('footer.trust3')}</li>
        </ul>
      </div>
      <nav class="footer-col" aria-label="${t('footer.shop')}">
        <h4>${t('footer.shop')}</h4>
        ${PAGES.map((p) => `<a href="${p.href}">${t(`nav.${p.id}`)}</a>`).join('')}
      </nav>
      <div class="footer-col">
        <h4>${t('footer.help')}</h4>
        <a href="showroom.html#faq">${t('footer.delivery')}</a>
        <a href="showroom.html#faq">${t('footer.warranty')}</a>
        <a href="materials.html#care">${t('footer.care')}</a>
        <a href="legal.html#imprint">${t('footer.imprint')}</a>
        <a href="legal.html#privacy">${t('footer.privacy')}</a>
      </div>
      <div class="footer-col">
        <h4>${t('footer.contact')}</h4>
        <span>hello@luna.example</span>
        <span>${t('footer.hours')}</span>
        <div class="footer-langs">${LANGS.map((l) => `<button data-lang="${l.id}" lang="${l.id}"${l.id === lang ? ' aria-current="true"' : ''}>${l.short}</button>`).join('')}</div>
      </div>
    </div>
    <div class="footer-bottom">
      <span>${t('footer.fiction')} <a href="${AUTHOR.url}" target="_blank" rel="noopener">${esc(AUTHOR.name)}</a>.</span>
      <span>Three.js · WebGL · Vanilla JS</span>
    </div>`;
  f.addEventListener('click', (e) => {
    const b = e.target.closest('[data-lang]');
    if (b && b.dataset.lang !== lang) setLang(b.dataset.lang);
  });
}

/* ------------------------------------------------------------------ reveal on scroll */

let revealer = null;
// Call again after rendering new [data-reveal] nodes.
export function reveal() {
  revealer ??= new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      e.target.classList.add('is-in');
      revealer.unobserve(e.target);
    }
  }, { rootMargin: '0px 0px -8% 0px' });
  $$('[data-reveal]:not([data-revealing])').forEach((el) => {
    el.dataset.revealing = '';
    revealer.observe(el);
  });
}

renderHeader();
renderFooter();
mountDrawer();
reveal();
