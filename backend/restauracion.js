'use strict';
const fs=require('node:fs');
const path=require('node:path');
const Database=require('better-sqlite3');

function validarCopia(ruta){
  if(!ruta||!fs.existsSync(ruta)||fs.statSync(ruta).size<100)throw new Error('Selecciona un respaldo SQLite no vacío');
  const header=Buffer.alloc(16);const fd=fs.openSync(ruta,'r');try{fs.readSync(fd,header,0,16,0);}finally{fs.closeSync(fd);}
  if(header.toString('ascii')!=='SQLite format 3\u0000')throw new Error('El archivo no es una base SQLite');
  const prueba=new Database(ruta,{readonly:true,fileMustExist:true});
  try{
    const ok=prueba.pragma('quick_check');
    if(!Array.isArray(ok)||ok[0]?.quick_check!=='ok')throw new Error('SQLite informa errores de integridad');
    const tablas=prueba.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r=>r.name);
    for(const tabla of ['perfiles','documentos'])if(!tablas.includes(tabla))throw new Error(`El respaldo no contiene la tabla ${tabla}`);
    const cols=prueba.pragma('table_info(documentos)').map(r=>r.name);
    if(!['perfil_id','xml_original','datos_json'].every(c=>cols.includes(c)))throw new Error('El respaldo no tiene la estructura requerida');
    if(tablas.includes('metadatos_aplicacion')) {
      const identidad=prueba.prepare("SELECT valor FROM metadatos_aplicacion WHERE clave='identidad'").get()?.valor;
      if(identidad!=='cr.comprobanteselectronicoscr.desktop')throw new Error('La copia pertenece a otra aplicación');
    }
    const inconsistencias=prueba.pragma('foreign_key_check');
    if(Array.isArray(inconsistencias)&&inconsistencias.length)throw new Error('El respaldo contiene referencias SQLite inválidas');
    const empresas=prueba.prepare('SELECT COUNT(*) AS n FROM perfiles').get().n;
    const documentos=prueba.prepare('SELECT COUNT(*) AS n FROM documentos').get().n;
    return {empresas,documentos,bytes:fs.statSync(ruta).size};
  }finally{prueba.close();}
}

function reemplazarBaseCerrada(origen,destino){
  const carpeta=path.dirname(destino);
  fs.mkdirSync(carpeta,{recursive:true});
  const temp=path.join(carpeta,`.restaurando-${process.pid}.sqlite`);
  const anterior=`${destino}.previo-restauracion-${Date.now()}`;
  if(path.resolve(origen)===path.resolve(destino))throw new Error('La fuente no puede ser la base activa');
  fs.copyFileSync(origen,temp);
  try {
    validarCopia(temp);
    if(fs.existsSync(anterior))throw new Error('Existe un respaldo de recuperación pendiente; revisa su ubicación');
    if(fs.existsSync(destino))fs.renameSync(destino,anterior);
    try {fs.renameSync(temp,destino);}
    catch(error){if(fs.existsSync(anterior))fs.renameSync(anterior,destino);throw error;}
    return {restaurado:true,copiaAnterior:fs.existsSync(anterior)?anterior:null};
  }finally{if(fs.existsSync(temp))fs.unlinkSync(temp);}
}
module.exports={validarCopia,reemplazarBaseCerrada};
