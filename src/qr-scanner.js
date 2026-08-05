import { BrowserMultiFormatReader } from '@zxing/browser';

const reader = new BrowserMultiFormatReader();
let activeControls = null;
let activeOverlay = null;

function setReactInputValue(input, value) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function closeScanner() {
  try { activeControls?.stop(); } catch {}
  activeControls = null;
  activeOverlay?.remove();
  activeOverlay = null;
  document.body.classList.remove('qr-scanner-open');
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
      <p class="qr-scanner-help">Namiř zadní kameru na QR nebo čárový kód. Po načtení se hodnota automaticky vloží do sériového čísla.</p>
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
  overlay.addEventListener('click', event => {
    if (event.target === overlay) closeScanner();
  });

  try {
    activeControls = await reader.decodeFromConstraints(
      { audio: false, video: { facingMode: { ideal: 'environment' } } },
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
    status.textContent = 'Kamera je připravená.';
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
