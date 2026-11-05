'use strict';
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');

function crearVigilancia(configDir){
  const archivo=path.join(configDir,'vigilancia-xml.json');
  let config={carpeta:'',habilitado:false,vistos:[]};
  try {const c=JSON.parse(fs.readFileSync(archivo,'utf8'));config={...config,...c};}catch{}
  if(!Array.isArray(config.vistos))config.vistos=[];
  function guardar(){fs.mkdirSync(configDir,{recursive:true});fs.writeFileSync(archivo,JSON.stringify(config,null,2));}
  const pendientes=new Map();
  function revisar(){
    if(!config.habilitado||!config.carpeta)return estado();
    let archivos=[];
    try {archivos=fs.readdirSync(config.carpeta,{withFileTypes:true}).filter(f=>f.isFile()&&/\.xml$/i.test(f.name)).slice(0,1000);}
    catch(error){return {...estado(),error:`No se puede abrir la carpeta: ${error.message}`};}
    for(const entrada of archivos){
      const ruta=path.join(config.carpeta,entrada.name);
      let s;try{s=fs.statSync(ruta);}catch{continue;}
      if(s.size<1||s.size>15*1024*1024||Date.now()-s.mtimeMs<2000)continue;
      const id=crypto.createHash('sha256').update(`${ruta}|${s.size}|${s.mtimeMs}`).digest('hex');
      if(config.vistos.includes(id)||pendientes.has(id))continue;
      if(pendientes.size>=100)break;
      pendientes.set(id,{id,nombre:entrada.name,ruta,bytes:s.size,modificado:s.mtimeMs});
    }
    return estado();
  }
  function estado(){return {habilitado:config.habilitado,carpeta:config.carpeta,pendientes:[...pendientes.values()].map(({ruta,...v})=>v)};}
  function configurar(carpeta,habilitado){
    if(carpeta){if(!fs.statSync(carpeta).isDirectory())throw new Error('Carpeta inválida');
      if(carpeta!==config.carpeta){pendientes.clear();config.vistos=[];}
      config.carpeta=carpeta;
    }
    config.habilitado=habilitado===true;
    guardar();return revisar();
  }
  function obtenerArchivos(ids){
    if(!Array.isArray(ids)||ids.length<1||ids.length>10)throw new Error('Selecciona entre 1 y 10 archivos');
    return ids.map(id=>{
      const f=pendientes.get(id);if(!f)throw new Error('El archivo seleccionado ya no está pendiente');
      const s=fs.statSync(f.ruta);
      if(s.size!==f.bytes||s.mtimeMs!==f.modificado)throw new Error(`Archivo ${f.nombre} cambió. Vuelve a analizar la carpeta.`);
      return {nombre:f.nombre,bytes:fs.readFileSync(f.ruta)};
    });
  }
  function marcar(ids){for(const id of ids){if(pendientes.has(id)){pendientes.delete(id);config.vistos.push(id);}}
    config.vistos=config.vistos.slice(-3000);guardar();return estado();}
  return {revisar,estado,configurar,obtenerArchivos,marcar};
}
module.exports={crearVigilancia};
