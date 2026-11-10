'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const raiz=path.resolve(__dirname,'..');
const moduleUrl=pathToFileURL(path.join(raiz,'frontend/src/gastos-administrativos.mjs')).href;
const util=import(moduleUrl);
const doc=(marcado=false,monto=null)=>({
  id:1,tipoDocumento:'Factura electrónica',total:0,
  gastoAdministrativo:marcado,montoGastoManual:monto,impuestos:[],
  resumen:{totalVenta:10025,totalDescuentos:10025,totalNoSujeto:10025,
    totalVentaNeta:0,totalImpuesto:0,totalGravado:0,
    medioPago:[{tipo:'99',medio:'Cupón',total:10025}]}
});

test('QA v1.4.7: cupón no se registra como gasto sin selección expresa',async()=>{
  const {resumenGastosAdministrativos,referenciaCuponNoSujeto}=await util;
  const factura=doc(false);
  assert.equal(referenciaCuponNoSujeto(factura).monto,10025);
  const resumen=resumenGastosAdministrativos([factura]);
  assert.equal(resumen.cantidad,0);
  assert.equal(resumen.totalGastos,0);
  assert.equal(resumen.totalIVA,0);
});

test('QA v1.4.7: casilla marcada sin importe manual mantiene gasto y total en cero',async()=>{
  const {resumenGastosAdministrativos}=await util;
  const factura=doc(true);
  const resumen=resumenGastosAdministrativos([factura]);
  assert.equal(resumen.cantidad,1);
  assert.equal(resumen.totalGastos,0);
  assert.equal(resumen.pendientesRevision,1);
  assert.equal(factura.total,0);
});

test('QA v1.4.7: confirmar manualmente importe no altera IVA ni total fiscal',async()=>{
  const {resumenGastosAdministrativos}=await util;
  const factura=doc(true,10025);
  const resumen=resumenGastosAdministrativos([factura]);
  assert.equal(resumen.totalGastos,10025);
  assert.equal(resumen.totalBaseIVA,0);
  assert.equal(resumen.totalIVA,0);
  assert.equal(resumen.filas[0].totalXML,0);
  assert.equal(factura.resumen.totalImpuesto,0);
});

test('QA v1.4.7: fixture de Playwright establece escenarios antes de montar React',()=>{
  const e2e=fs.readFileSync(path.join(raiz,'e2e/aplicacion.spec.cjs'),'utf8');
  assert.match(e2e,/get\('qa-fixture'\)/);
  assert.match(e2e,/escenario==='cupon-cero'/);
  assert.match(e2e,/escenario==='xml-cero'/);
  assert.match(e2e,/page\.goto\(`\/\?qa-fixture=\$\{escenario\}`\)/);
  assert.match(e2e,/window\.__qaGastosGuardados/);
  assert.doesNotMatch(e2e,/window\.comprobantesDesktop\.listar=async id=>/,
    'no volver a mutar el puente Electron después de montar React');
});


test('QA v1.4.7: las aserciones E2E aceptan separadores de miles de es-CR',()=>{
  const e2e=fs.readFileSync(path.join(raiz,'e2e/aplicacion.spec.cjs'),'utf8');
  assert.match(e2e,/₡10\[\.\,\\s\]025,00/);
  const cifra=`₡${(10025).toLocaleString('es-CR',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
  assert.match(cifra,/₡10[.,\s]025,00/);
  assert.match('₡10.025,00',/₡10[.,\s]025,00/);
});
