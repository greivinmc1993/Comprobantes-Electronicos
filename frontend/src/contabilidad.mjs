export const normalizarId=v=>String(v||'').replace(/[^\dA-Za-z]/g,'').toUpperCase();
export function clasificacion(doc,perfil){
 if(doc?.tipoDocumento==='Recibo electrónico de pago')return 'Pago / revisar';
 const cedula=normalizarId(perfil?.cedula);
 if(!cedula)return 'Sin clasificar';
 const emisor=normalizarId(doc?.emisor?.identificacion?.numero);
 const receptor=normalizarId(doc?.receptor?.identificacion?.numero);
 if(emisor===cedula&&receptor===cedula)return 'Revisar';
 if(emisor===cedula)return 'Venta';
 if(receptor===cedula)return 'Compra';
 return 'Ajeno a la empresa';
}
export function tablaContable(perfil,documentos){
 const grupos=Object.fromEntries(['Venta','Compra','Pago / revisar','Sin clasificar','Revisar','Ajeno a la empresa'].map(k=>[k,{tipo:k,cantidad:0,total:0,iva:0,base:0}]));
 for(const doc of documentos){const r=grupos[clasificacion(doc,perfil)];r.cantidad++;r.total+=Number(doc.total)||0;
 r.base+=Object.values(doc.bases||{}).reduce((sum,n)=>sum+(Number(n)||0),0);
 r.iva+=(doc.impuestos||[]).filter(i=>i.codigo==='01').reduce((sum,i)=>sum+(Number(i.monto)||0),0);}
 return Object.values(grupos);
}
export function agruparContrapartes(perfil,documentos){
 const grupos=new Map();
 for(const doc of documentos){
  const tipo=clasificacion(doc,perfil);
  if(!['Venta','Compra'].includes(tipo))continue;
  const contraparte=tipo==='Venta'?doc.receptor:doc.emisor;
  const nombre=contraparte?.nombre||'Sin identificación';
  const clave=`${tipo}|${normalizarId(contraparte?.identificacion?.numero)||nombre}`;
  if(!grupos.has(clave))grupos.set(clave,{tipo,nombre,cantidad:0,total:0,iva:0});
  const r=grupos.get(clave);r.cantidad++;r.total+=Number(doc.total)||0;
  r.iva+=(doc.impuestos||[]).filter(i=>i.codigo==='01').reduce((a,b)=>a+(Number(b.monto)||0),0);
 }
 return [...grupos.values()].sort((a,b)=>Math.abs(b.total)-Math.abs(a.total));
}
export function compararMeses(perfil,documentos){
 const meses=new Map();
 for(const doc of documentos){
  const mes=String(doc.fecha||'').slice(0,7);
  const tipo=clasificacion(doc,perfil);
  if(!/^\d{4}-\d{2}$/.test(mes)||!['Compra','Venta'].includes(tipo))continue;
  if(!meses.has(mes))meses.set(mes,{mes,compras:0,ventas:0});
  const r=meses.get(mes);r[tipo==='Venta'?'ventas':'compras']+=Number(doc.total)||0;
 }
 return [...meses.values()].sort((a,b)=>b.mes.localeCompare(a.mes));
}
