const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const dir = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(dir, 'frontend/src/App.jsx'), 'utf8');
const css = fs.readFileSync(path.join(dir, 'frontend/src/App.css'), 'utf8');
const main = fs.readFileSync(path.join(dir, 'electron/main.js'), 'utf8');
const pkg = require('../package.json');
test('empresa activa usa un selector personalizado en lugar de un select nativo', () => {
  assert.match(app, /<SelectorEmpresa perfiles=\{perfiles\}/);
  assert.match(app, /role="menuitemradio" aria-checked=/);
  assert.doesNotMatch(app, /<select aria-label="Empresa activa"/);
});
test('selector accesible con Escape, flechas y estilos del menu', () => {
  assert.match(app, /e\.key==='Escape'/);
  assert.match(app, /'ArrowDown','ArrowUp','Home','End'/);
  assert.match(css, /\.perfil-menu-opcion\.seleccionada/);
  assert.match(css, /\.perfil-menu-opciones \{max-height/);
});
test('Electron no muestra la barra File, Edit, View o Window', () => {
  assert.match(main, /Menu\.setApplicationMenu\(null\)/);
  assert.match(main, /ventana\.setMenuBarVisibility\(false\)/);
});
test('conserva identidad e instalador independiente', () => {
  assert.match(pkg.version,/^1\.[3-9]\.[0-9]+$/);
  assert.equal(pkg.build.appId,'cr.comprobanteselectronicoscr.desktop');
  assert.equal(pkg.build.win.executableName,'ComprobantesElectronicosCR');
});
