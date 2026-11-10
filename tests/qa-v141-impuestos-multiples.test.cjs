const {test}=require('node:test');
const assert=require('node:assert/strict');
const Module=require('node:module');
const original=Module._load;
let parser;
try {
 Module._load=function(request,parent,isMain){
   if(request==='xml2js')return {processors:{stripPrefix:x=>x}};
   return original.apply(this,arguments);
 };
 parser=require('../backend/parser');
}finally{Module._load=original;}
function prueba({neto='18.01',total='118.01',nota=false,asumido='0.00',incluirTotales=true,segundo='5.00'}={}){
 const l={NumeroLinea:'1',SubTotal:'100.00',BaseImponible:'100.00',Impuesto:[
  {Codigo:'01',CodigoTarifaIVA:'08',Tarifa:'13.00',Monto:'13.00'},
  {Codigo:'03',Tarifa:'5.00',Monto:segundo}],
  ImpuestoNeto:neto,ImpuestoAsumidoEmisorFabrica:asumido};
 if(incluirTotales)l.MontoTotalLinea=total;
 const doc={Clave:'CLAVE-SINTETICA',FechaEmision:'2026-10-01T09:00:00',Emisor:{Nombre:'QA'},
   DetalleServicio:{LineaDetalle:l},ResumenFactura:{CodigoTipoMoneda:{CodigoMoneda:'CRC'},TotalComprobante:total,TotalImpuesto:neto}};
 const xml=`<${nota?'NotaCreditoElectronica':'FacturaElectronica'} xmlns="https://cdn.comprobanteselectronicos.go.cr/xml-schemas/v4.4/facturaElectronica"/>`;
 return parser.procesarDocumento({[nota?'NotaCreditoElectronica':'FacturaElectronica']:doc},'test.xml',xml);
}
test('Múltiples impuestos con ajuste 0.01 conciliado se admiten sin atribuir tarifa',()=>{
 const f=prueba();assert.equal(f.detalle[0].impuestos.length,3);
 assert.ok(Math.abs(f.ajusteNetoSinTarifa-0.01)<1e-8);
 assert.equal(f.desgloseTarifas['08:13'].impuesto,13);
 assert.ok(f.observacionesFiscales.some(o=>o.mensaje.includes('sin asignación')));
});
test('Sin datos de total de línea no se inventa conciliación',()=>{
 assert.throws(()=>prueba({incluirTotales:false}),/no conciliado/);
});
test('Si difiere más de un céntimo, se sigue rechazando',()=>{
 assert.throws(()=>prueba({neto:'18.02',total:'118.02'}),/no conciliado/);
});
test('El total de línea debe coincidir con ImpuestoNeto declarado',()=>{
 assert.throws(()=>prueba({neto:'18.01',total:'118.00'}),/no conciliado/);
});
test('Nota de crédito mantiene signo negativo incluso en ajuste sin tarifa',()=>{
 const f=prueba({nota:true});assert.ok(Math.abs(f.ajusteNetoSinTarifa+0.01)<1e-8);
 assert.equal(f.impuestos.find(i=>i.codigo==='01').monto,-13);
});
test('Con impuestos asumidos en múltiples tarifas se conserva el neto declarado',()=>{
 const f=prueba({neto:'16.00',total:'116.00',asumido:'2.00'});
 assert.equal(f.detalle[0].impuestoNeto,16);
 assert.equal(f.ajusteNetoSinTarifa,-2);
 assert.equal(f.desgloseTarifas['08:13'].impuesto,13);
});
test('Con varios impuestos de neto coincidente no se crea ajuste artificial',()=>{
 const f=prueba({neto:'18.00',total:'118.00'});
 assert.equal(f.ajusteNetoSinTarifa,0);assert.equal(f.detalle[0].impuestos.length,2);
});
