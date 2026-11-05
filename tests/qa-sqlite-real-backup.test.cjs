'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const BetterSqlite=require('better-sqlite3');
const {abrirBaseDatos}=require('../backend/database');
const {crearGestorRespaldos}=require('../backend/respaldos');

test('SQLite nativo: backup WAL consistente, apertura de copia, retención y datos aislados',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cecr-real-backup-'));
  const ruta=path.join(dir,'principal.sqlite');let db;
  try {
    db=abrirBaseDatos(ruta);
    const a=db.crearPerfil({nombre:'Empresa Respaldada'});
    const data={clave:'clave-respaldo',tipoDocumento:'Factura electrónica',versionXML:'4.4',fecha:'2026-11-03',
      monedaOriginal:'CRC',tipoCambioAplicado:1,totalOriginal:113,total:113,emisor:{nombre:'Emisor'},receptor:{nombre:'Receptor'},
      impuestos:[{codigo:'01',tarifa:13,monto:13}],bases:{'13':100},nombreArchivo:'prueba.xml'};
    assert.equal(db.insertar('<xml>dato sintético</xml>',data,a.id),true);
    const gestor=crearGestorRespaldos({base:db,configuracionDir:path.join(dir,'config'),carpetaInicial:path.join(dir,'copias')});
    const backup=await gestor.crear('manual');
    const copy=new BetterSqlite(backup.ruta,{readonly:true});
    try {
      assert.equal(copy.pragma('quick_check',{simple:true}),'ok');
      assert.equal(copy.prepare('SELECT COUNT(*) cantidad FROM documentos').get().cantidad,1);
      assert.equal(copy.prepare('SELECT xml_original FROM documentos').get().xml_original,'<xml>dato sintético</xml>');
    } finally {copy.close();}
    const exportado=await gestor.guardarComo(path.join(dir,'independiente.sqlite'));
    assert.equal(exportado.guardado,true);
    assert.ok(fs.statSync(exportado.ruta).size>0);
    assert.equal(gestor.estado().copias.length,1);
    assert.throws(()=>gestor.configurar({habilitado:true,frecuencia:'diario',retener:1,carpeta:path.join(dir,'copias')}),/Cantidad/);
  } finally {if(db)db.cerrar();fs.rmSync(dir,{recursive:true,force:true});}
});
