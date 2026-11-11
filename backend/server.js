'use strict';
const express = require('express');
const multer = require('multer');
const {MAX_ARCHIVOS_XML} = require('./limites-importacion');
const path = require('node:path');
const {TASAS, TIPOS_DOCUMENTO, crearTotales, parsearXML, procesarDocumento, identificarDocumento, datosMonedaDocumento} = require('./parser');

function crearAPI(base, token, rutaFrontend, servicioTipoCambio) {
  const api = express();
  api.disable('x-powered-by');
  api.use((req,res,next)=>{res.set('Cache-Control','no-store'); next();});
  if (rutaFrontend) {
    api.use((req,res,next)=>{
      res.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
      next();
    });
    api.use(express.static(rutaFrontend));
  }
  const auth = (req,res,next)=>{
    if (req.get('Authorization') !== `Bearer ${token}`) return res.status(403).json({error:'Acceso denegado'});
    next();
  };
  api.use('/api',auth);
  api.use('/api',express.json({limit:'32kb'}));
  const upload = multer({storage:multer.memoryStorage(),limits:{fileSize:15*1024*1024,files:MAX_ARCHIVOS_XML}});
  const valid = fn => (req,res)=>{
    try {res.json(fn(req,res));}
    catch(e) {res.status(400).json({error:e.message || 'Solicitud inválida'});}
  };

  function resumenHistorico(perfilId) {
    const perfil = base.perfil(perfilId);
    const iva = crearTotales(), bases = crearTotales();
    const documentos = Object.fromEntries(Object.values(TIPOS_DOCUMENTO).map(x=>[x.nombre,0]));
    const facturas = base.listar(perfil.id);
    let totalNeto = 0;
    for (const f of facturas) {
      totalNeto += Number(f.total) || 0;
      documentos[f.tipoDocumento] = (documentos[f.tipoDocumento] || 0) + 1;
      for (const imp of f.impuestos || []) {
        if (imp.codigo !== '01') continue;
        const tasa = String(imp.tarifa);
        if (tasa in iva) iva[tasa] += Number(imp.monto) || 0;
      }
      for (const tasa of TASAS) bases[tasa] += Number(f.bases?.[tasa]) || 0;
    }
    return {perfil, iva, base:bases, totalNeto, documentos, facturas,
      comerciosGastos:base.comerciosGastos(perfil.id), errores:[]};
  }

  api.get('/api/tipo-cambio',async(req,res)=>{
    try {res.json(await servicioTipoCambio.vigente({forzar:req.query.actualizar==='1'}));}
    catch(error) {res.status(503).json({error:error.message});}
  });
  api.get('/api/perfiles',valid(()=>({perfiles:base.perfiles()})));
  api.post('/api/perfiles',valid(req=>({perfil:base.crearPerfil(req.body)})));
  api.put('/api/perfiles/:id',valid(req=>({perfil:base.actualizarPerfil(Number(req.params.id),req.body)})));
  // Las empresas solo se eliminan mediante Electron, tras respaldo y confirmación reforzada.
  api.get('/api/perfiles/:id/estado',valid(req=>resumenHistorico(Number(req.params.id))));

  api.post('/api/perfiles/:id/importar',upload.array('files',MAX_ARCHIVOS_XML),async(req,res)=>{
    let perfil;
    try {perfil = base.perfil(Number(req.params.id));}
    catch(e) {return res.status(400).json({error:e.message});}
    const errores = [], avisos = [];
    let nuevos = 0, duplicados = 0;
    for (const file of req.files || []) {
      try {
        if (!file.originalname.toLowerCase().endsWith('.xml')) throw new Error('Solo se permiten archivos .xml');
        const xml = file.buffer.toString('utf8');
        const parsed = await parsearXML(xml);
        const identificado=identificarDocumento(parsed);
        if(!identificado) throw new Error('Tipo de comprobante no admitido');
        const moneda=datosMonedaDocumento(identificado.doc);
        const referencia=moneda.codigoOriginal==='USD'
          ? await servicioTipoCambio.resolverUSD(String(identificado.doc.FechaEmision||identificado.doc.FechaEmisionDocumento||''),moneda.tipoCambioOriginalXML)
          : null;
        const doc = procesarDocumento(parsed,file.originalname,xml,referencia);
        if (referencia?.advertencia) {
          // Se informa sin marcar el comprobante como rechazado.
          avisos.push({archivo:file.originalname,mensaje:`Se aplicó el cambio del XML: ${referencia.advertencia}`});
        }
        if (base.insertar(xml,doc,perfil.id)) {
          nuevos++;
          if (doc.observacionesFiscales?.length) {
            avisos.push({archivo:file.originalname,
              mensaje:`${doc.observacionesFiscales.length} línea(s) con redondeo fiscal conciliado; se conservaron los importes originales del XML.`});
          }
        } else duplicados++;
      } catch(e) {errores.push({archivo:file.originalname,mensaje:e.message});}
    }
    res.json({perfil:perfil.id,importacion:{nuevos,duplicados},errores,avisos});
  });

  // La clasificación voluntaria nunca cambia los impuestos ni el XML original.
  api.patch('/api/perfiles/:perfilId/documentos/:id/gasto-administrativo',valid(req=>({
    resultado: base.marcarGastoAdministrativo(Number(req.params.perfilId), Number(req.params.id),
      req.body?.habilitado, req.body?.montoManual ?? null)
  })));
  api.delete('/api/perfiles/:perfilId/documentos/:id',valid(req=>({
    eliminado:base.eliminar(Number(req.params.id),Number(req.params.perfilId))
  })));
  api.post('/api/perfiles/:perfilId/documentos/:id/mover',valid(req=>({
    movido:base.mover(Number(req.params.id),Number(req.params.perfilId),Number(req.body?.destinoPerfilId))
  })));

  // Compatibility-only fallback for current tests and pre-existing renderer clients.
  api.get('/api/estado',valid(()=>{
    const primero=base.perfiles()[0];
    if (!primero) return {perfil:null,iva:crearTotales(),base:crearTotales(),totalNeto:0,documentos:{},facturas:[],errores:[]};
    return resumenHistorico(primero.id);
  }));
  api.post('/api/importar',upload.array('files',MAX_ARCHIVOS_XML),(req,res)=>res.status(410).json({error:'Selecciona un perfil antes de importar'}));

  api.use('/api',(req,res)=>res.status(404).json({error:'Ruta API desconocida'}));
  if (rutaFrontend) api.get('*',(req,res)=>res.sendFile(path.join(rutaFrontend,'index.html')));
  api.use((error,req,res,next)=>{
    if (error?.code === 'LIMIT_FILE_SIZE') return res.status(413).json({error:'XML demasiado grande (máximo 15 MB por archivo)'});
    res.status(400).json({error:error?.message || 'Error al procesar solicitud'});
  });
  return api;
}
module.exports = {crearAPI};
