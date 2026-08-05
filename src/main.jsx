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
