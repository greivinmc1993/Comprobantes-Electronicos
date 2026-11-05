'use strict';
const {parsearXML,identificarDocumento,datosMonedaDocumento,procesarDocumento}=require('./parser');
const {normalizarIdentificacion}=require('./identificaciones');

async function previsualizarXML(archivos,perfiles,base,servicioTipoCambio,perfilPreferido){
  if(!Array.isArray(archivos)||archivos.length<1||archivos.length>10)throw new Error('Selecciona de 1 a 10 XML por lote');
  const filas=[], contenidos=[],vistos=new Set();
  for(let i=0;i<archivos.length;i++){
    const archivo=archivos[i];
    const nombre=String(archivo.nombre||'').slice(0,255);
    try{
      if(!/\.xml$/i.test(nombre))throw new Error('Extensión no admitida');
      const bytes=Buffer.isBuffer(archivo.bytes)?archivo.bytes:Buffer.from(archivo.bytes||[]);
      if(bytes.length<1||bytes.length>15*1024*1024)throw new Error('XML vacío o demasiado grande (15 MB)');
      const xml=bytes.toString('utf8');
      const parsed=await parsearXML(xml);
      const reconocido=identificarDocumento(parsed);
      if(!reconocido)throw new Error('No es un comprobante electrónico compatible; los mensajes de Hacienda se importan por separado');
      const monedas=datosMonedaDocumento(reconocido.doc);
      const referencia=monedas.codigoOriginal==='USD'?
        await servicioTipoCambio.resolverUSD(String(reconocido.doc.FechaEmision||''),monedas.tipoCambioOriginalXML):null;
      const doc=procesarDocumento(parsed,nombre,xml,referencia);
      const claves=[doc.emisor?.identificacion?.numero,doc.receptor?.identificacion?.numero].map(normalizarIdentificacion);
      const compatibles=perfiles.filter(p=>p.cedula&&claves.includes(normalizarIdentificacion(p.cedula)));
      const sinCedula=perfiles.filter(p=>!p.cedula);
      const recomendada=compatibles.length===1?compatibles[0].id:null;
      const enEmpresas=doc.clave?base.buscarClaveEnPerfiles(doc.clave):[];
      const repetidoLote=Boolean(doc.clave&&vistos.has(doc.clave));
      if(doc.clave)vistos.add(doc.clave);
      const sugerida=recomendada||((sinCedula.length===1&&perfiles.length===1)?sinCedula[0].id:null);
      const estado=repetidoLote?'duplicado_en_lote':compatibles.length>1?'varias_coincidencias':!sugerida?'requiere_empresa':'listo';
      contenidos[i]={xml,documento:doc};
      filas.push({indice:i,archivo:nombre,estado,empresaSugerida:sugerida,
        empresasCompatibles:compatibles.map(p=>p.id),sinCedula:sinCedula.map(p=>p.id),
        existentes:enEmpresas,clave:doc.clave,fecha:doc.fecha,tipo:doc.tipoDocumento,total:doc.total,
        moneda:doc.monedaOriginal,emisor:doc.emisor?.nombre,receptor:doc.receptor?.nombre,
        observaciones:doc.observacionesFiscales?.length||0,advertencia:referencia?.advertencia||null,
        empresaActual:perfilPreferido||null});
    }catch(error){filas.push({indice:i,archivo:nombre,estado:'error',error:error.message});}
  }
  return {filas,contenidos};
}
module.exports={previsualizarXML};
