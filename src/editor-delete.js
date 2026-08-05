const STORE_KEY = 'dfm_react_pwa_v1';

function readData() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); }
  catch { return null; }
}

function fieldValue(form, name) {
  return form.querySelector(`[name="${name}"]`)?.value?.trim() || '';
}

function findItem(data, type, form) {
  if (!data) return null;

  if (type === 'pilot') {
    const name = fieldValue(form, 'name');
    const item = data.pilots?.find(x => x.name === name);
    return item ? { list: data.pilots, item, label: `pilota „${name}“` } : null;
  }

  if (type === 'task') {
    const taskType = fieldValue(form, 'type');
    const custom = fieldValue(form, 'custom');
    const dueDate = fieldValue(form, 'dueDate');
    const item = data.tasks?.find(x => x.type === taskType && (x.custom || '') === custom && (x.dueDate || '') === dueDate);
    const title = taskType === 'Ostatní' ? (custom || 'Ostatní') : taskType;
    return item ? { list: data.tasks, item, label: `úkol „${title}“` } : null;
  }

  if (type === 'flight') {
    const date = fieldValue(form, 'date');
    const location = fieldValue(form, 'location');
    const item = data.flights?.find(x => (x.date || '') === date && (x.location || '') === location);
    return item ? { list: data.flights, item, label: `let „${location || date || 'bez názvu'}“` } : null;
  }

  return null;
}

function enhanceEditorDelete() {
  const panel = document.querySelector('.sheet-panel');
  if (!panel || panel.dataset.detailDeleteReady === 'true') return;

  const form = panel.querySelector('form');
  const type = panel.querySelector('.sheet-header h2')?.textContent?.trim();
  const eyebrow = panel.querySelector('.sheet-header .eyebrow')?.textContent?.trim();
  if (!form || eyebrow !== 'Úprava položky') return;

  const data = readData();
  const match = findItem(data, type, form);
  if (!match) return;

  panel.dataset.detailDeleteReady = 'true';
  const actions = panel.querySelector('.sheet-actions');
  if (!actions) return;

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'danger-button editor-delete-button';
  button.textContent = type === 'pilot' ? 'Smazat pilota' : type === 'task' ? 'Smazat úkol' : 'Smazat let';
  button.addEventListener('click', () => {
    if (!window.confirm(`Opravdu smazat ${match.label}?`)) return;
    const index = match.list.findIndex(x => x.id === match.item.id);
    if (index < 0) return;
    match.list.splice(index, 1);
    localStorage.setItem(STORE_KEY, JSON.stringify(data));
    window.location.reload();
  });

  actions.prepend(button);
}

new MutationObserver(enhanceEditorDelete).observe(document.documentElement, { childList: true, subtree: true });
enhanceEditorDelete();
