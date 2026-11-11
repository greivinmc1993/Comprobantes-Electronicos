'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const PREFIJO = 'ComprobantesElectronicosCR';
const FRECUENCIAS = ['inicio', 'diario', 'semanal'];
const TIPOS = ['automatico', 'manual', 'antes-eliminar', 'antes-recalcular', 'antes-restaurar', 'antes-clasificar'];
const ARCHIVO = new RegExp(`^${PREFIJO}-(automatico|manual|antes-eliminar|antes-recalcular|antes-restaurar|antes-clasificar)-[0-9TZ_.-]+-[0-9a-f]{8}\\.sqlite$`);

function validarConfiguracion(entrada, carpetaAnterior) {
  const habilitado = entrada?.habilitado === true;
  const frecuencia = String(entrada?.frecuencia || 'diario');
  const retener = Number(entrada?.retener ?? 14);
  const carpeta = String(entrada?.carpeta || carpetaAnterior || '').trim();
  if (!FRECUENCIAS.includes(frecuencia)) throw new Error('Frecuencia de respaldo inválida');
  if (![5, 14, 30, 60].includes(retener)) throw new Error('Cantidad de copias inválida');
  if (!carpeta || !path.isAbsolute(carpeta)) throw new Error('Selecciona una carpeta válida y absoluta');
  return {habilitado, frecuencia, retener, carpeta:path.normalize(carpeta)};
}

function necesitaRespaldo(frecuencia, ultimaCopia, ahora = Date.now(), alIniciar = false) {
  if (frecuencia === 'inicio') return Boolean(alIniciar);
  if (!ultimaCopia) return true;
  const ms = frecuencia === 'semanal' ? 7 * 86400000 : 86400000;
  return ahora - new Date(ultimaCopia).getTime() >= ms;
}

