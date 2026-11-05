'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const {fechaISO,tasa,normalizarActual,normalizarHistorico,crearServicioTipoCambio}=require('../backend/tipo-cambio');
const baseFake=()=>{
  const tasas=new Map();const fechas=new Map();
  return {tipoCambioFecha:f=>tasas.get(f)||null,tipoCambioResuelto:f=>tasas.get(fechas.get(f))||null,
    guardarTipoCambio:d=>tasas.set(d.fecha,d),guardarTipoCambioResuelto:(f,d)=>{tasas.set(d.fecha,d);fechas.set(f,d.fecha);},
    ultimoTipoCambio:()=>[...tasas.values()].at(-1)||null};
};
test('TC: fechas inválidas, bisiestos y valores anómalos rechazados',()=>{
  assert.equal(fechaISO('2024-02-29'), '2024-02-29');
  for(const f of ['2025-02-29','2026-13-01','2026-00-10','texto']) assert.equal(fechaISO(f),null);
  for(const valor of [0,-1,Infinity,NaN,99,1600]) assert.equal(tasa(valor),null);
});
test('TC: rechaza compra mayor que venta y datos incompletos',()=>{
  assert.throws(()=>normalizarActual({compra:{fecha:'2026-10-27',valor:460},venta:{fecha:'2026-10-27',valor:455}}),/inválida/);
  assert.throws(()=>normalizarActual({compra:{fecha:'2026-10-27',valor:450}}),/inválida/);
});
test('TC: histórico solo selecciona fechas <= emisión y nunca mezcla incompletos',()=>{
  const datos=[{fecha:'2026-10-25',compra:450,venta:455},{fecha:'2026-10-27',compra:449,venta:454}];
  const elegido=normalizarHistorico(datos,'2026-10-26');
  assert.equal(elegido.fecha,'2026-10-25');
  assert.equal(elegido.venta,455);
});
test('TC: fallback a tasa XML si consulta falla, y rechazo si falta tasa',async()=>{
  const servicio=crearServicioTipoCambio({base:baseFake(),fetchFn:async()=>{throw Error('sin red');}});
  const c=await servicio.resolverUSD('2026-10-24T12:00:00',455.53);
  assert.equal(c.verificado,false);assert.equal(c.valor,455.53);
  await assert.rejects(servicio.resolverUSD('2026-10-22T12:00:00',0),/no trae uno válido/);
});
