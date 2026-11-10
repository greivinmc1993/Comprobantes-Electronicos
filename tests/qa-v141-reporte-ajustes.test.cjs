'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const fuente=fs.readFileSync(path.join(__dirname,'../frontend/src/reportes.js'),'utf8');
const desde=fuente.indexOf('export function resumenDatos(');
const hasta=fuente.indexOf('\nfunction seguroCSV(',desde);
const codigo=fuente.slice(desde,hasta).replace('export function','function');
function resumen(docs){
 const contexto=vm.createContext({
  TASAS:['0','0.5','1','2','4','8','13'],
  numero:v=>Number.isFinite(Number(v))?Number(v):0,
 });
 vm.runInContext(codigo,contexto);
 return vm.runInContext(`resumenDatos(${JSON.stringify(docs)})`,contexto);
}
test('El IVA neto por tarifa no inventa distribución de un ajuste sin tarifa',()=>{
 const r=resumen([{total:118.01,ajusteNetoSinTarifa:0.01,tipoDocumento:'Factura electrónica',
  emisor:{nombre:'Emisor de prueba'},bases:{'13':100},
  impuestos:[{codigo:'01',tarifa:13,monto:13},{codigo:'03',tarifa:5,monto:5}]}]);
 assert.equal(r.iva['13'],13);
 assert.ok(Math.abs(r.ajusteNetoSinTarifa-0.01)<1e-9);
 assert.equal(r.documentosConAjuste,1);
});
test('Notas de crédito compensan los ajustes no atribuidos',()=>{
 const r=resumen([
  {total:118.01,ajusteNetoSinTarifa:0.01,tipoDocumento:'Factura electrónica',impuestos:[{codigo:'01',tarifa:13,monto:13}]},
  {total:-118.01,ajusteNetoSinTarifa:-0.01,tipoDocumento:'Nota de crédito',impuestos:[{codigo:'01',tarifa:13,monto:-13}]},
 ]);
 assert.equal(r.total,0);assert.equal(r.iva['13'],0);
 assert.ok(Math.abs(r.ajusteNetoSinTarifa)<1e-9);
 assert.equal(r.documentosConAjuste,2);
});
