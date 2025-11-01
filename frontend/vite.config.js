import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    global: 'globalThis', // Polyfill 'global' with 'globalThis' (standard browser global)
  },
   resolve: {
    alias: {
      // ✅ Force simple-peer to use the browser build
      'simple-peer': 'simple-peer/simplepeer.min.js',
    },
  },
  server: {
    proxy: {
      '/uploads': 'http://localhost:8080', // 👈 Add this line
    }
  }
})