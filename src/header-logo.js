import logoUrl from './assets/dfm-logo-compact.svg';

const TARGETS = '.brand-logo, .auth-logo, .dashboard-mark';

function mountLogo(element) {
  if (!(element instanceof HTMLElement) || element.querySelector('.dfm-logo-image')) return;

  element.textContent = '';
  element.style.backgroundImage = 'none';
  element.style.textIndent = '0';
  element.setAttribute('aria-label', 'DFM');

  const image = document.createElement('img');
  image.className = 'dfm-logo-image';
  image.src = logoUrl;
  image.alt = 'DFM';
  image.decoding = 'async';
  image.draggable = false;
  element.appendChild(image);
}

function mountAll(root = document) {
  if (root instanceof HTMLElement && root.matches(TARGETS)) mountLogo(root);
  root.querySelectorAll?.(TARGETS).forEach(mountLogo);
}

const observer = new MutationObserver(records => {
  for (const record of records) {
    for (const node of record.addedNodes) {
      if (node instanceof HTMLElement) mountAll(node);
    }
  }
});

function start() {
  mountAll();
  observer.observe(document.body, { childList: true, subtree: true });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start, { once: true });
} else {
  start();
}
