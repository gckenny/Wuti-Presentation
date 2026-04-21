import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'

// Served from tools.orz.tw/presentation in production (Cloudflare Worker Route).
// The `base` prefix is also used by the app at runtime via import.meta.env.BASE_URL.
export default defineConfig({
  base: '/presentation/',
  plugins: [tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/presentation/api': 'http://localhost:8787',
      '/presentation/storage': 'http://localhost:8787',
    },
  },
})
