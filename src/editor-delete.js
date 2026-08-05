const STORE_KEY = 'dfm_react_pwa_v1';

function readData() {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
  } catch {
    return null;
  }
}

function fieldValue(form, name) {
  return form.querySelector(`[name="${name}"]`)?.value?.trim() || '';
}

function findItem(data, type, form) {
  if (!data) return null;

  if (type === 'pilot') {
    const name = fieldValue(form, 'name');
    const phone = fieldValue(form, 'phone');
    const email = fieldValue(form, 'email');
    const item = data.pilots?.find(x =>
      x.name === name &&
      (x.phone || '') === phone &&
      (x.email || '') === email
    ) || data.pilots?.find(x => x.name === name);

    return item
      ? { list: data.pilots, item, label: `pilota „${item.name}“`, button: 'Smazat pilota' }
      : null;
  }

  if (type === 'task') {
    const taskType = fieldValue(form, 'type');
    const custom = fieldValue(form, 'custom');
    const dueDate = fieldValue(form, 'dueDate');
    const assignedTo = fieldValue(form, 'assignedTo');

    const item = data.tasks?.find(x =>
      x.type === taskType &&
      (x.custom || '') === custom &&
      (x.dueDate || '') === dueDate &&
      (x.assignedTo || '') === assignedTo
    ) || data.tasks?.find(x =>
      x.type === taskType &&
      (x.custom || '') === custom &&
      (x.dueDate || '') === dueDate
    );

    const title = item
      ? (item.type === 'Ostatní' ? item.custom || 'Ostatní' : item.type)
      : (taskType === 'Ostatní' ? custom || 'Ostatní' : taskType);

    return item
      ? { list: data.tasks, item, label: `úkol „${title}“`, button: 'Smazat úkol' }
      : null;
  }

  if (type === 'flight') {
    const date = fieldValue(form, 'date');
    const location = fieldValue(form, 'location');
    const item = data.flights?.find(x =>
      (x.date || '') === date &&
      (x.location || '') === location
    );

    return item
      ? { list: data.flights, item, label: `let „${location || date || 'bez názvu'}“`, button: 'Smazat let' }
      : null;
  }

  return null;
}

function enhanceEditorDelete() {
  document.querySelectorAll('.sheet-panel').forEach(panel => {
    const form = panel.querySelector('form');
    const type = panel.querySelector('.sheet-header h2')?.textContent?.trim();
    const eyebrow = panel.querySelector('.sheet-header .eyebrow')?.textContent?.trim();

    if (!form || eyebrow !== 'Úprava položky' || !['pilot', 'task', 'flight'].includes(type)) return;

    const actions = panel.querySelector('.sheet-actions');
    if (!actions) return;

    const data = readData();
    const match = findItem(data, type, form);
    if (!match) return;

    let button = actions.querySelector('.editor-delete-button');
    if (button) return;

    button = document.createElement('button');
    button.type = 'button';
    button.className = 'danger-button editor-delete-button';
    button.textContent = match.button;

    button.addEventListener('click', () => {
      const freshData = readData();
      const freshMatch = findItem(freshData, type, form);
      if (!freshMatch) {
        window.alert('Položku se nepodařilo najít. Zavři úpravu a otevři ji znovu.');
        return;
      }

      if (!window.confirm(`Opravdu smazat ${freshMatch.label}?`)) return;

      const index = freshMatch.list.findIndex(x => x.id === freshMatch.item.id);
      if (index < 0) return;

      freshMatch.list.splice(index, 1);
      localStorage.setItem(STORE_KEY, JSON.stringify(freshData));
      window.location.reload();
    });

    actions.prepend(button);
  });
}

let scheduled = false;
const observer = new MutationObserver(() => {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    enhanceEditorDelete();
  });
});

observer.observe(document.documentElement, {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: ['value']
});

document.addEventListener('input', enhanceEditorDelete, true);
document.addEventListener('change', enhanceEditorDelete, true);
document.addEventListener('DOMContentLoaded', enhanceEditorDelete);
enhanceEditorDelete();