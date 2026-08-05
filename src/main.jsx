import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import AppV2 from './AppV2';
import './styles.css';
import './mobile-fixes.css';
import './qr-scanner.css';
import './qr-scanner';
import './ui-actions.css';
import './app-v2.css';

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
    <AppV2 />
  </React.StrictMode>
);
