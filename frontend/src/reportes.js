import jsPDF from 'jspdf';
import * as XLSX from 'xlsx';
import {autoTable} from 'jspdf-autotable';
import {escaparCSV, csvMonto, csvTasa, construirCSV} from './export-utils.mjs';

export const TASAS = ['0','0.5','1','2','4','8','13'];
export const TIPOS = [
  'Factura electrónica','Tiquete electrónico','Nota de crédito','Nota de débito',
  'Factura electrónica de compra','Factura electrónica de exportación','Recibo electrónico de pago'
];

export const numero = valor => Number.isFinite(Number(valor)) ? Number(valor) : 0;
export const crc = valor => `₡${numero(valor).toLocaleString('es-CR',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
export const crcPdf = valor => `CRC ${numero(valor).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
export const fechaCorta = valor => {
  if (!valor) return '—';
  const d=String(valor).slice(0,10).split('-');
  return d.length===3 ? `${d[2]}/${d[1]}/${d[0]}` : String(valor);
};
export const nombreSeguro = valor => String(valor || 'Perfil').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^A-Za-z0-9_-]+/g,'-').replace(/^-|-$/g,'').slice(0,45) || 'Perfil';

export function resumenDatos(documentos=[]) {
  const iva = Object.fromEntries(TASAS.map(t=>[t,0]));
  const bases = Object.fromEntries(TASAS.map(t=>[t,0]));
  const tipos={};
  const comercios=new Map();
  let total=0, ajusteNetoSinTarifa=0, documentosConAjuste=0;
  let baseIVAnoAtribuida=0, documentosConBaseAmbigua=0;
  for (const f of documentos) {
    const ajuste=numero(f.ajusteNetoSinTarifa);
    ajusteNetoSinTarifa+=ajuste;
    if(Math.abs(ajuste)>0.00000001) documentosConAjuste++;
    const basePendiente=numero(f.baseIVAnoAtribuida);
    baseIVAnoAtribuida+=basePendiente;
    if(Math.abs(basePendiente)>0.00000001) documentosConBaseAmbigua++;
    total+=numero(f.total);
    tipos[f.tipoDocumento]=(tipos[f.tipoDocumento]||0)+1;
    const nombre=f.emisor?.nombre || f.comercio || 'Sin nombre';
    if (!comercios.has(nombre)) comercios.set(nombre,{nombre,cantidad:0,total:0,iva:0,base:0});
    const c=comercios.get(nombre);c.cantidad++;c.total+=numero(f.total);c.base+=basePendiente;
    for(const t of TASAS) {
      const base=numero(f.bases?.[t]); bases[t]+=base;c.base+=base;
    }
    for(const imp of f.impuestos || []) {
      if (imp.codigo!=='01') continue;
      const t=String(imp.tarifa);
      if (t in iva) {iva[t]+=numero(imp.monto); c.iva+=numero(imp.monto);}
    }
  }
  const base=TASAS.reduce((n,t)=>n+bases[t],0)+baseIVAnoAtribuida;
  const totalIVA=TASAS.reduce((n,t)=>n+iva[t],0);
  return {total,base,iva,bases,totalIVA,ajusteNetoSinTarifa,documentosConAjuste,
    baseIVAnoAtribuida,documentosConBaseAmbigua,tipos,comercios:[...comercios.values()].sort((a,b)=>b.cantidad-a.cantidad),cantidad:documentos.length};
}

function seguroCSV(valor) {return escaparCSV(valor);}
function descargarCSV(nombre,encabezados,filas) {
  const contenido=construirCSV(encabezados,filas);
  const url=URL.createObjectURL(new Blob(['\ufeff',contenido],{type:'text/csv;charset=utf-8;'}));
  const a=document.createElement('a');a.href=url;a.download=nombre;a.style.display='none';
  document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}

