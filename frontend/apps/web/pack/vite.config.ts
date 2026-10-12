import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const projectDir = path.resolve(__dirname, '..');

export default defineConfig({
  root: projectDir,
  envPrefix: ['VITE_', 'OPEN_AGENT_'],
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(projectDir, 'src') } },
  server: { host: '0.0.0.0', port: 10001, open: false },
  build: { outDir: path.resolve(projectDir, 'dist'), emptyOutDir: true },
  optimizeDeps: {
    exclude: ['@lui-agent/api-types'],
  },
});
