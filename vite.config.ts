import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  // Use /golf/ base path only in production (for GitHub Pages)
  base: mode === 'production' ? '/golf/' : '/',
  plugins: [
    react(),
    tailwindcss(),
  ],
  optimizeDeps: {
    exclude: ['onnxruntime-web'],
  },
}))
