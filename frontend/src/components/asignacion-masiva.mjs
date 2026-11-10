/** Selecciona una empresa para comprobantes activos, respetando coincidencia de cédula. */
export function asignarEmpresaMasiva(filas, excluidos, selecciones, perfil) {
  const nuevo = {...selecciones};
  let aplicados = 0, incompatibles = 0, omitidos = 0;
  if (!perfil || !Number.isSafeInteger(Number(perfil.id)) || Number(perfil.id) <= 0) {
    return {selecciones:nuevo,aplicados,incompatibles,omitidos};
  }
  for (const fila of filas || []) {
    if (excluidos?.[fila.indice] || ['error','duplicado_en_lote'].includes(fila.estado)) {
      omitidos++; continue;
    }
    // Un perfil con cédula solo puede recibir XML donde aparece como emisor
    // o receptor. La comprobación se repite en SQLite al importar.
    if (perfil.cedula && !(fila.empresasCompatibles || []).includes(perfil.id)) {
      incompatibles++; continue;
    }
    nuevo[fila.indice] = String(perfil.id);
    aplicados++;
  }
  return {selecciones:nuevo,aplicados,incompatibles,omitidos};
}

/** No confundir un perfil con cédula incompatible con uno aún no elegido. */
export function empresaCompatible(fila, perfil) {
  return Boolean(perfil && (!perfil.cedula || (fila.empresasCompatibles || []).includes(perfil.id)));
}
