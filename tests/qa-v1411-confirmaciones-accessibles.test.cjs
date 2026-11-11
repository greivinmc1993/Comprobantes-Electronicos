"use strict";
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');

test('La X y Cancelar tienen nombres accesibles distintos',()=>{
 const jsx=read('frontend/src/components/ConfirmacionElegante.jsx');
 assert.match(jsx,/aria-label="Cerrar diálogo de confirmación"/);
 assert.match(jsx,/>Cancelar<\/button>/);
 assert.doesNotMatch(jsx,/aria-label="Cancelar operación"/);
 assert.match(jsx,/onResponder\(false\)/);
});

test('Playwright busca Cancelar exacto y distingue el botón X',()=>{
 const e2e=read('e2e/aplicacion.spec.cjs');
 assert.match(e2e,/name:'Cancelar',exact:true/);
 assert.doesNotMatch(e2e,/name:'Cancelar'\}/);
 assert.match(e2e,/name:'Cerrar diálogo de confirmación',exact:true/);
});

test('Regresión E2E comprueba Escape, no ejecución y clasificación intacta',()=>{
 const e2e=read('e2e/aplicacion.spec.cjs');
 const inicio=e2e.indexOf("test('La confirmación se cierra sin cambios con X y con Escape'");
 assert.notEqual(inicio,-1);
 const bloque=e2e.slice(inicio,e2e.indexOf("// v1.4.10",inicio));
 assert.match(bloque,/page\.keyboard\.press\('Escape'\)/);
 assert.match(bloque,/window\.__qaComercioClasificado\?\?null/);
 assert.match(bloque,/Sin clasificar: 1/);
 assert.match(bloque,/toBeEnabled\(\)/);
});

test('Identidad instalador y versión 1.4.11 sincronizadas',()=>{
 const paquete=JSON.parse(read('package.json'));
 assert.equal(paquete.version,'1.4.11');
 assert.equal(paquete.build.appId,'cr.comprobanteselectronicoscr.desktop');
 assert.match(read('README.md'),/versi%C3%B3n-1\.4\.11-/);
});
