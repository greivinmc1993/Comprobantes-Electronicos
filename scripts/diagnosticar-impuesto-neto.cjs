#!/usr/bin/env node
'use strict';
// Diagnóstico local: NO envía archivos ni imprime identificaciones fiscales.
const fs = require('node:fs');
const path = require('node:path');
const {parsearXML, identificarDocumento} = require('../backend/parser');
const lista = v => v == null ? [] : Array.isArray(v) ? v : [v];
const n = v => Number(v ?? 0) || 0;
const ver = v => Number.isFinite(v) ? v.toFixed(5) : '-';
function impuestosLinea(linea) {
  const surtidos = lista(linea.DetalleSurtido?.LineaDetalleSurtido || linea.DetalleSurtido?.LineaDetalle);
  const componentes = surtidos.flatMap(s => lista(s.ImpuestoSurtido).map(i => ({
    bruto:n(i.MontoImpuestoSurtido ?? i.MontolmpuestoSurtido),
    exonerado:lista(i.ExoneracionSurtido ?? i.Exoneracion).reduce((a,x)=>a+n(x.MontoExoneracion),0),
  })));
  const listaImpuestos = componentes.length ? componentes : lista(linea.Impuesto).map(i => ({
    bruto:n(i.Monto), exonerado:lista(i.Exoneracion).reduce((a,x)=>a+n(x.MontoExoneracion),0),
  }));
  return {impuestos:listaImpuestos, esSurtido:componentes.length>0};
}
(async()=>{
  const archivos=process.argv.slice(2);
  if(!archivos.length) {
    console.log('Uso: node scripts/diagnosticar-impuesto-neto.cjs archivo1.xml archivo2.xml');
    process.exitCode=2;
    return;
  }
  for(const nombre of archivos) {
    try {
      const xml=fs.readFileSync(nombre,'utf8');
      const parsed=await parsearXML(xml);
      const identificacion=identificarDocumento(parsed);
      if(!identificacion) throw new Error('Raíz XML no reconocida');
      const lineas=lista(identificacion.doc.DetalleServicio?.LineaDetalle);
      console.log(`\nArchivo: ${path.basename(nombre)} | tipo: ${identificacion.nombre} | líneas: ${lineas.length}`);
      for(const l of lineas) {
        if(l.ImpuestoNeto == null) continue;
        const {impuestos,esSurtido}=impuestosLinea(l);
        const bruto=impuestos.reduce((a,i)=>a+i.bruto,0);
        const exonerado=impuestos.reduce((a,i)=>a+i.exonerado,0);
        const asumido=n(l.ImpuestoAsumidoEmisorFabrica);
        const esperado=bruto-exonerado-asumido;
        const declarado=n(l.ImpuestoNeto);
        const diferencia=declarado-esperado;
        console.log(`  Línea ${l.NumeroLinea || '?'} | declaración ${ver(declarado)} | calculado ${ver(esperado)} | diferencia ${ver(diferencia)} | impuestos ${impuestos.length} | surtido ${esSurtido?'sí':'no'}`);
        if(Math.abs(diferencia)>0.011) console.log('  REVISAR: diferencia material. Verifique los nodos y consulte al emisor si corresponde.');
      }
    } catch(e) {console.error(`${path.basename(nombre)}: ${e.message}`);process.exitCode=1;}
  }
})().catch(e=>{console.error(e.message);process.exitCode=1;});
