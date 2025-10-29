import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Configure base URL for production
export default defineConfig({
  base: '/',
  plugins: [react()],
  server: {
    port: 5173
  }
});
