'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
let native;try{native=require('better-sqlite3')}catch{native=null}
const {abrirBaseDatos}=native?require('../backend/database'):{abrirBaseDatos:null};
function doc(clave,cedula,nombre,tipo='Factura electrónica',total=100){
 return {clave,fecha:'2026-11-10',nombreArchivo:'qa-sintetico.xml',versionXML:'4.4',
 tipoDocumento:tipo,monedaOriginal:'CRC',tipoCambioAplicado:1,total,totalOriginal:total,
 resumen:{totalVenta:total,totalVentaNeta:total,totalGravado:0},impuestos:[],
 emisor:{nombre,identificacion:{numero:cedula}},receptor:{nombre:'Receptor ficticio'}};
}
function dbTemporal(fn){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'qa-comercios-'));
 const base=abrirBaseDatos(path.join(dir,'datos.sqlite'));
 try{return fn(base);}finally{base.cerrar();fs.rmSync(dir,{force:true,recursive:true});}}

test('SQLite clasifica solo el comercio en la empresa, conserva importes manuales y notas de crédito',{skip:!native},()=>dbTemporal(base=>{
 const a=base.crearPerfil({nombre:'Empresa QA A'}),b=base.crearPerfil({nombre:'Empresa QA B'});
 base.insertar('<xml/>',doc('AAA','3101234567','Comercio QA'),a.id);
 base.insertar('<xml/>',doc('AAB','3101234567','Comercio QA','Nota de crédito',-25),a.id);
 base.insertar('<xml/>',doc('AAC','3101222222','Comercio QA'),a.id);
 base.insertar('<xml/>',doc('BAA','3101234567','Comercio QA'),b.id);
 const docA=base.listar(a.id).find(d=>d.clave==='AAA');
 base.marcarGastoAdministrativo(a.id,docA.id,true,325);
 const grupos=base.comerciosGastos(a.id);
 const elegido=grupos.find(g=>g.clave==='cedula:3101234567');
 assert.equal(elegido.total,2);assert.equal(elegido.marcados,1);assert.equal(elegido.pendientes,1);
 assert.throws(()=>base.clasificarGastosPorComercio(a.id,elegido.clave,true,2),/cambiaron/);
 assert.throws(()=>base.clasificarGastosPorComercio(b.id,'cedula:3101234567',true,2),/cambiaron/);
 assert.equal(base.clasificarGastosPorComercio(a.id,elegido.clave,true,1).afectados,1);
 const aDocs=base.listar(a.id),bDocs=base.listar(b.id);
 assert.equal(aDocs.find(d=>d.clave==='AAA').montoGastoManual,325);
 assert.equal(aDocs.find(d=>d.clave==='AAB').gastoAdministrativo,true);
 assert.equal(aDocs.find(d=>d.clave==='AAC').gastoAdministrativo,false);
 assert.equal(bDocs[0].gastoAdministrativo,false);
 const quitar=base.clasificarGastosPorComercio(a.id,elegido.clave,false,2);
 assert.equal(quitar.afectados,2);
 assert.equal(base.listar(a.id).find(d=>d.clave==='AAA').montoGastoManual,null);
 assert.equal(base.historialAuditoria().filter(a=>a.accion==='CLASIFICAR_GASTOS_POR_COMERCIO').length,2);
}));

test('SQLite la clasificación por comercio es atómica frente a cantidad desactualizada',{skip:!native},()=>dbTemporal(base=>{
 const a=base.crearPerfil({nombre:'Empresa QA A'});
 base.insertar('<xml/>',doc('AAA','3101234567','Comercio QA'),a.id);
 base.insertar('<xml/>',doc('AAB','3101234567','Comercio QA'),a.id);
 assert.throws(()=>base.clasificarGastosPorComercio(a.id,'cedula:3101234567',true,1),/cambiaron/);
 assert.equal(base.listar(a.id).filter(d=>d.gastoAdministrativo).length,0);
 const result=base.clasificarGastosPorComercio(a.id,'cedula:3101234567',true,2);
 assert.equal(result.afectados,2);
 assert.equal(base.listar(a.id).filter(d=>d.gastoAdministrativo).length,2);
}));


test('SQLite no permite registrar masivamente las ventas propias como gasto',{skip:!native},()=>dbTemporal(base=>{
 const a=base.crearPerfil({nombre:'Empresa QA titular',cedula:'3101234567'});
 base.insertar('<xml/>',doc('AAA','3101234567','Empresa QA titular'),a.id);
 assert.equal(base.comerciosGastos(a.id).length,0);
 assert.throws(()=>base.clasificarGastosPorComercio(a.id,'cedula:3101234567',true,1),/ventas de la empresa/);
 assert.equal(base.listar(a.id)[0].gastoAdministrativo,false);
}));
