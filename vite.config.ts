import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  server: { port: 5173, strictPort: true },
  build: { target: 'safari15', chunkSizeWarningLimit: 1500 },
  test: { environment: 'node', include: ['src/tests/**/*.test.ts'] },
});
