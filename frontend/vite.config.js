import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { VitePWA } from 'vite-plugin-pwa'

// Debug plugin to log all incoming requests
// const debugPlugin = () => ({
//   name: 'debug-requests',
//   configureServer(server) {
//     server.middlewares.use((req, res, next) => {
//       console.log(`🔍 [Vite] ${req.method} ${req.url}`)
//       console.log(`   Host: ${req.headers.host}`)
//       console.log(`   Origin: ${req.headers.origin || 'none'}`)
//       console.log(`   User-Agent: ${req.headers['user-agent']?.substring(0, 50)}...`)
//       next()
//     })
//   }
// })

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      // Keep SW disabled in dev to avoid caching interfering with HMR
      devOptions: { enabled: false },
      workbox: {
        // Three.js + R3F makes the main bundle ~2-3MB minified — raise the precache limit
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024, // 8MB
        // Precache JS/CSS/HTML/icons — small assets that should load instantly offline
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,woff,woff2}'],
        // Exclude /api and /uploads from SPA fallback — those hit the backend
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api/, /^\/uploads/],
        runtimeCaching: [
          {
            // GLB models: large files, cache on first load, serve from disk forever after
            urlPattern: /\/models\/.*\.glb$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'glb-models-v1',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
              },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            // Seat JSON data: static, cache for 24h
            urlPattern: /\/cinema\/.*\.json$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'cinema-data-v1',
              expiration: {
                maxEntries: 5,
                maxAgeSeconds: 60 * 60 * 24, // 24 hours
              },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            // Audio files: cache on first load, serve from cache after
            urlPattern: /\/sounds\/.*\.(mp3|wav)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'lwo-sounds-v1',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 7, // 7 days
              },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
      manifest: {
        name: 'LetsWatchOut',
        short_name: 'LWO',
        description: 'Watch together, anywhere',
        theme_color: '#7c3aed',
        background_color: '#000000',
        display: 'standalone',
        scope: '/',
        start_url: '/',
        // NOTE: For full cross-browser PWA install support, replace with 192×192 and 512×512 PNG icons.
        // WebP works in Chrome but not all browsers recognise it for the install prompt.
        icons: [
          {
            src: '/icons/lwoIcon.webp',
            sizes: '192x192',
            type: 'image/webp',
            purpose: 'any',
          },
          {
            src: '/icons/LetsWatchOutLogo.webp',
            sizes: '512x512',
            type: 'image/webp',
            purpose: 'any',
          },
        ],
      },
    }),
  ],
  define: {
    global: 'globalThis', // Polyfill 'global' with 'globalThis' (standard browser global)
  },
  test: {
    globals: true,
    environment: 'happy-dom', // Use happy-dom instead of jsdom (lighter, no CSS module issues)
    setupFiles: './tests/setup.js',
    css: false,
  },
   resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // ✅ Force simple-peer to use the browser build
      'simple-peer': 'simple-peer/simplepeer.min.js',
    },
  },
  server: {
    host: '0.0.0.0', // ✅ Listen on all network interfaces
    port: 5173,
    strictPort: true,
    allowedHosts: [
      '.trycloudflare.com', // ✅ Cloudflare Tunnel
      '.loca.lt', // ✅ LocalTunnel
      'localhost'
    ],
    hmr: {
      // Use port 443 only for tunnel access, default to 5173 for localhost
      clientPort: process.env.VITE_HMR_CLIENT_PORT || 5173,
    },
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        ws: true, // ✅ Enable WebSocket proxying
      },
      '/uploads': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    }
  },
  preview: {
    host: '0.0.0.0',
    port: 5173
  }
})