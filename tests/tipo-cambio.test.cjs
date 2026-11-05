'use strict';
const {test} = require('node:test');
const assert=require('node:assert/strict');
const {crearServicioTipoCambio,normalizarActual,normalizarHistorico,fechaISO,diaCR} = require('../backend/tipo-cambio');
function dbSimulada() {
  const map=new Map();return {
    tipoCambioFecha: f=>map.get(f)||null,
    ultimoTipoCambio:()=>[...map.values()].sort((a,b)=>b.fecha.localeCompare(a.fecha))[0]||null,
    guardarTipoCambio: f=>map.set(f.fecha,{...f}),
    registros: map,
  };
}
const exito = d=>({ok:true,json:async()=>d});
const error = status=>({ok:false,status,json:async()=>({})});
test('Fecha válida y zona horaria de Costa Rica',()=>{
  assert.equal(fechaISO('2026-02-29'),null);
  assert.equal(fechaISO('2024-02-29T13:00:00'), '2024-02-29');
  assert.match(diaCR(new Date('2026-11-04T05:30:00Z')),/^2026-11-03$/);
});
test('Formato actual compra/venta de Hacienda',()=>{
  assert.deepEqual(normalizarActual({venta:{fecha:'2026-11-04',valor:454.65},compra:{fecha:'2026-11-04',valor:450.31}}),
    {fecha:'2026-11-04',compra:450.31,venta:454.65,origen:'Ministerio de Hacienda / referencia BCCR'});
  assert.throws(()=>normalizarActual({venta:{fecha:'2026-11-04',valor:400},compra:{fecha:'2026-11-04',valor:450}}),/inválida/);
});
test('Histórico en formato arreglo y colecciones venta/compra',()=>{
  const a=normalizarHistorico([{fecha:'2026-10-27',compra:451.24,venta:455.53},{fecha:'2026-10-26',compra:450,venta:456.32}],'2026-10-27');
  assert.equal(a.venta,455.53);
  const b=normalizarHistorico({venta:[{fecha:'2026-10-27',valor:455.53}],compra:[{fecha:'2026-10-27',valor:451.24}]},'2026-10-27');
  assert.equal(b.compra,451.24);
  assert.equal(normalizarHistorico({texto:'inválido'},'2026-10-27'),null);
});
test('Importar USD histórico obtiene venta oficial, no utiliza 500 y caché evita solicitudes repetidas',async()=>{
  const base=dbSimulada();let solicitudes=0;
  const servicio=crearServicioTipoCambio({base,fetchFn:async url=>{solicitudes++;assert.match(url,/\/historico\?/);return exito([{fecha:'2026-10-27',compra:451.24,venta:455.53}]);}});
  const r=await servicio.resolverUSD('2026-10-27T13:00:00',455.53);
  assert.equal(r.valor,455.53);assert.equal(r.verificado,true);assert.equal(r.fecha,'2026-10-27');
  const seg=await servicio.resolverUSD('2026-10-27T13:00:00',455.53);
  assert.equal(seg.valor,455.53);assert.equal(solicitudes,1);
});
test('Sin acceso oficial conserva valor declarado XML, etiquetado sin verificación',async()=>{
  const servicio=crearServicioTipoCambio({base:dbSimulada(),fetchFn:async()=>{throw new Error('Sin Internet');}});
  const r=await servicio.resolverUSD('2026-10-27T13:00:00',455.53);
  assert.equal(r.valor,455.53);assert.equal(r.verificado,false);assert.match(r.fuente,/XML/);
  await assert.rejects(()=>servicio.resolverUSD('2026-10-27T13:00:00',null),/no trae uno válido/);
});
test('Cotización actual Hacienda se almacena, informa fecha y no se sustituye por un valor fijo',async()=>{
  const base=dbSimulada();const servicio=crearServicioTipoCambio({base,fetchFn:async()=>exito({venta:{fecha:'2026-11-04',valor:454.65},compra:{fecha:'2026-11-04',valor:450.31}})});
  const r=await servicio.vigente();assert.equal(r.venta,454.65);assert.equal(base.tipoCambioFecha('2026-11-04').compra,450.31);
});
