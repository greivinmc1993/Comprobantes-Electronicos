import React,{useCallback,useEffect,useMemo,useState} from 'react';

const money = cents=>'₡'+Math.round(Number(cents||0)/100).toLocaleString('es-CR');
const dayUTC=d=>d.toISOString().slice(0,10);
const defaultRange=()=>{const now=new Date();return {from:dayUTC(new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),1))),to:dayUTC(now)};};
const fmtCount=n=>Number(n||0).toLocaleString('es-CR');
const numberOfPages=(total)=>Math.max(1,Math.ceil(total/50));
const presetRange=(kind)=>{
 const now=new Date(), today=dayUTC(now),y=now.getUTCFullYear(),m=now.getUTCMonth();
 if(kind==='hoy')return {from:today,to:today};
 if(kind==='ayer'){const d=new Date(now);d.setUTCDate(d.getUTCDate()-1);return {from:dayUTC(d),to:dayUTC(d)}};
 if(kind==='semana'){const d=new Date(now);d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7);return {from:dayUTC(d),to:today}};
 if(kind==='mes')return {from:dayUTC(new Date(Date.UTC(y,m,1))),to:today};
 return {from:dayUTC(new Date(Date.UTC(y,0,1))),to:today};
};
const downloadBlob=(blob,filename)=>{const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=filename;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000)};
const activeFilters=(from,to,client,type,method,status)=>new URLSearchParams({from,to,client,type,method,status}).toString();

function Metric({label,value,note,icon,tone='green'}){return <div className={'bizDashMetric bizDashMetric-'+tone}><div className="bizDashMetricTop"><span>{label}</span><span className="bizDashMetricIcon" aria-hidden="true">{icon}</span></div><strong>{value}</strong><small>{note}</small></div>}
function Section({title,description,children,extra=''}){return <article className={'card bizDashSection '+extra}><div className="bizDashSectionHead"><h4>{title}</h4><p className="hint">{description}</p></div>{children}</article>}
function Ranking({items,label,unit}){return items.length?<div className="bizDashRanking">{items.map((p,i)=><div className="bizDashRankingRow" key={`${p.client_id??p.product_id??'x'}-${p.name||p.description}-${i}`}><span className="bizDashRank">{i+1}</span><div className="bizDashRankingName"><strong>{p.name||p.description}</strong><small>{fmtCount(unit==='clientes'?p.purchases:p.units)} {unit==='clientes'?'compras':'unidades'}{unit==='clientes'&&p.identification?' · '+p.identification:''}</small></div><b>{money(p.revenue_cents)}</b></div>)}</div>:<p className="bizDashEmpty">Sin movimientos para estos filtros.</p>}

