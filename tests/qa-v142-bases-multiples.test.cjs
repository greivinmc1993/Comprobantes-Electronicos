'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
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

const IVA=(codigo,tarifa,monto)=>({Codigo:'01',CodigoTarifaIVA:codigo,Tarifa:tarifa,Monto:monto});
function comprobante({impuestos,impuestoNeto='14.00',subtotal='100.00',total='114.00',nota=false,detalleSurtido=null}={}){
  const linea={NumeroLinea:'1',SubTotal:subtotal,BaseImponible:subtotal,
    Impuesto:impuestos||[IVA('08','13.00','13.00'),IVA('02','1.00','1.00')],
    ImpuestoAsumidoEmisorFabrica:'.00',ImpuestoNeto:impuestoNeto,MontoTotalLinea:total};
  if(detalleSurtido) linea.DetalleSurtido=detalleSurtido;
  const raiz=nota?'NotaCreditoElectronica':'FacturaElectronica';
  const doc={Clave:'QA-FISCAL-PRUEBA-SINTETICA',NumeroConsecutivo:'00000000000000000001',
    FechaEmision:'2026-10-01T10:00:00',Emisor:{Nombre:'Comercio QA ficticio'},
    DetalleServicio:{LineaDetalle:linea},ResumenFactura:{CodigoTipoMoneda:{CodigoMoneda:'CRC'},
      TotalComprobante:total,TotalVentaNeta:subtotal,TotalImpuesto:impuestoNeto}};
  return parser.procesarDocumento({[raiz]:doc},'sintetico.xml',
    `<${raiz} xmlns="https://cdn.comprobanteselectronicos.go.cr/xml-schemas/v4.4/facturaElectronica"/>`);
}
const igual=(a,b)=>assert.ok(Math.abs(a-b)<0.0000001,`${a} debe ser ${b}`);

test('QA XML 4.4: dos tarifas IVA sin bases individualizadas NO duplican BaseImponible',()=>{
  const f=comprobante();
  igual(f.detalle[0].impuestoNeto,14);
  igual(f.desgloseTarifas['08:13'].impuesto,13);
  igual(f.desgloseTarifas['02:1'].impuesto,1);
  igual(f.bases['13'],0);igual(f.bases['1'],0);
  igual(f.baseIVAnoAtribuida,100);
  assert.match(f.observacionesFiscales[0].mensaje,/no se distribuye ni se duplica/);
});
test('Nota de crédito con dos tasas IVA mantiene bases e impuestos negativos',()=>{
  const f=comprobante({nota:true});
  igual(f.total,-114);igual(f.baseIVAnoAtribuida,-100);
  igual(f.desgloseTarifas['08:13'].impuesto,-13);
  igual(f.desgloseTarifas['02:1'].impuesto,-1);
});
test('IVA 13 % junto a otro tributo NO crea base IVA ambigua',()=>{
  const f=comprobante({impuestos:[IVA('08','13','13'),{Codigo:'03',Tarifa:'5',Monto:'5'}],
    impuestoNeto:'18.00',total:'118.00'});
  igual(f.baseIVAnoAtribuida,0);igual(f.bases['13'],100);
  assert.equal(f.observacionesFiscales.length,0);
});
test('Varias entradas IVA de la MISMA tarifa no duplican la base',()=>{
  const f=comprobante({impuestos:[IVA('08','13','6.5'),IVA('08','13','6.5')],impuestoNeto:'13.00',total:'113.00'});
  igual(f.baseIVAnoAtribuida,0);igual(f.bases['13'],100);
});
test('Surtido con detalle de base por componente permite separar IVA 13 y 1 %',()=>{
  const f=comprobante({impuestos:[],impuestoNeto:'8.20',total:'108.20',
    detalleSurtido:{LineaDetalleSurtido:[
      {BaseImponibleSurtido:'60.00',ImpuestoSurtido:{CodigoImpuestoSurtido:'01',CodigoTarifaIVASurtido:'08',TarifaSurtido:'13',MontoImpuestoSurtido:'7.80'}},
      {BaseImponibleSurtido:'40.00',ImpuestoSurtido:{CodigoImpuestoSurtido:'01',CodigoTarifaIVASurtido:'02',TarifaSurtido:'1',MontoImpuestoSurtido:'0.40'}},
    ]}});
  igual(f.baseIVAnoAtribuida,0);igual(f.bases['13'],60);igual(f.bases['1'],40);
});
test('No aceptar importe neto con diferencias materiales aunque haya varios impuestos',()=>{
  assert.throws(()=>comprobante({impuestoNeto:'14.02',total:'114.02'}),/no conciliado/);
});
test('La suma de bases del resumen contabiliza las bases no atribuibles por separado',()=>{
  const fuente=fs.readFileSync(path.join(__dirname,'../frontend/src/reportes.js'),'utf8');
  const ini=fuente.indexOf('export function resumenDatos(');
  const fin=fuente.indexOf('\nfunction seguroCSV(',ini);
  assert.ok(ini!==-1&&fin!==-1);
  const contexto=vm.createContext({TASAS:['0','0.5','1','2','4','8','13'],numero:v=>Number.isFinite(Number(v))?Number(v):0});
  vm.runInContext(fuente.slice(ini,fin).replace('export function','function'),contexto);
  const docs=[comprobante(),comprobante({nota:true})];
  const a=vm.runInContext(`resumenDatos(${JSON.stringify([docs[0]])})`,contexto);
  igual(a.base,100);igual(a.baseIVAnoAtribuida,100);igual(a.bases['13'],0);igual(a.bases['1'],0);
  const b=vm.runInContext(`resumenDatos(${JSON.stringify(docs)})`,contexto);
  igual(b.base,0);igual(b.baseIVAnoAtribuida,0);igual(b.totalIVA,0);
  assert.equal(b.documentosConBaseAmbigua,2);
});
