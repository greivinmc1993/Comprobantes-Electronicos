'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const SQLite = require('better-sqlite3');
const {abrirBaseDatos} = require('../backend/database');

function documento(clave,emisor='3101675402') {return {
  clave,consecutivo:'0010000000000001',tipoDocumento:'Tiquete electrónico',versionXML:'4.4',
  fecha:'2026-11-04T12:00:00',nombreArchivo:'ejemplo.xml',monedaOriginal:'USD',
  tipoCambioAplicado:500,totalOriginal:24.02,total:12010,comercio:'Empresa de prueba',
  emisor:{nombre:'Empresa de prueba',identificacion:{numero:emisor}},
  receptor:{nombre:'Receptor',identificacion:{numero:'109990888'}},bases:{'13':10630},
  impuestos:[{codigo:'01',tarifa:13,monto:1380}]
};}

test('Perfiles: documentos separados, validación de cédula, movimiento y duplicados',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cr-perfiles-'));
  const ruta=path.join(dir,'datos.sqlite'); let db;
  try {
    db=abrirBaseDatos(ruta);
    const a=db.crearPerfil({nombre:'Empresa A',cedula:'3-101-675402',color:'#2563EB'});
    const b=db.crearPerfil({nombre:'Empresa B',cedula:'109990888',color:'#2563EB'});
    assert.equal(db.perfiles().length,2);
    const f=documento('clave-de-prueba');
    assert.equal(db.insertar('<xml/>',f,a.id),true);
    assert.equal(db.insertar('<xml/>',f,a.id),false);
    assert.equal(db.insertar('<xml/>',f,b.id),true); // mismo XML, otra empresa
    assert.equal(db.cantidad(a.id),1);
    assert.equal(db.cantidad(b.id),1);
    const err=()=>db.insertar('<xml/>',documento('clave-ajena','000000000'),a.id);
    assert.throws(err,/no corresponde/);
    assert.throws(()=>db.eliminarPerfil(a.id),/Confirma/);
    assert.throws(()=>db.eliminarPerfil(a.id,{nombreConfirmacion:'Empresa A',modo:'eliminar',documentosEsperados:1,confirmado:false}),/Confirma/);
    assert.throws(()=>db.mover(db.listar(a.id)[0].id,a.id,b.id),/ya existe/);
    assert.equal(db.eliminar(db.listar(b.id)[0].id,b.id),true);
    assert.equal(db.mover(db.listar(a.id)[0].id,a.id,b.id),true);
    assert.equal(db.cantidad(a.id),0);
    assert.equal(db.cantidad(b.id),1);
    assert.equal(db.eliminarPerfil(a.id,{nombreConfirmacion:'Empresa A',modo:'eliminar',documentosEsperados:0,confirmado:true}).eliminado,true);
    db.cerrar();db=null;
    db=abrirBaseDatos(ruta);
    assert.equal(db.cantidad(b.id),1);
    assert.equal(db.listar(b.id)[0].total,12010);
    assert.equal(db.tienePerfilLegado(),false);
    assert.equal(db.perfiles().length,1);
  } finally {if(db)db.cerrar();fs.rmSync(dir,{recursive:true,force:true});}
});

