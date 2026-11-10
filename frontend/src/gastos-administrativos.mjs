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
/**
 * Referencia NO fiscal cuando un comprobante sin monto neto se pagó con un cupón.
 * No constituye un gasto por sí misma y nunca se incluye automáticamente
 * en los reportes; requiere la confirmación del usuario.
 */
export function referenciaCuponNoSujeto(doc) {
  const r=doc?.resumen || {};
  const venta=num(r.totalVenta);
  const descuento=num(r.totalDescuentos);
  const noSujeto=num(r.totalNoSujeto);
  const neto=num(r.totalVentaNeta);
  const total=num(doc?.total);
  const pagos=Array.isArray(r.medioPago)?r.medioPago:[];
  // Documentos importados antes de v1.4.6 guardaban TipoMedioPago=99, pero
  // no persistían MedioPagoOtros. Se admite como referencia NO identificada
  // solo si las demás cifras respaldan inequívocamente el importe.
  const cupones=pagos.filter(m=>String(m?.tipo||'')==='99' &&
    (!String(m?.medio || m?.medioPagoOtros || '').trim() || /cup[oó]n/i.test(String(m?.medio || m?.medioPagoOtros || ''))));
  const importeCupon=cupones.reduce((s,m)=>s+num(m?.total),0);
  const cerca=(a,b)=>Math.abs(a-b)<=0.01000001;
  // No se ofrece sugerencia si el XML no respalda el importe de forma inequívoca.
  if (doc?.tipoDocumento === 'Nota de crédito' || venta<=0 || noSujeto<=0 || importeCupon<=0 ||
      !cerca(total,0) || !cerca(neto,0) || !cerca(venta,descuento) ||
      !cerca(venta,noSujeto) || !cerca(venta,importeCupon) || cupones.length!==1 ||
      pagos.length!==1 || Math.abs(num(r.totalImpuesto))>0.01) return null;
  const confirmadoComoCupon=/cup[oó]n/i.test(String(cupones[0]?.medio || cupones[0]?.medioPagoOtros || ''));
  return {
    monto:importeCupon,
    confirmadoComoCupon,
    fuente: confirmadoComoCupon
      ? 'MedioPago.TotalMedioPago (Cupón) del XML'
      : 'MedioPago.TotalMedioPago (código 99, descripción no guardada: verificar XML)',
    detalle:'El XML también indica venta y descuento del mismo importe; no demuestra un desembolso de efectivo.',
  };
}

export function gastoAdministrativoLinea(doc) {
  if (doc?.gastoAdministrativo !== true) return null;
  const manual = doc.montoGastoManual === null || doc.montoGastoManual === undefined
    ? null : num(doc.montoGastoManual);
  const signo = doc.tipoDocumento === 'Nota de crédito' ? -1 : 1;
  const baseGasto = manual !== null ? manual * signo : num(doc.resumen?.totalVentaNeta);
  const iva = ivaRealDelDocumento(doc);
  const referenciaCupon = referenciaCuponNoSujeto(doc);
  return {
    documento:doc,
    montoGasto:baseGasto,
    baseGravadaIVA:num(doc.resumen?.totalGravado),
    iva,
    totalXML:num(doc.total),
    manual:manual !== null,
    referenciaCupon,
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
