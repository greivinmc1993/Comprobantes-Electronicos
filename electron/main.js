'use strict';
const {app, BrowserWindow, ipcMain, dialog, session, Menu} = require('electron');
const path = require('node:path');
const crypto = require('node:crypto');
const {shell} = require('electron');
const {crearGestorRespaldos} = require('../backend/respaldos');
const {abrirBaseDatos} = require('../backend/database');
const {crearAPI} = require('../backend/server');
const {crearServicioTipoCambio} = require('../backend/tipo-cambio');
const {parsearXML, procesarDocumento, identificarDocumento, datosMonedaDocumento} = require('../backend/parser');

let ventana;
let servidor;
let base;
let puerto;
let token;
let gestorRespaldos;
let servicioTipoCambio;
let temporizadorRespaldos;
const devURL = process.env.VITE_DEV_SERVER_URL || null;

// Identidad única: este programa NO debe actualizar ni reemplazar a FacturaCR.
app.setName('ComprobantesElectronicosCR');
if (process.platform === 'win32') app.setAppUserModelId('cr.comprobanteselectronicoscr.desktop');

/**
 * Base de datos exclusiva de ComprobantesElectronicosCR.
 * La app anterior FacturaCR es independiente: nunca se copian sus datos automáticamente.
 * Se mantiene la ruta propia que ComprobantesElectronicosCR utilizaba en v1.1.1.
 */
function rutaBaseDatos() {
  return path.join(app.getPath('userData'), 'comprobanteselectronicoscr.sqlite');
}

function validarEmisor(event) {
  if (!ventana || event.sender !== ventana.webContents || event.senderFrame !== ventana.webContents.mainFrame) {
    throw new Error('Solicitud no autorizada desde otra ventana o marco');
  }
  const origen = event.senderFrame.url;
  const correcto = devURL
    ? origen.startsWith('http://127.0.0.1:5173/')
    : origen.startsWith(`http://127.0.0.1:${puerto}/`);
  if (!correcto) throw new Error('Origen del mensaje no permitido');
}

