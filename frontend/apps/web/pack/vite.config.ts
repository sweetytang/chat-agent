import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const projectDir = path.resolve(__dirname, '..');

export default defineConfig({
  root: projectDir,
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(projectDir, 'src') } },
  server: { port: 8001, open: false },
  build: { outDir: path.resolve(projectDir, 'dist'), emptyOutDir: true },
});
