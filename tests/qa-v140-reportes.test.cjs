'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const {clasificacion,tablaContable,agruparContrapartes,compararMeses}=require('../frontend/src/contabilidad.mjs');
const empresa={cedula:'3-101-111111'};
const d=(tipo,importe,fecha,emisor='3101111111',receptor='101111111')=>({tipoDocumento:tipo,total:importe,fecha,
 emisor:{nombre:'Proveedor ficticio',identificacion:{numero:emisor}},receptor:{nombre:'Cliente ficticio',identificacion:{numero:receptor}},
 impuestos:[{codigo:'01',monto:importe*0.13}],bases:{13:importe/1.13}});
test('Reporte separado: factura y su nota de crédito compensan el importe mensual',()=>{
 const datos=[d('Factura electrónica',113,'2026-10-01'),d('Nota de crédito',-113,'2026-10-14'),
 d('Factura electrónica',226,'2026-11-02','101111111','3101111111')];
 assert.equal(tablaContable(empresa,datos).find(x=>x.tipo==='Venta').total,0);
 assert.equal(tablaContable(empresa,datos).find(x=>x.tipo==='Compra').total,226);
 const meses=compararMeses(empresa,datos);assert.equal(meses.find(x=>x.mes==='2026-10').ventas,0);
 assert.equal(meses.find(x=>x.mes==='2026-11').compras,226);
 assert.equal(agruparContrapartes(empresa,datos).length,2);
 assert.equal(clasificacion(d('Recibo electrónico de pago',100,'2026-11-02'),empresa),'Pago / revisar');
});
