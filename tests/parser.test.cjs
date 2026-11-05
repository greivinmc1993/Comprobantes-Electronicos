'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {procesarDocumento, parsearXML} = require('../backend/parser');

const clave = '50627102600310167540200100003040001745429127102026';
const xml = `<?xml version="1.0" encoding="utf-8"?>
<TiqueteElectronico xmlns="https://cdn.comprobanteselectronicos.go.cr/xml-schemas/v4.4/tiqueteElectronico">
  <Clave>${clave}</Clave><NumeroConsecutivo>00100003040001745429</NumeroConsecutivo>
  <FechaEmision>2026-10-27T13:16:00</FechaEmision>
  <Emisor><Nombre>Comercio de prueba</Nombre></Emisor><Receptor><Nombre>Comprador de prueba</Nombre></Receptor>
  <DetalleServicio><LineaDetalle>
    <NumeroLinea>1</NumeroLinea><CodigoCABYS>9799000000000</CodigoCABYS><Cantidad>1</Cantidad>
    <Detalle>Servicio de prueba</Detalle><PrecioUnitario>21.26</PrecioUnitario>
    <MontoTotal>21.26</MontoTotal><SubTotal>21.26</SubTotal><BaseImponible>21.26</BaseImponible>
    <Impuesto><Codigo>01</Codigo><CodigoTarifaIVA>08</CodigoTarifaIVA><Tarifa>13.00</Tarifa><Monto>2.76</Monto></Impuesto>
    <ImpuestoNeto>2.76</ImpuestoNeto><MontoTotalLinea>24.02</MontoTotalLinea>
  </LineaDetalle></DetalleServicio>
  <ResumenFactura><CodigoTipoMoneda><CodigoMoneda>USD</CodigoMoneda><TipoCambio>455.53</TipoCambio></CodigoTipoMoneda>
    <TotalVenta>21.26</TotalVenta><TotalVentaNeta>21.26</TotalVentaNeta>
    <TotalImpuesto>2.76</TotalImpuesto><TotalComprobante>24.02</TotalComprobante>
  </ResumenFactura>
</TiqueteElectronico>`;

test('Lee moneda USD en XML 4.4 y conserva tipo de cambio declarado si no se proporciona referencia externa',async()=>{
  const parsed = await parsearXML(xml);
  const f = procesarDocumento(parsed,'prueba.xml',xml);
  assert.equal(f.versionXML,'4.4');
  assert.equal(f.monedaOriginal,'USD');
  assert.equal(f.tipoCambioAplicado,455.53);
  assert.match(f.fuenteTipoCambio,/XML/);
  assert.equal(f.tipoCambioVerificado,false);
  assert.equal(f.tipoCambioOriginalXML,455.53);
  assert.ok(Math.abs(f.total-24.02*455.53)<0.0001);
  assert.equal(f.detalle[0].codigoCABYS,'9799000000000');
  assert.equal(f.impuestos[0].codigoTarifa,'08');
  assert.equal(f.impuestos[0].tarifa,13);
  assert.ok(Math.abs(f.bases['13']-21.26*455.53)<0.0001);
});

test('Una nota de crédito resta el importe de la factura',async()=>{
  const notaXml=xml.replaceAll('TiqueteElectronico','NotaCreditoElectronica');
  const parsed=await parsearXML(notaXml);
  const f=procesarDocumento(parsed,'nota.xml',notaXml);
  assert.ok(Math.abs(f.total+24.02*455.53)<0.0001);
  assert.ok(Math.abs(f.impuestos[0].monto+2.76*455.53)<0.0001);
  assert.ok(Math.abs(f.bases['13']+21.26*455.53)<0.0001);
});

test('La cotización oficial permite reemplazar la del XML, sin tocar el importe USD original',async()=>{
  const parsed=await parsearXML(xml);
  const d=procesarDocumento(parsed,'ejemplo.xml',xml,{valor:455.53,fuente:'Hacienda BCCR',fecha:'2026-10-27',verificado:true});
  assert.equal(d.totalOriginal,24.02);
  assert.equal(d.tipoCambioOriginalXML,455.53);
  assert.equal(d.tipoCambioAplicado,455.53);
  assert.equal(d.fechaTipoCambio,'2026-10-27');
  assert.equal(d.tipoCambioVerificado,true);
  assert.ok(Math.abs(d.total-10941.8306)<0.0001);
});
