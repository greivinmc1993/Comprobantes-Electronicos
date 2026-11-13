'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..');
const app=fs.readFileSync(path.join(root,'frontend/src/App.jsx'),'utf8');
const preview=fs.readFileSync(path.join(root,'frontend/src/components/VistaPrevia.jsx'),'utf8');
const tests=fs.readFileSync(path.join(root,'e2e/aplicacion.spec.cjs'),'utf8');
const css=fs.readFileSync(path.join(root,'frontend/src/App.css'),'utf8');

test('cada lote remonta la vista previa para evitar seleccionar con estado anterior',()=>{
 assert.match(app,/VistaPrevia key=\{vistaImportacion\?\.token\|\|[\'"]sin-vista/);
});
test('la selección se inicializa al montar y no tras un useEffect',()=>{
 assert.match(preview,/useState\(\(\)=>Object\.fromEntries\(\(vista\?\.filas\|\|\[\]\)/);
 assert.doesNotMatch(preview,/\},\[vista\?\.token\]\)/);
});
test('cada fila tiene selector propio sin depender de la presentación responsive',()=>{
 assert.match(preview,/data-testid=\{`qa-fila-\$\{f\.indice\}`\}/);
 assert.match(tests,/getByTestId\(`qa-fila-\$\{indice\}`\)/);
});
test('el test E2E diagnostica cada fase de la asignación y filtros',()=>{
 for(const nombre of ['Dos XML por revisar visibles y desmarcados','Autorizar manualmente los dos XML',
  'Asignar empresa masivamente y verificar ambas filas','Confirmar lote sin modificar empresa ni signos',
  'Filtrar pendientes y elegir empresa sin marcarlos','Filtrar errores y volver a todos sin perder selección']){
  assert.ok(tests.includes(`test.step('${nombre}'`),nombre);
 }
});
test('los controles móviles mantienen área táctil y desplazamiento contenido',()=>{
 assert.match(css,/\.qa-preview \.qa-table tbody td:nth-child\(1\) input\[type="checkbox"\]/);
 assert.match(css,/overscroll-behavior:contain/);
});
test('los XML que requieren revisión siguen sin selección automática',async()=>{
 const estado=await import(pathToFileURL(path.join(root,'frontend/src/components/estado-revision.mjs')).href);
 const filas=[{indice:0,estado:'listo'},{indice:1,estado:'requiere_empresa'},{indice:2,estado:'error'}];
 const e=estado.exclusionInicial(filas);
 assert.equal(e[1],true);assert.equal(e[2],true);assert.notEqual(e[0],true);
 assert.equal(estado.marcarComprobantes(filas,e,true)[1],true);
});
