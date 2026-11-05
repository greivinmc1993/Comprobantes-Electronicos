const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const pkg = require(path.join(root, 'package.json'));
const electronMain = fs.readFileSync(path.join(root, 'electron', 'main.js'), 'utf8');

const APP_ID = 'cr.comprobanteselectronicoscr.desktop';

test('NSIS tiene identidad distinta a FacturaCR', () => {
  assert.equal(pkg.build.appId, APP_ID);
  assert.notEqual(pkg.build.appId, 'cr.facturacr.desktop');
  assert.equal(pkg.build.productName, 'ComprobantesElectronicosCR');
  assert.equal(pkg.build.win.executableName, 'ComprobantesElectronicosCR');
  assert.equal(pkg.build.nsis.shortcutName, 'ComprobantesElectronicosCR');
  assert.equal(pkg.build.nsis.createDesktopShortcut, true);
  assert.equal(pkg.build.nsis.createStartMenuShortcut, true);
});

test('Electron usa el mismo identificador AUMID que NSIS', () => {
  assert.ok(electronMain.includes(`app.setAppUserModelId('${APP_ID}')`));
});

test('ComprobantesElectronicosCR no importa en automático la base de FacturaCR', () => {
  assert.ok(electronMain.includes("app.setName('ComprobantesElectronicosCR')"));
  assert.ok(electronMain.includes("'comprobanteselectronicoscr.sqlite'"));
  assert.ok(!electronMain.includes("path.join(appData, 'FacturaCR'"));
  assert.ok(!electronMain.includes("path.join(appData, 'facturacr-desktop'"));
});

test('Los recursos de instalación son exclusivos del producto nuevo', () => {
  for (const key of ['installerIcon', 'uninstallerIcon', 'installerHeaderIcon']) {
    const p = path.join(root, pkg.build.nsis[key]);
    assert.ok(fs.existsSync(p), `Recurso no encontrado: ${p}`);
  }
  assert.ok(fs.existsSync(path.join(root, pkg.build.win.icon)));
});
