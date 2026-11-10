/**
 * La marca de gasto es independiente de la liquidación fiscal del comprobante.
 * Un XML con TotalComprobante=0 se mantiene en cero hasta que el usuario
 * introduzca de forma consciente un importe contable de referencia.
 */
const num = v => Number.isFinite(Number(v)) ? Number(v) : 0;
export function ivaRealDelDocumento(doc) {
  return (doc?.impuestos || [])
    .filter(i => i.codigo === '01')
    .reduce((s,i) => s + num(i.monto),0);
}
export function gastoAdministrativoLinea(doc) {
  if (doc?.gastoAdministrativo !== true) return null;
  const manual = doc.montoGastoManual === null || doc.montoGastoManual === undefined
    ? null : num(doc.montoGastoManual);
  const signo = doc.tipoDocumento === 'Nota de crédito' ? -1 : 1;
  const baseGasto = manual !== null ? manual * signo : num(doc.resumen?.totalVentaNeta);
  const iva = ivaRealDelDocumento(doc);
  return {
    documento:doc,
    montoGasto:baseGasto,
    baseGravadaIVA:num(doc.resumen?.totalGravado),
    iva,
    totalXML:num(doc.total),
    manual:manual !== null,
    requiereRevision: manual === null && Math.abs(num(doc.total)) < 0.000001 && num(doc.resumen?.totalVenta) > 0,
  };
}
export function resumenGastosAdministrativos(documentos=[]) {
  const filas=documentos.map(gastoAdministrativoLinea).filter(Boolean);
  return {
    filas,
    cantidad:filas.length,
    totalGastos:filas.reduce((s,f)=>s+f.montoGasto,0),
    totalBaseIVA:filas.reduce((s,f)=>s+f.baseGravadaIVA,0),
    totalIVA:filas.reduce((s,f)=>s+f.iva,0),
    pendientesRevision:filas.filter(f=>f.requiereRevision).length,
    manuales:filas.filter(f=>f.manual).length,
  };
}
