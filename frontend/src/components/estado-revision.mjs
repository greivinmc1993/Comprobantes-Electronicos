/** Reglas de selección de la importación inteligente. Sin datos fiscales ni dependencias del navegador. */
export const esErrorDeLectura = fila => fila?.estado === 'error';
export const esDuplicadoEnLote = fila => fila?.estado === 'duplicado_en_lote';
export const necesitaRevision = fila => Boolean(fila && !['listo','error','duplicado_en_lote'].includes(fila.estado));
export const esListo = fila => fila?.estado === 'listo';
export const sePuedeMarcar = fila => Boolean(fila && !esErrorDeLectura(fila) && !esDuplicadoEnLote(fila));

/** Solo los documentos detectados como listos se marcan automáticamente. */
export function exclusionInicial(filas = []) {
  return Object.fromEntries(filas.filter(f => !esListo(f)).map(f => [f.indice, true]));
}

/** "Marcar todos" no autoriza documentos que requieren una revisión manual. */
export function marcarComprobantes(filas = [], excluidos = {}, marcar = true) {
  const siguiente = {...excluidos};
  for (const fila of filas) {
    if (!sePuedeMarcar(fila)) continue;
    if (!marcar || esListo(fila)) siguiente[fila.indice] = !marcar;
  }
  return siguiente;
}

export function filtrarPorRevision(filas = [], filtro = 'todos') {
  switch (filtro) {
    case 'listos': return filas.filter(esListo);
    case 'revisar': return filas.filter(necesitaRevision);
    case 'errores': return filas.filter(esErrorDeLectura);
    case 'duplicados': return filas.filter(esDuplicadoEnLote);
    default: return filas;
  }
}
