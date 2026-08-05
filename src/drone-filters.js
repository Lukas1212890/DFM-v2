const SENSOR_FILTERS = ['RGB', 'Termokamera', 'Multispektrál', 'LiDAR', 'RTK', 'Noční vidění'];

let searchText = '';
let selectedSensors = new Set();

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('cs-CZ')
    .trim();
}

function findDroneLists() {
  return [...document.querySelectorAll('.list')].filter(list =>
    list.querySelector('.list-item .item-icon')?.textContent?.trim() === '✈'
  );
}

function getDroneCards(list) {
  return [...list.querySelectorAll(':scope > .list-item')].filter(card =>
    card.querySelector('.item-icon')?.textContent?.trim() === '✈'
  );
}

function applyFilters() {
  const query = normalize(searchText);
  let totalVisible = 0;

  findDroneLists().forEach(list => {
    const cards = getDroneCards(list);
    let visibleInList = 0;

    cards.forEach(card => {
      const searchableText = normalize(card.textContent);
      const cardSensors = new Set(
        [...card.querySelectorAll('.sensor-tag')].map(tag => tag.textContent.trim())
      );

      const matchesSearch = !query || searchableText.includes(query);
      const matchesSensors = [...selectedSensors].every(sensor => cardSensors.has(sensor));
      const visible = matchesSearch && matchesSensors;

      card.hidden = !visible;
      if (visible) {
        visibleInList += 1;
        totalVisible += 1;
      }
    });

    let empty = list.querySelector(':scope > .drone-filter-empty');
    if (!empty) {
      empty = document.createElement('div');
      empty.className = 'empty drone-filter-empty';
      empty.textContent = 'Žádný dron neodpovídá vyhledávání nebo zvoleným senzorům.';
      list.appendChild(empty);
    }
    empty.hidden = visibleInList > 0 || cards.length === 0;
  });

  document.querySelectorAll('.drone-filter-count').forEach(el => {
    el.textContent = `${totalVisible} nalezeno`;
  });
}

function createControls() {
  const panel = document.createElement('section');
  panel.className = 'drone-filter-panel';
  panel.dataset.droneFilterPanel = 'true';
  panel.innerHTML = `
    <div class="drone-search-row">
      <label class="drone-search-box">
        <span aria-hidden="true">⌕</span>
        <input type="search" placeholder="Hledat podle názvu nebo modelu…" autocomplete="off" aria-label="Vyhledat dron">
        <button type="button" class="drone-search-clear" aria-label="Vymazat hledání" hidden>×</button>
      </label>
      <span class="drone-filter-count">0 nalezeno</span>
    </div>
    <div class="drone-filter-head">
      <strong>Filtrovat podle senzorů</strong>
      <button type="button" class="drone-filter-reset" hidden>Zrušit filtry</button>
    </div>
    <div class="drone-filter-chips" role="group" aria-label="Filtry senzorů"></div>
  `;

  const input = panel.querySelector('input');
  const clear = panel.querySelector('.drone-search-clear');
  const reset = panel.querySelector('.drone-filter-reset');
  const chips = panel.querySelector('.drone-filter-chips');

  input.value = searchText;
  clear.hidden = !searchText;

  input.addEventListener('input', event => {
    searchText = event.target.value;
    clear.hidden = !searchText;
    applyFilters();
  });

  clear.addEventListener('click', () => {
    searchText = '';
    input.value = '';
    clear.hidden = true;
    input.focus();
    applyFilters();
  });

  SENSOR_FILTERS.forEach(sensor => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'drone-filter-chip';
    button.textContent = sensor;
    button.dataset.sensor = sensor;
    button.classList.toggle('active', selectedSensors.has(sensor));
    button.setAttribute('aria-pressed', selectedSensors.has(sensor) ? 'true' : 'false');

    button.addEventListener('click', () => {
      if (selectedSensors.has(sensor)) selectedSensors.delete(sensor);
      else selectedSensors.add(sensor);

      button.classList.toggle('active', selectedSensors.has(sensor));
      button.setAttribute('aria-pressed', selectedSensors.has(sensor) ? 'true' : 'false');
      reset.hidden = selectedSensors.size === 0;
      applyFilters();
    });
    chips.appendChild(button);
  });

  reset.hidden = selectedSensors.size === 0;
  reset.addEventListener('click', () => {
    selectedSensors.clear();
    panel.querySelectorAll('.drone-filter-chip').forEach(button => {
      button.classList.remove('active');
      button.setAttribute('aria-pressed', 'false');
    });
    reset.hidden = true;
    applyFilters();
  });

  return panel;
}

function enhanceDroneLists() {
  const lists = findDroneLists();
  if (!lists.length) return;

  lists.forEach(list => {
    if (list.previousElementSibling?.dataset?.droneFilterPanel === 'true') return;
    list.parentNode.insertBefore(createControls(), list);
  });

  applyFilters();
}

let scheduled = false;
const observer = new MutationObserver(() => {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    enhanceDroneLists();
  });
});

observer.observe(document.documentElement, { childList: true, subtree: true });
document.addEventListener('DOMContentLoaded', enhanceDroneLists);
enhanceDroneLists();
