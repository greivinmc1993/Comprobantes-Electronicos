'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

test('GitHub Actions ejecuta QA real en Windows y Linux y sube JUnit',()=>{
  const s=read('.github/workflows/qa.yml');
  assert.match(s,/ubuntu-latest, windows-latest/);
  assert.match(s,/npm run test:ci/);
  assert.match(s,/npm run check:repository/);
  assert.match(s,/npm run build/);
  assert.match(s,/npm run test:e2e/);
  assert.match(s,/qa-results\/\*\.xml/);
  assert.match(s,/if: always\(\)/);
});
test('El instalador NSIS depende de QA y conserva appId independiente',()=>{
  const s=read('.github/workflows/installer-windows.yml');
  assert.match(s,/windows-latest/);
  assert.match(s,/npm run test:ci/);
  assert.match(s,/npm run check:repository/);
  assert.match(s,/npm run dist:win/);
  assert.match(s,/Get-FileHash/);
  assert.equal(JSON.parse(read('package.json')).build.appId,'cr.comprobanteselectronicoscr.desktop');
});
test('La auditoría de seguridad NO oculta fallos con un operador lógico',()=>{
  const s=read('.github/workflows/seguridad.yml');
  assert.match(s,/npm audit --omit=dev --audit-level=high --json/);
  assert.doesNotMatch(s,/npm audit[^\n]*\s\|\|\s(?:echo|true)/);
  assert.match(s,/if: always\(\)/);
});
test('Archivos privados y documentación de versiones acumuladas fallan en el control de repositorio',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'comprobantes-qa-'));
  try{
    fs.mkdirSync(path.join(dir,'scripts'));
    fs.copyFileSync(path.join(root,'scripts/check-repository.cjs'),path.join(dir,'scripts/check-repository.cjs'));
    fs.writeFileSync(path.join(dir,'factura.xml'),'<FacturaElectronica/>');
    let p=spawnSync(process.execPath,['scripts/check-repository.cjs'],{cwd:dir,encoding:'utf8'});
    assert.notEqual(p.status,0);assert.match(p.stderr,/factura.xml/);
    fs.unlinkSync(path.join(dir,'factura.xml'));
    fs.writeFileSync(path.join(dir,'CAMBIOS_v1.4.3.md'),'archivo que no debe acumularse');
    p=spawnSync(process.execPath,['scripts/check-repository.cjs'],{cwd:dir,encoding:'utf8'});
    assert.notEqual(p.status,0);
    fs.unlinkSync(path.join(dir,'CAMBIOS_v1.4.3.md'));
    fs.mkdirSync(path.join(dir,'tests/fixtures'),{recursive:true});
    fs.writeFileSync(path.join(dir,'tests/fixtures/sintetico.xml'),'<FacturaElectronica/>');
    p=spawnSync(process.execPath,['scripts/check-repository.cjs'],{cwd:dir,encoding:'utf8'});
    assert.equal(p.status,0,p.stderr);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('El ejecutor de QA falla si falla una prueba y genera JUnit para Actions',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'comprobantes-junit-'));
  try{
    fs.mkdirSync(path.join(dir,'scripts'));fs.mkdirSync(path.join(dir,'tests'));
    fs.copyFileSync(path.join(root,'scripts/qa-ci.cjs'),path.join(dir,'scripts/qa-ci.cjs'));
    fs.writeFileSync(path.join(dir,'tests/falla.test.cjs'),`require('node:test')('error real',()=>{throw new Error('fallo de prueba QA');});`);
    const entorno={...process.env};delete entorno.NODE_TEST_CONTEXT;
    const p=spawnSync(process.execPath,['scripts/qa-ci.cjs'],{cwd:dir,encoding:'utf8',env:entorno});
    assert.notEqual(p.status,0,`QA ocultó fallo: ${p.stdout}`);
    const junit=path.join(dir,'qa-results/junit.xml');
    assert.ok(fs.existsSync(junit),`No produjo informe JUnit. Status=${p.status}; stdout=${p.stdout}; stderr=${p.stderr}`);
    assert.match(fs.readFileSync(junit,'utf8'),/<failure/);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
