'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const {MAX_ARCHIVOS_XML,MAX_BYTES_XML,MAX_BYTES_LOTE}=require('../backend/limites-importacion');

function previsualizadorSimulado(){
  // Aislar el flujo de revisión sin red ni documentos reales de clientes.
  // El parser XML verdadero se prueba en la suite de integración de Actions.
  const mocks={
    './parser':{
      parsearXML:async(xml)=>({clave:xml}),
      identificarDocumento:p=>({doc:{FechaEmision:'2026-10-15T10:00:00'}}),
      datosMonedaDocumento:()=>({codigoOriginal:'CRC'}),
      procesarDocumento:(p,nombre,xml)=>({
        clave:xml, fecha:'2026-10-15',tipoDocumento:'Factura electrónica',total:100,
        monedaOriginal:'CRC',emisor:{identificacion:{numero:'3101111111'}},
        receptor:{identificacion:{numero:'101234567'}},observacionesFiscales:[]
      })
    },
    './identificaciones':{normalizarIdentificacion:v=>String(v||'').replace(/\D/g,'')},
    './limites-importacion':{MAX_ARCHIVOS_XML}
  };
  const sandbox={module:{exports:{}},Buffer,require:x=>{
    if(!(x in mocks))throw new Error('Unexpected dependency '+x);
    return mocks[x];
  }};
  vm.runInNewContext(read('backend/previsualizacion.js'),sandbox,{filename:'backend/previsualizacion.js'});
  return sandbox.module.exports.previsualizarXML;
}
const archivos=n=>Array.from({length:n},(_,i)=>({nombre:`factura-${i+1}.xml`,bytes:Buffer.from(`CLAVE-${i+1}`)}));
const empresas=[{id:2,cedula:'3101111111',nombre:'Empresa sintética'}];
const base={buscarClaveEnPerfiles:()=>[]};

test('Se revisan 75 comprobantes en una sola vista (no hay división en decenas)',async()=>{
  const r=await previsualizadorSimulado()(archivos(75),empresas,base,null,null);
  assert.equal(r.filas.length,75);
  assert.equal(r.contenidos.length,75);
  assert.equal(r.filas[74].indice,74);
  assert.equal(r.filas[74].estado,'listo');
});

test('El límite de revisión protege memoria sin cortar silenciosamente archivos',async()=>{
  const preview=previsualizadorSimulado();
  await assert.rejects(()=>preview(archivos(MAX_ARCHIVOS_XML+1),empresas,base,null,null),/2000/);
  assert.equal(MAX_ARCHIVOS_XML,2000);
  assert.equal(MAX_BYTES_XML,15*1024*1024);
  assert.equal(MAX_BYTES_LOTE,256*1024*1024);
});

test('Duplicados y empresa pendiente conservan la semántica original de v1.4.11',async()=>{
  const preview=previsualizadorSimulado();
  const r=await preview([
    {nombre:'existe.xml',bytes:Buffer.from('CLAVE-1')},
    {nombre:'repite.xml',bytes:Buffer.from('CLAVE-1')},
    {nombre:'nuevo.xml',bytes:Buffer.from('CLAVE-2')}
  ],[],{buscarClaveEnPerfiles:(clave)=>clave==='CLAVE-1'?[{perfilId:5,empresa:'Otro perfil'}]:[]},null,null);
  assert.equal(r.filas[0].estado,'requiere_empresa');
  assert.equal(r.filas[0].existentes.length,1);
  assert.equal(r.filas[1].estado,'duplicado_en_lote');
  assert.equal(r.filas[2].estado,'requiere_empresa');
  // No se introducen estados de «omisión parcial» en esta versión.
  const ui=read('frontend/src/components/VistaPrevia.jsx');
  assert.match(ui,/validos\.length===0\|\|pendientes!==0/);
  assert.doesNotMatch(ui,/Finalizar revisión|Ya registrado · se omitirá|Importación parcial:/);
});

test('Los controles UI revisan todos los comprobantes aunque muestre solo 200 filas',()=>{
  const app=read('frontend/src/App.jsx');
  const ui=read('frontend/src/components/VistaPrevia.jsx');
  assert.match(app,/await prepararVista\(files\)/);
  assert.doesNotMatch(app,/files\.slice\(0,10\)|colaPendiente|setColaPendiente/);
  assert.match(ui,/filasFiltradas\.slice\(0,limiteVisibles\)/);
  assert.match(ui,/const elegidos=aplicables\.filter/);
  assert.match(ui,/onConfirmar\(validos\.map/);
  assert.match(ui,/setLimiteVisibles\(n=>Math\.min\(n\+200,filasFiltradas\.length\)\)/);
});

test('El límite por lote está coherente en SQLite, Electron y API',()=>{
  assert.match(read('backend/database.js'),/items\.length>MAX_ARCHIVOS_XML/);
  assert.match(read('electron/main.js'),/selecciones\.length>MAX_ARCHIVOS_XML/);
  assert.match(read('backend/server.js'),/files:MAX_ARCHIVOS_XML/);
  assert.match(read('backend/vigilancia.js'),/ids\.length>MAX_ARCHIVOS_XML/);
});
