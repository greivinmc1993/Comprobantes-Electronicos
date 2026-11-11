'use strict';
const {normalizarIdentificacion} = require('./identificaciones');

// Nunca agrupar por una coincidencia aproximada: primero cédula, luego nombre normalizado.
function identidadComercio(doc) {
  const cedula = normalizarIdentificacion(doc?.emisor?.identificacion?.numero);
  if (cedula) return `cedula:${cedula}`;
  const nombre = String(doc?.emisor?.nombre || doc?.comercio || '').normalize('NFKD')
    .replace(/[\u0300-\u036f]/g,'').trim().replace(/\s+/g,' ').toLocaleLowerCase('es');
  return nombre ? `nombre:${nombre}` : null;
}
function agruparGastosComercios(documentos) {
  const grupos = new Map();
  for (const doc of documentos) {
    const clave = identidadComercio(doc);
    if (!clave) continue; // Nunca clasificar en bloque un emisor sin identificar.
    let grupo=grupos.get(clave);
    if (!grupo) {
      grupo={clave,nombre:doc.emisor?.nombre||doc.comercio||'Emisor con cédula identificada',cedula:doc.emisor?.identificacion?.numero||'',
        total:0,marcados:0,pendientes:0,manuales:0};
      grupos.set(clave,grupo);
    }
    grupo.total++;
    if (doc.gastoAdministrativo===true) grupo.marcados++;
    else grupo.pendientes++;
    if (doc.montoGastoManual != null) grupo.manuales++;
  }
  return [...grupos.values()].sort((a,b)=>a.nombre.localeCompare(b.nombre,'es'));
}
module.exports={identidadComercio,agruparGastosComercios};
