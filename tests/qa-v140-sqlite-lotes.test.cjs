'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {abrirBaseDatos}=require('../backend/database');
function doc(clave,cedula='3101111111'){return {clave,tipoDocumento:'Factura electrónica',fecha:'2026-10-30',tipoCambioAplicado:1,
 total:113,totalOriginal:113,monedaOriginal:'CRC',nombreArchivo:clave+'.xml',
 emisor:{nombre:'Vendedor',identificacion:{numero:cedula}},receptor:{identificacion:{numero:'101110111'}},impuestos:[],bases:{}};}
function conDB(fn){const carpeta=fs.mkdtempSync(path.join(os.tmpdir(),'cecr-v140-'));
 const p=path.join(carpeta,'test.sqlite');let db=abrirBaseDatos(p);
 try{return fn(db,p);}finally{db.cerrar();fs.rmSync(carpeta,{recursive:true,force:true});}}
test('Lote atómico: deduplicación, auditoría y deshacer en Papelera',()=>conDB(db=>{
 const a=db.crearPerfil({nombre:'Ventas A',cedula:'3101111111'});
 const r=db.importarLote([{xml:'<factura id="1"/>',documento:doc('1'),perfilId:a.id},
 {xml:'<factura id="1"/>',documento:doc('1'),perfilId:a.id}]);
 assert.equal(r.nuevos,1);assert.equal(r.duplicados,1);assert.equal(db.ultimoLote().cantidad,1);
 assert.equal(db.listar(a.id).length,1);
 assert.equal(db.deshacerUltimoLote(r.loteId).deshechos,1);
 assert.equal(db.listar(a.id).length,0);assert.equal(db.listarPapelera().length,1);
 assert.ok(db.historialAuditoria().some(a=>a.accion==='DESHACER_IMPORTACION'));
 assert.throws(()=>db.deshacerUltimoLote(r.loteId),/activo/);
}));
test('Una cédula ajena cancela todo el lote sin insertar documentos',()=>conDB(db=>{
 const a=db.crearPerfil({nombre:'A',cedula:'3101111111'}),b=db.crearPerfil({nombre:'B',cedula:'3102222222'});
 assert.throws(()=>db.importarLote([{xml:'<xml/>',documento:doc('1'),perfilId:a.id},
  {xml:'<xml/>',documento:doc('2'),perfilId:b.id}]),/no corresponde/);
 assert.equal(db.listar(a.id).length,0);assert.equal(db.listar(b.id).length,0);
 assert.equal(db.ultimoLote(),null);
}));
test('Mensajes Hacienda por clave no exponen documentos de otras empresas',()=>conDB(db=>{
 const a=db.crearPerfil({nombre:'A'}),b=db.crearPerfil({nombre:'B'});
 db.importarLote([{xml:'<doc/>',documento:doc('1'),perfilId:a.id}]);
 const m={clave:'1',codigo:'1',estado:'Aceptado',detalle:'ok',archivo:'f.xml',hash:'unique1',xml:'<MensajeHacienda/>'};
 assert.throws(()=>db.registrarMensajeHacienda(m),/clave válida/);
 m.clave='1'.repeat(50);db.registrarMensajeHacienda(m);
 assert.equal(db.mensajesHacienda(a.id).length,0);
 assert.equal(db.mensajesHacienda(b.id).length,0);
}));
test('Deshacer no retira comprobantes que ya se trasladaron de empresa',()=>conDB(db=>{
 const a=db.crearPerfil({nombre:'A'}),b=db.crearPerfil({nombre:'B'});
 const r=db.importarLote([{xml:'<xml/>',documento:doc('uno'),perfilId:a.id}]);
 db.moverLote(a.id,r.ids,b.id);
 assert.throws(()=>db.deshacerUltimoLote(r.loteId),/trasladado/);
 assert.equal(db.listar(b.id).length,1);
 assert.equal(db.listarPapelera().length,0);
}));

test('Respuesta Hacienda vinculada por clave y aislada por empresa',()=>conDB(db=>{
 const a=db.crearPerfil({nombre:'A'}),b=db.crearPerfil({nombre:'B'});
 const clave='1'.repeat(50);
 db.importarLote([{xml:'<xml/>',documento:doc(clave),perfilId:a.id}]);
 assert.equal(db.registrarMensajeHacienda({clave,codigo:'1',estado:'Aceptado',detalle:'Respuesta sintética',archivo:'test.xml',hash:'hash-unico-sintetico',xml:'<MensajeHacienda />'}),true);
 assert.equal(db.mensajesHacienda(a.id).length,1);
 assert.equal(db.mensajesHacienda(b.id).length,0);
}));
