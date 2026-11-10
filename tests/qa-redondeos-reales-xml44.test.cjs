'use strict';
// Casos sinteticos basados en patrones fiscales observados. NUNCA incluye XML
// reales, claves, cedulas, nombres ni datos de clientes.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const original = Module._load;
let parser;
try {
  Module._load = function(request,parent,isMain) {
    if (request === 'xml2js') return {processors:{stripPrefix:x=>x}};
    return original.apply(this,arguments);
  };
  parser = require('../backend/parser');
} finally {Module._load = original;}
const {procesarDocumento} = parser;
const xml='<?xml version="1.0"?><FacturaElectronica xmlns="https://cdn.comprobanteselectronicos.go.cr/xml-schemas/v4.4/facturaElectronica"/>';
function linea({bruto='13.00',neto='13.00',subtotal='100.00',total='113.00',base=subtotal,tasa='13.00',asumido='0.00',credito=false,exoneracion=null}={}) {
  const impuesto={Codigo:'01',CodigoTarifaIVA: tasa === '1.00' ? '02':'08',Tarifa:tasa,Monto:bruto};
  if(exoneracion!=null) impuesto.Exoneracion={MontoExoneracion:exoneracion};
  return {NumeroLinea:'1',Detalle:'Artículo sintético',Cantidad:'1',PrecioUnitario:subtotal,SubTotal:subtotal,BaseImponible:base,MontoTotalLinea:total,
    Impuesto:impuesto,ImpuestoAsumidoEmisorFabrica:asumido,ImpuestoNeto:neto};
}
function documento(l,credito=false) {
  return {[credito?'NotaCreditoElectronica':'FacturaElectronica']:{
    FechaEmision:'2026-01-01T12:00:00',Clave:'CLAVE-SINTETICA-VALIDA',Emisor:{Nombre:'Emisor QA'},
    DetalleServicio:{LineaDetalle:l},ResumenFactura:{CodigoTipoMoneda:{CodigoMoneda:'CRC',TipoCambio:'1'},TotalComprobante:l.MontoTotalLinea,TotalVentaNeta:l.SubTotal}
  }};
}
function procesar(l,credito=false) {return procesarDocumento(documento(l,credito),'sintetico.xml',xml);}
function impuesto(f){return f.detalle[0].impuestos[0];}

test('Decimal .00 se admite como cero en impuesto asumido',()=>{
  const f=procesar(linea({asumido:'.00'})); assert.equal(impuesto(f).monto,13);
});
test('Decimal .000 se admite como cero',()=>{
  const f=procesar(linea({asumido:'.000'})); assert.equal(impuesto(f).monto,13);
});
test('Microdiferencia 0.00005 con cinco decimales se acepta y documenta',()=>{
  const f=procesar(linea({bruto:'345.13270',neto:'345.13275',subtotal:'2654.86730',total:'3000.00000'}));
  assert.equal(impuesto(f).monto,345.13275);assert.equal(impuesto(f).montoBruto,345.1327);
  assert.ok(f.observacionesFiscales.length>0);
});
test('Microdiferencia negativa de cinco decimales se admite',()=>{
  const f=procesar(linea({bruto:'207.07970',neto:'207.07965',subtotal:'1592.92040',total:'1800.00000'}));
  assert.equal(impuesto(f).monto,207.07965);
});
test('1 centimo: impuesto neto concilia con base 1% y total de linea',()=>{
  const f=procesar(linea({bruto:'166.75000',neto:'166.76000',subtotal:'16675.56000',base:'16675.56000',total:'16842.32000',tasa:'1.00'}));
  assert.equal(impuesto(f).monto,166.76);
  assert.equal(impuesto(f).montoBruto,166.75);
  assert.ok(f.observacionesFiscales.some(a=>a.linea===1));
});
test('Redondeo a centimos: 1449.54550 se acepta como 1449.55000',()=>{
  const f=procesar(linea({bruto:'1449.54550',neto:'1449.55000',subtotal:'11150.35000',total:'12599.90000'}));
  assert.equal(impuesto(f).monto,1449.55);
});
test('Redondeo a centimos: 3313.21510 en nota de credito se resta',()=>{
  const f=procesar(linea({bruto:'3313.21510',neto:'3313.22000',subtotal:'25486.27000',total:'28799.49000'}),true);
  assert.equal(impuesto(f).monto,-3313.22);
  assert.equal(f.total,-28799.49);
});
test('Diferencia de 0.001 conciliada con total de línea',()=>{
  const f=procesar(linea({bruto:'3828.672',neto:'3828.671',subtotal:'29451.320',total:'33279.991',asumido:'.000'}));
  assert.equal(impuesto(f).monto,3828.671);
});
test('La exoneracion reduce el impuesto neto sin redondeo falso',()=>{
  const f=procesar(linea({bruto:'13.00',neto:'0.00',subtotal:'100.00',total:'100.00',exoneracion:'13.00'}));
  assert.equal(impuesto(f).monto,0);
});
test('El impuesto asumido disminuye el impuesto neto y conserva el bruto',()=>{
  const f=procesar(linea({bruto:'13.00',neto:'0.00',subtotal:'100.00',total:'100.00',asumido:'13.00'}));
  assert.equal(impuesto(f).monto,0); assert.equal(impuesto(f).montoBruto,13);
});
test('Se rechaza un impuesto no conciliado aunque difiera solo un centimo',()=>{
  assert.throws(()=>procesar(linea({bruto:'13.00',neto:'13.01',subtotal:'100.00',total:'113.00'})),/no coincide/);
});
test('Se rechaza diferencia material aunque el total de linea la respalde',()=>{
  assert.throws(()=>procesar(linea({bruto:'13.00',neto:'13.50',subtotal:'100.00',total:'113.50'})),/no coincide/);
});
test('Se rechaza mas de un centimo aunque coincida total y tarifa',()=>{
  assert.throws(()=>procesar(linea({bruto:'166.74',neto:'166.76',subtotal:'16675.56',total:'16842.32',tasa:'1.00'})),/no coincide/);
});
test('Decimal malformado no se acepta',()=>{
  for(const x of ['.','1,000.00','abc','1.2.3']) {
    assert.throws(()=>procesar(linea({asumido:x})),/no es un decimal válido/);
  }
});
test('No se atribuye un ajuste de varias tarifas a una sola',()=>{
  const l=linea({bruto:'13.00',neto:'18.01',subtotal:'100.00',total:'118.01'});
  l.Impuesto=[l.Impuesto,{Codigo:'03',Monto:'5.00',Tarifa:'5.00'}];
  const f=procesar(l);
  assert.ok(Math.abs(f.detalle[0].impuestoNeto - 18.01) < 0.0000001);
  assert.ok(Math.abs(f.ajusteNetoSinTarifa - 0.01) < 0.0000001);
  assert.equal(f.desgloseTarifas['08:13'].impuesto,13);
  assert.equal(f.detalle[0].impuestos.filter(i=>i.codigo==='AJUSTE_NO_ATRIBUIDO').length,1);
});
