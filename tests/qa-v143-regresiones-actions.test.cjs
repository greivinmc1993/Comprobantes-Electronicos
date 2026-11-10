'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL,fileURLToPath}=require('node:url');

const raiz=path.resolve(__dirname,'..');
const leer=rel=>fs.readFileSync(path.join(raiz,rel),'utf8');

test('La ruta de importación ESM es un file URL válido en Windows y Linux',async()=>{
 const destino=path.resolve(raiz,'frontend/src/components/asignacion-masiva.mjs');
 const url=pathToFileURL(destino).href;
 assert.ok(url.startsWith('file://'));
 assert.equal(fileURLToPath(url),destino);
 const modulo=await import(url);
 const filas=[{indice:0,estado:'listo',empresasCompatibles:[7]},{indice:1,estado:'error',empresasCompatibles:[]}];
 const r=modulo.asignarEmpresaMasiva(filas,{},{},{id:7,cedula:'3101000000'});
 assert.equal(r.aplicados,1);
 assert.equal(r.omitidos,1);
 assert.equal(r.selecciones[0],'7');
});

test('La integración verifica la respuesta de rechazo y la integridad de ambas empresas',()=>{
 const api=leer('tests/qa-api-integracion.test.cjs');
 assert.match(api,/ajeno\.status,400/);
 assert.match(api,/ajeno\.data\.error/);
 assert.match(api,/b\.id}\/estado/);
 assert.match(api,/correcto\.data\.eliminado,true/);
});

test('Playwright distingue el título principal del título interior de la bitácora',()=>{
 const e2e=leer('e2e/aplicacion.spec.cjs');
 assert.match(e2e,/name:'Bitácora de operaciones',level:1/);
 assert.match(leer('frontend/src/App.jsx'),/seccion==='auditoria'\?'Bitácora de operaciones'/);
 assert.match(leer('frontend/src/components/CentroGestion.jsx'),/titulo="Bitácora de operaciones"/);
});

test('Actions conserva QA en Windows, Linux y Playwright sin ocultar los fallos',()=>{
 const yaml=leer('.github/workflows/qa.yml');
 assert.match(yaml,/ubuntu-latest, windows-latest/);
 assert.match(yaml,/npm run test:ci/);
 assert.match(yaml,/npm run test:e2e/);
 assert.doesNotMatch(yaml,/continue-on-error:\s*true/);
});
