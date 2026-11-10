'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const leer=archivo=>fs.readFileSync(path.join(root,archivo),'utf8');

test('El contador de comprobantes no cambia el nombre accesible de la navegación',()=>{
 const app=leer('frontend/src/App.jsx');
 assert.match(app,/aria-label=\{n\.titulo\}/);
 assert.match(app,/aria-current=\{seccion===n\.id\?'page':undefined\}/);
 assert.match(app,/className="nav-count" aria-hidden="true"/);
 assert.match(app,/<nav className="nav-list" aria-label="Secciones">/);
});

test('Playwright busca Comprobantes en el menú y verifica la pantalla abierta',()=>{
 const e2e=leer('e2e/aplicacion.spec.cjs');
 assert.match(e2e,/name:'Secciones'\}\)\.getByRole\('button',\{name:'Comprobantes',exact:true\}\)/);
 assert.match(e2e,/name:'Comprobantes',level:1/);
 assert.match(e2e,/Navegación: Comprobantes tiene nombre estable aunque muestre contador/);
});

test('Los tests de gastos verifican la base, el IVA y el monto manual sin tocar el XML',()=>{
 const e2e=leer('e2e/aplicacion.spec.cjs');
 assert.match(e2e,/Marcar como gasto administrativo/);
 assert.match(e2e,/Reporte de gastos administrativos/);
 assert.match(e2e,/\.iva-panel/);
 assert.match(e2e,/Guardar monto/);
 assert.match(e2e,/Este XML declara total ₡0,00/);
});
