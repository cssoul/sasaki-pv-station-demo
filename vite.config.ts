import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5291,
    host: '127.0.0.1',
    strictPort: true
  },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 2000
  }
})
