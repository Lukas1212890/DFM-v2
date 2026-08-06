import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import CloudShell from './CloudShell';
import './styles.css';
import './mobile-fixes.css';
import './qr-scanner.css';
import './qr-scanner';
import './ui-actions.css';
import './app-v2.css';
import './sensor-colors';
import './admin-chat';
import './status-indicator';
import './logo-fix.css';
import './header-logo';
import './task-assignment.css';
import './task-assignment';
import './task-calendar-fix';
import './dashboard-task-alert-position';
import './accident-pilot-select';
import './sheet-scroll-fix.css';
import './settings-scroll-fix.css';
import './more-menu-cleanup.css';
import './drone-record-alerts.css';
import './drone-record-alerts';
import './drone-offices.css';
import './drone-archive.css';
import './drone-archive';
import './archive-navigation-fix';
import './outlook-sync.css';
import './outlook-sync';
import './push-notifications.css';
import './push-notifications';

const DEFAULT_CLOUD_API = 'https://dfm-cloud-api.bednarik.workers.dev';
if (!localStorage.getItem('dfm_cloud_api_url')) {
  localStorage.setItem('dfm_cloud_api_url', DEFAULT_CLOUD_API);
}

let updateSW = () => {};
updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    updateSW(true);
  },
  onRegisteredSW(_swUrl, registration) {
    if (registration) {
      registration.update();
      window.setInterval(() => registration.update(), 60 * 60 * 1000);
    }
  },
  onOfflineReady() {
    console.info('DFM je připravené pro offline použití.');
  }
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <CloudShell />
  </React.StrictMode>
);

