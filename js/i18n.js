// Tiny i18n: picks a language, loads its dictionary, translates [data-i18n*] nodes
// and formats money/dates for that locale. Switching language reloads the page (state lives in the URL).
import en from './locales/en.js';

export const LANGS = [
  { id: 'en', short: 'EN', label: 'English', locale: 'en-IE' },
  { id: 'de', short: 'DE', label: 'Deutsch', locale: 'de-DE' },
  { id: 'uk', short: 'UK', label: 'Українська', locale: 'uk-UA' },
];
const KEY = 'luna.lang';

function detect() {
  const ok = (id) => LANGS.some((l) => l.id === id);
  const fromUrl = new URLSearchParams(location.search).get('lang');
  if (ok(fromUrl)) return fromUrl;
  try {
    const saved = localStorage.getItem(KEY);
    if (ok(saved)) return saved;
  } catch { /* storage blocked */ }
  for (const l of navigator.languages ?? [navigator.language]) {
    const id = l.slice(0, 2).toLowerCase();
    if (ok(id)) return id;
    if (id === 'ru' || id === 'be') return 'uk';
  }
  return 'en';
}

export const lang = detect();
export const { locale } = LANGS.find((l) => l.id === lang);
const dict = lang === 'en' ? en : (await import(`./locales/${lang}.js`)).default;

export function t(key, vars) {
  let s = dict[key] ?? en[key];
  if (s === undefined) {
    console.warn(`[i18n] missing key: ${key}`);
    return key;
  }
  if (vars) s = s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
  return s;
}
// option label, e.g. opt('material', 'boucle') → "Bouclé"
export const opt = (kind, id) => t(`opt.${kind}.${id}`);

const moneyFmt = new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR', currencyDisplay: 'narrowSymbol', maximumFractionDigits: 0, minimumFractionDigits: 0 });
export const num = new Intl.NumberFormat(locale);
export const money = (n) => moneyFmt.format(Math.round(n));
export const signed = (n) => (n === 0 ? t('price.included') : `${n > 0 ? '+' : '−'}${moneyFmt.format(Math.abs(Math.round(n)))}`);
export const delta = (n) => `${n > 0 ? '+' : '−'}${moneyFmt.format(Math.abs(Math.round(n)))}`;

export function applyI18n(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => (el.textContent = t(el.dataset.i18n)));
  root.querySelectorAll('[data-i18n-html]').forEach((el) => (el.innerHTML = t(el.dataset.i18nHtml)));
  root.querySelectorAll('[data-i18n-attr]').forEach((el) => {
    for (const pair of el.dataset.i18nAttr.split(';')) {
      const [attr, key] = pair.split(':').map((s) => s.trim());
      el.setAttribute(attr, t(key));
    }
  });
}

export function setLang(id) {
  try {
    localStorage.setItem(KEY, id);
  } catch { /* falls back to ?lang */ }
  const url = new URL(location.href);
  url.searchParams.set('lang', id);
  document.documentElement.classList.add('lang-switching');
  setTimeout(() => location.replace(url), 180);
}

document.documentElement.lang = lang;
applyI18n();
