import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // The workspace root is exposed through a junction/symlink; keep the
  // logical paths so Vite/Vitest can locate files and dependency imports.
  resolve: { preserveSymlinks: true },
  server: { port: 5173 },
  test: {
    environment: 'jsdom',
    globals: true,
    css: true,
  },
});