function sufijo(perfil) {return nombreSeguro(perfil?.nombre);}
export function csvDocumentos(perfil,docs) {
  descargarCSV(`Comprobantes_${sufijo(perfil)}.csv`,
    ['Empresa','Tipo','Fecha','Emisor','Cedula emisor','Receptor','Cedula receptor','Consecutivo','Clave','Moneda original','Total original','Cambio aplicado','Fecha TC','Fuente TC','Verificado BCCR','Total CRC','Base IVA por tarifa CRC','IVA CRC','Ajuste neto sin tarifa CRC','Base IVA sin tarifa atribuida CRC','Observaciones fiscales','Gasto administrativo','Monto gasto manual CRC','Archivo'],
    docs.map(f=>[
      perfil.nombre,f.tipoDocumento,fechaCorta(f.fecha),f.emisor?.nombre||f.comercio,f.emisor?.identificacion?.numero,
      f.receptor?.nombre,f.receptor?.identificacion?.numero,f.consecutivo,f.clave,f.monedaOriginal,
      csvMonto(f.totalOriginal),csvTasa(f.tipoCambioAplicado),f.fechaTipoCambio||'',f.fuenteTipoCambio||'Versión anterior',f.tipoCambioVerificado===true?'Sí':'No',csvMonto(f.total),
      csvMonto(TASAS.reduce((n,t)=>n+numero(f.bases?.[t]),0)),
      csvMonto((f.impuestos||[]).filter(i=>i.codigo==='01').reduce((n,i)=>n+numero(i.monto),0)),
      csvMonto(f.ajusteNetoSinTarifa),csvMonto(f.baseIVAnoAtribuida),(f.observacionesFiscales||[]).map(o=>o.mensaje).join(' | '), f.gastoAdministrativo===true?'Sí':'No',f.montoGastoManual==null?'':csvMonto(f.montoGastoManual),f.nombreArchivo
    ])
  );
}
export function csvIVA(perfil,docs) {
  const r=resumenDatos(docs);
  descargarCSV(`IVA_${sufijo(perfil)}.csv`,['Empresa','Tarifa IVA','Base neta CRC','IVA neto CRC'],
    [...TASAS.map(t=>[perfil.nombre,`${t}%`,csvMonto(r.bases[t]),csvMonto(r.iva[t])]),
      ...(r.documentosConBaseAmbigua ? [[perfil.nombre,'Base sin tarifa atribuida',csvMonto(r.baseIVAnoAtribuida),'']] : [])]);
}
export function csvComercios(perfil,docs) {
  descargarCSV(`Comercios_${sufijo(perfil)}.csv`,
    ['Empresa','Comercio emisor','Documentos','Total neto CRC','Base IVA CRC','IVA neto CRC'],
    resumenDatos(docs).comercios.map(c=>[perfil.nombre,c.nombre,c.cantidad,csvMonto(c.total),csvMonto(c.base),csvMonto(c.iva)]));
}
export function csvLineas(perfil,docs) {
  const filas=[];
  for(const f of docs) for(const l of f.detalle||[]) filas.push([
    perfil.nombre,f.clave,f.tipoDocumento,fechaCorta(f.fecha),f.emisor?.nombre||f.comercio,l.linea,
    l.codigoCABYS||l.codigo,l.detalle,l.cantidad,l.unidadMedida,csvMonto(l.precioUnitario),
    csvMonto(l.subtotal),csvMonto((l.impuestos||[]).filter(i=>i.codigo==='01').reduce((n,i)=>n+numero(i.monto),0)),
    (l.impuestos||[]).filter(i=>i.codigo==='01').map(i=>`${i.tarifa}%`).join(', '),csvMonto(l.montoTotalLinea)
  ]);
  descargarCSV(`Detalle_Articulos_${sufijo(perfil)}.csv`,
    ['Empresa','Clave','Tipo','Fecha','Emisor','Linea','CABYS','Descripción','Cantidad','Unidad','Precio unitario CRC','Subtotal CRC','IVA CRC','Tarifa IVA','Total CRC'],filas);
}

