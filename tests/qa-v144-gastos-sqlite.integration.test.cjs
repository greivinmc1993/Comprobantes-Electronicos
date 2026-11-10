'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
let native=null;
try{native=require('better-sqlite3');}catch{}
const {abrirBaseDatos}=native?require('../backend/database'):{abrirBaseDatos:null};

function sample(clave){return {clave,tipoDocumento:'Factura electrónica',fecha:'2026-10-31',
  monedaOriginal:'CRC',tipoCambioAplicado:1,total:0,totalOriginal:0,
  resumen:{totalVenta:30003,totalDescuentos:30003,totalVentaNeta:0,totalGravado:0},
  impuestos:[],emisor:{identificacion:{numero:'3102000000'}}};}
function withDB(fn){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'qa-gasto-admin-'));const ruta=path.join(dir,'local.sqlite');
  const db=abrirBaseDatos(ruta);try{return fn(db,ruta);}finally{db.cerrar();fs.rmSync(dir,{recursive:true,force:true});}}

 test('SQLite: clasificación aislada por empresa, persistencia, papelera y restauración',{skip:!native},()=>withDB(db=>{
  const a=db.crearPerfil({nombre:'Empresa A'}),b=db.crearPerfil({nombre:'Empresa B'});
  const orig='<xml>simulado</xml>';
  assert.equal(db.insertar(orig,sample('A1'),a.id),true);
  assert.equal(db.insertar(orig,sample('B1'),b.id),true);
  const docA=db.listar(a.id)[0],docB=db.listar(b.id)[0];
  assert.throws(()=>db.marcarGastoAdministrativo(b.id,docA.id,true,30),/no pertenece/);
  assert.throws(()=>db.marcarGastoAdministrativo(a.id,docA.id,true,-30),/positivo/);
  db.marcarGastoAdministrativo(a.id,docA.id,true,30003);
  assert.equal(db.listar(a.id)[0].gastoAdministrativo,true);
  assert.equal(db.listar(a.id)[0].montoGastoManual,30003);
  assert.equal(db.listar(b.id)[0].gastoAdministrativo,false);
  db.enviarPapelera(a.id,[docA.id]);
  const basura=db.listarPapelera();assert.equal(basura.length,1);
  db.restaurarPapelera([basura[0].id],a.id);
  assert.equal(db.listar(a.id)[0].montoGastoManual,30003);
  assert.equal(db.listar(a.id)[0].total,0);
  assert.equal(db.listar(b.id)[0].gastoAdministrativo,false);
}));
 test('SQLite: desmarcar elimina monto manual, sin eliminar comprobante',{skip:!native},()=>withDB(db=>{
  const a=db.crearPerfil({nombre:'Empresa A'});
  db.insertar('<xml/>',sample('C3'),a.id);
  const d=db.listar(a.id)[0];
  db.marcarGastoAdministrativo(a.id,d.id,true,88);
  db.marcarGastoAdministrativo(a.id,d.id,false);
  const r=db.listar(a.id)[0];
  assert.equal(r.gastoAdministrativo,false);
  assert.equal(r.montoGastoManual,null);
  assert.equal(r.total,0);
}));
