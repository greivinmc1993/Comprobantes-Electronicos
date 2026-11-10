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
 * Los importes XML se publican hasta con 5 decimales, aunque algunos emisores
 * redondean sus importes a 2. La tolerancia toma la precisión DECLARADA de
 * cada operando, sin aceptar arbitrariamente diferencias de un colón.
 */
function decimalFiscal(v, etiqueta, linea) {
  const original = texto(v);
  if (original == null) return {valor:0, semiancho:0};
  const cadena = original.trim();
  if (!/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(cadena)) {
    throw new Error(`${etiqueta} no es un decimal válido en línea ${linea}`);
  }
  const valor = Number(cadena);
  if (!Number.isFinite(valor)) throw new Error(`${etiqueta} fuera de rango en línea ${linea}`);
  const nDecimales = cadena.includes('.') ? cadena.split('.')[1].length : 0;
  return {valor, semiancho: 0.5 * 10 ** (-nDecimales)};
}

/**
 * Hacienda 4.4 permite desglose de impuestos en el surtido/paquete/combo.
 * Allí los impuestos de componentes sustituyen al desglose normal de línea
 * y no deben sumarse dos veces. Cada IVA mantiene su propia tarifa.
 */
function impuestosDeclaradosEnLinea(linea) {
  const surtidos = asArray(linea.DetalleSurtido?.LineaDetalleSurtido || linea.DetalleSurtido?.LineaDetalle);
  const impuestosSurtido = surtidos.flatMap((componente, indice) => asArray(componente.ImpuestoSurtido).map(i => ({
    Codigo: i.CodigoImpuestoSurtido,
    CodigoTarifaIVA: i.CodigoTarifaIVASurtido,
    Tarifa: i.TarifaSurtido,
    Monto: i.MontoImpuestoSurtido ?? i.MontolmpuestoSurtido,
    Exoneracion: i.ExoneracionSurtido ?? i.Exoneracion,
    _componenteSurtido: true,
    _indiceSurtido: indice,
    _baseImponible: componente.BaseImponibleSurtido ?? componente.SubTotalSurtido,
  })));
  return impuestosSurtido.length ? impuestosSurtido : asArray(linea.Impuesto);
}

/**
 * ImpuestoNeto = impuestos brutos menos exoneraciones e impuestos asumidos.
 * Una diferencia de redondeo compatible con la precisión XML se acepta; una
 * diferencia material no se reparte a ciegas entre tarifas o impuestos.
 */