// Conserva las exportaciones Excel existentes, con cantidades numéricas y formato CRC.
function descargarExcel(nombre,hojaNombre,encabezados,filas,columnasCRC=[]) {
  const ws=XLSX.utils.aoa_to_sheet([encabezados,...filas]);
  const ancho=Math.max(encabezados.length,1);
  ws['!cols']=Array.from({length:ancho},(_,i)=>({wch:i===0?26:i<4?20:17}));
  filas.forEach((fila,idx)=>{
    for(const col of columnasCRC){
      const ref=XLSX.utils.encode_cell({r:idx+1,c:col});
      if(ws[ref]&&typeof ws[ref].v==='number') ws[ref].z='"CRC "#,##0.00;[Red]-"CRC "#,##0.00';
    }
  });
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,hojaNombre.slice(0,31));
  XLSX.writeFile(wb,nombre);
}
export function excelDocumentos(perfil,docs) {
  descargarExcel(`Comprobantes_${sufijo(perfil)}.xlsx`,'Comprobantes',
    ['Tipo','Fecha','Emisor','Receptor','Consecutivo','Clave','Moneda','Total original','Cambio aplicado','Fecha TC','Fuente TC','Verificado BCCR','Total CRC','Ajuste neto sin tarifa CRC','Base IVA sin tarifa atribuida CRC','Observaciones fiscales','Gasto administrativo','Monto gasto manual CRC'],
    docs.map(f=>[f.tipoDocumento,fechaCorta(f.fecha),f.emisor?.nombre||f.comercio,f.receptor?.nombre||'',
      f.consecutivo,f.clave,f.monedaOriginal,numero(f.totalOriginal),numero(f.tipoCambioAplicado),f.fechaTipoCambio||'',f.fuenteTipoCambio||'Versión anterior',f.tipoCambioVerificado===true?'Sí':'No',numero(f.total),numero(f.ajusteNetoSinTarifa),numero(f.baseIVAnoAtribuida),
      (f.observacionesFiscales||[]).map(o=>o.mensaje).join(' | '),f.gastoAdministrativo===true?'Sí':'No',f.montoGastoManual==null?'':numero(f.montoGastoManual)]),[12,13,14,17]);
}
export function excelIVA(perfil,docs) {
  const r=resumenDatos(docs);
  descargarExcel(`IVA_${sufijo(perfil)}.xlsx`,'IVA por tarifa',
    ['Empresa','Tarifa','Base neta CRC','IVA neto CRC'],
    [...TASAS.map(t=>[perfil.nombre,`${t}%`,numero(r.bases[t]),numero(r.iva[t])]),
     ...(r.documentosConBaseAmbigua ? [[perfil.nombre,'Base sin tarifa atribuida',numero(r.baseIVAnoAtribuida),0]] : [])],[2,3]);
}
export function excelComercios(perfil,docs) {
  descargarExcel(`Comercios_${sufijo(perfil)}.xlsx`,'Comercios',
    ['Comercio','Documentos','Total CRC','Base CRC','IVA CRC'],
    resumenDatos(docs).comercios.map(c=>[c.nombre,c.cantidad,numero(c.total),numero(c.base),numero(c.iva)]),[2,3,4]);
}
export function excelLineas(perfil,docs) {
  const filas=[];
  for(const f of docs) for(const l of f.detalle||[]) filas.push([
    f.clave,fechaCorta(f.fecha),f.emisor?.nombre||f.comercio,l.linea,
    l.codigoCABYS||l.codigo,l.detalle,numero(l.cantidad),numero(l.precioUnitario),
    numero(l.subtotal),(l.impuestos||[]).filter(i=>i.codigo==='01').reduce((n,i)=>n+numero(i.monto),0),numero(l.montoTotalLinea)
  ]);
  descargarExcel(`Articulos_${sufijo(perfil)}.xlsx`,'Detalle de líneas',
    ['Clave','Fecha','Emisor','Línea','CAByS','Descripción','Cantidad','Precio CRC','Subtotal CRC','IVA CRC','Total CRC'],filas,[7,8,9,10]);
}

