const RESTORE_KEY = 'dfm_restore_section';

function sectionFromDeleteButton(button) {
  const text = button?.textContent?.trim() || '';
  if (text.includes('pilota')) return 'Piloti';
  if (text.includes('úkol')) return 'Úkoly';
  if (text.includes('let')) return 'Lety';
  if (text.includes('dron')) return 'Drony';
  return null;
}

document.addEventListener('click', event => {
  const button = event.target.closest('.danger-button');
  if (!button) return;
  const section = sectionFromDeleteButton(button);
  if (section) sessionStorage.setItem(RESTORE_KEY, section);
}, true);

function restoreSection() {
  const section = sessionStorage.getItem(RESTORE_KEY);
  if (!section) return;

  const target = [...document.querySelectorAll('.bottom-nav button')]
    .find(button => button.querySelector('small')?.textContent?.trim() === section);

  if (!target) return;
  sessionStorage.removeItem(RESTORE_KEY);
  target.click();
}

const observer = new MutationObserver(restoreSection);
observer.observe(document.documentElement, { childList: true, subtree: true });
document.addEventListener('DOMContentLoaded', restoreSection);
restoreSection();
