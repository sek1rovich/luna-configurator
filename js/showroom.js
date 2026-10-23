import { $, $$, cart, toast, confetti, bindPhoneFields, validate, reveal, itemTitle } from './shell.js';
import { t, locale } from './i18n.js';

const SHOWROOMS = [
  {
    id: 'berlin', address: 'Torstraße 140, 10119 Berlin', tz: 'Europe/Berlin',
    hours: [10, 20], phone: '+49 30 0000 0000', map: { x: 58, y: 44 },
    water: 'M0 52 Q30 40 55 50 T100 46 L100 56 Q70 60 50 58 T0 62Z',
  },
  {
    id: 'warsaw', address: 'ul. Mokotowska 50, 00-543 Warszawa', tz: 'Europe/Warsaw',
    hours: [10, 19], phone: '+48 22 000 00 00', map: { x: 36, y: 40 },
    water: 'M78 0 Q70 30 82 70 L100 70 L100 0Z',
  },
];
const SLOTS = ['10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00'];
const DAY = new Intl.DateTimeFormat(locale, { weekday: 'short' });
const DATE_LONG = new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long' });
const city = (s) => t(`sr.${s.id}.city`);

/* ------------------------------------------------------------------ hero counters */

const counters = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (!e.isIntersecting) continue;
    counters.unobserve(e.target);
    const to = Number(e.target.dataset.count), t0 = performance.now();
    const step = (now) => {
      const k = Math.min(1, (now - t0) / 1200);
      e.target.textContent = Math.round(to * (1 - Math.pow(1 - k, 3)));
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
});
$$('[data-count]').forEach((el) => counters.observe(el));

/* ------------------------------------------------------------------ locations */

function openNow(s) {
  // showroom hours are in the showroom's own timezone, whatever the visitor's clock says
  const h = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: s.tz }).format(new Date()));
  return h >= s.hours[0] && h < s.hours[1];
}
const mapSvg = (s) => `
  <svg class="map" viewBox="0 0 100 70" aria-hidden="true">
    <path class="map-water" d="${s.water}"/>
    <g class="map-roads">
      <path d="M0 20 L100 28"/><path d="M0 48 L100 40"/><path d="M22 0 L30 70"/><path d="M52 0 L60 70"/>
      <path class="minor" d="M0 34 L100 34"/><path class="minor" d="M40 0 L44 70"/><path class="minor" d="M70 0 L76 70"/><path class="minor" d="M0 58 L60 52"/>
    </g>
    <rect class="map-park" x="${s.map.x - 20}" y="${s.map.y - 14}" width="12" height="9" rx="2"/>
    <g class="map-pin" transform="translate(${s.map.x} ${s.map.y})">
      <circle r="9" class="pulse"/><circle r="4.5"/>
    </g>
  </svg>`;

$('#locations').innerHTML = SHOWROOMS.map((s, i) => `
  <article class="loc" data-reveal style="--d:${i * 0.1}s">
    <div class="loc-map">${mapSvg(s)}<span class="loc-status ${openNow(s) ? 'is-open' : ''}">${t(openNow(s) ? 'sr.open' : 'sr.closed')}</span></div>
    <div class="loc-body">
      <h3>${city(s)}</h3>
      <p class="loc-addr">${s.address}<br><small>${t(`sr.${s.id}.area`)}</small></p>
      <dl>
        <div><dt>${t('sr.daily')}</dt><dd>${s.hours[0]}:00 – ${s.hours[1]}:00</dd></div>
        <div><dt>${t('sr.phone')}</dt><dd>${s.phone}</dd></div>
        <div><dt>${t('sr.bonus')}</dt><dd>${t(`sr.${s.id}.note`)}</dd></div>
      </dl>
      <div class="loc-actions">
        <a class="btn btn-ghost" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.address)}" target="_blank" rel="noopener">${t('sr.route')}</a>
        <button class="btn btn-dark" data-book="${s.id}">${t('sr.book')}</button>
      </div>
    </div>
  </article>`).join('');

$('#locations').addEventListener('click', (e) => {
  const b = e.target.closest('[data-book]');
  if (!b) return;
  $(`input[name="city"][value="${b.dataset.book}"]`).checked = true;
  renderSlots();
  $('#book').scrollIntoView({ behavior: 'smooth' });
});

/* ------------------------------------------------------------------ booking form */

const form = $('#bookForm');
$('#bkCity').innerHTML = SHOWROOMS.map((s, i) => `
  <label><input type="radio" name="city" value="${s.id}" ${i ? '' : 'checked'}><span><b>${city(s)}</b><small>${s.address}</small></span></label>`).join('');

