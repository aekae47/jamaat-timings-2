import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'assets/*.png'],
      manifest: {
        name: 'Jamaat on Time',
        short_name: 'Jamaat on Time',
        description: 'Local Masjid Prayer Timings',
        theme_color: '#0d9488',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '.',
        icons: [
          {
            src: 'assets/jot-icon-1-192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'assets/jot-icon-1-512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    })
  ],
  base: '/jamaat-timings-2/', // Ensure this matches your repo name
})
