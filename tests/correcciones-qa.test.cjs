'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
let parser;
try {
  parser = require('../backend/parser');
} catch (error) {
  if (error.code!=='MODULE_NOT_FOUND' || !error.message.includes('xml2js')) throw error;
  // Permite probar los cálculos incluso sin descargar xml2js. La prueba real de
  // parseStringPromise sigue en parser.test.cjs al instalar las dependencias.
  const anterior = Module._load;
  try {
    Module._load=function(nombre,parent,isMain){
      if(nombre==='xml2js') return {processors:{stripPrefix:x=>x},parseStringPromise:async()=>{throw Error('xml2js no instalado')}};
      return anterior.call(this,nombre,parent,isMain);
    };
    parser=require('../backend/parser');
  } finally { Module._load=anterior; }
}
const {procesarDocumento} = parser;
const {crearServicioTipoCambio}=require('../backend/tipo-cambio');
const xml='<FacturaElectronica xmlns="https://cdn.comprobanteselectronicos.go.cr/xml-schemas/v4.4/facturaElectronica" />';
function doc({exonerado=0,neto=null,asumido=0,moneda='CRC',cambio=1,nota=false,otrosImpuestos=[]}={}) {
  const monto=13, netoEsperado=neto===null?monto-exonerado-asumido:neto;
  const imp={Codigo:'01',CodigoTarifaIVA:'08',Tarifa:'13.00',Monto:'13'};
  if (exonerado) imp.Exoneracion={MontoExoneracion:String(exonerado),TarifaExonerada:String(exonerado)};
  const l={NumeroLinea:'1',Cantidad:'1',Detalle:'Servicio sintético',BaseImponible:'100',
    PrecioUnitario:'100',MontoTotal:'100',SubTotal:'100',
    Impuesto:[imp,...otrosImpuestos],ImpuestoNeto:String(netoEsperado),
    ImpuestoAsumidoEmisorFabrica:String(asumido),MontoTotalLinea:String(100+netoEsperado)};
  const r={CodigoTipoMoneda:{CodigoMoneda:moneda,TipoCambio:String(cambio)},TotalVenta:'100',
    TotalVentaNeta:'100',TotalImpuesto:String(netoEsperado),TotalComprobante:String(100+netoEsperado)};
  return {[nota?'NotaCreditoElectronica':'FacturaElectronica']:{FechaEmision:'2026-10-27T13:00:00',
    Emisor:{Nombre:'Empresa prueba'},DetalleServicio:{LineaDetalle:l},ResumenFactura:r}};
}
function importe(f) {return f.impuestos.filter(i=>i.codigo==='01').reduce((n,i)=>n+i.monto,0);}
test('QA-001: exoneración TOTAL de IVA 13 % -> IVA neto y base neta cero',()=>{
  const f=procesarDocumento(doc({exonerado:13}), 'exento.xml',xml);
  assert.equal(importe(f),0);
  assert.equal(f.detalle[0].impuestos[0].montoBruto,13);
  assert.equal(f.detalle[0].impuestos[0].montoExonerado,13);
  assert.equal(f.detalle[0].impuestoNeto,0);
  assert.equal(f.bases['13'],0);
  assert.equal(f.total,100);
});
test('QA-001: exoneración PARCIAL produce IVA 6.5 y base no exonerada 50',()=>{
  const f=procesarDocumento(doc({exonerado:6.5}), 'parcial.xml',xml);
  assert.equal(importe(f),6.5);assert.equal(f.bases['13'],50);
  assert.equal(f.resumen.totalImpuesto,6.5);
  assert.equal(f.desgloseTarifas['08:13'].impuesto,6.5);
});
test('QA-001: nota de crédito con exoneración parcial resta IVA y base',()=>{
  const f=procesarDocumento(doc({exonerado:6.5,nota:true}),'credito.xml',xml);
  assert.equal(importe(f),-6.5);assert.equal(f.bases['13'],-50);assert.equal(f.total,-106.5);
});
test('QA-001: un XML sin exoneración conserva el IVA original y base completa',()=>{
  const f=procesarDocumento(doc(), 'normal.xml',xml);
  assert.equal(importe(f),13);assert.equal(f.bases['13'],100);assert.equal(f.total,113);
});
test('QA-001: IVA asumido por emisor no se cobra si ImpuestoNeto es cero',()=>{
  const f=procesarDocumento(doc({asumido:13}), 'asumido.xml',xml);
  assert.equal(importe(f),0);assert.equal(f.bases['13'],0);
});
test('QA-001: si múltiples impuestos hacen ambiguo el neto, rechaza en vez de inventar montos',()=>{
  const otro={Codigo:'03',Tarifa:'10',Monto:'5'};
  assert.throws(()=>procesarDocumento(doc({otrosImpuestos:[otro]}),'otros.xml',xml),/ImpuestoNeto ambiguo/);
});
test('QA-001: una factura USD con exoneración conserva tipo de cambio y convierte IVA neto',()=>{
  const f=procesarDocumento(doc({moneda:'USD',cambio:455.53,exonerado:6.5}), 'usd.xml',xml,
    {valor:455.53,fecha:'2026-10-27',fuente:'BCCR',verificado:true});
  assert.ok(Math.abs(importe(f)-6.5*455.53)<1e-8);
  assert.ok(Math.abs(f.total-106.5*455.53)<1e-8);
  assert.equal(f.tipoCambioAplicado,455.53);
});
function dbSimulada(){
  const tasas=new Map(), fechas=new Map();
  return {
    tipoCambioFecha: fecha=>tasas.get(fecha)||null,
    tipoCambioResuelto: fecha=>tasas.get(fechas.get(fecha))||null,
    guardarTipoCambio:r=>tasas.set(r.fecha,{...r}),
    guardarTipoCambioResuelto:(pedida,r)=>{tasas.set(r.fecha,{...r});fechas.set(pedida,r.fecha);},
    ultimoTipoCambio:()=>[...tasas.values()].sort((a,b)=>b.fecha.localeCompare(a.fecha))[0]||null,
    fechas,
  };
}
test('QA-002: sábado/domingo conserva la tasa de día hábil tras reinicio sin Internet',async()=>{
  const base=dbSimulada();
  let consultas=0;
  const online=crearServicioTipoCambio({base,fetchFn:async()=>{
    consultas++;
    return {ok:true,json:async()=>[{fecha:'2026-10-23',compra:451.24,venta:455.53}]};
  }});
  const primera=await online.resolverUSD('2026-10-25T10:00:00',470);
  assert.equal(primera.valor,455.53);assert.equal(primera.fecha,'2026-10-23');
  assert.equal(base.fechas.get('2026-10-25'),'2026-10-23');
  const offline=crearServicioTipoCambio({base,fetchFn:async()=>{
    throw Error('Sin conexión');
  }});
  const segunda=await offline.resolverUSD('2026-10-25T11:00:00',470);
  assert.equal(segunda.valor,455.53);
  assert.equal(segunda.verificado,true);
  assert.equal(segunda.fecha,'2026-10-23');
  assert.equal(consultas,1);
});
test('QA-002: si la fecha no ha sido consultada, sin Internet usa XML no verificado',async()=>{
  const servicio=crearServicioTipoCambio({base:dbSimulada(),fetchFn:async()=>{throw Error('offline');}});
  const r=await servicio.resolverUSD('2026-10-25T10:00:00',470);
  assert.equal(r.valor,470);assert.equal(r.verificado,false);
});
test('QA-001: el resumen que alimenta PDF/CSV/Excel usa IVA NETO almacenado',()=>{
  const fs=require('node:fs'); const vm=require('node:vm'); const path=require('node:path');
  const source=fs.readFileSync(path.join(__dirname,'../frontend/src/reportes.js'),'utf8');
  const inicio=source.indexOf('export function resumenDatos(');
  const fin=source.indexOf('\nfunction seguroCSV(',inicio);
  assert.ok(inicio>=0 && fin>inicio);
  const codigo=source.slice(inicio,fin).replace('export function','function');
  const context=vm.createContext({TASAS:['0','0.5','1','2','4','8','13'],numero:v=>Number.isFinite(Number(v))?Number(v):0});
  vm.runInContext(codigo,context);
  const exonerada=procesarDocumento(doc({exonerado:13}),'exo.xml',xml);
  const normal=procesarDocumento(doc(),'normal.xml',xml);
  const r=vm.runInContext('resumenDatos',context)([exonerada,normal]);
  assert.equal(r.totalIVA,13);
  assert.equal(r.base,100);
  assert.equal(r.iva['13'],13);
});
test('QA-001: IVA exonerado y otro impuesto válido pueden convivir con impuesto neto conciliado',()=>{
  const otro={Codigo:'03',Tarifa:'10',Monto:'5'};
  const f=procesarDocumento(doc({exonerado:13,neto:5,otrosImpuestos:[otro]}),'multi.xml',xml);
  assert.equal(importe(f),0);
  assert.equal(f.bases['13'],0);
  assert.equal(f.detalle[0].impuestos.reduce((n,i)=>n+i.monto,0),5);
});