// next 10 days; Monday is a workshop day, showrooms are closed
const days = [];
for (let n = 1; days.length < 10 && n < 20; n++) {
  const now = new Date();
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + n);
  days.push({ date: day, closed: day.getDay() === 1 });
}
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
$('#bkDays').innerHTML = days.map(({ date, closed }) => `
  <label class="day${closed ? ' is-closed' : ''}">
    <input type="radio" name="date" value="${iso(date)}" required ${closed ? 'disabled' : ''}>
    <span><small>${DAY.format(date)}</small><b>${date.getDate()}</b>${closed ? `<small>${t('sr.dayOff')}</small>` : ''}</span>
  </label>`).join('');

// deterministic "already booked" slots so the schedule looks alive but stable
function busy(dateIso, cityId, slot) {
  let h = 0;
  for (const c of `${dateIso}${cityId}${slot}`) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h % 10 < 3;
}
function renderSlots() {
  const date = form.date.value, cityId = form.city.value;
  const chosen = form.time?.value;
  const closeAt = SHOWROOMS.find((s) => s.id === cityId).hours[1];
  $('#bkSlots').innerHTML = date
    ? SLOTS.map((slot) => {
      const off = busy(date, cityId, slot) || Number(slot.slice(0, 2)) >= closeAt;
      return `<label class="slot${off ? ' is-busy' : ''}"><input type="radio" name="time" value="${slot}" required ${off ? 'disabled' : ''} ${slot === chosen && !off ? 'checked' : ''}><span>${slot}</span></label>`;
    }).join('')
    : `<p class="slots-empty">${t('sr.pickDate')}</p>`;
}
form.addEventListener('change', (e) => {
  if (e.target.name === 'date' || e.target.name === 'city') renderSlots();
  e.target.closest('.field, .field-check')?.classList.remove('is-invalid');
  e.target.closest('.field, .field-check')?.querySelector('.field-err')?.remove();
});
renderSlots();
bindPhoneFields(form);

const sofas = cart.items.filter((i) => i.kind === 'sofa');
if (sofas.length) {
  $('#bkCartWrap').hidden = false;
  $('#bkCartNote').textContent = sofas.map(itemTitle).join(', ');
}

let lastBooking = null;
form.addEventListener('submit', (e) => {
  e.preventDefault();
  if (!validate(form)) return;
  const data = Object.fromEntries(new FormData(form));
  const s = SHOWROOMS.find((x) => x.id === data.city);
  const [y, m, d] = data.date.split('-').map(Number);
  const when = new Date(y, m - 1, d, ...data.time.split(':').map(Number));
  lastBooking = { when, s };
  try {
    localStorage.setItem('luna.booking.v2', JSON.stringify({ showroom: s.id, date: data.date, time: data.time, name: data.name }));
  } catch { /* not persisted */ }

  $('#bookDone').innerHTML = `
    <div class="done">
      <div class="done-badge"><svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg></div>
      <h3>${t('sr.doneTitle', { name: data.name.split(' ')[0].replace(/[<>&"]/g, '') })}</h3>
      <p>${t('sr.doneText', { when: `<b>${DATE_LONG.format(when)}, ${data.time}</b>`, city: city(s), address: s.address })}</p>
      <div class="done-actions">
        <button class="btn btn-dark" id="icsBtn">${t('sr.calendar')}</button>
        <button class="btn btn-ghost" id="againBtn">${t('sr.again')}</button>
      </div>
    </div>`;
  form.hidden = true;
  $('#bookDone').hidden = false;
  const r = $('.book-card').getBoundingClientRect();
  confetti(r.left + r.width / 2, r.top + 120);
  $('#icsBtn').addEventListener('click', () => downloadIcs(lastBooking));
  $('#againBtn').addEventListener('click', () => {
    form.reset();
    renderSlots();
    form.hidden = false;
    $('#bookDone').hidden = true;
  });
});

function downloadIcs({ when, s }) {
  const pad = (n) => String(n).padStart(2, '0');
  const local = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Luna//Showroom//EN', 'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${Date.now()}@luna.example`,
    `DTSTAMP:${stamp}`,
    `DTSTART;TZID=${s.tz}:${local(when)}`,
    'DURATION:PT1H',
    `SUMMARY:${t('sr.icsTitle')}`,
    `LOCATION:${s.address.replace(/,/g, '\\,')}`,
    `DESCRIPTION:${t('sr.icsText')}`,
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
  a.download = 'luna-showroom.ics';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast(t('sr.icsSaved'));
}

reveal();
