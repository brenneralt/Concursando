import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './', // Compatibilidade universal com GitHub Pages e Vercel
  server: {
    port: 3000,
    open: false
  }
});