const AZUL=[25,57,100];
const AZUL_CLARO=[235,242,251];
const GRIS=[96,115,136];
function nuevaHojaPDF(perfil,titulo,subtitulo) {
  const pdf=new jsPDF({unit:'mm',format:'a4'});
  const ancho=pdf.internal.pageSize.getWidth();
  pdf.setFillColor(...AZUL);pdf.rect(0,0,ancho,33,'F');
  pdf.setTextColor(255,255,255);pdf.setFont('helvetica','bold');pdf.setFontSize(16);
  pdf.text(titulo,14,16);
  pdf.setFont('helvetica','normal');pdf.setFontSize(9);
  pdf.text(String(perfil?.nombre||'Empresa').slice(0,75),14,24);
  pdf.setTextColor(...GRIS);pdf.setFontSize(9);
  pdf.text(subtitulo,14,41);
  pdf.text(`Generado: ${new Date().toLocaleDateString('es-CR')}  |  Valores expresados en colones (CRC)`,14,47);
  return pdf;
}
function tablaPDF(pdf,head,body,startY,opciones={}) {
  autoTable(pdf,{
    startY,head:[head],body:body.length?body:[['Sin registros',...head.slice(1).map(()=>'')]],
    theme:'grid',margin:{left:14,right:14,top:18,bottom:18},
    styles:{font:'helvetica',fontSize:8,cellPadding:2.8,overflow:'linebreak',lineColor:[225,233,242],lineWidth:0.1},
    headStyles:{fillColor:AZUL,textColor:255,fontStyle:'bold'},
    alternateRowStyles:{fillColor:[248,250,254]},
    ...opciones,
  });
  return pdf.lastAutoTable.finalY;
}
function cerrarPDF(pdf,nombre) {
  const paginas=pdf.internal.getNumberOfPages();
  for(let n=1;n<=paginas;n++) {
    pdf.setPage(n);const h=pdf.internal.pageSize.getHeight();
    pdf.setDrawColor(...AZUL_CLARO);pdf.line(14,h-13,pdf.internal.pageSize.getWidth()-14,h-13);
    pdf.setFontSize(8);pdf.setTextColor(...GRIS);
    pdf.text('ComprobantesElectronicosCR | Reporte local',14,h-9);
    pdf.text(`Página ${n} de ${paginas}`,pdf.internal.pageSize.getWidth()-14,h-9,{align:'right'});
  }
  pdf.save(nombre);
}
export function pdfResumen(perfil,docs) {
  const r=resumenDatos(docs);
  const pdf=nuevaHojaPDF(perfil,'Resumen de comprobantes','Reporte general por empresa y filtros seleccionados');
  pdf.setFont('helvetica','bold');pdf.setFontSize(10);pdf.setTextColor(...AZUL);
  pdf.text(`Documentos: ${r.cantidad}   |   Total neto: ${crcPdf(r.total)}`,14,57);
  pdf.setFont('helvetica','normal');pdf.setFontSize(9);
  pdf.text(`Base IVA: ${crcPdf(r.base)}   |   IVA: ${crcPdf(r.totalIVA)}`,14,63);
  if (r.documentosConAjuste) {
    pdf.setFontSize(8);pdf.text(`${r.documentosConAjuste} comprobante(s) contienen ajustes netos sin tarifa atribuida. Revisar detalle.`,14,68);
  }
  let y=tablaPDF(pdf,['Tipo de comprobante','Cantidad'],Object.entries(r.tipos).map(([t,n])=>[t,String(n)]),71);
  y=tablaPDF(pdf,['Tarifa IVA','Base neta CRC','IVA neto CRC'],[
    ...TASAS.map(t=>[`${t}%`,crcPdf(r.bases[t]),crcPdf(r.iva[t])]),
    ...(r.documentosConBaseAmbigua ? [['Base sin tarifa atribuida',crcPdf(r.baseIVAnoAtribuida),'—']] : []),
  ],y+9);
  const comercios=r.comercios.map(c=>[c.nombre,String(c.cantidad),crcPdf(c.total),crcPdf(c.iva)]);
  tablaPDF(pdf,['Comercio','Documentos','Total CRC','IVA CRC'],comercios,y+9);
  cerrarPDF(pdf,`Resumen_${sufijo(perfil)}.pdf`);
}
export function pdfComercios(perfil,docs) {
  const pdf=nuevaHojaPDF(perfil,'Resumen por comercio','Importes netos de los documentos filtrados');
  const r=resumenDatos(docs);
  tablaPDF(pdf,['Comercio','Documentos','Total CRC','Base CRC','IVA CRC'],
    r.comercios.map(c=>[c.nombre,String(c.cantidad),crcPdf(c.total),crcPdf(c.base),crcPdf(c.iva)]),56);
  cerrarPDF(pdf,`Comercios_${sufijo(perfil)}.pdf`);
}
export function pdfIVA(perfil,docs) {
  const pdf=nuevaHojaPDF(perfil,'Desglose de IVA','Detalle neto por tarifa, notas de crédito incluidas');
  const r=resumenDatos(docs);
  const filas=TASAS.map(t=>[`${t}%`,crcPdf(r.bases[t]),crcPdf(r.iva[t])]);
  if(r.documentosConBaseAmbigua) filas.push(['Base sin tarifa atribuida',crcPdf(r.baseIVAnoAtribuida),'—']);
  const y=tablaPDF(pdf,['Tarifa IVA','Base neta CRC','IVA neto CRC'],filas,56);
  const avisos=[];
  if(r.documentosConAjuste) avisos.push(`${r.documentosConAjuste} documento(s) con ajuste neto sin tarifa: ${crcPdf(r.ajusteNetoSinTarifa)}`);
  if(r.documentosConBaseAmbigua) avisos.push(`${r.documentosConBaseAmbigua} documento(s) con base sin tarifa atribuida: ${crcPdf(r.baseIVAnoAtribuida)}`);
  if(avisos.length) tablaPDF(pdf,['Avisos de conciliación fiscal'],avisos.map(a=>[a]),y+8);
  cerrarPDF(pdf,`IVA_${sufijo(perfil)}.pdf`);
}
export function pdfDetalle(perfil,f) {
  const pdf=nuevaHojaPDF(perfil,'Detalle del comprobante',`${f.tipoDocumento||'Documento'}  |  ${fechaCorta(f.fecha)}`);
  const cabecera=[
    ['Clave',f.clave||'-'],['Consecutivo',f.consecutivo||'-'],
    ['Emisor',f.emisor?.nombre||f.comercio||'-'],['Receptor',f.receptor?.nombre||'-'],
    ['Moneda original',f.monedaOriginal||'CRC'],['Tipo de cambio aplicado',String(f.tipoCambioAplicado||1)],
    ['Fecha referencia TC',f.fechaTipoCambio||'-'],['Fuente tipo de cambio',f.fuenteTipoCambio||'Versión anterior (no registrada)'],
    ['Tasa verificada',f.tipoCambioVerificado===true?'Sí':'No'],
    ['Total original',String(f.totalOriginal??'-')],['Total convertido',crcPdf(f.total)],
    ['Gasto administrativo',f.gastoAdministrativo===true?'Sí':'No'],
    ['Monto manual solo para gastos',f.montoGastoManual==null?'No indicado':crcPdf(f.montoGastoManual)],
    ['Ajuste neto sin tarifa',crcPdf(f.ajusteNetoSinTarifa)],
    ['Base IVA sin tarifa atribuida',crcPdf(f.baseIVAnoAtribuida)],
    ['Observaciones fiscales',(f.observacionesFiscales||[]).map(o=>`Línea ${o.linea}: ${o.mensaje}`).join(' | ')||'Ninguna'],
  ];
  let y=tablaPDF(pdf,['Campo','Dato'],cabecera,55,{columnStyles:{0:{cellWidth:52},1:{cellWidth:'auto'}}});
  y=tablaPDF(pdf,['#','CABYS / Código','Descripción','Cantidad','Subtotal CRC','IVA CRC','Total CRC'],
    (f.detalle||[]).map(l=>[String(l.linea),l.codigoCABYS||l.codigo||'-',l.detalle||'-',String(l.cantidad),
      crcPdf(l.subtotal),crcPdf((l.impuestos||[]).filter(i=>i.codigo==='01').reduce((n,i)=>n+numero(i.monto),0)),crcPdf(l.montoTotalLinea)]),
    y+10,{styles:{fontSize:7,cellPadding:2.2}});
  cerrarPDF(pdf,`Comprobante_${nombreSeguro(f.consecutivo||f.clave||f.id)}.pdf`);
}