export default function DashboardPanel({companyId,company}){
 const initial=useMemo(defaultRange,[]);
 const [from,setFrom]=useState(initial.from),[to,setTo]=useState(initial.to);
 const [client,setClient]=useState('todos'),[clientSearch,setClientSearch]=useState(''),[clients,setClients]=useState([]);
 const [type,setType]=useState('todas'),[method,setMethod]=useState('todas'),[status,setStatus]=useState('activas');
 const [data,setData]=useState(null),[busy,setBusy]=useState(false),[exportBusy,setExportBusy]=useState(''),[error,setError]=useState(''),[message,setMessage]=useState('');
 const [page,setPage]=useState(1),[sales,setSales]=useState(null);
 const query=useMemo(()=>activeFilters(from,to,client,type,method,status),[from,to,client,type,method,status]);
 useEffect(()=>{setClient('todos');setClientSearch('');setClients([]);setMethod('todas');if(!companyId)return;
  const ctrl=new AbortController();fetch(`/api/companies/${companyId}/clients`,{signal:ctrl.signal}).then(async r=>{if(!r.ok)throw Error('No se pudieron cargar los clientes.');return r.json()}).then(list=>{if(!ctrl.signal.aborted)setClients(list)}).catch(e=>{if(e.name!=='AbortError'&&!ctrl.signal.aborted)setError(e.message)});
  return()=>ctrl.abort();
 },[companyId]);
 const load=useCallback(async(signal)=>{
  if(!companyId){setData(null);return}
  setBusy(true);setError('');setMessage('');setData(null);
  try{const response=await fetch(`/api/companies/${companyId}/dashboard?${query}`,{signal});const json=await response.json();if(!response.ok)throw Error(json.error||'No se pudo cargar el dashboard.');if(!signal?.aborted)setData(json)}
  catch(e){if(e.name!=='AbortError'&&!signal?.aborted)setError(e.message)}finally{if(!signal?.aborted)setBusy(false)}
 },[companyId,query]);
 useEffect(()=>{const ctrl=new AbortController();load(ctrl.signal);return()=>ctrl.abort()},[load]);
 useEffect(()=>{setPage(1)},[query,companyId]);
 useEffect(()=>{if(!companyId||!data)return;
  const ctrl=new AbortController();setSales(null);
  fetch(`/api/companies/${companyId}/dashboard/sales?${query}&page=${page}`,{signal:ctrl.signal}).then(async r=>{const json=await r.json();if(!r.ok)throw Error(json.error||'No se pudo cargar el detalle.');return json}).then(json=>{if(!ctrl.signal.aborted)setSales(json)}).catch(e=>{if(e.name!=='AbortError'&&!ctrl.signal.aborted)setError(e.message)});
  return()=>ctrl.abort();
 },[companyId,query,page,data]);
 const applyPreset=k=>{const range=presetRange(k);setFrom(range.from);setTo(range.to)};
 const runExport=async(format,kind)=>{
  if(!companyId||!data)return;
  setExportBusy(`${format}:${kind}`);setError('');setMessage('');
  try{
   const response=await fetch(`/api/companies/${companyId}/dashboard/export.${format==='pdf'?'html':'csv'}?${query}&kind=${kind}`);
   if(!response.ok){let detail='No se pudo generar el reporte.';try{detail=(await response.json()).error||detail}catch{}throw Error(detail)}
   const name=`FacturaCR_${kind}_${from}_${to}`;
   if(format==='csv'){downloadBlob(await response.blob(),name+'.csv');setMessage('Reporte CSV generado correctamente.')}
   else{
    if(!window.facturacrReports?.savePdf)throw Error('La exportación PDF requiere la aplicación FacturaCR de escritorio.');
    const html=await response.text();const result=await window.facturacrReports.savePdf(html,name+'.pdf',{landscape:kind==='detallado'});
    if(result?.cancelled)return;
    if(!result?.success)throw Error(result?.error||'No se pudo guardar el PDF.');
    setMessage('PDF guardado correctamente: '+result.path);
   }
  }catch(e){setError(e.message)}finally{setExportBusy('')}
 };
 const visibleClients=clients.filter(c=>[c.name,c.trade_name,c.identification,c.phone,c.email].some(x=>String(x||'').toLowerCase().includes(clientSearch.toLowerCase().trim()))).slice(0,60);
 const selectedClient=clients.find(c=>String(c.id)===client);
 const s=data?.summary;const peak=Math.max(1,...(data?.daily||[]).map(d=>d.revenue_cents));
 return <section className="bizDashboard bizDashAdvanced">
  <div className="card bizDashHero"><div><p className="bizDashEyebrow">CENTRO DE INTELIGENCIA COMERCIAL · DATOS LOCALES</p><h3>{company?.trade_name||company?.legal_name||'Dashboard de tu empresa'}</h3><p className="hint">Indicadores y movimientos de la empresa activa, calculados directamente desde SQLite. Sin mezclar empresas.</p></div><button className="secondary" disabled={busy||!companyId} onClick={()=>load()}>↻ {busy?'Actualizando…':'Actualizar'}</button></div>
  <div className="card bizDashFiltersAdvanced"><div className="bizDashFilterHeading"><strong>Filtros del reporte</strong><span>Las mismas condiciones se aplican al dashboard, a la tabla y a los archivos exportados.</span></div>
   <div className="bizDashPresets">{[['hoy','Hoy'],['ayer','Ayer'],['semana','Esta semana'],['mes','Este mes'],['año','Este año']].map(([id,label])=><button type="button" className="secondary" key={id} onClick={()=>applyPreset(id)}>{label}</button>)}</div>
   <div className="bizDashFilterGrid">
    <label>Desde (UTC)<input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label><label>Hasta (UTC)<input type="date" value={to} onChange={e=>setTo(e.target.value)}/></label>
    <label>Condición de venta<select value={type} onChange={e=>setType(e.target.value)}><option value="todas">Contado y crédito</option><option value="contado">Contado</option><option value="credito">Crédito</option></select></label>
    <label>Estado<select value={status} onChange={e=>setStatus(e.target.value)}><option value="activas">Ventas activas</option><option value="anuladas">Solo anuladas</option><option value="todas">Todas (separadas)</option></select></label>
    <label>Método de pago<select value={method} onChange={e=>setMethod(e.target.value)}><option value="todas">Todos los métodos</option>{(data?.methods_available||[]).map(m=><option key={m} value={m}>{m}</option>)}</select></label>
    <label>Cliente<input type="search" value={clientSearch} onChange={e=>setClientSearch(e.target.value)} placeholder="Nombre, cédula, teléfono o correo"/></label>
   </div>
   <div className="bizDashClientChoices"><button type="button" className={client==='todos'?'bizDashChoice active':'bizDashChoice'} onClick={()=>setClient('todos')}>Todos los clientes</button><button type="button" className={client==='final'?'bizDashChoice active':'bizDashChoice'} onClick={()=>setClient('final')}>Consumidor final</button>{selectedClient&&<button type="button" className="bizDashChoice active" onClick={()=>{setClient('todos');setClientSearch('')}}>{selectedClient.name} ×</button>}{clientSearch.trim()&&<div className="bizDashClientResults" role="listbox" aria-label="Clientes coincidentes">{visibleClients.map(c=><button type="button" key={c.id} onClick={()=>{setClient(String(c.id));setClientSearch('')}}><strong>{c.name}</strong><small>{[c.identification,c.phone].filter(Boolean).join(' · ')}</small></button>)}{!visibleClients.length&&<span>No se encontraron clientes</span>}</div>}</div>
   <div className="bizDashExportBar"><strong>Exportar información</strong><div className="bizDashExportActions">{[['csv','resumen','CSV resumen'],['csv','detallado','CSV detallado'],['pdf','resumen','PDF resumen'],['pdf','detallado','PDF detallado']].map(([format,kind,label])=><button key={label} type="button" className={format==='pdf'?'':'secondary'} disabled={!data||busy||!!exportBusy} onClick={()=>runExport(format,kind)}>{exportBusy===`${format}:${kind}`?'Generando…':label}</button>)}</div></div>
  </div>
  {!companyId?<div className="card">Selecciona una empresa para consultar el dashboard.</div>:<>
  {busy&&<div className="card" role="status">Consultando datos comerciales y preparando indicadores…</div>}
  {error&&<div className="card bizDashError" role="alert">{error}</div>}{message&&<div className="card bizDashSuccess" role="status">{message}</div>}
  {data&&<>
   <div className="bizDashMetrics bizDashMetricsExtended">
    <Metric label="Ventas del período" value={money(s.revenue_cents)} icon="↗" note="Importe de ventas activas (con IVA)"/>
    <Metric label="Cobros recibidos" value={money(s.collected_cents)} icon="₡" tone="blue" note="Pagos recibidos en estas fechas"/>
    <Metric label="Crédito pendiente" value={money(data.outstanding.balance_cents)} icon="◷" tone="amber" note="Saldo histórico con filtros de cliente/condición"/>
    <Metric label="Ticket promedio" value={money(s.average_ticket_cents)} icon="▤" note="Promedio por venta válida"/>
    <Metric label="Ventas activas" value={fmtCount(s.sale_count)} icon="✓" tone="blue" note={`${fmtCount(s.annulled_count)} ventas anuladas en el filtro`}/>
    <Metric label="Clientes compradores" value={fmtCount(s.distinct_clients)} icon="♙" note="Clientes registrados distintos"/>
    <Metric label="Unidades vendidas" value={fmtCount(s.units)} icon="▣" tone="blue" note="Unidades de líneas vendidas"/>
    <Metric label="IVA del período" value={money(s.tax_cents)} icon="%" tone="amber" note="De las ventas activas del período"/>
   </div>
   <div className="bizDashCompareHeading"><div><h4>Análisis del período</h4><p className="hint">Comparación con un intervalo anterior de la misma duración, manteniendo los filtros seleccionados.</p></div><span>{data.comparison?.from} — {data.comparison?.to} · Período anterior (UTC)</span></div>
   <div className="bizDashMetrics bizDashMetricsExtended bizDashCompareMetrics">
    <Metric label="Ventas período anterior" value={money(data.comparison?.previous?.revenue_cents)} icon="↶" tone="blue" note="Mismo número de días · ventas activas"/>
    <Metric label="Variación de ventas" value={data.comparison?.revenue_change_pct===null?'Sin base':`${data.comparison.revenue_change_pct>0?'+':''}${data.comparison.revenue_change_pct}%`} icon="↗" tone="green" note={`Diferencia: ${money(Math.abs(data.comparison?.revenue_change_cents||0))} ${data.comparison?.revenue_change_cents<0?'menos':'más o igual'}`}/>
    <Metric label="Operaciones anteriores" value={fmtCount(data.comparison?.previous?.sale_count)} icon="▤" tone="blue" note="Ventas válidas del intervalo anterior"/>
    <Metric label="Variación de operaciones" value={data.comparison?.sales_change_pct===null?'Sin base':`${data.comparison.sales_change_pct>0?'+':''}${data.comparison.sales_change_pct}%`} icon="≋" tone="amber" note={`${(data.comparison?.sales_change||0)>0?'+':''}${data.comparison?.sales_change||0} ventas frente al anterior`}/>
   </div>
   <div className="bizDashGrid bizDashBalancedGrid">
    <Section title="Margen bruto estimado" description="Solo ventas con costo guardado en el momento de vender; NO equivale a utilidad neta.">
     <div className="bizDashProfitStat"><span>Margen bruto de líneas cubiertas</span><strong>{money(data.profitability?.estimated_gross_margin_cents)}</strong></div>
     <div className="bizDashCoverageBar" role="progressbar" aria-label="Líneas con costo histórico" aria-valuenow={data.profitability?.coverage_pct||0} aria-valuemin="0" aria-valuemax="100"><div style={{width:`${data.profitability?.coverage_pct||0}%`}}/></div>
     <p className="hint">Cobertura: {data.profitability?.priced_lines||0} de {data.profitability?.total_lines||0} líneas ({data.profitability?.coverage_pct||0}%). {data.profitability?.unpriced_lines||0} sin costo histórico.</p>
     <div className="bizDashFinancialRows"><div><span>Ingresos netos de IVA cubiertos</span><strong>{money(data.profitability?.covered_net_sales_cents)}</strong></div><div><span>Costos capturados</span><strong>{money(data.profitability?.cost_cents)}</strong></div></div>
     <p className="bizDashWarning">No se asignan costos actuales a ventas antiguas. El margen es parcial si hay líneas sin costo y excluye gastos operativos.</p>
    </Section>
    <Section title="Evolución mensual" description="Ventas activas agrupadas por mes, según los filtros seleccionados (UTC)">
     <div className="bizDashMonthList">{data.monthly?.length?data.monthly.map(x=><div key={x.month}><span>{x.month}</span><strong>{money(x.revenue_cents)}</strong><small>{fmtCount(x.sales)} ventas</small></div>):<p className="bizDashEmpty">No hay ventas en este período.</p>}</div>
    </Section>
   </div>
   <Section title="Rentabilidad por producto" description="Ranking por margen bruto cubierto, calculado con el costo histórico capturado al vender; se respetan todos los filtros" extra="bizDashProductProfitSection">
    <div className="bizDashProfitTableWrap"><table className="bizDashProfitTable"><thead><tr><th>Producto</th><th>Unidades</th><th>Ingresos cubiertos sin IVA</th><th>Costo histórico</th><th>Margen cubierto</th><th>Margen %</th><th>Cobertura</th></tr></thead><tbody>{(data.product_margins||[]).map((p,i)=><tr key={`${p.product_id}-${p.description}-${i}`}><td><strong>{p.description}</strong>{p.unpriced_lines>0&&<small className="bizDashMissingCost">{p.unpriced_lines} línea(s) sin costo histórico</small>}</td><td>{fmtCount(p.units)}</td><td>{money(p.covered_net_sales_cents)}</td><td>{money(p.historical_cost_cents)}</td><td><strong className={p.margin_cents<0?'bizDashNegativeMargin':'bizDashPositiveMargin'}>{p.margin_cents<0?'− '+money(-p.margin_cents):money(p.margin_cents)}</strong></td><td>{p.margin_pct===null?'Sin base':`${p.margin_pct}%`}</td><td><span className={p.unpriced_lines?'bizDashCoveragePartial':'bizDashCoverageFull'}>{p.coverage_pct}%</span><small>{p.priced_lines}/{p.total_lines} líneas</small></td></tr>)}</tbody></table>{!data.product_margins?.length&&<p className="bizDashEmpty">No hay productos vendidos para este período y estos filtros.</p>}</div>
    <p className="bizDashWarning">El ranking muestra hasta 12 productos por margen cubierto. Los importes y porcentajes son estimaciones brutas parciales: excluyen líneas sin costo y gastos operativos. No representan utilidad neta.</p>
   </Section>
   <div className="bizDashGrid bizDashBalancedGrid">
    <Section title="Clientes frecuentes" description="Clientes registrados con dos o más compras válidas dentro del período"><Ranking items={data.frequent_clients||[]} unit="clientes"/></Section>
    <Section title="Contexto comercial" description="Lectura de indicadores para tomar decisiones sin confundir importes">
      <div className="bizDashContext"><p><strong>Ventas:</strong> fecha de creación de cada venta, incluido crédito aún no cobrado.</p><p><strong>Cobros:</strong> fecha de cada pago o abono, aunque pertenezca a una venta anterior.</p><p><strong>Margen:</strong> ventas sin IVA menos costo histórico de las líneas con dato de costo; no incluye salarios, gastos ni impuestos sobre utilidades.</p></div>
    </Section>
   </div>
   <div className="bizDashGrid bizDashBalancedGrid">
    <Section title="Evolución de ventas" description="Por día de registro (UTC) · no incluye anuladas"><div className="bizDashPlot">{data.daily.length?<div className="bizDashBars" aria-label="Gráfica de ventas por fecha">{data.daily.map(d=><div className="bizDashBarItem" key={d.day} title={`${d.day}: ${money(d.revenue_cents)} · ${d.sales} ventas`}><div className="bizDashBar" style={{height:`${Math.max(4,100*d.revenue_cents/peak)}%`}}/><small>{d.day.slice(5)}</small></div>)}</div>:<p className="bizDashEmpty">No hay ventas activas en estas fechas.</p>}</div><div className="bizDashChartFooter"><span>Base sin IVA: <b>{money(s.net_base_cents)}</b></span><span>Descuentos: <b>{money(s.discount_cents)}</b></span><span>IVA: <b>{money(s.tax_cents)}</b></span></div></Section>
    <Section title="Pagos recibidos" description="Por fecha de pago (UTC), incluyendo abonos de ventas anteriores"><div className="bizDashMethods">{data.payment_methods.length?data.payment_methods.map(p=><div className="bizDashMethod" key={p.method}><strong>{p.method}</strong><small>{fmtCount(p.operations)} movimientos</small><b>{money(p.amount_cents)}</b></div>):<p className="bizDashEmpty">Sin cobros para estos filtros.</p>}</div><div className="bizDashChartFooter"><strong>Total recibido: {money(s.collected_cents)}</strong></div></Section>
    <Section title="Productos más vendidos" description="Ranking por unidades, únicamente ventas activas"><Ranking items={data.top_products} unit="productos"/></Section>
    <Section title="Clientes con más compras" description="Ranking por importe comprado; incluye consumidor final"><Ranking items={data.top_clients} unit="clientes"/></Section>
   </div>
   <div className="bizDashGrid bizDashFinanceGrid"><Section title="Composición de ventas" description="Comparación de ventas a contado y crédito"><div className="bizDashSplitStats">{data.sale_types.length?data.sale_types.map(x=><div key={x.type}><span>{x.type==='contado'?'Contado':'Crédito'}</span><b>{money(x.amount_cents)}</b><small>{fmtCount(x.sales)} ventas</small></div>):<p className="bizDashEmpty">Sin ventas activas.</p>}</div></Section><Section title="Resumen comercial" description="Importes expresados en colones (CRC)"><div className="bizDashFinancialRows">{[['Subtotal sin descuentos',s.subtotal_cents],['Descuentos aplicados',-s.discount_cents],['Base después de descuentos',s.net_base_cents],['IVA de ventas',s.tax_cents],['Total de ventas',s.revenue_cents]].map(([label,value])=><div key={label}><span>{label}</span><strong>{value<0?'− '+money(-value):money(value)}</strong></div>)}</div></Section></div>
   <Section title="Ventas filtradas" description={`Consulta por cliente, fecha, estado, condición y método · ${fmtCount(data.sales_count)} resultado(s)`} extra="bizDashSalesSection"><div className="bizDashSalesTableWrap"><table className="bizDashSalesTable"><thead><tr><th>#</th><th>Fecha (UTC)</th><th>Cliente</th><th>Condición</th><th>Estado</th><th>Total</th><th>Abonado</th><th>Saldo</th><th>Métodos</th></tr></thead><tbody>{(sales?.rows||data.recent_sales||[]).map(x=><tr key={x.id}><td>#{x.id}</td><td>{x.created_at}</td><td><strong>{x.client_name}</strong><small>{x.identification}</small></td><td>{x.sale_type}</td><td><span className={'bizDashStatus '+(x.status==='activa'?'isActive':'isCancelled')}>{x.status}</span></td><td>{money(x.total_cents)}</td><td>{money(x.paid_cents)}</td><td>{money(x.balance_cents)}</td><td>{x.methods||'Sin pagos'}</td></tr>)}</tbody></table>{sales?.rows?.length===0&&<p className="bizDashEmpty">No se encontraron ventas para estos filtros.</p>}</div><div className="bizDashPager"><span>Página {page} de {numberOfPages(sales?.total??data.sales_count)} · {fmtCount(sales?.total??data.sales_count)} registros</span><div><button type="button" className="secondary" disabled={page<=1} onClick={()=>setPage(p=>p-1)}>‹ Anterior</button><button type="button" className="secondary" disabled={page>=numberOfPages(sales?.total??data.sales_count)} onClick={()=>setPage(p=>p+1)}>Siguiente ›</button></div></div></Section>
   <p className="bizDashFootnote">Ventas: fecha de registro UTC. Cobros: fecha de recepción UTC, aunque correspondan a ventas de otro período. El saldo pendiente es histórico y puede cambiar cuando se registran abonos. Los importes mostrados son comerciales internos, no utilidades netas ni comprobantes electrónicos fiscales.</p>
  </>}
  </>}
 </section>;
}
