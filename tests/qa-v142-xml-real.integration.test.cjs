'use strict';
// Pruebas de integración: DEBEN ejecutarse con xml2js real instalado en Actions.
// No contienen documentos ni identificaciones de clientes reales.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {parsearXML,procesarDocumento}=require('../backend/parser');
const {previsualizarXML}=require('../backend/previsualizacion');
const impuesto=(codigo,tarifa,monto)=>`<Impuesto><Codigo>01</Codigo><CodigoTarifaIVA>${codigo}</CodigoTarifaIVA><Tarifa>${tarifa}</Tarifa><Monto>${monto}</Monto></Impuesto>`;
function xml({clave,nota=false,ivaDoble=true,neto='14.00',total='114.00'}={}){
 const raiz=nota?'NotaCreditoElectronica':'FacturaElectronica';
 const taxes=ivaDoble ? impuesto('08','13.00','13.00')+impuesto('02','1.00','1.00')
   : impuesto('08','13.00','13.00')+'<Impuesto><Codigo>03</Codigo><Tarifa>5</Tarifa><Monto>5.00</Monto></Impuesto>';
 return `<?xml version="1.0" encoding="utf-8"?><${raiz} xmlns="https://cdn.comprobanteselectronicos.go.cr/xml-schemas/v4.4/facturaElectronica">
  <Clave>${clave}</Clave><NumeroConsecutivo>00100001010000000001</NumeroConsecutivo>
  <FechaEmision>2026-10-01T10:00:00-06:00</FechaEmision>
  <Emisor><Nombre>Emisor sintético</Nombre><Identificacion><Tipo>02</Tipo><Numero>3101999999</Numero></Identificacion></Emisor>
  <Receptor><Nombre>Receptor sintético</Nombre><Identificacion><Tipo>01</Tipo><Numero>199999999</Numero></Identificacion></Receptor>
  <DetalleServicio><LineaDetalle><NumeroLinea>1</NumeroLinea><Cantidad>1</Cantidad><UnidadMedida>Unid</UnidadMedida><Detalle>Artículo QA</Detalle>
    <PrecioUnitario>100.00</PrecioUnitario><MontoTotal>100.00</MontoTotal><SubTotal>100.00</SubTotal><BaseImponible>100.00</BaseImponible>
    ${taxes}<ImpuestoAsumidoEmisorFabrica>.00</ImpuestoAsumidoEmisorFabrica><ImpuestoNeto>${neto}</ImpuestoNeto><MontoTotalLinea>${total}</MontoTotalLinea>
  </LineaDetalle></DetalleServicio><ResumenFactura><CodigoTipoMoneda><CodigoMoneda>CRC</CodigoMoneda></CodigoTipoMoneda>
    <TotalVentaNeta>100.00</TotalVentaNeta><TotalImpuesto>${neto}</TotalImpuesto><TotalComprobante>${total}</TotalComprobante>
  </ResumenFactura></${raiz}>`;
}
const clave='50600000000000000000000000000000000000000000000001';
test('Integración xml2js: dos IVA, .00, base sin duplicar y totales originales',async()=>{
 const contenido=xml({clave});const parsed=await parsearXML(contenido);
 const doc=procesarDocumento(parsed,'qa-sintetico.xml',contenido);
 assert.equal(doc.detalle[0].impuestos.length,2);
 assert.equal(doc.total,114);assert.equal(doc.detalle[0].impuestoNeto,14);
 assert.equal(doc.baseIVAnoAtribuida,100);
 assert.equal(doc.bases['13'],0);assert.equal(doc.bases['1'],0);
});
test('Integración xml2js: IVA y otro tributo quedan diferenciados',async()=>{
 const contenido=xml({clave,ivaDoble:false,neto:'18.00',total:'118.00'});
 const parsed=await parsearXML(contenido);const doc=procesarDocumento(parsed,'otro-impuesto.xml',contenido);
 assert.equal(doc.bases['13'],100);assert.equal(doc.baseIVAnoAtribuida,0);
 assert.equal(doc.impuestos.filter(i=>i.codigo==='01').length,1);
});
test('Integración xml2js: nota de crédito multitarifa conserva signo negativo',async()=>{
 const contenido=xml({clave,nota:true});
 const doc=procesarDocumento(await parsearXML(contenido),'nota-sintetica.xml',contenido);
 assert.equal(doc.total,-114);assert.equal(doc.baseIVAnoAtribuida,-100);
});
test('Importación inteligente: un XML inconsistente se rechaza y otro queda listo',async()=>{
 const perfiles=[{id:1,nombre:'Empresa QA',cedula:'3101999999'}];
 const archivos=[
   {nombre:'correcto.xml',bytes:Buffer.from(xml({clave}))},
   {nombre:'incorrecto.xml',bytes:Buffer.from(xml({clave:'50600000000000000000000000000000000000000000000002',neto:'14.50',total:'114.50'}))}
 ];
 const vista=await previsualizarXML(archivos,perfiles,{buscarClaveEnPerfiles:()=>[]},{resolverUSD:async()=>{throw Error('No debe consultar USD para CRC');}},1);
 assert.equal(vista.filas.length,2);
 assert.equal(vista.filas[0].estado,'listo');assert.equal(vista.filas[0].baseIVAnoAtribuida,100);
 assert.equal(vista.filas[1].estado,'error');
 assert.match(vista.filas[1].error,/no conciliado/);
 assert.equal(vista.contenidos.filter(Boolean).length,1);
});
