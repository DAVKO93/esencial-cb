import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: [
        'logo.png',
        'icon-*.png'
      ],
      manifest: {
        name: 'Esencial FC',
        short_name: 'Esencial FC',
        description: 'Sistema de pedidos Esencial FC',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#1a1a1a',
        theme_color: '#1a1a1a',
        orientation: 'any',
        lang: 'es',
        categories: ['food', 'business'],
        icons: [
          { src: '/icon-72x72.png',            sizes: '72x72',   type: 'image/png', purpose: 'any' },
          { src: '/icon-72x72-maskable.png',   sizes: '72x72',   type: 'image/png', purpose: 'maskable' },
          { src: '/icon-96x96.png',            sizes: '96x96',   type: 'image/png', purpose: 'any' },
          { src: '/icon-96x96-maskable.png',   sizes: '96x96',   type: 'image/png', purpose: 'maskable' },
          { src: '/icon-128x128.png',          sizes: '128x128', type: 'image/png', purpose: 'any' },
          { src: '/icon-128x128-maskable.png', sizes: '128x128', type: 'image/png', purpose: 'maskable' },
          { src: '/icon-144x144.png',          sizes: '144x144', type: 'image/png', purpose: 'any' },
          { src: '/icon-144x144-maskable.png', sizes: '144x144', type: 'image/png', purpose: 'maskable' },
          { src: '/icon-152x152.png',          sizes: '152x152', type: 'image/png', purpose: 'any' },
          { src: '/icon-152x152-maskable.png', sizes: '152x152', type: 'image/png', purpose: 'maskable' },
          { src: '/icon-192x192.png',          sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icon-192x192-maskable.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: '/icon-384x384.png',          sizes: '384x384', type: 'image/png', purpose: 'any' },
          { src: '/icon-384x384-maskable.png', sizes: '384x384', type: 'image/png', purpose: 'maskable' },
          { src: '/icon-512x512.png',          sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icon-512x512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 }
            }
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'gstatic-fonts-cache',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 }
            }
          },
          {
            urlPattern: /^https:\/\/images\.unsplash\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'images-cache',
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 * 30 }
            }
          },
          {
            urlPattern: /^https:\/\/firestore\.googleapis\.com\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'firebase-cache',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 }
            }
          }
        ]
      }
    })
  ]
})