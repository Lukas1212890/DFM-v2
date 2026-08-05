const classifyStatus = value => {
  const text = String(value || '').toLocaleLowerCase('cs-CZ');
  if (text.includes('offline')) return 'offline';
  if (text.includes('synchron') || text.includes('čeká')) return 'syncing';
  return 'online';
};

const updateStatusIndicator = () => {
  const button = document.querySelector('.cloud-status');
  if (!button) return;
  button.dataset.state = classifyStatus(button.textContent);
};

const observer = new MutationObserver(updateStatusIndicator);

const startStatusIndicator = () => {
  updateStatusIndicator();
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
  });
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startStatusIndicator, { once: true });
} else {
  startStatusIndicator();
}