/** Respaldo online de SQLite (funciona con WAL), sin copiar el .sqlite abierto con fs.copyFile. */
function crearGestorRespaldos({base, configuracionDir, carpetaInicial, verificar}) {
  fs.mkdirSync(configuracionDir,{recursive:true});
  const rutaConfig = path.join(configuracionDir, 'respaldos-config.json');
  const defecto = {habilitado:true, frecuencia:'diario', retener:14, carpeta:carpetaInicial};
  let opciones = defecto;
  let ultimoError = '';
  try {
    if (fs.existsSync(rutaConfig)) {
      const leido=JSON.parse(fs.readFileSync(rutaConfig,'utf8'));
      opciones=validarConfiguracion({...defecto,...leido},carpetaInicial);
      ultimoError=String(leido.ultimoError||'');
    }
  } catch(error) {
    ultimoError=`No se pudo leer la configuración anterior: ${error.message}`;
    opciones=defecto;
  }
  let cola = Promise.resolve();
  const serial = accion => {
    const ejecucion = cola.then(accion,accion);
    cola = ejecucion.catch(()=>{});
    return ejecucion;
  };
  const persistir = () => {
    fs.mkdirSync(configuracionDir,{recursive:true});
    const temporal = `${rutaConfig}.${process.pid}.tmp`;
    try {
      fs.writeFileSync(temporal,JSON.stringify({...opciones,ultimoError},null,2),{encoding:'utf8',mode:0o600});
      fs.renameSync(temporal,rutaConfig);
    } catch(err) {try{fs.rmSync(temporal,{force:true});}catch{}throw err;}
  };
  function copias() {
    if (!fs.existsSync(opciones.carpeta)) return [];
    return fs.readdirSync(opciones.carpeta,{withFileTypes:true})
      .filter(x=>x.isFile() && ARCHIVO.test(x.name))
      .map(x=>{
        const ruta=path.join(opciones.carpeta,x.name);
        const st=fs.statSync(ruta);
        return {nombre:x.name,tipo:x.name.slice(PREFIJO.length+1).split('-').slice(0,-1).join('-'),ruta,
          fecha:st.mtime.toISOString(),bytes:st.size};
      }).sort((a,b)=>b.fecha.localeCompare(a.fecha));
  }
  // Nombre de tipo se extrae por prefijos para admitir respaldo de emergencia con guiones.
  function listar() {
    return copias().map(c=>({...c,tipo:TIPOS.find(t=>c.nombre.startsWith(`${PREFIJO}-${t}-`)) || c.tipo}));
  }
  function estado() {
    const lista=listar();
    const ultimaAuto=lista.find(c=>c.tipo==='automatico');
    return {...opciones,ultimoError,ultimaAutomatica:ultimaAuto?.fecha || null,
      ultimaCopia:lista[0]?.fecha||null,copias:lista.slice(0,60)};
  }
  function verificarArchivo(ruta) {
    if (verificar) return verificar(ruta);
    const SQLite=require('better-sqlite3');
    const db=new SQLite(ruta,{readonly:true,fileMustExist:true});
    try {
      const r=db.pragma('quick_check',{simple:true});
      if (r!=='ok') throw new Error(`La copia no superó el control SQLite: ${String(r)}`);
      const tablas=db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name IN ('perfiles','documentos')").get();
      if (tablas.n!==2) throw new Error('La copia no contiene las tablas esperadas');
    } finally {db.close();}
  }
  async function crear(tipo='manual') {
    if (!TIPOS.includes(tipo)) throw new Error('Tipo de respaldo no permitido');
    return serial(async()=>{
      fs.mkdirSync(opciones.carpeta,{recursive:true});
      const marca=new Date().toISOString().replace(/:/g,'-').replace(/\./g,'_');
      const nombre=`${PREFIJO}-${tipo}-${marca}-${crypto.randomBytes(4).toString('hex')}.sqlite`;
      const destino=path.join(opciones.carpeta,nombre);
      const temporal=destino+'.partial';
      try {
        await base.respaldo(temporal);
        verificarArchivo(temporal);
        fs.renameSync(temporal,destino);
        // La retención afecta SOLO los respaldos automáticos, nunca los de emergencia.
        if (tipo==='automatico') {
          const autos=listar().filter(c=>c.tipo==='automatico');
          for (const antiguo of autos.slice(opciones.retener)) fs.unlinkSync(antiguo.ruta);
        }
        ultimoError='';persistir();
        return {guardado:true,ruta:destino,nombre,fecha:new Date().toISOString()};
      } catch(error) {
        try {fs.rmSync(temporal,{force:true});} catch {}
        ultimoError=`Último respaldo fallido: ${error.message}`;
        try {persistir();}catch{}
        throw error;
      }
    });
  }
  async function guardarComo(destino) {
    if(!path.isAbsolute(destino)||path.extname(destino).toLowerCase()!=='.sqlite') throw new Error('Elige un archivo .sqlite válido');
    if(path.resolve(destino)===path.resolve(base.ruta)) throw new Error('No se puede sobrescribir la base de datos en uso');
    if(fs.existsSync(destino)) throw new Error('Este archivo ya existe. Elige un nombre nuevo para conservar el respaldo anterior.');
    return serial(async()=>{
      const tmp=destino+'.partial';
      try {await base.respaldo(tmp);verificarArchivo(tmp);fs.renameSync(tmp,destino);return {guardado:true,ruta:destino};}
      catch(e){try{fs.rmSync(tmp,{force:true});}catch{}throw e;}
    });
  }
  function configurar(nuevas) {
    opciones=validarConfiguracion(nuevas,opciones.carpeta);
    persistir();
    return estado();
  }
  async function revisarAutomatico(alIniciar=false) {
    if(!opciones.habilitado) return {realizado:false};
    const ultima=listar().find(c=>c.tipo==='automatico')?.fecha;
    if(!necesitaRespaldo(opciones.frecuencia,ultima,Date.now(),alIniciar)) return {realizado:false};
    return crear('automatico');
  }
  return {estado, configurar, crear, guardarComo, revisarAutomatico};
}
module.exports={crearGestorRespaldos, validarConfiguracion, necesitaRespaldo};
