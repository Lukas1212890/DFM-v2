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

async function decodePhotoFile(file, input, statusTarget = null) {
  if (!file) return;
  const status = statusTarget || document.querySelector('.qr-scanner-status');
  if (status) status.textContent = 'Analyzuji fotografii…';

  const objectUrl = URL.createObjectURL(file);
  const image = new Image();
  image.className = 'qr-hidden-image';
  image.alt = '';
  document.body.appendChild(image);

  try {
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = reject;
      image.src = objectUrl;
    });

    const result = await reader.decodeFromImageElement(image);
    const text = result?.getText()?.trim();
    if (!text) throw new Error('empty-result');

    setReactInputValue(input, text);
    if (navigator.vibrate) navigator.vibrate(80);
    if (status) status.textContent = `Načteno z fotografie: ${text}`;
    window.setTimeout(closeScanner, 450);
  } catch (error) {
    console.warn('QR photo decode failed:', error);
    if (status) {
      status.textContent = 'Kód se z fotografie nepodařilo přečíst. Zkus fotografii z větší blízkosti, bez odlesku a s ostrým kódem uprostřed.';
    } else {
      window.alert('Kód se z fotografie nepodařilo přečíst. Zkus ostřejší snímek bez odlesku.');
    }
  } finally {
    URL.revokeObjectURL(objectUrl);
    image.remove();
  }
}

function createPhotoInput(input, statusTarget = null) {
  const picker = document.createElement('input');
  picker.type = 'file';
  picker.accept = 'image/*';
  picker.setAttribute('capture', 'environment');
  picker.className = 'qr-photo-input';
  picker.addEventListener('change', async () => {
    const file = picker.files?.[0];
    await decodePhotoFile(file, input, statusTarget);
    picker.remove();
  }, { once: true });
  document.body.appendChild(picker);
  picker.click();
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
      <div class="qr-action-grid">
        <button type="button" class="qr-photo-button">📷 Vyfotit kód</button>
        <button type="button" class="qr-focus-button">◎ Znovu zaostřit</button>
      </div>
      <p class="qr-scanner-help">U malého štítku je lepší použít „Vyfotit kód“. Telefon pořídí snímek v plném rozlišení a aplikace ho následně analyzuje.</p>
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
  overlay.querySelector('.qr-photo-button').addEventListener('click', () => createPhotoInput(input, status));
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
    status.textContent = 'Kamera je připravená. Pro miniaturní kód doporučuji fotografii.';
  } catch (error) {
    console.error('QR scanner error:', error);
    status.textContent = 'Živou kameru se nepodařilo otevřít. Stále můžeš použít tlačítko Vyfotit kód.';
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

    const scanButton = document.createElement('button');
    scanButton.type = 'button';
    scanButton.className = 'qr-scan-button';
    scanButton.innerHTML = '<span aria-hidden="true">▣</span><b>Skenovat</b>';
    scanButton.setAttribute('aria-label', 'Naskenovat QR kód sériového čísla');
    scanButton.addEventListener('click', () => openScanner(input));
    row.appendChild(scanButton);

    const photoButton = document.createElement('button');
    photoButton.type = 'button';
    photoButton.className = 'qr-photo-inline-button';
    photoButton.innerHTML = '<span aria-hidden="true">📷</span><b>Vyfotit</b>';
    photoButton.setAttribute('aria-label', 'Vyfotit QR kód sériového čísla');
    photoButton.addEventListener('click', () => createPhotoInput(input));
    row.appendChild(photoButton);
  });
}

const observer = new MutationObserver(() => enhanceSerialInputs());
observer.observe(document.documentElement, { childList: true, subtree: true });

document.addEventListener('DOMContentLoaded', () => enhanceSerialInputs());
enhanceSerialInputs();
window.addEventListener('pagehide', closeScanner);
