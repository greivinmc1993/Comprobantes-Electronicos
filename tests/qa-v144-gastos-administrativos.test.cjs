'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
let exportsPromise=import('../frontend/src/gastos-administrativos.mjs');
function doc(overrides={}) {
  return {tipoDocumento:'Factura electrónica',gastoAdministrativo:true,montoGastoManual:null,
    total:113,resumen:{totalVenta:100,totalVentaNeta:100,totalGravado:100},
    impuestos:[{codigo:'01',tarifa:13,monto:13}], ...overrides};
}

test('gasto marcado: base sin IVA, base gravada e IVA conservado',async()=>{
  const {resumenGastosAdministrativos}=await exportsPromise;
  const r=resumenGastosAdministrativos([doc()]);
  assert.equal(r.totalGastos,100);assert.equal(r.totalBaseIVA,100);assert.equal(r.totalIVA,13);
});
test('factura sin IVA aporta importe al gasto y cero al IVA',async()=>{
  const {resumenGastosAdministrativos}=await exportsPromise;
  const r=resumenGastosAdministrativos([doc({total:30003,resumen:{totalVenta:30003,totalVentaNeta:30003,totalGravado:0},impuestos:[]})]);
  assert.equal(r.totalGastos,30003);assert.equal(r.totalBaseIVA,0);assert.equal(r.totalIVA,0);
});
test('total XML cero no se inventa: revisión obligada',async()=>{
  const {resumenGastosAdministrativos}=await exportsPromise;
  const original=doc({total:0,resumen:{totalVenta:30003,totalVentaNeta:0,totalDescuentos:30003,totalGravado:0},impuestos:[]});
  const r=resumenGastosAdministrativos([original]);
  assert.equal(r.totalGastos,0);assert.equal(r.pendientesRevision,1);
  assert.equal(original.total,0);
});
test('importe manual no altera total XML ni IVA',async()=>{
  const {resumenGastosAdministrativos}=await exportsPromise;
  const original=doc({total:0,montoGastoManual:30003,resumen:{totalVenta:30003,totalVentaNeta:0,totalDescuentos:30003,totalGravado:0},impuestos:[]});
  const r=resumenGastosAdministrativos([original]);
  assert.equal(r.totalGastos,30003);assert.equal(r.filas[0].totalXML,0);
  assert.equal(r.filas[0].manual,true);assert.equal(r.totalIVA,0);
});
test('no marcado no aparece en gastos pero mantiene IVA documental',async()=>{
  const {resumenGastosAdministrativos,ivaRealDelDocumento}=await exportsPromise;
  const original=doc({gastoAdministrativo:false});
  assert.equal(resumenGastosAdministrativos([original]).cantidad,0);
  assert.equal(ivaRealDelDocumento(original),13);
});
test('nota de crédito resta el gasto si se clasifica como gasto administrativo',async()=>{
  const {resumenGastosAdministrativos}=await exportsPromise;
  const r=resumenGastosAdministrativos([doc({tipoDocumento:'Nota de crédito',total:-113,
    resumen:{totalVentaNeta:-100,totalGravado:-100},impuestos:[{codigo:'01',tarifa:13,monto:-13}]})]);
  assert.equal(r.totalGastos,-100);assert.equal(r.totalIVA,-13);
});
test('importe manual de nota de crédito conserva el signo negativo',async()=>{
  const {resumenGastosAdministrativos}=await exportsPromise;
  const r=resumenGastosAdministrativos([doc({tipoDocumento:'Nota de crédito',montoGastoManual:100})]);
  assert.equal(r.totalGastos,-100);
});
test('se mantiene aislamiento por empresa mediante el endpoint protegido',()=>{
  const db=fs.readFileSync(path.join(root,'backend/database.js'),'utf8');
  const api=fs.readFileSync(path.join(root,'backend/server.js'),'utf8');
  assert.match(db,/WHERE id = \? AND perfil_id = \?/);
  assert.match(db,/marcarGastoAdministrativo\(perfilId, documentoId, habilitado/);
  assert.match(api,/\/api\/perfiles\/:perfilId\/documentos\/:id\/gasto-administrativo/);
});
test('la marca se conserva en traslado, papelera y restauración',()=>{
  const db=fs.readFileSync(path.join(root,'backend/database.js'),'utf8');
  assert.match(db,/gasto_administrativo,monto_gasto_manual\)/);
  assert.match(db,/monto_gasto_manual: snapshot\.monto_gasto_manual\?\?null/);
  assert.match(db,/gastoAdministrativo: row\.gasto_administrativo === 1/);
});
test('los reportes separan base gravada de gasto e IVA sin restarlo del panel',()=>{
  const report=fs.readFileSync(path.join(root,'frontend/src/reportes.js'),'utf8');
  const app=fs.readFileSync(path.join(root,'frontend/src/App.jsx'),'utf8');
  assert.match(report,/function csvGastosAdministrativos/);
  assert.match(report,/function excelGastosAdministrativos/);
  assert.match(report,/function pdfGastosAdministrativos/);
  assert.match(app,/resumenDatos\(documentosPanel\)/);
  assert.match(app,/resumenGastosAdministrativos\(documentosPanel\)/);
});
