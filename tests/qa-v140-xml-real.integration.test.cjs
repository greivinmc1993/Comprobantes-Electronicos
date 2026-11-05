'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const {parsearXML,procesarDocumento}=require('../backend/parser');
const {previsualizarXML}=require('../backend/previsualizacion');
const {leerMensajeHacienda}=require('../backend/gestion');
const xml=(clave,emisor='3101111111')=>`<FacturaElectronica xmlns="https://cdn.comprobanteselectronicos.go.cr/xml-schemas/v4.4/facturaElectronica">
 <Clave>${clave}</Clave><FechaEmision>2026-10-30T12:00:00-06:00</FechaEmision>
 <Emisor><Nombre>Emisor de prueba</Nombre><Identificacion><Numero>${emisor}</Numero></Identificacion></Emisor>
 <Receptor><Nombre>Comprador</Nombre><Identificacion><Numero>102222222</Numero></Identificacion></Receptor>
 <DetalleServicio><LineaDetalle><NumeroLinea>1</NumeroLinea><Detalle>Prueba</Detalle><Cantidad>1</Cantidad><PrecioUnitario>100</PrecioUnitario><SubTotal>100</SubTotal><BaseImponible>100</BaseImponible>
 <Impuesto><Codigo>01</Codigo><CodigoTarifaIVA>08</CodigoTarifaIVA><Tarifa>13</Tarifa><Monto>13</Monto></Impuesto><ImpuestoNeto>13</ImpuestoNeto><MontoTotalLinea>113</MontoTotalLinea>
 </LineaDetalle></DetalleServicio><ResumenFactura><CodigoTipoMoneda><CodigoMoneda>CRC</CodigoMoneda></CodigoTipoMoneda><TotalComprobante>113</TotalComprobante></ResumenFactura></FacturaElectronica>`;
const k='50600000000000000000000000000000000000000000000001';
test('Vista previa real XML: sugerir perfil por cédula y mostrar duplicados de empresa',async()=>{
 const perfiles=[{id:1,nombre:'A',cedula:'3101111111'},{id:2,nombre:'B',cedula:'3109999999'}];
 const fakeDB={buscarClaveEnPerfiles:clave=>clave===k?[{perfilId:2,empresa:'B'}]:[]};
 const svc={resolverUSD:async()=>{throw Error('CRC no debe consultar cotizaciones');}};
 const r=await previsualizarXML([{nombre:'f.xml',bytes:Buffer.from(xml(k))}],perfiles,fakeDB,svc,1);
 assert.equal(r.filas[0].estado,'listo');assert.equal(r.filas[0].empresaSugerida,1);
 assert.equal(r.filas[0].existentes[0].perfilId,2);assert.equal(r.contenidos[0].documento.total,113);
});
test('El lector rechaza un XML inválido en la vista previa, sin guardar nada',async()=>{
 const r=await previsualizarXML([{nombre:'invalido.xml',bytes:Buffer.from('<xml>') }],[{id:1,nombre:'A',cedula:''}],{buscarClaveEnPerfiles:()=>[]},{},1);
 assert.equal(r.filas[0].estado,'error');
});
test('MensajeHacienda se identifica por clave, sin afirmar verificación de firma digital',async()=>{
 const resp=`<MensajeHacienda><Clave>${k}</Clave><Mensaje>1</Mensaje><DetalleMensaje>ACEPTADO</DetalleMensaje></MensajeHacienda>`;
 const r=await leerMensajeHacienda(resp,'respuesta.xml');assert.equal(r.estado,'Aceptado');assert.equal(r.clave,k);
 await assert.rejects(()=>leerMensajeHacienda('<FacturaElectronica/>','factura.xml'),/MensajeHacienda/);
});
