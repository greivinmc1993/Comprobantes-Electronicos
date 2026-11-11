'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const utilPromise=import('../frontend/src/gastos-administrativos.mjs');

// Fixture exclusivamente sintética: no se usan datos privados de contribuyentes.
const recibo=(extras={})=>({
  tipoDocumento:'Factura electrónica', total:0,
  monedaOriginal:'CRC', gastoAdministrativo:true, montoGastoManual:null,
  resumen:{totalVenta:10025,totalNoSujeto:10025,totalDescuentos:10025,
    totalVentaNeta:0,totalImpuesto:0,totalGravado:0,
    medioPago:[{tipo:'99',medio:'Cupón',total:10025}]},
  impuestos:[], ...extras
});

test('XML de cupón sin sujeto: ofrece referencia 10025 sin cambiar total fiscal ni IVA',async()=>{
  const {referenciaCuponNoSujeto,resumenGastosAdministrativos}=await utilPromise;
  const xml=recibo();
  const sugerida=referenciaCuponNoSujeto(xml);
  assert.equal(sugerida.monto,10025);
  assert.equal(sugerida.confirmadoComoCupon,true);
  assert.equal(xml.total,0);
  const resumen=resumenGastosAdministrativos([xml]);
  assert.equal(resumen.totalGastos,0,'la referencia nunca debe contarse automáticamente');
  assert.equal(resumen.totalIVA,0);
  assert.equal(resumen.pendientesRevision,1);
  assert.equal(resumen.filas[0].referenciaCupon.monto,10025);
});
test('importe de referencia confirmado manualmente se suma solo a gastos',async()=>{
  const {resumenGastosAdministrativos}=await utilPromise;
  const xml=recibo({montoGastoManual:10025});
  const resumen=resumenGastosAdministrativos([xml]);
  assert.equal(resumen.totalGastos,10025);
  assert.equal(resumen.totalBaseIVA,0);
  assert.equal(resumen.totalIVA,0);
  assert.equal(resumen.pendientesRevision,0);
  assert.equal(resumen.filas[0].totalXML,0);
  assert.equal(xml.resumen.totalDescuentos,10025);
});
test('documento histórico medio 99 sin descripción: referencia condicionada, con advertencia',async()=>{
  const {referenciaCuponNoSujeto}=await utilPromise;
  const xml=recibo({resumen:{...recibo().resumen,medioPago:[{tipo:'99',medio:null,total:10025}]}});
  const r=referenciaCuponNoSujeto(xml);
  assert.equal(r.monto,10025);
  assert.equal(r.confirmadoComoCupon,false);
  assert.match(r.fuente,/descripción no guardada/);
});
test('no propone referencia cuando el cupón no concuerda con la venta',async()=>{
  const {referenciaCuponNoSujeto}=await utilPromise;
  const xml=recibo({resumen:{...recibo().resumen,medioPago:[{tipo:'99',medio:'Cupón',total:10020}]}});
  assert.equal(referenciaCuponNoSujeto(xml),null);
});
test('no propone referencia para efectivo, códigos distintos ni total sin descuento completo',async()=>{
  const {referenciaCuponNoSujeto}=await utilPromise;
  const original=recibo();
  assert.equal(referenciaCuponNoSujeto(recibo({resumen:{...original.resumen,medioPago:[{tipo:'01',medio:'Efectivo',total:10025}]}})),null);
  assert.equal(referenciaCuponNoSujeto(recibo({resumen:{...original.resumen,totalDescuentos:0}})),null);
  assert.equal(referenciaCuponNoSujeto(recibo({total:10025})),null);
  assert.equal(referenciaCuponNoSujeto(recibo({resumen:{...original.resumen,totalNoSujeto:0}})),null);
});
test('nota de crédito con total cero no propone cupón aunque coincidan importes',async()=>{
  const {referenciaCuponNoSujeto}=await utilPromise;
  assert.equal(referenciaCuponNoSujeto(recibo({tipoDocumento:'Nota de crédito'})),null);
});
test('no se registra gasto con la casilla desmarcada',async()=>{
  const {resumenGastosAdministrativos}=await utilPromise;
  assert.equal(resumenGastosAdministrativos([recibo({gastoAdministrativo:false,montoGastoManual:10025})]).cantidad,0);
});
test('parser conserva MedioPagoOtros para importaciones nuevas y resumen no sujeto',()=>{
  const parser=fs.readFileSync(path.join(root,'backend/parser.js'),'utf8');
  assert.match(parser,/m\.MedioPagoOtros \?\? m\.MedioPago/);
  assert.match(parser,/totalNoSujeto: money\('TotalNoSujeto'\)/);
});
test('reportes muestran referencia aparte del gasto manual y no la suman',()=>{
  const reports=fs.readFileSync(path.join(root,'frontend/src/reportes.js'),'utf8');
  assert.match(reports,/Referencia medio pago XML CRC \(no sumada\)/);
  assert.match(reports,/referenciaCupon\?csvMonto\(referenciaCupon\.monto\):''/);
  const app=fs.readFileSync(path.join(root,'frontend/src/App.jsx'),'utf8');
  assert.match(app,/solicitarConfirmacion\(`El comprobante fiscal tiene total/);
  assert.match(app,/Registrar referencia como gasto manual/);
});
