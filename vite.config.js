import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['satellite.js']
  },
  build: {
    commonjsOptions: {
      transformMixedEsModules: true
    }
  }
})