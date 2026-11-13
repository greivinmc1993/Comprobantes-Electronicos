'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const fs=require('node:fs');
const root=path.resolve(__dirname,'..');
const helper=()=>import(pathToFileURL(path.join(root,'frontend/src/components/estado-revision.mjs')).href);
const filas=[
  {indice:0,estado:'listo',archivo:'listo.xml'},
  {indice:1,estado:'requiere_empresa',archivo:'pendiente.xml'},
  {indice:2,estado:'varias_coincidencias',archivo:'ambiguo.xml'},
  {indice:3,estado:'error',archivo:'invalido.xml'},
  {indice:4,estado:'duplicado_en_lote',archivo:'duplicado.xml'}
];

test('Por revisar se inicia desmarcado; listos seleccionados y errores inaccesibles',async()=>{
 const {exclusionInicial}=await helper();
 const out=exclusionInicial(filas);
 assert.notEqual(out[0],true);
 for(const i of [1,2,3,4])assert.equal(out[i],true);
});

test('Marcar listos nunca autoriza documentos pendientes, con error ni duplicados',async()=>{
 const {marcarComprobantes,exclusionInicial}=await helper();
 const marcados=marcarComprobantes(filas,exclusionInicial(filas),true);
 assert.equal(marcados[0],false);
 for(const i of [1,2,3,4])assert.equal(marcados[i],true);
 // Si el usuario había autorizado expresamente un pendiente, Marcar listos no lo revierte.
 const manual=marcarComprobantes(filas,{...marcados,1:false},true);
 assert.equal(manual[1],false);
 const vacios=marcarComprobantes(filas,manual,false);
 for(const i of [0,1,2])assert.equal(vacios[i],true);
});

test('Filtros separan listos, pendientes, errores y duplicados',async()=>{
 const {filtrarPorRevision}=await helper();
 assert.deepEqual(filtrarPorRevision(filas,'todos').map(f=>f.indice),[0,1,2,3,4]);
 assert.deepEqual(filtrarPorRevision(filas,'listos').map(f=>f.indice),[0]);
 assert.deepEqual(filtrarPorRevision(filas,'revisar').map(f=>f.indice),[1,2]);
 assert.deepEqual(filtrarPorRevision(filas,'errores').map(f=>f.indice),[3]);
 assert.deepEqual(filtrarPorRevision(filas,'duplicados').map(f=>f.indice),[4]);
});

test('Filtro encuentra un pendiente más allá de las primeras 200 filas',async()=>{
 const {filtrarPorRevision,exclusionInicial}=await helper();
 const grande=Array.from({length:500},(_,indice)=>({indice,estado:indice===489?'requiere_empresa':'listo'}));
 assert.deepEqual(filtrarPorRevision(grande,'revisar').map(f=>f.indice),[489]);
 assert.equal(exclusionInicial(grande)[489],true);
});

test('La interfaz ofrece accesos rápidos y selección manual sin ocultar el elemento pendiente',()=>{
 const jsx=fs.readFileSync(path.join(root,'frontend/src/components/VistaPrevia.jsx'),'utf8');
 const css=fs.readFileSync(path.join(root,'frontend/src/App.css'),'utf8');
 assert.match(jsx,/aria-label=\{`Ver \$\{porRevisar\} XML por revisar`\}/);
 assert.match(jsx,/aria-label=\{`Ver \$\{errores\} XML con error`\}/);
 assert.match(jsx,/filtrarPorRevision\(filas,filtro\)/);
 assert.match(jsx,/filasFiltradas\.slice\(0,limiteVisibles\)/);
 assert.match(jsx,/setExcluidos\(exclusionInicial\(vista\?\.filas\|\|\[\]\)\)/);
 assert.match(jsx,/disabled=\{cargando\|\|f\.estado==='error'\|\|f\.estado==='duplicado_en_lote'\}/);
 assert.match(css,/\.qa-review-filter-active/);
});
