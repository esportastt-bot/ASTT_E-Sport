import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Dépôt GitHub : esportastt-bot/ASTT_E-Sport
  // GitHub Pages sert sur https://esportastt-bot.github.io/ASTT_E-Sport/
  base: '/ASTT_E-Sport/',
})
