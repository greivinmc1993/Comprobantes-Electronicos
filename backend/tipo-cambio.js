'use strict';
/**
 * Cotizaciones USD/CRC de referencia publicadas por el Ministerio de Hacienda.
 * La referencia es la VENTA del BCCR, requerida en la estructura XML 4.4.
 * Solo se envían fechas al servicio oficial; NUNCA se envían XML, cédulas o clientes.
 */
const ORIGEN = 'Ministerio de Hacienda / referencia BCCR';
const BASE = 'https://api.hacienda.go.cr/indicadores/tc/dolar';
const LIMITE_MS = 9000;
const CACHE_ACTUAL_MS = 5 * 60 * 1000;

function diaCR(fecha = new Date()) {
  const partes = new Intl.DateTimeFormat('en-US', {timeZone:'America/Costa_Rica',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(fecha);
  const valor = tipo => partes.find(p => p.type === tipo)?.value;
  return `${valor('year')}-${valor('month')}-${valor('day')}`;
}
function fechaISO(valor) {
  const s = String(valor || '').slice(0,10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y,m,d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y,m-1,d));
  return dt.getUTCFullYear()===y && dt.getUTCMonth()===m-1 && dt.getUTCDate()===d ? s : null;
}
function restarDias(fecha, dias) {
  const d=new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate()-dias);
  return d.toISOString().slice(0,10);
}
function tasa(valor) {
  const num=typeof valor==='object' && valor!==null ? Number(valor.valor ?? valor.value ?? valor.monto) : Number(valor);
  return Number.isFinite(num) && num >= 100 && num < 1500 ? num : null;
}
function fechaDato(obj, defecto=null) {
  const s=typeof obj === 'object' && obj ? obj.fecha ?? obj.date ?? obj.dia ?? obj.Fecha : obj;
  const d=String(s||'');
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(d)) { const [dd,mm,yyyy]=d.split('/');return fechaISO(`${yyyy}-${mm}-${dd}`); }
  return fechaISO(d)||defecto;
}
function normalizarActual(data) {
  const venta = tasa(data?.venta);
  const compra = tasa(data?.compra);
  const fecha=fechaDato(data?.venta)||fechaDato(data?.compra)||fechaDato(data);
  if (!fecha || !venta || !compra || compra>venta) throw new Error('Hacienda devolvió una cotización incompleta o inválida');
  return {fecha, compra, venta, origen:ORIGEN};
}
function normalizarHistorico(data, fechaBuscada) {
  // Esquemas posibles: [{fecha,compra,venta}], {fecha:{compra,venta}},
  // {compra:[{fecha,valor}], venta:[{fecha,valor}]} y {datos:[...]}.
  const registros=new Map();
  function registrar(fecha,tipo,valor) {
    fecha=fechaDato(fecha);
    const n=tasa(valor);
    if (!fecha || !n || fecha>fechaBuscada) return;
    const row=registros.get(fecha)||{fecha};row[tipo]=n;registros.set(fecha,row);
  }
  function recorrer(obj, profundidad=0, contexto=null) {
    if (!obj || typeof obj!=='object' || profundidad>7) return;
    if (Array.isArray(obj)) {obj.forEach(o=>recorrer(o,profundidad+1,contexto));return;}
    const f=fechaDato(obj);
    const compra=tasa(obj.compra ?? obj.Compra);
    const venta=tasa(obj.venta ?? obj.Venta);
    if (f && compra) registrar(f,'compra',compra);
    if (f && venta) registrar(f,'venta',venta);
    if (f && contexto && tasa(obj.valor ?? obj.value)) registrar(f,contexto,obj.valor ?? obj.value);
    for (const [k,v] of Object.entries(obj)) {
      const tipo= /^(compra|compras)$/i.test(k)?'compra':/^(venta|ventas)$/i.test(k)?'venta':null;
      if (fechaISO(k) && v && typeof v==='object') recorrer({...v,fecha:k},profundidad+1,contexto);
      else if (fechaISO(k) && contexto) registrar(k,contexto,v);
      else if (v && typeof v==='object') recorrer(v,profundidad+1,tipo||contexto);
    }
  }
  recorrer(data);
  const lista=[...registros.values()].filter(r=>r.venta && r.compra && r.compra<=r.venta).sort((a,b)=>b.fecha.localeCompare(a.fecha));
  return lista[0] ? {...lista[0],origen:ORIGEN} : null;
}
async function consultarJSON(url, fetchFn=fetch) {
  const controlador=new AbortController();
  const timeout=setTimeout(()=>controlador.abort(),LIMITE_MS);
  try {
    const respuesta=await fetchFn(url,{signal:controlador.signal,headers:{Accept:'application/json'}});
    if (!respuesta.ok) throw new Error(`Hacienda HTTP ${respuesta.status}`);
    return await respuesta.json();
  } finally {clearTimeout(timeout);}
}
function crearServicioTipoCambio({base,fetchFn=fetch}={}) {
  if (!base) throw new Error('Se requiere la base SQLite para guardar el histórico');
  const pendientes=new Map();
  const cacheSesion=new Map();
  let ultimaConsulta=null;
  let reintentarRedDesde=0;
  async function vigente({forzar=false}={}) {
    if (!forzar && ultimaConsulta && Date.now()-ultimaConsulta.ms<CACHE_ACTUAL_MS) return ultimaConsulta.dato;
    try {
      const dato=normalizarActual(await consultarJSON(BASE,fetchFn));
      base.guardarTipoCambio(dato);
      reintentarRedDesde=0;
      ultimaConsulta={ms:Date.now(),dato:{...dato,fuente:'hacienda'}};
      return ultimaConsulta.dato;
    } catch(error) {
      reintentarRedDesde=Date.now()+60000;
      const anterior=base.ultimoTipoCambio();
      if (anterior) return {...anterior,fuente:'cache',advertencia:`Sin conexión con Hacienda: ${error.message}`};
      return {disponible:false,advertencia:`No se obtuvo el tipo de cambio: ${error.message}`};
    }
  }
  async function historico(fecha) {
    if (cacheSesion.has(fecha)) return {...cacheSesion.get(fecha),fuente:'cache-oficial'};
    const guardado=base.tipoCambioResuelto?.(fecha) || base.tipoCambioFecha(fecha);
    if (guardado) {cacheSesion.set(fecha,guardado);return {...guardado,fuente:'cache-oficial'};}
    const hoy=diaCR();
    if (fecha>hoy) throw new Error('No se puede consultar un tipo de cambio futuro');
    if (fecha===hoy) {
      const actual=await vigente();
      if (actual.venta && actual.fecha===fecha) {cacheSesion.set(fecha,actual);return actual;}
    }
    if(Date.now()<reintentarRedDesde) throw new Error('Servicio no disponible recientemente; se reintentará luego');
    const inicio=restarDias(fecha,9);
    const url=`${BASE}/historico?d=${inicio}&h=${fecha}`;
    let json;
    try {json=await consultarJSON(url,fetchFn);reintentarRedDesde=0;}
    catch(error) {reintentarRedDesde=Date.now()+60000;throw error;}
    const fila=normalizarHistorico(json,fecha);
    if (!fila) throw new Error('El histórico de Hacienda no devolvió una cotización de venta identificable para la fecha');
    // Persistir tanto la tasa publicada como la fecha solicitada (feriados/fines de semana).
    if (typeof base.guardarTipoCambioResuelto === 'function') base.guardarTipoCambioResuelto(fecha,fila);
    else base.guardarTipoCambio(fila); // compatibilidad con implementaciones anteriores.
    cacheSesion.set(fecha,fila);
    return {...fila,fuente:'hacienda'};
  }
  async function resolverUSD(fechaEmision,tasaDeclaradaXML) {
    const fecha=fechaISO(fechaEmision);
    if (!fecha) throw new Error('El XML USD no tiene una fecha de emisión válida');
    if (!pendientes.has(fecha)) pendientes.set(fecha,historico(fecha).finally(()=>pendientes.delete(fecha)));
    try {
      const c=await pendientes.get(fecha);
      return {valor:c.venta,fecha:c.fecha,fuente:c.fuente==='cache-oficial'?'BCCR (caché oficial)':ORIGEN,
        verificado:true,compra:c.compra,venta:c.venta};
    } catch(error) {
      const xml=tasa(tasaDeclaradaXML);
      if (!xml) throw new Error(`No se pudo consultar el tipo de cambio del ${fecha} y el XML no trae uno válido: ${error.message}`);
      return {valor:xml,fecha,fuente:'XML (declarado por el emisor, sin verificación en línea)',
        verificado:false,advertencia:`Sin consulta oficial: ${error.message}`};
    }
  }
  return {vigente,historico,resolverUSD};
}
module.exports={crearServicioTipoCambio,normalizarActual,normalizarHistorico,fechaISO,diaCR,tasa,restarDias};
