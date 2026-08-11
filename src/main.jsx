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
import './task-progress.css';
import './task-calendar-fix';
import './dashboard-task-alert-position';
import './flight-assignment-alert.css';
import './flight-assignment-alert';
import './overview-alert-restore.css';
import './overview-alert-restore';
import './theme-switcher.css';
import './theme-switcher';
import './license-expiry-alert.css';
import './license-expiry-alert';
import './notification-center.css';
import './notification-fab.css';
import './notification-center';
import './accident-pilot-select';
import './sheet-scroll-fix.css';
import './settings-scroll-fix.css';
import './more-menu-cleanup.css';
import './drone-record-alerts.css';
import './drone-record-alerts';
import './drone-offices.css';
import './drone-archive.css';
import './archive-bulk-actions.css';
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

const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    const accepted = window.confirm('Je dostupná nová verze DFM. Aktualizovat nyní?');
    if (accepted) updateSW(true);
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