function extraerImpuestos(linea, signo, factor) {
  const numeroLinea = texto(linea.NumeroLinea) || '?';
  const originales = impuestosDeclaradosEnLinea(linea);
  const impuestos = originales.map(i => {
    const brutoD = decimalFiscal(i.Monto, 'Impuesto.Monto', numeroLinea);
    const exoneraciones = asArray(i.Exoneracion).map(e => decimalFiscal(e.MontoExoneracion,'MontoExoneracion',numeroLinea));
    const bruto = brutoD.valor;
    const exonerado = exoneraciones.reduce((a,e) => a + e.valor, 0);
    if (bruto < -0.000001 || exonerado < -0.000001 || exonerado > bruto + 0.00001) {
      throw new Error(`Impuesto o exoneración no válida en línea ${numeroLinea}`);
    }
    return {
      codigo: texto(i.Codigo), codigoTarifa: texto(i.CodigoTarifaIVA ?? i.CodigoTarifa), tarifa: numero(i.Tarifa),
      montoBruto: bruto, montoExonerado: exonerado, montoNeto: Math.max(0, bruto - exonerado),
      incertidumbre: brutoD.semiancho + exoneraciones.reduce((a,e) => a + e.semiancho,0),
      exoneracion: i.Exoneracion || null,
      baseSurtido: i._baseImponible == null ? null : numero(i._baseImponible),
      esSurtido: Boolean(i._componenteSurtido),
      indiceSurtido: i._indiceSurtido ?? null,
    };
  });
  const declaradoD = linea.ImpuestoNeto == null ? null : decimalFiscal(linea.ImpuestoNeto, 'ImpuestoNeto', numeroLinea);
  const asumidoD = linea.ImpuestoAsumidoEmisorFabrica == null
    ? {valor:0,semiancho:0} : decimalFiscal(linea.ImpuestoAsumidoEmisorFabrica,'ImpuestoAsumidoEmisorFabrica',numeroLinea);
  const asumido = asumidoD.valor;
  if (asumido < -0.000001) throw new Error(`Impuesto asumido por emisor inválido en línea ${numeroLinea}`);
  const suma = impuestos.reduce((n, i) => n + i.montoNeto, 0);
  const esperado = suma - asumido;
  const objetivo = declaradoD?.valor ?? Math.max(0, esperado);
  const diferencia = objetivo - esperado;
  // El valor decimal es declarativo: su cantidad de ceros finales NO autoriza
  // aceptar otra cifra diferente sin contrastarla con el total de la linea.
  // Antes se sumaban semianchos de ".00" y se aceptaban diferencias de 0.01
  // sin verificación cruzada. Mantener estricta la primera comparación.
  const toleranciaOriginal = 0.00002;

  // Los XML recibidos muestran variaciones de 0.00005 CRC con importes de cinco
  // decimales, inferiores a una diezmilésima de colón. No representan una
  // diferencia fiscal material y no requieren alterar los XML originales.
  const microTolerancia = Math.max(toleranciaOriginal, 0.00010001);
  let reconciliacion = null;
  const redondearCentimos = n => Math.round((n + Number.EPSILON) * 100);

  if (objetivo < -microTolerancia) {
    throw new Error(`ImpuestoNeto negativo en línea ${numeroLinea}: ${objetivo.toFixed(5)}`);
  }
  if (Math.abs(diferencia) > toleranciaOriginal && Math.abs(diferencia) <= microTolerancia) {
    reconciliacion = 'diferencia inferior a 0.0001 CRC';
  }
  if (Math.abs(diferencia) > microTolerancia && impuestos.length > 1) {
    // En XML 4.4 un mismo renglón puede contener varios códigos de impuesto.
    // El nodo ImpuestoNeto es el TOTAL de la línea, no el neto de cada tarifa.
    // Una diferencia pequeña solo se concilia si el total de línea confirma
    // independientemente el mismo impuesto neto. NO se asigna a una tarifa.
    const subtotalD = linea.SubTotal == null ? null : decimalFiscal(linea.SubTotal, 'SubTotal', numeroLinea);
    const totalD = linea.MontoTotalLinea == null ? null : decimalFiscal(linea.MontoTotalLinea, 'MontoTotalLinea', numeroLinea);
    const margenLinea = subtotalD && totalD && declaradoD
      ? Math.max(0.00010001, Math.min(0.00500001, Math.max(subtotalD.semiancho,totalD.semiancho,declaradoD.semiancho) + 0.00000001))
      : 0;
    const coincideTotal = subtotalD && totalD && declaradoD &&
      Math.abs(totalD.valor - subtotalD.valor - objetivo) <= margenLinea;
    if (Math.abs(diferencia) > 0.01000001 || !coincideTotal) {
      throw new Error(`ImpuestoNeto no conciliado en línea ${numeroLinea} con múltiples impuestos: ` +
        `declarado ${objetivo.toFixed(5)}, suma neta ${esperado.toFixed(5)}, ` +
        `diferencia ${diferencia.toFixed(5)}. Verifica los impuestos y el total de línea.`);
    }
    reconciliacion = `ajuste de redondeo ${diferencia.toFixed(5)} CRC conciliado con MontoTotalLinea; ` +
      'sin asignación automática a una tarifa';
  }
  if (Math.abs(diferencia) > microTolerancia && impuestos.length <= 1) {
    // Hay emisores que publican Impuesto.Monto con más decimales, mientras
    // ImpuestoNeto se concilia con MontoTotalLinea - SubTotal. Aceptamos como
    // redondeo como máximo 1 céntimo si existe UNA tarifa y DOS comprobaciones
    // independientes coinciden: total de línea y monto fiscal redondeado.
    const tieneCamposLinea = linea.SubTotal != null && linea.MontoTotalLinea != null;
    const subtotalD = tieneCamposLinea ? decimalFiscal(linea.SubTotal, 'SubTotal', numeroLinea) : null;
    const montoLineaD = tieneCamposLinea ? decimalFiscal(linea.MontoTotalLinea, 'MontoTotalLinea', numeroLinea) : null;
    const diferenciaTotal = tieneCamposLinea ? (montoLineaD.valor - subtotalD.valor) - objetivo : Infinity;
    const toleranciaTotal = tieneCamposLinea
      ? Math.max(0.00010001, montoLineaD.semiancho + subtotalD.semiancho + (declaradoD?.semiancho || 0) + 0.00000001)
      : 0;
    const conciliaTotal = Math.abs(diferenciaTotal) <= toleranciaTotal;
    const conciliaImpuestoCentesimos = redondearCentimos(esperado) === redondearCentimos(objetivo);
    const unico = impuestos.length === 1 && !impuestos[0].esSurtido;
    const tasa = impuestos[0]?.tarifa;
    const base = linea.BaseImponible ?? linea.SubTotal;
    const conciliaBaseTarifa = unico && impuestos[0].codigo === '01' &&
      base != null && Number.isFinite(tasa) && tasa > 0 &&
      impuestos[0].montoExonerado === 0 && asumido === 0 &&
      redondearCentimos(numero(base) * tasa / 100) === redondearCentimos(objetivo);
    const diferenciaMaxima = Math.abs(diferencia) <= 0.01000001;
    if (unico && declaradoD && diferenciaMaxima && conciliaTotal &&
        (conciliaImpuestoCentesimos || conciliaBaseTarifa)) {
      reconciliacion = `ajuste de redondeo conciliado con total de línea (${diferencia.toFixed(5)} CRC)`;
    } else {
      throw new Error(`ImpuestoNeto no coincide con impuestos de la línea ${numeroLinea}: declarado ${objetivo.toFixed(5)}, ` +
        `calculado ${esperado.toFixed(5)}, diferencia ${diferencia.toFixed(5)}, impuestos ${impuestos.length}. ` +
        'No se pudo justificar por precisión ni conciliar con el total de línea y la tarifa.');
    }
  }
  // Cuando solo hay un impuesto, el impuesto neto DECLARADO determina el IVA
  // contable. Se conserva el impuesto bruto original para auditoría. No se
  // distribuye automáticamente un ajuste entre tarifas distintas.
  if (impuestos.length === 1) {
    // Solo si hay un impuesto se sabe a qué tipo/tarifa corresponde el neto.
    impuestos[0].montoNeto = Math.max(0, objetivo);
  }
  const respuesta = impuestos.map(i => ({
    codigo:i.codigo, codigoTarifa:i.codigoTarifa, tarifa:i.tarifa,
    monto:i.montoNeto * signo * factor, impuestoNeto:i.montoNeto * signo * factor,
    montoBruto:i.montoBruto * signo * factor, montoExonerado:i.montoExonerado * signo * factor,
    exoneracion:i.exoneracion, baseSurtido:i.baseSurtido == null ? null : i.baseSurtido * signo * factor,
    esSurtido:i.esSurtido, indiceSurtido:i.indiceSurtido,
    observacionRedondeo: impuestos.length === 1 ? reconciliacion : null,
  }));
  if (impuestos.length > 1) {
    // Mantener la suma de los impuestos netos igual al ImpuestoNeto DECLARADO,
    // pero sin inventar una atribución por tarifa: incluye el impuesto asumido
    // y un posible ajuste de redondeo. No se suma al IVA por tarifa.
    const ajuste = objetivo - suma;
    if (Math.abs(ajuste) > 0.00000001) {
      respuesta.push({
        codigo:'AJUSTE_NO_ATRIBUIDO',codigoTarifa:null,tarifa:0,
        monto:ajuste * signo * factor,impuestoNeto:ajuste * signo * factor,
        montoBruto:0,montoExonerado:0,exoneracion:null,baseSurtido:null,
        esSurtido:false,indiceSurtido:null,ajusteNoAtribuido:true,
        observacionRedondeo: reconciliacion ||
          `impuestos asumidos por el emisor ${asumido.toFixed(5)} CRC; ` +
          'importe neto conservado sin atribuirlo a una tarifa',
      });
    }
  }
  return respuesta;
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
    ajusteNetoSinTarifa: impuestos.filter(i => i.ajusteNoAtribuido).reduce((n,i)=>n+i.monto,0),
    observacionesFiscales: [...new Set(impuestos.map(i => i.observacionRedondeo).filter(Boolean))],
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
      const claveBase = imp.esSurtido ? `${clave}:surtido:${imp.indiceSurtido}` : clave;
      if (!tasasEnLinea.has(claveBase)) {
        const proporcion = Math.abs(imp.montoBruto) > 0.0000001
          ? Math.max(0, Math.min(1, imp.monto / imp.montoBruto)) : 1;
        desgloseTarifas[clave].base += (imp.baseSurtido == null ? baseLinea : imp.baseSurtido) * proporcion;
        tasasEnLinea.add(claveBase);
      }
    }
    // Base para el gráfico legado: una sola vez por tarifa por línea.
    const tasas = new Set();
    for (const imp of iva) {
      const tasa = String(imp.tarifa);
      const claveTasa = imp.esSurtido ? `${tasa}:surtido:${imp.indiceSurtido}` : tasa;
      if (tasas.has(claveTasa) || !(tasa in bases)) continue;
      tasas.add(claveTasa);
      // La base del informe IVA representa la parte no exonerada de la línea.
      const proporcion = Math.abs(imp.montoBruto) > 0.0000001
        ? Math.max(0, Math.min(1, imp.monto / imp.montoBruto)) : 1;
      bases[tasa] += (imp.baseSurtido == null ? baseLinea : imp.baseSurtido) * proporcion;
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
    ajusteNetoSinTarifa: detalle.reduce((n,l)=>n+(l.ajusteNetoSinTarifa||0),0),
    observacionesFiscales: detalle.flatMap(l => (l.observacionesFiscales || []).map(mensaje => ({linea:l.linea,mensaje}))),
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
