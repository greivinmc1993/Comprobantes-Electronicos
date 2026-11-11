import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {readFileSync} from 'node:fs';
const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const version = JSON.parse(readFileSync(path.join(projectRoot,'package.json'),'utf8')).version;
export default defineConfig({
  root: path.join(projectRoot, 'frontend'),
  plugins: [react()],
  define: {__APP_VERSION__: JSON.stringify(version)},
  base: '/',
  build: {outDir: path.join(projectRoot, 'dist'), emptyOutDir: true},
  server: {host:'127.0.0.1', port:5173, strictPort:true},
});
