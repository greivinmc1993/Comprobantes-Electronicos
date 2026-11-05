/**
 * Fechas de emisión (YYYY-MM-DD), independientes de UTC y de la zona horaria
 * de la máquina. No se modifica el documento ni su valor contable.
 */
const pad = n => String(n).padStart(2,'0');
export const fechaLocal = fecha => `${fecha.getFullYear()}-${pad(fecha.getMonth()+1)}-${pad(fecha.getDate())}`;
const inicioMes = (anio,mes) => `${anio}-${pad(mes)}-01`;
const finMes = (anio,mes) => `${anio}-${pad(mes)}-${pad(new Date(anio,mes,0).getDate())}`;
const esFecha = valor => {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(valor||''))) return false;
  const [anio,mes,dia] = valor.split('-').map(Number);
  return mes>=1 && mes<=12 && dia>=1 && dia<=new Date(anio,mes,0).getDate();
};
export function obtenerRangoPanel(filtro,actual=new Date()) {
  const fechaHoy=fechaLocal(actual);
  const anio=actual.getFullYear();
  const mes=actual.getMonth()+1;
  switch(filtro.modo) {
    case 'actual': return {desde:inicioMes(anio,mes),hasta:fechaHoy,valido:true};
    case 'anterior': {
      const d=new Date(anio,mes-2,1);
      return {desde:inicioMes(d.getFullYear(),d.getMonth()+1),hasta:finMes(d.getFullYear(),d.getMonth()+1),valido:true};
    }
    case 'tres': {
      const d=new Date(anio,mes-3,1);
      return {desde:inicioMes(d.getFullYear(),d.getMonth()+1),hasta:fechaHoy,valido:true};
    }
    case 'anio': return {desde:inicioMes(anio,1),hasta:fechaHoy,valido:true};
    case 'mes': {
      const valor=String(filtro.mes||'');
      if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(valor)) return {desde:'',hasta:'',valido:false};
      const [y,m]=valor.split('-').map(Number);
      return {desde:inicioMes(y,m),hasta:finMes(y,m),valido:true};
    }
    case 'rango': {
      const desde=String(filtro.desde||'');
      const hasta=String(filtro.hasta||'');
      return {desde,hasta,valido:esFecha(desde)&&esFecha(hasta)&&desde<=hasta};
    }
    default: return {desde:'',hasta:'',valido:true};
  }
}
export function filtrarPorPeriodo(documentos,rango) {
  if(!rango.valido) return [];
  if(!rango.desde && !rango.hasta) return documentos;
  return documentos.filter(documento=>{
    // La fecha del XML tiene formato ISO, con o sin zona horaria.
    const fecha=String(documento.fecha||'').slice(0,10);
    return esFecha(fecha) && (!rango.desde || fecha>=rango.desde) && (!rango.hasta || fecha<=rango.hasta);
  });
}
export function mismoMes(rango) {
  return Boolean(rango.valido && rango.desde && rango.hasta && rango.desde.slice(0,7)===rango.hasta.slice(0,7));
}
export function etiquetaRango(rango) {
  if(!rango.valido) return 'Rango de fechas inválido';
  if(!rango.desde && !rango.hasta) return 'Todo el historial';
  const formatear = fecha => fecha.split('-').reverse().join('/');
  return `Del ${formatear(rango.desde)} al ${formatear(rango.hasta)}`;
}
