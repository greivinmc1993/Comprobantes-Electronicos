const xml2js = require('xml2js');
const TASAS = ['0', '0.5', '1', '2', '4', '8', '13'];
const TIPOS_DOCUMENTO = {
  FacturaElectronica: { nombre: 'Factura electrónica', signo: 1 },
  TiqueteElectronico: { nombre: 'Tiquete electrónico', signo: 1 },
  NotaCreditoElectronica: { nombre: 'Nota de crédito', signo: -1 },
  NotaDebitoElectronica: { nombre: 'Nota de débito', signo: 1 },
  FacturaElectronicaCompra: { nombre: 'Factura electrónica de compra', signo: 1 },
  FacturaElectronicaExportacion: { nombre: 'Factura electrónica de exportación', signo: 1 },
  ReciboElectronicoPago: { nombre: 'Recibo electrónico de pago', signo: 1 },
};
const asArray = v => v == null ? [] : Array.isArray(v) ? v : [v];
function numero(v) { const n = Number(v && typeof v === 'object' ? v._ : v); return Number.isFinite(n) ? n : 0; }
function texto(v) { return v == null ? null : typeof v === 'object' && '_' in v ? String(v._) : String(v); }
function crearTotales() { return Object.fromEntries(TASAS.map(t => [t, 0])); }
function identificarDocumento(parsed) {
  for (const [raiz, info] of Object.entries(TIPOS_DOCUMENTO)) {
    if (parsed[raiz]) return {...info, raiz, doc: parsed[raiz]};
  }
  return null;
}
function versionXML(xml) { const m = xml.match(/xml-schemas\/v(\d+\.\d+)\//); return m ? m[1] : 'No identificada'; }
function datosMonedaDocumento(doc) {
  const r = doc.ResumenFactura || {};
  const moneda = r.CodigoTipoMoneda || {};
  const codigoOriginal = (texto(moneda.CodigoMoneda || r.CodigoMoneda) || 'CRC').trim().toUpperCase();
  if (!['CRC', 'USD'].includes(codigoOriginal)) throw new Error(`Moneda ${codigoOriginal} sin conversión configurada.`);
  const tasaXML = moneda.TipoCambio ?? r.TipoCambio;
  const tipoCambioOriginalXML = tasaXML == null ? null : numero(tasaXML);
  return {codigoOriginal,tipoCambioOriginalXML};
}
function monedaDocumento(doc, referencia=null) {
  const datos = datosMonedaDocumento(doc);
  const usd = datos.codigoOriginal==='USD';
  const cambio = usd ? Number(referencia?.valor ?? datos.tipoCambioOriginalXML) : 1;
  if (!Number.isFinite(cambio) || cambio<=0 || (usd && (cambio<100 || cambio>=1500))) {
    throw new Error('La factura USD no tiene un tipo de cambio válido. No se puede convertir a CRC.');
  }
  return {...datos, factor:cambio, tipoCambioAplicado:cambio,
    fuenteTipoCambio:usd ? (referencia?.fuente || 'XML (declarado por el emisor, sin verificación en línea)') : 'CRC',
    fechaTipoCambio:usd ? (referencia?.fecha || texto(doc.FechaEmision)?.slice(0,10) || null) : null,
    tipoCambioVerificado:usd ? Boolean(referencia?.verificado) : true};
}
function extraerIdentificacion(persona) { const id = persona?.Identificacion || {}; return { tipo: texto(id.Tipo), numero: texto(id.Numero || persona?.IdentificacionExtranjero) }; }
function persona(p) { return { nombre: texto(p?.Nombre), nombreComercial: texto(p?.NombreComercial), identificacion: extraerIdentificacion(p), correo: texto(p?.CorreoElectronico) }; }
/**
 * Impuesto.Monto es BRUTO en Hacienda 4.4. Para IVA a pagar se usa el NETO,
 * descontando exoneraciones e impuesto asumido por emisor/fábrica. Cuando
 * ImpuestoNeto de la línea difiere, se reconcilia solo si es inequívoco;
 * nunca se reparte a ciegas una diferencia entre impuestos diferentes.
 */
function extraerImpuestos(linea, signo, factor) {
  const impuestos = asArray(linea.Impuesto).map(i => {
    const bruto = numero(i.Monto);
    const exonerado = asArray(i.Exoneracion).reduce((a, e) => a + numero(e.MontoExoneracion), 0);
    if (bruto < -0.000001 || exonerado < -0.000001 || exonerado > bruto + 0.0002) {
      throw new Error(`Impuesto o exoneración no válida en línea ${texto(linea.NumeroLinea) || '?'}`);
    }
    return {
      codigo: texto(i.Codigo), codigoTarifa: texto(i.CodigoTarifaIVA ?? i.CodigoTarifa), tarifa: numero(i.Tarifa),
      montoBruto: bruto, montoExonerado: exonerado, montoNeto: Math.max(0, bruto - exonerado),
      exoneracion: i.Exoneracion || null,
    };
  });
  const declarado = linea.ImpuestoNeto == null ? null : numero(linea.ImpuestoNeto);
  const asumido = numero(linea.ImpuestoAsumidoEmisorFabrica);
  if (asumido < -0.000001) throw new Error('Impuesto asumido por emisor inválido');
  const suma = impuestos.reduce((n, i) => n + i.montoNeto, 0);
  const objetivo = declarado ?? Math.max(0, suma - asumido);
  const diferencia = suma - objetivo;
  if (objetivo < -0.0002 || diferencia < -0.0002) {
    throw new Error(`ImpuestoNeto no coincide con impuestos de la línea ${texto(linea.NumeroLinea) || '?'}`);
  }
  if (diferencia > 0.0002) {
    // Solo se puede determinar a qué tarifa descontar cuando existe un impuesto.
    if (impuestos.length !== 1) {
      throw new Error(`ImpuestoNeto ambiguo en línea ${texto(linea.NumeroLinea) || '?'} con múltiples impuestos; revisa el XML`);
    }
    impuestos[0].montoNeto = Math.max(0, objetivo);
  } else if (impuestos.length === 1 && declarado != null && Math.abs(diferencia) > 0) {
    // Ajuste mínimo por redondeo declarado por el emisor (hasta 0.0002).
    impuestos[0].montoNeto = Math.max(0, objetivo);
  }
  return impuestos.map(i => ({
    codigo:i.codigo, codigoTarifa:i.codigoTarifa, tarifa:i.tarifa,
    monto:i.montoNeto * signo * factor, impuestoNeto:i.montoNeto * signo * factor,
    montoBruto:i.montoBruto * signo * factor, montoExonerado:i.montoExonerado * signo * factor,
    exoneracion:i.exoneracion,
  }));
}
function extraerDetalleLineas(doc, signo, factor = 1) {
  return asArray(doc.DetalleServicio?.LineaDetalle).map((l, index) => {
    const impuestos = extraerImpuestos(l, signo, factor);
    return ({
    linea: numero(l.NumeroLinea) || index + 1,
    codigo: texto(l.CodigoCABYS || l.Codigo?.Codigo || l.Codigo),
    codigoCABYS: texto(l.CodigoCABYS),
    codigosComerciales: asArray(l.CodigoComercial).map(c => ({tipo: texto(c.Tipo), codigo: texto(c.Codigo)})),
    tipoTransaccion: texto(l.TipoTransaccion), cantidad: numero(l.Cantidad), unidadMedida: texto(l.UnidadMedida), detalle: texto(l.Detalle),
    precioUnitario: numero(l.PrecioUnitario) * factor, montoTotal: numero(l.MontoTotal) * signo * factor,
    descuentos: asArray(l.Descuento).map(d => ({monto: numero(d.MontoDescuento) * signo * factor, naturaleza: texto(d.NaturalezaDescuento), codigo: texto(d.CodigoDescuento)})),
    subtotal: numero(l.SubTotal) * signo * factor, baseImponible: numero(l.BaseImponible ?? l.MontoBase ?? l.MontoGravable ?? l.SubTotal) * signo * factor,
    impuestos, impuestoNeto: l.ImpuestoNeto != null
      ? numero(l.ImpuestoNeto) * signo * factor
      : impuestos.reduce((sum, i) => sum + i.monto, 0),
    montoTotalLinea: numero(l.MontoTotalLinea) * signo * factor,
    detalleSurtido: asArray(l.DetalleSurtido),
    });
  });
}
function extraerResumen(doc, signo, factor, moneda) {
  const r = doc.ResumenFactura || {};
  const money = key => numero(r[key]) * signo * factor;
  return {
    totalVenta: money('TotalVenta'), totalVentaNeta: money('TotalVentaNeta'), totalDescuentos: money('TotalDescuentos'),
    totalImpuesto: money('TotalImpuesto'), totalComprobante: money('TotalComprobante'),
    totalGravado: money('TotalGravado'), totalExento: money('TotalExento'), totalExonerado: money('TotalExonerado'),
    totalNoSujeto: money('TotalNoSujeto'), totalOtrosCargos: money('TotalOtrosCargos'), totalIVADevuelto: money('TotalIVADevuelto'),
    moneda: 'CRC', monedaOriginal: moneda.codigoOriginal, tipoCambio: moneda.tipoCambioAplicado,
    tipoCambioOriginalXML: moneda.tipoCambioOriginalXML,
    fuenteTipoCambio: moneda.fuenteTipoCambio, fechaTipoCambio: moneda.fechaTipoCambio,
    tipoCambioVerificado: moneda.tipoCambioVerificado,
    desgloseImpuestos: asArray(r.TotalDesgloseImpuesto).map(i => ({ codigo: texto(i.Codigo), codigoTarifa: texto(i.CodigoTarifaIVA ?? i.CodigoTarifa), monto: numero(i.TotalMontoImpuesto) * signo * factor })),
    medioPago: asArray(r.MedioPago).map(m => typeof m === 'string' ? {tipo: m, medio: m, total: null} : ({ tipo: texto(m.TipoMedioPago ?? m.CodigoMedioPago), medio: texto(m.MedioPago), total: m.TotalMedioPago != null ? numero(m.TotalMedioPago) * signo * factor : null })),
  };
}
function procesarDocumento(parsed, nombreArchivo, xml, referencia=null) {
  const id = identificarDocumento(parsed);
  if (!id) throw new Error('Tipo de comprobante no admitido o raíz XML desconocida');
  const {doc, signo} = id;
  const tipoDocumento = id.nombre;
  const moneda = monedaDocumento(doc, referencia);
  const factor = moneda.factor;
  const detalle = extraerDetalleLineas(doc, signo, factor);
  const resumen = extraerResumen(doc, signo, factor, moneda);
  const impuestos = []; const bases = crearTotales(); const desgloseTarifas = {};
  // Los totales de IVA se calculan con los impuestos de línea, no se duplican con el desglose del resumen.
  for (const linea of detalle) {
    const iva = linea.impuestos.filter(i => i.codigo === '01');
    const baseLinea = linea.baseImponible;
    const tasasEnLinea = new Set();
    for (const imp of iva) {
      const tasa = String(imp.tarifa);
      impuestos.push({...imp});
      const clave = `${imp.codigoTarifa || 'sin-codigo'}:${tasa}`;
      if (!desgloseTarifas[clave]) desgloseTarifas[clave] = {codigoTarifa: imp.codigoTarifa, tarifa: imp.tarifa, base: 0, impuesto: 0};
      desgloseTarifas[clave].impuesto += imp.monto;
      if (!tasasEnLinea.has(clave)) {
        const proporcion = Math.abs(imp.montoBruto) > 0.0000001
          ? Math.max(0, Math.min(1, imp.monto / imp.montoBruto)) : 1;
        desgloseTarifas[clave].base += baseLinea * proporcion;
        tasasEnLinea.add(clave);
      }
    }
    // Base para el gráfico legado: una sola vez por tarifa por línea.
    const tasas = new Set();
    for (const imp of iva) {
      const tasa = String(imp.tarifa);
      if (tasas.has(tasa) || !(tasa in bases)) continue;
      tasas.add(tasa);
      // La base del informe IVA representa la parte no exonerada de la línea.
      const proporcion = Math.abs(imp.montoBruto) > 0.0000001
        ? Math.max(0, Math.min(1, imp.monto / imp.montoBruto)) : 1;
      bases[tasa] += baseLinea * proporcion;
    }
  }
  return {
    nombreArchivo, versionXML: versionXML(xml), tipoDocumento, signo,
    comercio: texto(doc.Emisor?.Nombre) || 'Desconocido',
    total: resumen.totalComprobante, totalOriginal: numero(doc.ResumenFactura?.TotalComprobante),
    monedaOriginal: moneda.codigoOriginal, tipoCambioAplicado: moneda.tipoCambioAplicado,
    tipoCambioOriginalXML: moneda.tipoCambioOriginalXML,
    fuenteTipoCambio: moneda.fuenteTipoCambio, fechaTipoCambio: moneda.fechaTipoCambio,
    tipoCambioVerificado: moneda.tipoCambioVerificado,
    fecha: texto(doc.FechaEmision || doc.FechaEmisionDocumento), clave: texto(doc.Clave), consecutivo: texto(doc.NumeroConsecutivo || doc.Consecutivo),
    codigoActividadEmisor: texto(doc.CodigoActividadEmisor || doc.CodigoActividad), codigoActividadReceptor: texto(doc.CodigoActividadReceptor),
    proveedorSistemas: texto(doc.ProveedorSistemas), condicionVenta: texto(doc.CondicionVenta),
    emisor: persona(doc.Emisor), receptor: persona(doc.Receptor),
    referencias: asArray(doc.InformacionReferencia), otrosCargos: asArray(doc.OtrosCargos),
    impuestos, bases, desgloseTarifas, resumen, detalle,
  };
}
async function parsearXML(xml) {
  return xml2js.parseStringPromise(xml, {explicitArray: false, tagNameProcessors: [xml2js.processors.stripPrefix]});
}
async function procesarXML(xml) {
  const parsed = await parsearXML(xml);
  const doc = procesarDocumento(parsed, 'documento.xml', xml);
  return {tipoDocumento: doc.tipoDocumento, signo: doc.signo, impuestos: doc.impuestos, bases: doc.bases};
}

module.exports = {datosMonedaDocumento, TASAS, TIPOS_DOCUMENTO, crearTotales, identificarDocumento, procesarDocumento, parsearXML, procesarXML, extraerDetalleLineas, monedaDocumento};
