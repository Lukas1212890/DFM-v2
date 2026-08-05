import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import './styles.css';
import './mobile-fixes.css';
import './qr-scanner.css';
import './qr-scanner';
import './drone-filters.css';
import './drone-filters';
import './ui-actions.css';
import './ui-actions';
import './settings-panel';
import './drone-remove';
import './editor-delete';
import './restore-section';

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
    <App />
  </React.StrictMode>
);
