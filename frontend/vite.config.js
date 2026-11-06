import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// In development, /api and /uploads are proxied to the Flask backend on port 5000.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:5000',
      '/uploads': 'http://127.0.0.1:5000',
    },
  },
})
