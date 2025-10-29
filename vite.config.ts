import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Use relative base by default so the build works on GitHub Pages or subpaths.
export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    port: 5173
  }
});
