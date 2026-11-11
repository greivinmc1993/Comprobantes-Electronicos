'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root=path.join(__dirname,'..');
const read=(file)=>fs.readFileSync(path.join(root,file),'utf8');
const json=(file)=>JSON.parse(read(file));

test('Identidad propia: instalador no debe reemplazar FacturaCR',()=>{
  const p=json('package.json');
  assert.equal(p.build.appId,'cr.comprobanteselectronicoscr.desktop');
  assert.equal(p.build.productName,'ComprobantesElectronicosCR');
  assert.match(p.build.nsis.artifactName,/ComprobantesElectronicosCR-Setup/);
  assert.match(p.build.win.executableName,/^ComprobantesElectronicosCR$/);
});
test('Electron: aisla Node.js y bloquea enlaces externos y permisos',()=>{
  const s=read('electron/main.js');
  assert.match(s,/nodeIntegration:\s*false/);
  assert.match(s,/contextIsolation:\s*true/);
  assert.match(s,/sandbox:\s*true/);
  assert.match(s,/setPermissionRequestHandler/);
  assert.match(s,/setWindowOpenHandler/);
  assert.match(s,/Menu\.setApplicationMenu\(null\)/);
  assert.match(s,/127\.0\.0\.1/);
});
test('API: autenticación, límites de archivos y CSP',()=>{
  const s=read('backend/server.js');
  assert.match(s,/Bearer \$\{token\}/);
  assert.match(s,/api\.use\('\/api',auth\)/);
  assert.match(s,/15\*1024\*1024/);
  assert.match(s,/files:MAX_ARCHIVOS_XML/);
  assert.match(s,/frame-ancestors 'none'/);
});
test('No empaquetar datos locales o secretos',()=>{
  const ignore=read('.gitignore');
  for(const pattern of ['node_modules','release','*.sqlite','.env']) {
    assert.ok(ignore.includes(pattern),`${pattern} ausente en .gitignore`);
  }
  const p=json('package.json');
  const files=p.build.files;
  assert.ok(!files.some(x=>/test|qa-results|\.env|\.sqlite/.test(x)));
});
test('El README nuevo documenta QA, copias y GitHub Actions',()=>{
  const s=read('README.md');
  for(const fragment of ['GitHub Actions','SQLite','Respaldos','QA','4.4','NSIS','npm run dist:win']){
    assert.ok(s.includes(fragment),`${fragment} ausente en README`);
  }
});
