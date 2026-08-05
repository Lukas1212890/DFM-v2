import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/dfm-icon-a.svg', 'icons/dfm-logo-a.svg'],
      manifest: {
        name: 'DFM – Drone Fleet Manager',
        short_name: 'DFM',
        description: 'Správa dronů, baterií, příslušenství, pilotů, letů a úkolů.',
        theme_color: '#07111f',
        background_color: '#07111f',
        display: 'standalone',
        orientation: 'portrait-primary',
        start_url: './',
        scope: './',
        icons: [
          { src: 'icons/dfm-icon-a.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icons/dfm-icon-a.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' }
        ]
      },
      workbox: {
        cleanupOutdatedCaches: true,
        navigateFallback: 'index.html'
      }
    })
  ]
});