async function peticionAPI(ruta, method='GET', body, headers={}) {
  const response = await fetch(`http://127.0.0.1:${puerto}${ruta}`, {
    method, headers:{Authorization:`Bearer ${token}`,...headers}, body
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `Error HTTP ${response.status}`);
  return data;
}

function registrarPuente() {
  const idValido = id => Number.isSafeInteger(id) && id > 0;
  ipcMain.handle('comprobanteselectronicoscr:tipo-cambio',async(e,forzar=false)=>{
    validarEmisor(e);
    return peticionAPI(`/api/tipo-cambio${forzar?'?actualizar=1':''}`);
  });
  ipcMain.handle('comprobanteselectronicoscr:recalcular-usd',async(e,confirmacion)=>{
    validarEmisor(e);
    if(confirmacion!=='ACTUALIZAR') throw new Error('Confirma escribiendo ACTUALIZAR');
    // Una copia válida ANTES de comenzar cualquier modificación.
    const copia=await gestorRespaldos.crear('antes-recalcular');
    const antiguos=base.documentosUSDParaRevision();
    const nuevos=[];
    for (const guardado of antiguos) {
      const parsed=await parsearXML(guardado.xml);
      const tipo=identificarDocumento(parsed);
      if(!tipo) throw new Error(`Documento ${guardado.id} no reconocido; no se modificó ningún comprobante`);
      const datos=datosMonedaDocumento(tipo.doc);
      const referencia=await servicioTipoCambio.resolverUSD(String(tipo.doc.FechaEmision||tipo.doc.FechaEmisionDocumento||''),datos.tipoCambioOriginalXML);
      const documento=procesarDocumento(parsed,guardado.nombreArchivo,guardado.xml,referencia);
      nuevos.push({id:guardado.id,documento});
    }
    const actualizados=base.actualizarRecalculados(nuevos);
    return {actualizados,respaldo:copia.ruta};
  });
  ipcMain.handle('comprobanteselectronicoscr:reparar-iva',async(e,confirmacion)=>{
    validarEmisor(e);
    if (confirmacion !== 'REPARAR IVA') throw new Error('Confirma escribiendo REPARAR IVA');
    // La corrección histórica es explícita: nunca se cambia una base antigua al abrir.
    const antiguos=base.documentosParaRevisionIVA();
    if (!antiguos.length) return {actualizados:0,respaldo:null};
    // Crear y verificar un respaldo antes de modificar un solo registro.
    const copia=await gestorRespaldos.crear('antes-recalcular');
    const nuevos=[];
    for (const guardado of antiguos) {
      const anterior=JSON.parse(guardado.datos);
      const parsed=await parsearXML(guardado.xml);
      const identificado=identificarDocumento(parsed);
      if (!identificado) throw new Error(`XML no reconocido en documento ${guardado.id}. No se modificó ninguno.`);
      const moneda=datosMonedaDocumento(identificado.doc);
      if (moneda.codigoOriginal !== anterior.monedaOriginal) {
        throw new Error(`Moneda distinta a la guardada en documento ${guardado.id}. No se modificó ninguno.`);
      }
      // NO consultar Internet ni modificar cotizaciones ya utilizadas.
      const referencia=moneda.codigoOriginal==='USD' ? {
        valor:Number(anterior.tipoCambioAplicado),
        fecha:anterior.fechaTipoCambio || String(anterior.fecha||'').slice(0,10),
        fuente:anterior.fuenteTipoCambio || 'Tipo de cambio histórico conservado',
        verificado:anterior.tipoCambioVerificado===true,
      } : null;
      const nuevo=procesarDocumento(parsed,guardado.nombreArchivo,guardado.xml,referencia);
      nuevos.push({id:guardado.id,documento:nuevo});
    }
    const actualizados=base.actualizarImpuestosHistoricos(nuevos);
    return {actualizados,respaldo:copia.ruta};
  });
  ipcMain.handle('comprobanteselectronicoscr:perfiles',async e=>{
    validarEmisor(e);
    return peticionAPI('/api/perfiles');
  });
  ipcMain.handle('comprobanteselectronicoscr:crear-perfil',async(e,datos)=>{
    validarEmisor(e);
    return peticionJSON('/api/perfiles','POST',datos);
  });
  ipcMain.handle('comprobanteselectronicoscr:editar-perfil',async(e,id,datos)=>{
    validarEmisor(e);
    if (!idValido(id)) throw new Error('Perfil inválido');
    return peticionJSON(`/api/perfiles/${id}`,'PUT',datos);
  });
  ipcMain.handle('comprobanteselectronicoscr:eliminar-perfil',async(e,id,confirmacion)=>{
    validarEmisor(e);
    if (!idValido(id)) throw new Error('Perfil inválido');
    const perfil = base.perfil(id);
    if (confirmacion?.confirmado!==true || confirmacion?.nombreConfirmacion!==perfil.nombre ||
        !['mover','eliminar'].includes(confirmacion?.modo) ||
        !Number.isSafeInteger(confirmacion?.documentosEsperados) || confirmacion.documentosEsperados<0 ||
        base.cantidad(id)!==confirmacion.documentosEsperados) {
      throw new Error('La confirmación ya no es válida. Revisa la empresa y sus comprobantes.');
    }
    // Si falla la copia, NO se borra ni la empresa ni un solo XML.
    const copia=await gestorRespaldos.crear('antes-eliminar');
    const resultado=base.eliminarPerfil(id,confirmacion);
    return {...resultado,respaldo:copia.ruta};
  });
  ipcMain.handle('comprobanteselectronicoscr:listar',async(e,perfilId)=>{
    validarEmisor(e);
    if (!idValido(perfilId)) throw new Error('Perfil inválido');
    return peticionAPI(`/api/perfiles/${perfilId}/estado`);
  });
  ipcMain.handle('comprobanteselectronicoscr:importar',async(e,perfilId,archivos)=>{
    validarEmisor(e);
    if (!idValido(perfilId)) throw new Error('Selecciona una empresa');
    if (!Array.isArray(archivos) || archivos.length<1 || archivos.length>10) throw new Error('Solo se permite un lote de 1 a 10 archivos XML');
    const form = new FormData();
    let totalBytes=0;
    for (const f of archivos) {
      if (typeof f.nombre !== 'string' || !/\.xml$/i.test(f.nombre)) throw new Error('Solo se permiten archivos XML');
      const bytes = Buffer.from(f.bytes || []);
      if (!bytes.length || bytes.length>15*1024*1024) throw new Error(`Archivo vacío o mayor de 15 MB: ${f.nombre}`);
      totalBytes += bytes.length;
      if (totalBytes>60*1024*1024) throw new Error('El lote supera 60 MB. Importa archivos en lotes más pequeños.');
      form.append('files',new Blob([bytes],{type:'application/xml'}),path.basename(f.nombre));
    }
    return peticionAPI(`/api/perfiles/${perfilId}/importar`,'POST',form);
  });
  ipcMain.handle('comprobanteselectronicoscr:eliminar',async(e,perfilId,id)=>{
    validarEmisor(e);
    if (!idValido(perfilId) || !idValido(id)) throw new Error('Identificadores inválidos');
    return peticionAPI(`/api/perfiles/${perfilId}/documentos/${id}`,'DELETE');
  });
  ipcMain.handle('comprobanteselectronicoscr:mover',async(e,perfilId,id,destinoId)=>{
    validarEmisor(e);
    if (![perfilId,id,destinoId].every(idValido)) throw new Error('Identificadores inválidos');
    return peticionJSON(`/api/perfiles/${perfilId}/documentos/${id}/mover`,'POST',{destinoPerfilId:destinoId});
  });
  ipcMain.handle('comprobanteselectronicoscr:respaldo',async(e)=>{
    validarEmisor(e);
    const fecha = new Date().toISOString().slice(0,10);
    const elegido = await dialog.showSaveDialog(ventana,{
      title:'Guardar copia de ComprobantesElectronicosCR',
      defaultPath:`ComprobantesElectronicosCR-respaldo-${fecha}.sqlite`,
      buttonLabel:'Guardar respaldo',
      filters:[{name:'Base de datos SQLite',extensions:['sqlite']}]
    });
    if (elegido.canceled || !elegido.filePath) return {guardado:false};
    return gestorRespaldos.guardarComo(elegido.filePath);
  });
  ipcMain.handle('comprobanteselectronicoscr:respaldos-estado',async e=>{
    validarEmisor(e);return gestorRespaldos.estado();
  });
  ipcMain.handle('comprobanteselectronicoscr:respaldos-configurar',async(e,datos)=>{
    validarEmisor(e);
    const actual=gestorRespaldos.estado();
    return gestorRespaldos.configurar({...datos,carpeta:actual.carpeta});
  });
  ipcMain.handle('comprobanteselectronicoscr:respaldos-carpeta',async e=>{
    validarEmisor(e);
    const elegido=await dialog.showOpenDialog(ventana,{
      title:'Carpeta de copias de seguridad',defaultPath:gestorRespaldos.estado().carpeta,
      properties:['openDirectory','createDirectory']
    });
    if(elegido.canceled||!elegido.filePaths[0]) return gestorRespaldos.estado();
    const actual=gestorRespaldos.estado();
    return gestorRespaldos.configurar({...actual,carpeta:elegido.filePaths[0]});
  });
  ipcMain.handle('comprobanteselectronicoscr:respaldos-crear',async e=>{
    validarEmisor(e);return gestorRespaldos.crear('manual');
  });
  ipcMain.handle('comprobanteselectronicoscr:respaldos-abrir-carpeta',async e=>{
    validarEmisor(e);
    const ruta=gestorRespaldos.estado().carpeta;
    require('node:fs').mkdirSync(ruta,{recursive:true});
    const error=await shell.openPath(ruta);
    if(error) throw new Error(error);
    return {abierta:true};
  });
}

async function peticionJSON(ruta,method,datos) {
  return peticionAPI(ruta,method,JSON.stringify(datos),{'Content-Type':'application/json'});
}

async function iniciar() {
  base = abrirBaseDatos(rutaBaseDatos());
  gestorRespaldos = crearGestorRespaldos({
    base,
    configuracionDir:app.getPath('userData'),
    carpetaInicial:path.join(app.getPath('documents'),'ComprobantesElectronicosCR','Respaldos')
  });
  // Actualización v1.3.3 solicitada: elimina «Sin asignar» y sus XML únicamente
  // DESPUÉS de crear y verificar una copia recuperable en la carpeta de respaldos.
  // Este procedimiento solo afecta al perfil heredado, nunca a empresas reales.
  if (base.tienePerfilLegado()) {
    let copiaLegado;
    try {
      copiaLegado=await gestorRespaldos.crear('antes-eliminar');
    } catch (error) {
      throw new Error(`No se borró «Sin asignar» porque no se pudo crear el respaldo previo. Revisa la carpeta de respaldos o sus permisos: ${error.message}`);
    }
    const resultado=base.eliminarPerfilLegado();
    console.info('Perfil heredado eliminado con respaldo:', resultado.documentosEliminados, copiaLegado.ruta);
  }
  // La app no corre en segundo plano: revisa al abrirse y mientras permanezca abierta.
  try {await gestorRespaldos.revisarAutomatico(true);} catch(e) {
    console.error('No se pudo crear el respaldo automático inicial:',e.message);
  }
  temporizadorRespaldos=setInterval(()=>{
    gestorRespaldos.revisarAutomatico(false).catch(e=>console.error('Respaldo automático:',e.message));
  },15*60*1000);
  temporizadorRespaldos.unref?.();
  token = crypto.randomBytes(32).toString('hex');
  servicioTipoCambio=crearServicioTipoCambio({base});
  const frontendDist = app.isPackaged ? path.join(__dirname,'..','dist') : null;
  const api = crearAPI(base,token,frontendDist,servicioTipoCambio);
  servidor = await new Promise((resolve,reject)=>{
    const s=api.listen(0,'127.0.0.1',()=>resolve(s));
    s.once('error',reject);
  });
  puerto = servidor.address().port;
  registrarPuente();
  session.defaultSession.setPermissionRequestHandler((_webContents,_permission,callback)=>callback(false));

  // Quitar File / Edit / View / Window / Help del menú estándar de Electron.
  Menu.setApplicationMenu(null);

  ventana = new BrowserWindow({
    title:'ComprobantesElectronicosCR — Escritorio',
    icon:path.join(__dirname,'..','build','icons','ComprobantesElectronicosCR.ico'),
    width:1380, height:850, minWidth:680, minHeight:560,
    show:false, autoHideMenuBar:true, backgroundColor:'#f4f7fb',
    webPreferences:{
      preload:path.join(__dirname,'preload.js'), contextIsolation:true,
      nodeIntegration:false, sandbox:true,
    },
  });
  ventana.setMenuBarVisibility(false);
  ventana.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  const direccion = devURL || `http://127.0.0.1:${puerto}/`;
  ventana.webContents.on('will-navigate',(event,url)=>{
    if (!url.startsWith(direccion)) event.preventDefault();
  });
  ventana.once('ready-to-show',()=>ventana.show());
  await ventana.loadURL(direccion);
}

app.whenReady().then(iniciar).catch((e)=>{
  dialog.showErrorBox('ComprobantesElectronicosCR no pudo iniciar', String(e?.message || e));
  app.quit();
});
app.on('window-all-closed',()=>app.quit());
app.on('before-quit',()=>{
  if (temporizadorRespaldos) clearInterval(temporizadorRespaldos);
  if (servidor) servidor.close();
  if (base) {try {base.cerrar();} catch(e) { /* ya cerrada */ }}
});
