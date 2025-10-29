import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Configure base URL for GitHub Pages
export default defineConfig({
  base: '/Talentflow-app/',
  plugins: [react()],
  server: {
    port: 5173
  }
});
