import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const projectRoot = path.dirname(fileURLToPath(import.meta.url));
export default defineConfig({
  root: path.join(projectRoot, 'frontend'),
  plugins: [react()],
  base: '/',
  build: {outDir: path.join(projectRoot, 'dist'), emptyOutDir: true},
  server: {host:'127.0.0.1', port:5173, strictPort:true},
});
