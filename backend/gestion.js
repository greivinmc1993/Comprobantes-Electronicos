'use strict';
// Reglas contables: no modifica XML ni determina aceptación fiscal por inferencia.
const {normalizarIdentificacion} = require('./identificaciones');
const crypto = require('node:crypto');

function clasificarDocumento(documento, perfil) {
  if(documento?.tipoDocumento==='Recibo electrónico de pago')return 'Pago / revisar';
  const cedula = normalizarIdentificacion(perfil?.cedula);
  if (!cedula) return 'Sin clasificar';
  const emisor = normalizarIdentificacion(documento?.emisor?.identificacion?.numero);
  const receptor = normalizarIdentificacion(documento?.receptor?.identificacion?.numero);
  if (emisor === cedula && receptor === cedula) return 'Revisar';
  if (emisor === cedula) return 'Venta';
  if (receptor === cedula) return 'Compra';
  return 'Ajeno a la empresa';
}

function resumenComprasVentas(documentos,perfil) {
  const resumen={Venta:{cantidad:0,total:0,iva:0,base:0},Compra:{cantidad:0,total:0,iva:0,base:0},
    'Pago / revisar':{cantidad:0,total:0,iva:0,base:0},'Sin clasificar':{cantidad:0,total:0,iva:0,base:0},Revisar:{cantidad:0,total:0,iva:0,base:0},'Ajeno a la empresa':{cantidad:0,total:0,iva:0,base:0}};
  for(const doc of documentos) {
    const tipo=clasificarDocumento(doc,perfil);
    const fila=resumen[tipo];
    fila.cantidad++;
    fila.total+=Number(doc.total)||0;
    fila.iva+=(doc.impuestos||[]).filter(i=>i.codigo==='01').reduce((s,i)=>s+(Number(i.monto)||0),0);
    fila.base+=Object.values(doc.bases||{}).reduce((s,v)=>s+(Number(v)||0),0);
  }
  return resumen;
}

function analizarReferencias(documentos) {
  const porClave=new Map(documentos.filter(d=>d.clave).map(d=>[String(d.clave).trim(),d]));
  return documentos.filter(d=>d.tipoDocumento==='Nota de crédito'||d.tipoDocumento==='Nota de débito').map(doc=>{
    const referencias=(doc.referencias||[]).map(r=>({clave:String(r.Numero||'').trim(),codigo:String(r.Codigo||''),razon:String(r.Razon||'')}));
    const encontrado=referencias.map(r=>({r,original:porClave.get(r.clave)})).find(x=>x.original);
    const original=encontrado?.original||null;
    const monto=Number(doc.total)||0;
    const compara=original?Math.abs(Math.abs(monto)-Math.abs(Number(original.total)||0))<=0.01:false;
    return {id:doc.id,numero:doc.consecutivo||doc.clave,tipo:doc.tipoDocumento,importe:monto,
      claveReferencia:referencias[0]?.clave||'',referenciaEnEmpresa:Boolean(original),
      documentoOriginal:original?.consecutivo||original?.clave||null,
      estado:original?(compara?'Coincidencia total de importe':'Coincidencia parcial de importe'):'Referencia no encontrada en el perfil',
      advertencia:'La coincidencia no equivale a una validación de anulación por Hacienda.'};
  });
}

async function leerMensajeHacienda(xml,archivo) {
  if(typeof xml!=='string'||xml.length>15*1024*1024) throw new Error('XML de respuesta inválido o demasiado grande');
  const {parsearXML}=require('./parser');
  const parsed=await parsearXML(xml);
  const root=parsed.MensajeHacienda;
  if (!root || typeof root !== 'object') throw new Error('Se esperaba un XML MensajeHacienda');
  const clave=String(root.Clave||'').trim();
  if(!/^\d{50}$/.test(clave)) throw new Error('La respuesta de Hacienda no contiene una clave de 50 dígitos');
  const codigo=String(root.Mensaje||'').trim();
  const estados={'1':'Aceptado','2':'Aceptado parcialmente','3':'Rechazado'};
  if(!estados[codigo]) throw new Error('Código de mensaje de Hacienda no reconocido');
  return {clave,codigo,estado:estados[codigo],detalle:String(root.DetalleMensaje||'').slice(0,2000),
    archivo:String(archivo||'MensajeHacienda.xml').slice(0,255),hash:crypto.createHash('sha256').update(xml).digest('hex'),xml};
}
module.exports={clasificarDocumento,resumenComprasVentas,analizarReferencias,leerMensajeHacienda};
