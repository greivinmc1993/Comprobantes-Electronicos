import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
const {version} = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(version) },
  server:{host:'127.0.0.1',proxy:{'/api':'http://127.0.0.1:3001'}}
});
