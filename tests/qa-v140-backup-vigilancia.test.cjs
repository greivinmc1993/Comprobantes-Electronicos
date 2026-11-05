'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {crearVigilancia}=require('../backend/vigilancia');
const {validarCopia,reemplazarBaseCerrada}=require('../backend/restauracion');
const {abrirBaseDatos}=require('../backend/database');
const dir=()=>fs.mkdtempSync(path.join(os.tmpdir(),'cecr-v140-backup-'));
test('Vigilancia: pendientes sin importar, no admite archivos mayores y los marca procesados',()=>{
 const carpeta=dir();try{const config=path.join(carpeta,'config');const xmlDir=path.join(carpeta,'xml');fs.mkdirSync(xmlDir);
 fs.writeFileSync(path.join(xmlDir,'valido.xml'),'<FacturaElectronica/>');
 fs.writeFileSync(path.join(xmlDir,'malo.txt'),'ignorar');
 const v=crearVigilancia(config);v.configurar(xmlDir,true);
 const anterior=new Date(Date.now()-10_000);fs.utimesSync(path.join(xmlDir,'valido.xml'),anterior,anterior);
 const data=v.revisar();assert.equal(data.pendientes.length,1);
 const id=data.pendientes[0].id;assert.equal(v.obtenerArchivos([id])[0].nombre,'valido.xml');
 assert.equal(v.marcar([id]).pendientes.length,0);
 assert.equal(crearVigilancia(config).revisar().pendientes.length,0);
 }finally{fs.rmSync(carpeta,{recursive:true,force:true});}
});
test('Respaldo: rechaza archivo aleatorio y comprueba esquema e integridad antes de reemplazo',()=>{
 const carpeta=dir();let db;try{const actual=path.join(carpeta,'actual.sqlite'),copia=path.join(carpeta,'copia.sqlite');
 fs.writeFileSync(path.join(carpeta,'invalida.sqlite'),'no es SQLite');
 assert.throws(()=>validarCopia(path.join(carpeta,'invalida.sqlite')));
 db=abrirBaseDatos(actual);db.crearPerfil({nombre:'Empresa de origen'});db.cerrar();db=null;
 fs.copyFileSync(actual,copia);assert.equal(validarCopia(copia).empresas,1);
 const resultado=reemplazarBaseCerrada(copia,actual);assert.equal(resultado.restaurado,true);
 assert.ok(fs.existsSync(resultado.copiaAnterior));
 db=abrirBaseDatos(actual);assert.equal(db.perfiles().length,1);
 }finally{if(db)db.cerrar();fs.rmSync(carpeta,{recursive:true,force:true});}
});
test('Gestor de respaldos admite copias de emergencia antes de restaurar',async()=>{
 const carpeta=dir();let db;
 try{db=abrirBaseDatos(path.join(carpeta,'actual.sqlite'));
  const {crearGestorRespaldos}=require('../backend/respaldos');
  const gestor=crearGestorRespaldos({base:db,configuracionDir:path.join(carpeta,'cfg'),carpetaInicial:path.join(carpeta,'respaldos')});
  const res=await gestor.crear('antes-restaurar');assert.ok(fs.existsSync(res.ruta));
  assert.equal(validarCopia(res.ruta).empresas,0);
  assert.ok(gestor.estado().copias.some(c=>c.tipo==='antes-restaurar'));
 }finally{if(db)db.cerrar();fs.rmSync(carpeta,{recursive:true,force:true});}
});
