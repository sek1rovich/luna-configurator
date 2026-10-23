// "Put it in your room": exports the current model to GLB and shows it in <model-viewer>,
// which launches WebXR on Android and Quick Look on iOS (USDZ is generated on the fly).
// On desktop it shows a QR code that opens the same configuration on a phone.
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { $, toast } from './shell.js';
import { disposeGroup } from './studio.js';
import { t } from './i18n.js';

const MODEL_VIEWER = new URL('../vendor/model-viewer.min.js', import.meta.url).href;
const QR_LIB = new URL('../vendor/qrcode.js', import.meta.url).href;

let modelViewerReady = null;
const loadModelViewer = () => (modelViewerReady ??= import(MODEL_VIEWER));

let qrReady = null;
function loadQr() {
  qrReady ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = QR_LIB;
    s.onload = () => resolve(window.qrcode);
    s.onerror = reject;
    document.head.appendChild(s);
  });
  return qrReady;
}

export async function exportGLB(object) {
  object.updateMatrixWorld(true);
  const buffer = await new GLTFExporter().parseAsync(object, { binary: true });
  return new Blob([buffer], { type: 'model/gltf-binary' });
}

// share link for the phone: the configurator with this config and an "open AR" flag
export const arLink = (cfg) => `${location.origin}${location.pathname.replace(/[^/]*$/, '')}index.html#${new URLSearchParams({ ...cfg, ar: 1 })}`;

let modelUrl = null;
const loading = () => `<div class="ar-loading"><span class="spinner"></span>${t('ar.loading')}</div>`;

/**
 * build()  — returns a fresh Object3D in metres, standing on y = 0 (it is disposed after export)
 * dims     — { W, D, H } in metres, shown in the dialog
 */
export async function openAR({ build, title, dims, shareUrl }) {
  let modal = $('#arModal');
  if (!modal) {
    document.body.insertAdjacentHTML('beforeend', `
      <div class="ar-modal" id="arModal" role="dialog" aria-modal="true" aria-labelledby="arTitle" hidden>
        <div class="ar-backdrop" data-ar-close></div>
        <div class="ar-card">
          <header class="ar-head">
            <div>
              <p class="kicker">${t('ar.kicker')}</p>
              <h2 id="arTitle"></h2>
            </div>
            <button class="icon-btn" data-ar-close aria-label="${t('common.close')}"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
          </header>
          <div class="ar-body">
            <div class="ar-viewer" id="arViewer"></div>
            <aside class="ar-side" id="arSide"></aside>
          </div>
        </div>
      </div>`);
    modal = $('#arModal');
    modal.addEventListener('click', (e) => e.target.closest('[data-ar-close]') && closeAR());
    addEventListener('keydown', (e) => e.key === 'Escape' && !modal.hidden && closeAR());
  }
  $('#arTitle').textContent = title;
  $('#arViewer').innerHTML = loading();
  $('#arSide').innerHTML = '';
  modal.hidden = false;
  document.documentElement.classList.add('modal-open');
  requestAnimationFrame(() => modal.classList.add('is-open'));

  try {
    const object = build();
    const [blob] = await Promise.all([exportGLB(object), loadModelViewer()]);
    disposeGroup(object);
    if (modelUrl) URL.revokeObjectURL(modelUrl);
    modelUrl = URL.createObjectURL(blob);

    const cm = (v) => Math.round(v * 100);
    $('#arViewer').innerHTML = `
      <model-viewer id="arMv" src="${modelUrl}" alt="${title}"
        ar ar-modes="webxr quick-look" ar-placement="floor" ar-scale="fixed"
        camera-controls auto-rotate auto-rotate-delay="0" rotation-per-second="18deg"
        camera-orbit="30deg 72deg auto" interaction-prompt="none"
        shadow-intensity="1" shadow-softness="0.9" exposure="1.05" tone-mapping="neutral" environment-image="neutral">
        <button slot="ar-button" class="btn btn-dark ar-go">
          <svg viewBox="0 0 24 24"><path d="M12 3 4 7.5v9L12 21l8-4.5v-9L12 3Z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9"/></svg>
          ${t('ar.place')}
        </button>
      </model-viewer>
      <span class="ar-size">${cm(dims.W)} × ${cm(dims.D)} × ${cm(dims.H)} cm · ${t('ar.trueSize')}</span>`;

    const mv = $('#arMv');
    await new Promise((resolve) => mv.addEventListener('load', resolve, { once: true }));
    mv.addEventListener('ar-status', (e) => {
      if (e.detail.status === 'failed') toast(t('ar.failed'));
    });

    if (mv.canActivateAR) {
      $('#arSide').innerHTML = `
        <ol class="ar-steps">
          <li><b>${t('ar.step1')}</b><span>${t('ar.step1Sub')}</span></li>
          <li><b>${t('ar.step2')}</b><span>${t('ar.step2Sub')}</span></li>
          <li><b>${t('ar.step3')}</b><span>${t('ar.step3Sub')}</span></li>
        </ol>`;
    } else {
      const local = /^(localhost|127\.|\[::1\])/.test(location.hostname);
      $('#arSide').innerHTML = `
        <div class="ar-qr" id="arQr"><span class="spinner"></span></div>
        <h3>${t('ar.phoneTitle')}</h3>
        <p>${t('ar.phoneText')}</p>
        ${local ? `<p class="fine">${t('ar.localNote')}</p>` : ''}
        <button class="btn btn-ghost" id="arCopy">${t('ar.copy')}</button>`;
      $('#arCopy').addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(shareUrl);
          toast(t('ar.copied'));
        } catch {
          toast(t('ar.copyFail'));
        }
      });
      try {
        const qrcode = await loadQr();
        const qr = qrcode(0, 'M');
        qr.addData(shareUrl);
        qr.make();
        $('#arQr').innerHTML = qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
      } catch {
        $('#arQr').textContent = t('ar.qrFail');
      }
    }
  } catch (err) {
    console.error(err);
    $('#arViewer').innerHTML = `<div class="ar-loading">${t('ar.error')}</div>`;
  }
}

function closeAR() {
  const modal = $('#arModal');
  modal.classList.remove('is-open');
  document.documentElement.classList.remove('modal-open');
  setTimeout(() => {
    modal.hidden = true;
    $('#arViewer').innerHTML = '';
  }, 350);
}
