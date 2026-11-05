'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Module=require('node:module');
const originalLoad=Module._load;
let parser;
try {
  Module._load=function(request,parent,isMain){
    if(request==='xml2js') return {parseStringPromise:async()=>({}),processors:{stripPrefix:x=>x}};
    return originalLoad.apply(this,arguments);
  };
  parser=require('../backend/parser');
} finally {Module._load=originalLoad;}
const {procesarDocumento}=parser;
const xml='<?xml version="1.0"?><FacturaElectronica xmlns="https://cdn.comprobanteselectronicos.go.cr/xml-schemas/v4.4/facturaElectronica" />';
function factura(linea,{credito=false,moneda='CRC',cambio=1}={}) {
  return {[credito?'NotaCreditoElectronica':'FacturaElectronica']:{
    FechaEmision:'2026-10-07T12:00:00',Clave:'50607102600310100873920001052010000095227306070312',
    Emisor:{Nombre:'Empresa sintética'},
    DetalleServicio:{LineaDetalle:linea},
    ResumenFactura:{CodigoTipoMoneda:{CodigoMoneda:moneda,TipoCambio:String(cambio)},TotalComprobante:'120.00',TotalVentaNeta:'100'}
  }};
}
function linea({neto='13.34',monto='13.335',impuestos=null}={}){
  return {NumeroLinea:'1',Detalle:'Artículo sintético',Cantidad:'1',PrecioUnitario:'100',SubTotal:'100',BaseImponible:'100',
    Impuesto: impuestos||{Codigo:'01',CodigoTarifaIVA:'08',Tarifa:'13.00',Monto:monto},
    ImpuestoNeto:neto,MontoTotalLinea:'113.34'};
}
function totalIVA(f){return f.impuestos.filter(x=>x.codigo==='01').reduce((s,x)=>s+x.monto,0);}
test('4.4 redondeo a centésimos en ImpuestoNeto: 13.335 a 13.34',()=>{
  const f=procesarDocumento(factura(linea()),'redondeado.xml',xml);
  assert.ok(Math.abs(totalIVA(f)-13.34)<1e-8);
});
test('nota de crédito con redondeo resta el IVA',()=>{
  const f=procesarDocumento(factura(linea(),{credito:true}),'credito.xml',xml);
  assert.ok(Math.abs(totalIVA(f)+13.34)<1e-8);
});
test('4.4 sin diferencia con precisión completa se conserva',()=>{
  const f=procesarDocumento(factura(linea({monto:'13.33500',neto:'13.33500'})),'preciso.xml',xml);
  assert.ok(Math.abs(totalIVA(f)-13.335)<1e-8);
});
test('diferencia material no puede normalizarse como redondeo',()=>{
  assert.throws(()=>procesarDocumento(factura(linea({monto:'13.00',neto:'13.50'})),'error.xml',xml),/declarado 13\.50000, calculado 13\.00000/);
});
test('error de falta de impuesto no se interpreta como exoneración',()=>{
  const l=linea(); delete l.Impuesto; l.ImpuestoNeto='1.00';
  assert.throws(()=>procesarDocumento(factura(l),'sin-iva.xml',xml),/declarado 1\.00000, calculado 0\.00000/);
});
test('4.4 conjunto de impuestos normales conserva la suma',()=>{
  const l=linea({neto:'18.00',impuestos:[
    {Codigo:'01',CodigoTarifaIVA:'08',Tarifa:'13',Monto:'13.00'},
    {Codigo:'03',Tarifa:'5',Monto:'5.00'}]});
  const f=procesarDocumento(factura(l),'multi.xml',xml);
  assert.equal(totalIVA(f),13);
  assert.equal(f.detalle[0].impuestos.reduce((a,i)=>a+i.monto,0),18);
});
test('4.4 surtido: 13% + 1% asignan bases por componente, sin duplicar',()=>{
  const l=linea({neto:'15.00'});
  l.BaseImponible='300.00';
  delete l.Impuesto;
  l.DetalleSurtido={LineaDetalleSurtido:[
    {BaseImponibleSurtido:'100.00',ImpuestoSurtido:{CodigoImpuestoSurtido:'01',CodigoTarifaIVASurtido:'08',TarifaSurtido:'13',MontoImpuestoSurtido:'13.00'}},
    {BaseImponibleSurtido:'200.00',ImpuestoSurtido:{CodigoImpuestoSurtido:'01',CodigoTarifaIVASurtido:'02',TarifaSurtido:'1',MontoImpuestoSurtido:'2.00'}}
  ]};
  const f=procesarDocumento(factura(l),'combo.xml',xml);
  assert.equal(totalIVA(f),15);
  assert.equal(f.bases['13'],100);
  assert.equal(f.bases['1'],200);
  assert.equal(f.desgloseTarifas['08:13'].impuesto,13);
  assert.equal(f.desgloseTarifas['02:1'].impuesto,2);
});
test('surtido con varios componentes de la MISMA tarifa acumula la base',()=>{
  const l=linea({neto:'26.00'});
  delete l.Impuesto;
  l.DetalleSurtido={LineaDetalleSurtido:[
    {BaseImponibleSurtido:'100.00',ImpuestoSurtido:{CodigoImpuestoSurtido:'01',CodigoTarifaIVASurtido:'08',TarifaSurtido:'13',MontoImpuestoSurtido:'13.00'}},
    {BaseImponibleSurtido:'100.00',ImpuestoSurtido:{CodigoImpuestoSurtido:'01',CodigoTarifaIVASurtido:'08',TarifaSurtido:'13',MontoImpuestoSurtido:'13.00'}}
  ]};
  const f=procesarDocumento(factura(l),'combo2.xml',xml);
  assert.equal(totalIVA(f),26);
  assert.equal(f.bases['13'],200);
});
test('IVA exonerado completamente sigue en cero',()=>{
  const l=linea({neto:'0.00', monto:'13.00'});
  l.Impuesto.Exoneracion={MontoExoneracion:'13.00'};
  const f=procesarDocumento(factura(l),'exonerada.xml',xml);
  assert.equal(totalIVA(f),0);
});
test('IVA asumido sigue descontándose sin inventar montos',()=>{
  const l=linea({neto:'0.00',monto:'13.00'});
  l.ImpuestoAsumidoEmisorFabrica='13.00';
  const f=procesarDocumento(factura(l),'asumida.xml',xml);
  assert.equal(totalIVA(f),0);
});
