import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

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
  plugins: [react()],
  define: {
    global: 'globalThis', // Polyfill 'global' with 'globalThis' (standard browser global)
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