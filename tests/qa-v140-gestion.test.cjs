'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const {clasificarDocumento,resumenComprasVentas,analizarReferencias}=require('../backend/gestion');
function doc(tipo='Factura electrónica',total=113,ref=[]) {return {tipoDocumento:tipo,total,impuestos:[{codigo:'01',monto:13}],bases:{13:100},
  clave:'50600000000000000000000000000000000000000000000001',
  emisor:{identificacion:{numero:'3101111111'}},receptor:{identificacion:{numero:'101110111'}},referencias:ref};}
const A={cedula:'3-101-111111'},B={cedula:'101110111'},C={cedula:'3109999999'};
test('Compras y ventas se determinan por la cédula de la empresa (no por nombre ni tipo)',()=>{
 assert.equal(clasificarDocumento(doc(),A),'Venta');assert.equal(clasificarDocumento(doc(),B),'Compra');
 assert.equal(clasificarDocumento(doc(),C),'Ajeno a la empresa');assert.equal(clasificarDocumento(doc(),{cedula:''}),'Sin clasificar');
 const nota=doc('Nota de crédito',-113);assert.equal(clasificarDocumento(nota,A),'Venta');
 assert.equal(clasificarDocumento(doc('Recibo electrónico de pago'),A),'Pago / revisar');
 const r=resumenComprasVentas([doc(),nota],A);assert.equal(r.Venta.total,0);assert.equal(r.Venta.cantidad,2);
});
test('Conciliación de notas no inventa anulaciones, distingue referencia ausente y parcial',()=>{
 const original=doc();original.id=1;original.consecutivo='00100001';
 const credito=doc('Nota de crédito',-20,[{Numero:original.clave,Codigo:'01',Razon:'ajuste'}]);credito.id=2;credito.clave='50600000000000000000000000000000000000000000000002';
 const r=analizarReferencias([original,credito]);assert.equal(r.length,1);
 assert.equal(r[0].referenciaEnEmpresa,true);assert.match(r[0].estado,/parcial/);
 credito.referencias=[{Numero:'0'.repeat(50)}];assert.equal(analizarReferencias([original,credito])[0].referenciaEnEmpresa,false);
});