// v1.4.0: clasificación por papel real de la empresa, nunca solo por tipo XML.
import {clasificacion,tablaContable,agruparContrapartes,compararMeses} from './contabilidad.mjs';
export function csvComprasVentas(perfil,docs) {
  descargarCSV(`Compras_Ventas_${sufijo(perfil)}.csv`,
    ['Empresa','Movimiento','Tipo XML','Fecha','Clave','Emisor','Receptor','Total neto CRC','IVA neto CRC'],
    docs.map(f=>[perfil.nombre,clasificacion(f,perfil),f.tipoDocumento,fechaCorta(f.fecha),f.clave,
      f.emisor?.nombre||'',f.receptor?.nombre||'',csvMonto(f.total),
      csvMonto((f.impuestos||[]).filter(i=>i.codigo==='01').reduce((n,i)=>n+numero(i.monto),0))]));
}
export function excelComprasVentas(perfil,docs) {
  descargarExcel(`Compras_Ventas_${sufijo(perfil)}.xlsx`,'Compras y ventas',
    ['Movimiento','Tipo XML','Fecha','Clave','Emisor','Receptor','Total CRC','IVA CRC'],
    docs.map(f=>[clasificacion(f,perfil),f.tipoDocumento,fechaCorta(f.fecha),f.clave,f.emisor?.nombre||'',
      f.receptor?.nombre||'',numero(f.total),(f.impuestos||[]).filter(i=>i.codigo==='01').reduce((n,i)=>n+numero(i.monto),0)]),[6,7]);
}
export function pdfComprasVentas(perfil,docs) {
  const pdf=nuevaHojaPDF(perfil,'Compras y ventas','Clasificación según cédula de emisor y receptor; importes con signo');
  tablaPDF(pdf,['Clasificación','Documentos','Total neto CRC','Base neta CRC','IVA neto CRC'],
    tablaContable(perfil,docs).map(r=>[r.tipo,String(r.cantidad),crcPdf(r.total),crcPdf(r.base),crcPdf(r.iva)]),56);
  cerrarPDF(pdf,`Compras_Ventas_${sufijo(perfil)}.pdf`);
}