test('Migración: historial v1.0 permite backup y borrado completo del perfil heredado',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cr-migracion-'));
  const ruta=path.join(dir,'antigua.sqlite');let db;
  try {
    const antigua=new SQLite(ruta);
    antigua.exec(`CREATE TABLE documentos (
      id INTEGER PRIMARY KEY AUTOINCREMENT, identidad TEXT NOT NULL UNIQUE, clave TEXT,
      consecutivo TEXT, version_xml TEXT, tipo TEXT NOT NULL, fecha TEXT, emisor TEXT, receptor TEXT,
      moneda_original TEXT NOT NULL, tipo_cambio_aplicado REAL NOT NULL, total_original REAL NOT NULL,
      total_crc REAL NOT NULL, nombre_archivo TEXT NOT NULL, xml_original TEXT NOT NULL, datos_json TEXT NOT NULL,
      creado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));
    `);
    const doc=documento('clave-anterior');
    antigua.prepare(`INSERT INTO documentos(id,identidad,clave,tipo,moneda_original,tipo_cambio_aplicado,
      total_original,total_crc,nombre_archivo,xml_original,datos_json) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
      .run(27,'clave:clave-anterior','clave-anterior',doc.tipoDocumento,'USD',500,24.02,12010,
        'antigua.xml','<xml>Anterior</xml>',JSON.stringify(doc));
    antigua.close();
    db=abrirBaseDatos(ruta);
    const lista=db.listar(1);
    assert.equal(lista.length,1);assert.equal(lista[0].id,27);
    assert.equal(lista[0].total,12010);
    assert.equal(db.cantidad(1),1);
    const nueva=db.crearPerfil({nombre:'Nueva empresa'});
    db.insertar('<xml/>',documento('xml-de-nueva'),nueva.id);
    const raw=new SQLite(ruta,{readonly:true});
    assert.equal(raw.prepare('SELECT xml_original FROM documentos WHERE id=27').get().xml_original,'<xml>Anterior</xml>');
    raw.close();
    assert.equal(db.tienePerfilLegado(),true);
    const limpiado=db.eliminarPerfilLegado();
    assert.equal(limpiado.eliminado,true);
    assert.equal(limpiado.documentosEliminados,1);
    assert.equal(db.tienePerfilLegado(),false);
    assert.equal(db.cantidad(nueva.id),1);
    assert.equal(db.perfiles().length,1);
    db.cerrar();db=null;
    db=abrirBaseDatos(ruta); // El perfil borrado no puede recrearse al reiniciar.
    assert.equal(db.perfiles().length,1);
    assert.equal(db.tienePerfilLegado(),false);
  }finally{if(db)db.cerrar();fs.rmSync(dir,{recursive:true,force:true});}
});


test('Eliminar empresa con documentos: mover a empresa real, eliminar y validar conteo',()=>{
  const carpeta=fs.mkdtempSync(path.join(os.tmpdir(),'cecr-borrado-perfiles-'));
  const ruta=path.join(carpeta,'datos.sqlite'); let db;
  try {
    db=abrirBaseDatos(ruta);
    const a=db.crearPerfil({nombre:'Empresa Conservada'});
    const b=db.crearPerfil({nombre:'Empresa Borrada'});
    db.insertar('<xml>A</xml>',documento('conservar'),a.id);
    db.insertar('<xml>B</xml>',documento('eliminar'),b.id);
    assert.throws(()=>db.eliminarPerfil(a.id,{nombreConfirmacion:'Empresa Conservada',confirmado:true,modo:'mover',destinoPerfilId:b.id,documentosEsperados:0}),/cambió/);
    assert.equal(db.cantidad(a.id),1);
    const moved=db.eliminarPerfil(a.id,{nombreConfirmacion:'Empresa Conservada',confirmado:true,modo:'mover',destinoPerfilId:b.id,documentosEsperados:1});
    assert.equal(moved.documentosAfectados,1);
    assert.equal(db.cantidad(b.id),2);
    assert.equal(db.listar(b.id).find(x=>x.clave==='conservar')?.clave,'conservar');
    const deleted=db.eliminarPerfil(b.id,{nombreConfirmacion:'Empresa Borrada',confirmado:true,modo:'eliminar',documentosEsperados:2});
    assert.equal(deleted.documentosAfectados,2);
    assert.equal(db.perfiles().length,0);
    assert.throws(()=>db.perfil(b.id),/no existe/);
    assert.throws(()=>db.crearPerfil({nombre:'Sin asignar (historial anterior)'}),/heredado eliminado/);
  } finally {if(db)db.cerrar();fs.rmSync(carpeta,{recursive:true,force:true});}
});
