const DFM_STORAGE_KEY = 'dfm_react_pwa_v1';
const DFM_VERSION = '0.9 Beta';

function readDashboardData() {
  try {
    return JSON.parse(localStorage.getItem(DFM_STORAGE_KEY) || 'null') || {
      drones: [], pilots: [], flights: [], tasks: []
    };
  } catch {
    return { drones: [], pilots: [], flights: [], tasks: [] };
  }
}

function formatToday() {
  return new Intl.DateTimeFormat('cs-CZ', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  }).format(new Date());
}

function isDashboardActive() {
  return document.querySelector('.bottom-nav button.active small')?.textContent?.trim() === 'Přehled';
}

function renderDashboard() {
  if (!isDashboardActive()) return;
  const content = document.querySelector('.content');
  if (!content || content.dataset.dashboardVersion === DFM_VERSION) return;

  const data = readDashboardData();
  const drones = data.drones || [];
  const pilots = data.pilots || [];
  const flights = data.flights || [];
  const tasks = data.tasks || [];
  const batteryCount = drones.reduce((sum, drone) => sum + (drone.batteries?.length || 0), 0);
  const openTasks = tasks.filter(task => !(task.done === true || task.done === 'Ano')).length;
  const today = new Date().toISOString().slice(0, 10);
  const todayFlights = flights.filter(flight => flight.date === today).length;
  const todayTasks = tasks.filter(task => task.dueDate === today && !(task.done === true || task.done === 'Ano')).length;
  const accidents = drones.reduce((sum, drone) => sum + (drone.accidents?.length || 0), 0);
  const claims = drones.reduce((sum, drone) => sum + (drone.claims?.filter(claim => claim.status !== 'Vyřízeno').length || 0), 0);

  content.dataset.dashboardVersion = DFM_VERSION;
  content.innerHTML = `
    <section class="dashboard-welcome">
      <div>
        <p class="eyebrow">Drone Fleet Manager</p>
        <h2>Dobrý den.</h2>
        <p>Přehled celé flotily na jednom místě.</p>
      </div>
      <span class="dashboard-version">v${DFM_VERSION}</span>
    </section>

    <section class="dashboard-stats">
      <article><span>✈</span><div><small>Drony</small><strong>${drones.length}</strong></div></article>
      <article><span>▣</span><div><small>Baterie</small><strong>${batteryCount}</strong></div></article>
      <article><span>👤</span><div><small>Piloti</small><strong>${pilots.length}</strong></div></article>
      <article><span>✓</span><div><small>Otevřené úkoly</small><strong>${openTasks}</strong></div></article>
    </section>

    <div class="dashboard-section-title"><p class="eyebrow">Stav flotily</p><h2>Vyžaduje pozornost</h2></div>
    <section class="dashboard-attention">
      <article><span class="attention-dot ${openTasks ? 'orange' : 'green'}"></span><div><strong>${openTasks}</strong><small>otevřených úkolů</small></div></article>
      <article><span class="attention-dot ${claims ? 'orange' : 'green'}"></span><div><strong>${claims}</strong><small>aktivních reklamací</small></div></article>
      <article><span class="attention-dot ${accidents ? 'red' : 'green'}"></span><div><strong>${accidents}</strong><small>evidovaných nehod</small></div></article>
    </section>

    <div class="dashboard-section-title"><p class="eyebrow">${formatToday()}</p><h2>Dnes</h2></div>
    <section class="dashboard-today">
      <article><span>🛫</span><div><strong>${todayFlights}</strong><small>naplánovaných letů</small></div></article>
      <article><span>📋</span><div><strong>${todayTasks}</strong><small>úkolů na dnešek</small></div></article>
    </section>

    <section class="dashboard-placeholder">
      <div class="dashboard-drone-mark" aria-hidden="true">
        <span class="wing left"></span><span class="body">DFM</span><span class="wing right"></span>
      </div>
      <p class="eyebrow">DFM Dashboard</p>
      <h2>Prostor pro další přehledy</h2>
      <p>Dashboard bude postupně rozšířen o statistiky, upozornění a provozní widgety.</p>
    </section>
  `;
}

let dashboardScheduled = false;
new MutationObserver(() => {
  if (dashboardScheduled) return;
  dashboardScheduled = true;
  requestAnimationFrame(() => {
    dashboardScheduled = false;
    renderDashboard();
  });
}).observe(document.documentElement, { childList: true, subtree: true });

document.addEventListener('DOMContentLoaded', renderDashboard);
renderDashboard();