export function csvContrapartes(perfil,docs) {
 descargarCSV(`Contrapartes_${sufijo(perfil)}.csv`,
 ['Movimiento','Proveedor / cliente','Documentos','Total neto CRC','IVA neto CRC'],
 agruparContrapartes(perfil,docs).map(r=>[r.tipo,r.nombre,r.cantidad,csvMonto(r.total),csvMonto(r.iva)]));
}
export function csvComparativoMensual(perfil,docs) {
 descargarCSV(`Comparativo_Mensual_${sufijo(perfil)}.csv`,
 ['Mes','Compras netas CRC','Ventas netas CRC','Diferencia CRC'],
 compararMeses(perfil,docs).map(r=>[r.mes,csvMonto(r.compras),csvMonto(r.ventas),csvMonto(r.ventas-r.compras)]));
}


// v1.4.4 - Gastos administrativos (selección voluntaria; no resta ni duplica IVA general).
import {resumenGastosAdministrativos} from './gastos-administrativos.mjs';
export {resumenGastosAdministrativos};

export function csvGastosAdministrativos(perfil,docs) {
  const {filas}=resumenGastosAdministrativos(docs);
  descargarCSV(`Gastos_Administrativos_${sufijo(perfil)}.csv`,
    ['Empresa','Fecha','Tipo','Emisor','Identificación emisor','Clave','Monto gasto sin IVA CRC',
     'Base gravada IVA CRC','IVA neto CRC','Total XML CRC','Monto manual','Revisar total cero','Archivo'],
    filas.map(({documento:f,montoGasto,baseGravadaIVA,iva,totalXML,manual,requiereRevision})=>[
      perfil.nombre,fechaCorta(f.fecha),f.tipoDocumento,f.emisor?.nombre||f.comercio||'',
      f.emisor?.identificacion?.numero||'',f.clave||'',csvMonto(montoGasto),csvMonto(baseGravadaIVA),
      csvMonto(iva),csvMonto(totalXML),manual?'Sí':'No',requiereRevision?'Sí':'No',f.nombreArchivo||''
    ]));
}
export function excelGastosAdministrativos(perfil,docs) {
  const {filas}=resumenGastosAdministrativos(docs);
  descargarExcel(`Gastos_Administrativos_${sufijo(perfil)}.xlsx`,'Gastos administrativos',
    ['Fecha','Tipo','Emisor','Clave','Monto gasto sin IVA CRC','Base gravada IVA CRC',
     'IVA neto CRC','Total XML CRC','Monto manual','Revisar total cero'],
    filas.map(({documento:f,montoGasto,baseGravadaIVA,iva,totalXML,manual,requiereRevision})=>[
      fechaCorta(f.fecha),f.tipoDocumento,f.emisor?.nombre||f.comercio||'',f.clave||'',
      montoGasto,baseGravadaIVA,iva,totalXML,manual?'Sí':'No',requiereRevision?'Sí':'No'
    ]),[4,5,6,7]);
}
export function pdfGastosAdministrativos(perfil,docs) {
  const resumen=resumenGastosAdministrativos(docs);
  const pdf=nuevaHojaPDF(perfil,'Gastos administrativos','Documentos marcados manualmente · Filtros de fecha y empresa aplicados');
  pdf.setTextColor(...AZUL);pdf.setFont('helvetica','bold');pdf.setFontSize(10);
  pdf.text(`Gastos sin IVA: ${crcPdf(resumen.totalGastos)}   |   IVA real: ${crcPdf(resumen.totalIVA)}`,14,57);
  pdf.setFont('helvetica','normal');pdf.setFontSize(8);pdf.setTextColor(...GRIS);
  pdf.text('Importes manuales son referencias contables, no modifican el XML ni prueban deducibilidad.',14,64);
  if (resumen.pendientesRevision) pdf.text(`${resumen.pendientesRevision} documentos con total XML cero requieren revisión del monto.`,14,69);
  tablaPDF(pdf,['Fecha','Emisor','Gasto sin IVA CRC','Base IVA CRC','IVA CRC','Manual'],
    resumen.filas.map(({documento:f,montoGasto,baseGravadaIVA,iva,manual})=>[
      fechaCorta(f.fecha),String(f.emisor?.nombre||f.comercio||'-').slice(0,40),
      crcPdf(montoGasto),crcPdf(baseGravadaIVA),crcPdf(iva),manual?'Sí':'No'
    ]),resumen.pendientesRevision?76:72,{styles:{fontSize:7.4}});
  cerrarPDF(pdf,`Gastos_Administrativos_${sufijo(perfil)}.pdf`);
}
