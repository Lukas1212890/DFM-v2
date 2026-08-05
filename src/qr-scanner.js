import { BrowserMultiFormatReader } from '@zxing/browser';

const reader = new BrowserMultiFormatReader();
let activeControls = null;
let activeOverlay = null;
let activeTrack = null;

function setReactInputValue(input, value) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function closeScanner() {
  try { activeControls?.stop(); } catch {}
  try { activeTrack?.stop(); } catch {}
  activeControls = null;
  activeTrack = null;
  activeOverlay?.remove();
  activeOverlay = null;
  document.body.classList.remove('qr-scanner-open');
}

async function applyBestCameraSettings(track, overlay) {
  if (!track) return;

  const capabilities = typeof track.getCapabilities === 'function' ? track.getCapabilities() : {};
  const settings = typeof track.getSettings === 'function' ? track.getSettings() : {};
  const advanced = [];

  if (Array.isArray(capabilities.focusMode) && capabilities.focusMode.includes('continuous')) {
    advanced.push({ focusMode: 'continuous' });
  }

  if (capabilities.zoom) {
    const min = Number(capabilities.zoom.min ?? 1);
    const max = Number(capabilities.zoom.max ?? min);
    const step = Number(capabilities.zoom.step ?? 0.1);
    const preferred = Math.min(max, Math.max(min, settings.zoom || min, 2));
    advanced.push({ zoom: preferred });

    const controls = overlay.querySelector('.qr-camera-controls');
    const slider = overlay.querySelector('.qr-zoom-slider');
    const value = overlay.querySelector('.qr-zoom-value');
    controls.hidden = false;
    slider.min = String(min);
    slider.max = String(max);
    slider.step = String(step || 0.1);
    slider.value = String(preferred);
    value.textContent = `${preferred.toFixed(1)}×`;

    slider.addEventListener('input', async event => {
      const zoom = Number(event.target.value);
      value.textContent = `${zoom.toFixed(1)}×`;
      try {
        await track.applyConstraints({ advanced: [{ zoom }] });
      } catch (error) {
        console.warn('Camera zoom is not available:', error);
      }
    });
  }

  if (advanced.length) {
    try { await track.applyConstraints({ advanced }); } catch (error) {
      console.warn('Advanced camera settings are not available:', error);
    }
  }
}

async function refocusCamera(status) {
  if (!activeTrack) return;
  try {
    const capabilities = activeTrack.getCapabilities?.() || {};
    if (Array.isArray(capabilities.focusMode) && capabilities.focusMode.includes('continuous')) {
      await activeTrack.applyConstraints({ advanced: [{ focusMode: 'continuous' }] });
      status.textContent = 'Automatické ostření bylo znovu aktivováno.';
    } else {
      status.textContent = 'Telefon nepovoluje ruční ostření. Pomalu změň vzdálenost od štítku.';
    }
  } catch {
    status.textContent = 'Ostření se nepodařilo změnit.';
  }
}

async function openScanner(input) {
  closeScanner();

  const overlay = document.createElement('div');
  overlay.className = 'qr-scanner-overlay';
  overlay.innerHTML = `
    <section class="qr-scanner-panel" role="dialog" aria-modal="true" aria-label="Skenování QR kódu">
      <header class="qr-scanner-head">
        <div>
          <p>SKENOVÁNÍ</p>
          <h2>Načíst sériové číslo</h2>
        </div>
        <button type="button" class="qr-scanner-close" aria-label="Zavřít">×</button>
      </header>
      <div class="qr-video-wrap">
        <video class="qr-scanner-video" playsinline muted></video>
        <div class="qr-frame" aria-hidden="true"></div>
      </div>
      <div class="qr-camera-controls" hidden>
        <div class="qr-zoom-head"><span>Přiblížení</span><strong class="qr-zoom-value">1.0×</strong></div>
        <input class="qr-zoom-slider" type="range" aria-label="Přiblížení kamery">
      </div>
      <button type="button" class="qr-focus-button">◎ Znovu zaostřit</button>
      <p class="qr-scanner-help">Pro velmi malý kód použij přiblížení a drž telefon o něco dál. Kód musí být dobře osvětlený a celý uvnitř rámečku.</p>
      <p class="qr-scanner-status">Spouštím kameru…</p>
      <button type="button" class="qr-scanner-cancel">Zrušit</button>
    </section>`;

  document.body.appendChild(overlay);
  document.body.classList.add('qr-scanner-open');
  activeOverlay = overlay;

  const video = overlay.querySelector('video');
  const status = overlay.querySelector('.qr-scanner-status');
  overlay.querySelector('.qr-scanner-close').addEventListener('click', closeScanner);
  overlay.querySelector('.qr-scanner-cancel').addEventListener('click', closeScanner);
  overlay.querySelector('.qr-focus-button').addEventListener('click', () => refocusCamera(status));
  overlay.addEventListener('click', event => {
    if (event.target === overlay) closeScanner();
  });

  try {
    activeControls = await reader.decodeFromConstraints(
      {
        audio: false,
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 3840 },
          height: { ideal: 2160 }
        }
      },
      video,
      (result) => {
        if (!result) return;
        const text = result.getText()?.trim();
        if (!text) return;
        setReactInputValue(input, text);
        if (status) status.textContent = `Načteno: ${text}`;
        if (navigator.vibrate) navigator.vibrate(80);
        window.setTimeout(closeScanner, 350);
      }
    );

    activeTrack = video.srcObject?.getVideoTracks?.()[0] || null;
    await applyBestCameraSettings(activeTrack, overlay);
    status.textContent = 'Kamera je připravená. Pro malý kód použij přiblížení.';
  } catch (error) {
    console.error('QR scanner error:', error);
    status.textContent = 'Kameru se nepodařilo otevřít. Zkontroluj oprávnění ke kameře v nastavení Safari.';
    overlay.querySelector('.qr-video-wrap').classList.add('camera-error');
  }
}

function enhanceSerialInputs(root = document) {
  root.querySelectorAll('.field input[name="serial"]').forEach(input => {
    if (input.dataset.qrReady === 'true') return;
    input.dataset.qrReady = 'true';

    const row = document.createElement('div');
    row.className = 'qr-input-row';
    input.parentNode.insertBefore(row, input);
    row.appendChild(input);

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'qr-scan-button';
    button.innerHTML = '<span aria-hidden="true">▣</span><b>Skenovat</b>';
    button.setAttribute('aria-label', 'Naskenovat QR kód sériového čísla');
    button.addEventListener('click', () => openScanner(input));
    row.appendChild(button);
  });
}

const observer = new MutationObserver(() => enhanceSerialInputs());
observer.observe(document.documentElement, { childList: true, subtree: true });

document.addEventListener('DOMContentLoaded', () => enhanceSerialInputs());
enhanceSerialInputs();
window.addEventListener('pagehide', closeScanner);
