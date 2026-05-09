import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Cerebro Digital',
        short_name: 'Cerebro',
        description: 'Tu segundo cerebro: notas, voz, dibujos, fotos, enlaces conectados',
        theme_color: '#1c1917',
        background_color: '#fafaf9',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
        ],
        shortcuts: [
          {
            name: 'Nueva nota de texto',
            short_name: 'Texto',
            description: 'Captura una idea rápida',
            url: '/?action=new&type=text',
            icons: [{ src: 'icon-192.png', sizes: '192x192' }]
          },
          {
            name: 'Nueva nota de voz',
            short_name: 'Voz',
            description: 'Graba un audio rápido',
            url: '/?action=new&type=voice',
            icons: [{ src: 'icon-192.png', sizes: '192x192' }]
          },
          {
            name: 'Nueva foto',
            short_name: 'Foto',
            description: 'Captura una imagen',
            url: '/?action=new&type=image',
            icons: [{ src: 'icon-192.png', sizes: '192x192' }]
          },
          {
            name: 'Pregúntale a tu cerebro',
            short_name: 'Buscar',
            description: 'Búsqueda inteligente',
            url: '/?action=chat',
            icons: [{ src: 'icon-192.png', sizes: '192x192' }]
          }
        ],
        share_target: {
          action: '/',
          method: 'GET',
          params: {
            title: 'title',
            text: 'text',
            url: 'url'
          }
        }
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
        maximumFileSizeToCacheInBytes: 5000000
      }
    })
  ]
});
