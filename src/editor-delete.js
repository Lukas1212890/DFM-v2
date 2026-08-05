const STORE_KEY = 'dfm_react_pwa_v1';
const EDIT_KEY = 'dfm_edit_target';

function readData() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); }
  catch { return null; }
}

function writeData(data) {
  localStorage.setItem(STORE_KEY, JSON.stringify(data));
}

function currentSection() {
  const label = document.querySelector('.bottom-nav button.active small')?.textContent?.trim();
  if (label === 'Piloti') return 'pilot';
  if (label === 'Úkoly') return 'task';
  if (label === 'Lety') return 'flight';
  return null;
}

function rememberEditedItem() {
  const type = currentSection();
  if (!type) return;

  const data = readData();
  if (!data) return;

  const key = type === 'pilot' ? 'pilots' : type === 'task' ? 'tasks' : 'flights';
  const cards = [...document.querySelectorAll('.content .list > .list-item')];

  cards.forEach((card, index) => {
    const edit = card.querySelector('.mini-button');
    if (!edit || edit.dataset.deleteTargetReady === 'true') return;
    const item = data[key]?.[index];
    if (!item) return;

    edit.dataset.deleteTargetReady = 'true';
    edit.addEventListener('click', () => {
      sessionStorage.setItem(EDIT_KEY, JSON.stringify({ type, id: item.id }));
    }, true);
  });
}

function itemLabel(type, item) {
  if (type === 'pilot') return `pilota „${item.name || 'bez jména'}“`;
  if (type === 'task') {
    const title = item.type === 'Ostatní' ? (item.custom || 'Ostatní') : (item.type || 'bez názvu');
    return `úkol „${title}“`;
  }
  return `let „${item.location || item.date || 'bez názvu'}“`;
}

function buttonLabel(type) {
  if (type === 'pilot') return 'Smazat pilota';
  if (type === 'task') return 'Smazat úkol';
  return 'Smazat let';
}

function enhanceEditorDelete() {
  rememberEditedItem();

  const panel = document.querySelector('.sheet-panel');
  if (!panel || panel.dataset.nativeDeleteReady === 'true') return;
  if (panel.querySelector('.sheet-header .eyebrow')?.textContent?.trim() !== 'Úprava položky') return;

  let target;
  try { target = JSON.parse(sessionStorage.getItem(EDIT_KEY) || 'null'); }
  catch { target = null; }
  if (!target || !['pilot', 'task', 'flight'].includes(target.type)) return;

  const data = readData();
  if (!data) return;
  const key = target.type === 'pilot' ? 'pilots' : target.type === 'task' ? 'tasks' : 'flights';
  const item = data[key]?.find(entry => entry.id === target.id);
  if (!item) return;

  const actions = panel.querySelector('.sheet-actions');
  if (!actions) return;

  panel.dataset.nativeDeleteReady = 'true';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'danger-button editor-delete-button';
  button.textContent = buttonLabel(target.type);
  button.addEventListener('click', () => {
    if (!window.confirm(`Opravdu smazat ${itemLabel(target.type, item)}?`)) return;
    const index = data[key].findIndex(entry => entry.id === target.id);
    if (index < 0) return;
    data[key].splice(index, 1);
    writeData(data);
    sessionStorage.setItem('dfm_return_section', target.type === 'pilot' ? 'Piloti' : target.type === 'task' ? 'Úkoly' : 'Lety');
    sessionStorage.removeItem(EDIT_KEY);
    window.location.reload();
  });
  actions.prepend(button);
}

let scheduled = false;
new MutationObserver(() => {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    enhanceEditorDelete();
  });
}).observe(document.documentElement, { childList: true, subtree: true });

document.addEventListener('click', event => {
  if (event.target.closest('.bottom-nav button')) sessionStorage.removeItem(EDIT_KEY);
}, true);

enhanceEditorDelete();
