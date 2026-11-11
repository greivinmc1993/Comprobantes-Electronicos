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
const {previsualizarXML} = require('../backend/previsualizacion');
const {MAX_ARCHIVOS_XML,MAX_BYTES_XML,MAX_BYTES_LOTE} = require('../backend/limites-importacion');
const {leerMensajeHacienda,resumenComprasVentas,analizarReferencias} = require('../backend/gestion');
const {crearVigilancia} = require('../backend/vigilancia');
const {validarCopia,reemplazarBaseCerrada} = require('../backend/restauracion');
const fs = require('node:fs');

let ventana;
let servidor;
let base;
let puerto;
let token;
let gestorRespaldos;
let servicioTipoCambio;
let temporizadorRespaldos;
let temporizadorVigilancia;
let vigilancia;
const preparadas=new Map(); // Solo en memoria durante 15 minutos. No se graban XML hasta confirmar.
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

function limpiarPrevisualizaciones(){
  for(const [token,v] of preparadas)if(Date.now()-v.creada>15*60*1000)preparadas.delete(token);
}
async function prepararArchivos(archivos,perfilPreferido,idsVigilancia=[]) {
  limpiarPrevisualizaciones();
  // Una vista previa a la vez: evita acumular múltiples lotes grandes en RAM.
  if(preparadas.size)preparadas.clear();
  if(!Array.isArray(archivos)||archivos.length<1||archivos.length>MAX_ARCHIVOS_XML)throw new Error(`Máximo ${MAX_ARCHIVOS_XML} XML por vista previa`);
  let total=0;
  const files=archivos.map(f=>{
    if(typeof f.nombre!=='string'||!/\.xml$/i.test(f.nombre)||f.nombre.length>255)throw new Error('Solo archivos .xml con nombre válido');
    const bytes=Buffer.from(f.bytes||[]);
    if(!bytes.length||bytes.length>MAX_BYTES_XML)throw new Error('Archivo vacío o mayor de 15 MB');
    total+=bytes.length;
    return {nombre:f.nombre,bytes};
  });
  if(total>MAX_BYTES_LOTE)throw new Error('El lote supera 256 MB');
  const vista=await previsualizarXML(files,base.perfiles(),base,servicioTipoCambio,perfilPreferido);
  const tokenVista=crypto.randomUUID();
  preparadas.set(tokenVista,{creada:Date.now(),contenidos:vista.contenidos,filas:vista.filas,idsVigilancia});
  return {token:tokenVista,filas:vista.filas,limite:MAX_ARCHIVOS_XML};
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
  ipcMain.handle('comprobanteselectronicoscr:previsualizar',async(e,perfilId,archivos)=>{
    validarEmisor(e);return prepararArchivos(archivos,perfilId);
  });
  ipcMain.handle('comprobanteselectronicoscr:confirmar-importacion',async(e,tokenVista,selecciones)=>{
    validarEmisor(e);limpiarPrevisualizaciones();
    const vista=preparadas.get(tokenVista);
    if(!vista)throw new Error('La vista previa expiró. Selecciona los archivos nuevamente.');
    if(!Array.isArray(selecciones)||!selecciones.length||selecciones.length>MAX_ARCHIVOS_XML)throw new Error('Selecciona los comprobantes');
    const vistos=new Set();
    const items=selecciones.map(s=>{
      if(!Number.isSafeInteger(s.indice)||vistos.has(s.indice))throw new Error('Documento repetido en la selección');
      vistos.add(s.indice);
      const fila=vista.filas[s.indice],cont=vista.contenidos[s.indice];
      if(!fila||!cont||fila.estado==='error'||fila.estado==='duplicado_en_lote')throw new Error('El documento no pasó la revisión');
      if(!Number.isSafeInteger(s.perfilId)||s.perfilId<=0)throw new Error('Selecciona una empresa por documento');
      return {...cont,perfilId:s.perfilId};
    });
    // Agregar es atómico en SQLite. Evitamos el segundo clic con la misma vista.
    preparadas.delete(tokenVista);
    const resultado=base.importarLote(items);
    if(vista.idsVigilancia.length)vigilancia.marcar(selecciones.map(x=>vista.idsVigilancia[x.indice]).filter(Boolean));
    return resultado;
  });
  ipcMain.handle('comprobanteselectronicoscr:deshacer-importacion',async(e,id,confirmacion)=>{
    validarEmisor(e);
    if(confirmacion!=='DESHACER')throw new Error('Confirma escribiendo DESHACER');
    const copia=await gestorRespaldos.crear('antes-eliminar');
    return {...base.deshacerUltimoLote(id),respaldo:copia.ruta};
  });
  ipcMain.handle('comprobanteselectronicoscr:ultimo-lote',async e=>{
    validarEmisor(e);return base.ultimoLote();
  });
  ipcMain.handle('comprobanteselectronicoscr:gestion-contable',async(e,perfilId)=>{
    validarEmisor(e);
    const perfil=base.perfil(perfilId),docs=base.listar(perfil.id);
    return {resumen:resumenComprasVentas(docs,perfil),conciliaciones:analizarReferencias(docs)};
  });
  ipcMain.handle('comprobanteselectronicoscr:auditoria',async e=>{
    validarEmisor(e);return base.historialAuditoria();
  });
  ipcMain.handle('comprobanteselectronicoscr:mensajes-hacienda',async(e,perfilId)=>{
    validarEmisor(e);return base.mensajesHacienda(perfilId);
  });
  ipcMain.handle('comprobanteselectronicoscr:importar-mensajes',async(e,archivos)=>{
    validarEmisor(e);
    if(!Array.isArray(archivos)||archivos.length<1||archivos.length>10)throw new Error('Máximo 10 mensajes por importación');
    let nuevos=0,duplicados=0;const errores=[];
    for(const archivo of archivos){
      try{
        const bytes=Buffer.from(archivo.bytes||[]);
        if(bytes.length<1||bytes.length>MAX_BYTES_XML)throw new Error('Archivo vacío o grande');
        const mensaje=await leerMensajeHacienda(bytes.toString('utf8'),archivo.nombre);
        if(base.registrarMensajeHacienda(mensaje))nuevos++;else duplicados++;
      }catch(error){errores.push({archivo:archivo.nombre,error:error.message});}
    }
    return {nuevos,duplicados,errores};
  });
  ipcMain.handle('comprobanteselectronicoscr:vigilancia-estado',async e=>{
    validarEmisor(e);return vigilancia.revisar();
  });
  ipcMain.handle('comprobanteselectronicoscr:vigilancia-configurar',async(e,habilitado)=>{
    validarEmisor(e);
    const seleccionado=await dialog.showOpenDialog(ventana,{title:'Seleccionar carpeta de XML',properties:['openDirectory']});
    if(seleccionado.canceled||!seleccionado.filePaths[0])return vigilancia.estado();
    return vigilancia.configurar(seleccionado.filePaths[0],habilitado===true);
  });
  ipcMain.handle('comprobanteselectronicoscr:vigilancia-habilitar',async(e,habilitado)=>{
    validarEmisor(e);return vigilancia.configurar(null,habilitado===true);
  });
  ipcMain.handle('comprobanteselectronicoscr:vigilancia-previsualizar',async(e,perfilId,ids)=>{
    validarEmisor(e);
    const files=vigilancia.obtenerArchivos(ids);
    return prepararArchivos(files,perfilId,ids);
  });
  ipcMain.handle('comprobanteselectronicoscr:respaldo-validar',async e=>{
    validarEmisor(e);
    const elegido=await dialog.showOpenDialog(ventana,{title:'Selecciona un respaldo SQLite para revisar',
      filters:[{name:'SQLite',extensions:['sqlite','db']}],properties:['openFile']});
    if(elegido.canceled||!elegido.filePaths[0])return {cancelado:true};
    const ruta=elegido.filePaths[0];
    const meta=validarCopia(ruta);
    // Token interno: no aceptamos rutas elegidas por texto desde la interfaz.
    const tokenRestauracion=crypto.randomUUID();
    preparadas.set(tokenRestauracion,{tipo:'respaldo',ruta,creada:Date.now()});
    return {token:tokenRestauracion,archivo:path.basename(ruta),...meta};
  });
  ipcMain.handle('comprobanteselectronicoscr:respaldo-restaurar',async(e,tokenRestauracion,frase)=>{
    validarEmisor(e);
    if(frase!=='RESTAURAR')throw new Error('Escribe RESTAURAR para confirmar');
    const etapa=preparadas.get(tokenRestauracion);
    if(etapa?.tipo!=='respaldo'||Date.now()-etapa.creada>15*60*1000)throw new Error('Selecciona nuevamente el respaldo');
    validarCopia(etapa.ruta);
    const copiaEmergencia=await gestorRespaldos.crear('antes-restaurar');
    preparadas.delete(tokenRestauracion);
    // Cerrar SQLite antes de reemplazar archivos; Electron reinicia el proceso
    // para que la API no conserve una referencia a la conexión antigua.
    await new Promise(resolve=>servidor?.close(resolve)||resolve());servidor=null;
    base.cerrar();base=null;
    try{
      reemplazarBaseCerrada(etapa.ruta,rutaBaseDatos());
      app.relaunch();app.quit();
      return {reiniciando:true,respaldoEmergencia:copiaEmergencia.ruta};
    }catch(error){
      // Si no se pudo restaurar, reabrir solo después de reiniciar.
      app.relaunch();app.quit();
      throw new Error(`No se restauró: ${error.message}. Respaldo de emergencia: ${copiaEmergencia.ruta}`);
    }
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
    if (!Array.isArray(archivos) || archivos.length<1 || archivos.length>MAX_ARCHIVOS_XML) throw new Error(`Solo se permite un lote de 1 a ${MAX_ARCHIVOS_XML} archivos XML`);
    const form = new FormData();
    let totalBytes=0;
    for (const f of archivos) {
      if (typeof f.nombre !== 'string' || !/\.xml$/i.test(f.nombre)) throw new Error('Solo se permiten archivos XML');
      const bytes = Buffer.from(f.bytes || []);
      if (!bytes.length || bytes.length>MAX_BYTES_XML) throw new Error(`Archivo vacío o mayor de 15 MB: ${f.nombre}`);
      totalBytes += bytes.length;
      if (totalBytes>MAX_BYTES_LOTE) throw new Error('El lote supera 256 MB. Reduce la selección para proteger la memoria.');
      form.append('files',new Blob([bytes],{type:'application/xml'}),path.basename(f.nombre));
    }
    return peticionAPI(`/api/perfiles/${perfilId}/importar`,'POST',form);
  });
  ipcMain.handle('comprobanteselectronicoscr:marcar-gasto-administrativo',async(e,perfilId,documentoId,habilitado,montoManual)=>{
    validarEmisor(e);
    if (![perfilId,documentoId].every(idValido) || typeof habilitado !== 'boolean')
      throw new Error('Datos de clasificación inválidos');
    return peticionJSON(`/api/perfiles/${perfilId}/documentos/${documentoId}/gasto-administrativo`,
      'PATCH',{habilitado,montoManual});
  });
  ipcMain.handle('comprobanteselectronicoscr:clasificar-gastos-comercio',async(e,perfilId,clave,habilitado,cantidadEsperada,confirmado)=>{
    validarEmisor(e);
    if (!idValido(perfilId) || confirmado!==true || typeof habilitado!=='boolean')
      throw new Error('Confirma la clasificación por comercio en la empresa seleccionada');
    const grupo=base.comerciosGastos(perfilId).find(g=>g.clave===clave);
    const pendiente=habilitado?grupo?.pendientes:grupo?.marcados;
    if(!grupo || !Number.isSafeInteger(cantidadEsperada) || cantidadEsperada<1 || pendiente!==cantidadEsperada)
      throw new Error('La cantidad de comprobantes cambió. Revisa el comercio y confirma nuevamente.');
    // No modificar cientos de comprobantes sin una copia recuperable y verificada.
    const copia=await gestorRespaldos.crear('antes-clasificar');
    return {...base.clasificarGastosPorComercio(perfilId,clave,habilitado,cantidadEsperada),respaldo:copia.ruta};
  });
  ipcMain.handle('comprobanteselectronicoscr:papelera-listar',async e=>{
    validarEmisor(e);return {documentos:base.listarPapelera()};
  });
  ipcMain.handle('comprobanteselectronicoscr:papelera-enviar',async(e,perfilId,ids)=>{
    validarEmisor(e);
    if(!idValido(perfilId) || !Array.isArray(ids)) throw new Error('Empresa o selección inválida');
    // Si falla el respaldo verificado, no se mueve nada de los documentos activos.
    const copia=await gestorRespaldos.crear('antes-eliminar');
    return {...base.enviarPapelera(perfilId,ids),respaldo:copia.ruta};
  });
  ipcMain.handle('comprobanteselectronicoscr:papelera-restaurar',async(e,ids,destinoPerfilId)=>{
    validarEmisor(e);
    if(!Array.isArray(ids) || !idValido(destinoPerfilId)) throw new Error('Selección o destino inválido');
    const copia=await gestorRespaldos.crear('antes-eliminar');
    return {...base.restaurarPapelera(ids,destinoPerfilId),respaldo:copia.ruta};
  });
  ipcMain.handle('comprobanteselectronicoscr:mover-lote',async(e,perfilId,ids,destinoId)=>{
    validarEmisor(e);
    if(!idValido(perfilId) || !Array.isArray(ids) || !idValido(destinoId)) throw new Error('Empresa o destino inválido');
    const copia=await gestorRespaldos.crear('antes-eliminar');
    return {...base.moverLote(perfilId,ids,destinoId),respaldo:copia.ruta};
  });
  ipcMain.handle('comprobanteselectronicoscr:eliminar',async(e,perfilId,id)=>{
    validarEmisor(e);
    if (!idValido(perfilId) || !idValido(id)) throw new Error('Identificadores inválidos');
    const copia=await gestorRespaldos.crear('antes-eliminar');
    return {...base.enviarPapelera(perfilId,[id]),respaldo:copia.ruta};
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
  vigilancia=crearVigilancia(app.getPath('userData'));
  vigilancia.revisar();
  temporizadorVigilancia=setInterval(()=>vigilancia.revisar(),45*1000);
  temporizadorVigilancia.unref?.();
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
  if (temporizadorVigilancia) clearInterval(temporizadorVigilancia);
  if (servidor) servidor.close();
  if (base) {try {base.cerrar();} catch(e) { /* ya cerrada */ }}
});
