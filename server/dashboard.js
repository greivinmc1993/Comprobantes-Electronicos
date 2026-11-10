import {csvCell as safeCell,csvExcelBuffer} from './report-format.js';
// FacturaCR: reportes comerciales por empresa. Solo lectura; nunca modifica ventas ni inventario.
const cleanHtml = value => String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cash = value => '₡'+(Number(value||0)/100).toLocaleString('es-CR',{minimumFractionDigits:2,maximumFractionDigits:2});
const csvCell = value => safeCell(value); // Protege cadenas con fórmula sin alterar números negativos.
const validDay=d=>/^\d{4}-\d{2}-\d{2}$/.test(d)&&!Number.isNaN(Date.parse(d+'T00:00:00Z'))&&new Date(d+'T00:00:00Z').toISOString().slice(0,10)===d;
const dateField = (col)=>`${col} BETWEEN ? AND ?`;

export function registerDashboardRoutes(app,db,saleCompany){
  function filters(req){
    const companyId=saleCompany(req);
    const from=String(req.query.from||''),to=String(req.query.to||'');
    if(!validDay(from)||!validDay(to)||from>to)throw Error('Indica fechas válidas (AAAA-MM-DD) y un rango correcto.');
    if((Date.parse(to+'T00:00:00Z')-Date.parse(from+'T00:00:00Z'))/86400000>366)throw Error('El rango máximo es de 367 días.');
    const status=String(req.query.status||'activas');
    const type=String(req.query.type||'todas');
    const method=String(req.query.method||'todas');
    const client=String(req.query.client||'todos');
    if(!['activas','anuladas','todas'].includes(status)||!['todas','contado','credito'].includes(type))throw Error('Filtro de estado o condición inválido.');
    const methods=db.prepare('SELECT DISTINCT method FROM sale_payments p JOIN sales s ON s.id=p.sale_id WHERE s.company_id=? ORDER BY method').all(companyId).map(x=>x.method);
    if(method!=='todas'&&!methods.includes(method))throw Error('Método de pago no disponible en esta empresa.');
    if(client!=='todos'&&client!=='final'&&(!/^\d+$/.test(client)||!db.prepare('SELECT id FROM clients WHERE company_id=? AND id=?').get(companyId,Number(client))))throw Error('Cliente inválido para esta empresa.');
    const where=['s.company_id=?'],params=[companyId];
    if(client==='final')where.push('s.client_id IS NULL');
    else if(client!=='todos'){where.push('s.client_id=?');params.push(Number(client));}
    if(type!=='todas'){where.push('s.sale_type=?');params.push(type);}
    if(method!=='todas'){where.push('EXISTS (SELECT 1 FROM sale_payments pfilter WHERE pfilter.sale_id=s.id AND pfilter.method=?)');params.push(method);}
    if(status==='activas')where.push("s.status='activa'");
    if(status==='anuladas')where.push("s.status='anulada'");
    return {companyId,from,to,status,type,method,client,methods,where:where.join(' AND '),params,start:from+' 00:00:00',end:to+' 23:59:59'};
  }
  function saleWhere(f,{active=false,dates=true}={}){
    let where=f.where;
    if(active){if(f.status==='anuladas')where+=' AND 1=0';else if(f.status==='todas')where+=" AND s.status='activa'";}
    if(dates)where+=' AND '+dateField('s.created_at');
    return {sql:where,args:dates?[...f.params,f.start,f.end]:[...f.params]};
  }
  function salesRows(f,{limit=50,offset=0,all=false}={}){
    const w=saleWhere(f);
    const base=`SELECT s.id,s.created_at,s.sale_type,s.status,s.subtotal_cents,s.discount_cents,s.tax_cents,s.total_cents,s.paid_cents,s.balance_cents,
      s.client_id,COALESCE(c.name,'Consumidor final') AS client_name,COALESCE(c.identification,'') AS identification,
      COALESCE(c.phone,'') AS phone,COALESCE(c.email,'') AS email,
      (SELECT COALESCE(SUM(l.quantity),0) FROM sale_lines l WHERE l.sale_id=s.id) AS units,
      (SELECT COALESCE(GROUP_CONCAT(l.description || ' x' || l.quantity,' | '),'') FROM sale_lines l WHERE l.sale_id=s.id) AS products,
      (SELECT COALESCE(GROUP_CONCAT(DISTINCT p.method),'') FROM sale_payments p WHERE p.sale_id=s.id) AS methods
      FROM sales s LEFT JOIN clients c ON c.id=s.client_id AND c.company_id=s.company_id WHERE ${w.sql} ORDER BY s.created_at DESC,s.id DESC`;
    return all?db.prepare(base).all(...w.args):db.prepare(base+' LIMIT ? OFFSET ?').all(...w.args,limit,offset);
  }
  function report(f){
    const valid=saleWhere(f,{active:true}),selected=saleWhere(f),hist=saleWhere(f,{active:true,dates:false});
    const summary=db.prepare(`SELECT COUNT(*) AS sale_count,COALESCE(SUM(s.total_cents),0) AS revenue_cents,
      COALESCE(SUM(s.subtotal_cents-s.discount_cents),0) AS net_base_cents,
      COALESCE(SUM(s.subtotal_cents),0) AS subtotal_cents,COALESCE(SUM(s.discount_cents),0) AS discount_cents,
      COALESCE(SUM(s.tax_cents),0) AS tax_cents,
      COALESCE(SUM(CASE WHEN s.sale_type='credito' THEN s.balance_cents ELSE 0 END),0) AS period_balance_cents,
      COALESCE(SUM(CASE WHEN s.sale_type='contado' THEN s.total_cents ELSE 0 END),0) AS cash_sales_cents,
      COALESCE(SUM(CASE WHEN s.sale_type='credito' THEN s.total_cents ELSE 0 END),0) AS credit_sales_cents,
      COUNT(DISTINCT s.client_id) AS distinct_clients
      FROM sales s WHERE ${valid.sql}`).get(...valid.args);
    // Comparar períodos de igual duración respetando cliente, condición, método y estado.
    const days=Math.round((Date.parse(f.to+'T00:00:00Z')-Date.parse(f.from+'T00:00:00Z'))/86400000)+1;
    const prevTo=new Date(Date.parse(f.from+'T00:00:00Z')-86400000).toISOString().slice(0,10);
    const prevFrom=new Date(Date.parse(f.from+'T00:00:00Z')-days*86400000).toISOString().slice(0,10);
    const prevFilter={...f,from:prevFrom,to:prevTo,start:prevFrom+' 00:00:00',end:prevTo+' 23:59:59'};
    const pw=saleWhere(prevFilter,{active:true});
    const previous=db.prepare(`SELECT COUNT(*) AS sale_count,COALESCE(SUM(s.total_cents),0) AS revenue_cents,COALESCE(SUM(s.tax_cents),0) AS tax_cents FROM sales s WHERE ${pw.sql}`).get(...pw.args);
    const comparison={from:prevFrom,to:prevTo,previous,
      revenue_change_cents:summary.revenue_cents-previous.revenue_cents,
      revenue_change_pct:previous.revenue_cents>0?Math.round((summary.revenue_cents-previous.revenue_cents)*10000/previous.revenue_cents)/100:null,
      sales_change:summary.sale_count-previous.sale_count,
      sales_change_pct:previous.sale_count>0?Math.round((summary.sale_count-previous.sale_count)*10000/previous.sale_count)/100:null};
    // Solo líneas con costo capturado en el momento de la venta. Históricos NULL no se inventan.
    const profitability=db.prepare(`SELECT COUNT(*) AS total_lines,
      COALESCE(SUM(CASE WHEN l.unit_cost_cents IS NOT NULL THEN 1 ELSE 0 END),0) AS priced_lines,
      COALESCE(SUM(CASE WHEN l.unit_cost_cents IS NULL THEN 1 ELSE 0 END),0) AS unpriced_lines,
      COALESCE(SUM(CASE WHEN l.unit_cost_cents IS NOT NULL THEN l.quantity*l.unit_cost_cents ELSE 0 END),0) AS cost_cents,
      COALESCE(SUM(CASE WHEN l.unit_cost_cents IS NOT NULL THEN l.subtotal_cents-l.discount_cents ELSE 0 END),0) AS covered_net_sales_cents
      FROM sale_lines l JOIN sales s ON s.id=l.sale_id WHERE ${valid.sql}`).get(...valid.args);
    profitability.estimated_gross_margin_cents=profitability.covered_net_sales_cents-profitability.cost_cents;
    profitability.coverage_pct=profitability.total_lines?Math.round(profitability.priced_lines*10000/profitability.total_lines)/100:0;
    // Rentabilidad por producto: usar exclusivamente costos HISTÓRICOS de cada línea.
    // Los registros sin costo conservan su condición de dato faltante; no se atribuye costo actual.
    // Se agrupa por producto y descripción capturada al vender, sin consultar el catálogo mutable.
    const productMargins=db.prepare(`SELECT l.product_id,l.description,
      COUNT(*) AS total_lines,
      SUM(CASE WHEN l.unit_cost_cents IS NOT NULL THEN 1 ELSE 0 END) AS priced_lines,
      SUM(CASE WHEN l.unit_cost_cents IS NULL THEN 1 ELSE 0 END) AS unpriced_lines,
      COALESCE(SUM(l.quantity),0) AS units,
      COALESCE(SUM(l.subtotal_cents-l.discount_cents),0) AS all_net_sales_cents,
      COALESCE(SUM(CASE WHEN l.unit_cost_cents IS NOT NULL THEN l.subtotal_cents-l.discount_cents ELSE 0 END),0) AS covered_net_sales_cents,
      COALESCE(SUM(CASE WHEN l.unit_cost_cents IS NOT NULL THEN l.quantity*l.unit_cost_cents ELSE 0 END),0) AS historical_cost_cents
      FROM sale_lines l JOIN sales s ON s.id=l.sale_id WHERE ${valid.sql}
      GROUP BY l.product_id,l.description ORDER BY covered_net_sales_cents-historical_cost_cents DESC,l.description LIMIT 12`).all(...valid.args)
      .map(x=>({...x,
        margin_cents:x.covered_net_sales_cents-x.historical_cost_cents,
        margin_pct:x.covered_net_sales_cents>0?Math.round((x.covered_net_sales_cents-x.historical_cost_cents)*10000/x.covered_net_sales_cents)/100:null,
        coverage_pct:x.total_lines?Math.round(x.priced_lines*10000/x.total_lines)/100:0}));
    const monthly=db.prepare(`SELECT substr(s.created_at,1,7) AS month,COUNT(*) AS sales,COALESCE(SUM(s.total_cents),0) AS revenue_cents
      FROM sales s WHERE ${valid.sql} GROUP BY substr(s.created_at,1,7) ORDER BY month`).all(...valid.args);
    const frequentClients=db.prepare(`SELECT s.client_id,COALESCE(c.name,'Consumidor final') AS name,COUNT(*) AS purchases,
      COALESCE(SUM(s.total_cents),0) AS revenue_cents FROM sales s LEFT JOIN clients c ON c.id=s.client_id AND c.company_id=s.company_id
      WHERE ${valid.sql} AND s.client_id IS NOT NULL GROUP BY s.client_id HAVING COUNT(*)>=2
      ORDER BY purchases DESC,revenue_cents DESC LIMIT 10`).all(...valid.args);
    const selectedCount=db.prepare(`SELECT COUNT(*) AS n FROM sales s WHERE ${selected.sql}`).get(...selected.args).n;
    const annulledSql=selected.sql.replace(/ AND s.status='(?:activa|anulada)'/g,'');
    const annulled=db.prepare(`SELECT COUNT(*) AS n FROM sales s WHERE ${annulledSql} AND s.status='anulada'`).get(...selected.args).n;
    const outstanding=db.prepare(`SELECT COUNT(*) AS count,COALESCE(SUM(s.balance_cents),0) AS balance_cents FROM sales s WHERE ${hist.sql} AND s.sale_type='credito' AND s.balance_cents>0`).get(...hist.args);
    const daily=db.prepare(`SELECT substr(s.created_at,1,10) AS day,COUNT(*) AS sales,COALESCE(SUM(s.total_cents),0) AS revenue_cents FROM sales s WHERE ${valid.sql} GROUP BY substr(s.created_at,1,10) ORDER BY day`).all(...valid.args);
    const topProducts=db.prepare(`SELECT l.product_id,l.description,COALESCE(SUM(l.quantity),0) AS units,COALESCE(SUM(l.total_cents),0) AS revenue_cents FROM sale_lines l JOIN sales s ON s.id=l.sale_id WHERE ${valid.sql} GROUP BY l.product_id,l.description ORDER BY units DESC,revenue_cents DESC LIMIT 10`).all(...valid.args);
    const topClients=db.prepare(`SELECT s.client_id,COALESCE(c.name,'Consumidor final') AS name,COALESCE(c.identification,'') AS identification,COUNT(*) AS purchases,COALESCE(SUM(s.total_cents),0) AS revenue_cents FROM sales s LEFT JOIN clients c ON c.id=s.client_id AND c.company_id=s.company_id WHERE ${valid.sql} GROUP BY s.client_id ORDER BY revenue_cents DESC,purchases DESC LIMIT 10`).all(...valid.args);
    const units=db.prepare(`SELECT COALESCE(SUM(l.quantity),0) AS units FROM sale_lines l JOIN sales s ON s.id=l.sale_id WHERE ${valid.sql}`).get(...valid.args).units;
    const typeRows=db.prepare(`SELECT s.sale_type AS type,COUNT(*) AS sales,COALESCE(SUM(s.total_cents),0) AS amount_cents FROM sales s WHERE ${valid.sql} GROUP BY s.sale_type ORDER BY amount_cents DESC`).all(...valid.args);
    // Cobros se agrupan por fecha DE PAGO, incluso de ventas anteriores. Aplican empresa, cliente, condición y método.
    // No se limita a la fecha de creación de la venta. El estado anulada no genera cobros activos.
    const paidBase=saleWhere(f,{active:true,dates:false});
    const methodCondition=f.method==='todas'?'':' AND p.method=?';
    const methodArgs=f.method==='todas'?[]:[f.method];
    const paymentMethods=db.prepare(`SELECT p.method,COUNT(*) AS operations,COALESCE(SUM(p.amount_cents),0) AS amount_cents FROM sale_payments p JOIN sales s ON s.id=p.sale_id WHERE ${paidBase.sql} AND p.created_at BETWEEN ? AND ?${methodCondition} GROUP BY p.method ORDER BY amount_cents DESC`).all(...paidBase.args,f.start,f.end,...methodArgs);
    const collected_cents=paymentMethods.reduce((acc,p)=>acc+p.amount_cents,0);
    return {company_id:f.companyId,from:f.from,to:f.to,timezone:'UTC',filters:{client:f.client,type:f.type,method:f.method,status:f.status},methods_available:f.methods,
      summary:{...summary,annulled_count:annulled,selected_count:selectedCount,units,average_ticket_cents:summary.sale_count?Math.round(summary.revenue_cents/summary.sale_count):0,collected_cents},
      outstanding,daily,monthly,comparison,profitability,product_margins:productMargins,frequent_clients:frequentClients,top_products:topProducts,top_clients:topClients,payment_methods:paymentMethods,sale_types:typeRows,
      recent_sales:salesRows(f,{limit:50}),sales_count:selectedCount};
  }
  const route=(action)=>(req,res)=>{
    try{const f=filters(req);return action(req,res,f)}catch(e){res.status(400).json({error:e.message})}
  };
  app.get('/api/companies/:companyId/dashboard',route((req,res,f)=>res.json(report(f))));
  app.get('/api/companies/:companyId/dashboard/sales',route((req,res,f)=>{
    const page=Number(req.query.page||1);
    if(!Number.isSafeInteger(page)||page<1||page>100000)throw Error('Página inválida.');
    const total=db.prepare(`SELECT COUNT(*) AS n FROM sales s WHERE ${saleWhere(f).sql}`).get(...saleWhere(f).args).n;
    res.json({page,per_page:50,total,rows:salesRows(f,{limit:50,offset:(page-1)*50})});
  }));
  function csvReport(f,kind){
    const r=report(f);const rows=[];
    const add=(...x)=>rows.push(x);
    if(kind==='detallado'){
      // Un registro por venta y encabezados en primera fila: Excel puede ordenar y filtrar directamente.
      const company=db.prepare('SELECT COALESCE(NULLIF(trade_name,\'\'),legal_name) AS name FROM companies WHERE id=?').get(f.companyId).name;
      add('Empresa','Filtro desde UTC','Filtro hasta UTC','Filtro cliente','Filtro condición','Filtro método','Filtro estado','Número venta','Fecha UTC','Cliente','Identificación','Teléfono','Correo','Condición','Estado','Subtotal sin descuento CRC','Descuento CRC','IVA CRC','Total CRC','Abonado acumulado CRC','Saldo actual CRC','Métodos de pago','Unidades','Productos');
      const clientLabel=f.client==='todos'?'Todos':f.client==='final'?'Consumidor final':(db.prepare('SELECT name FROM clients WHERE id=? AND company_id=?').get(Number(f.client),f.companyId)?.name||'');
      for(const x of salesRows(f,{all:true})){
        add(company,f.from,f.to,clientLabel,f.type,f.method,f.status,x.id,x.created_at,x.client_name,x.identification,x.phone,x.email,x.sale_type,x.status,
          ...['subtotal_cents','discount_cents','tax_cents','total_cents','paid_cents','balance_cents'].map(k=>(x[k]/100).toFixed(2)),x.methods,x.units,x.products);
      }
      return '\ufeffsep=;\r\n'+rows.map(row=>row.map(csvCell).join(';')).join('\r\n');
    }
    add('FacturaCR · Reporte comercial','');add('Empresa',db.prepare('SELECT COALESCE(NULLIF(trade_name,\'\'),legal_name) AS name FROM companies WHERE id=?').get(f.companyId).name);
    add('Período UTC',`${f.from} a ${f.to}`);add('Cliente',f.client);add('Condición',f.type);add('Estado',f.status);add('Método',f.method);add('');
    const s=r.summary;
    for(const [k,v] of [['Ventas válidas',s.sale_count],['Anuladas en el filtro',s.annulled_count],['Ventas CRC',(s.revenue_cents/100).toFixed(2)],['Base sin IVA CRC',(s.net_base_cents/100).toFixed(2)],['Descuento CRC',(s.discount_cents/100).toFixed(2)],['IVA CRC',(s.tax_cents/100).toFixed(2)],['Cobros en fechas CRC',(s.collected_cents/100).toFixed(2)],['Saldo pendiente histórico CRC',(r.outstanding.balance_cents/100).toFixed(2)],['Unidades vendidas',s.units],['Clientes registrados distintos',s.distinct_clients],['Ticket promedio CRC',(s.average_ticket_cents/100).toFixed(2)]])add(k,v);
    add('');add('Comparación con período anterior equivalente');
    add('Período anterior UTC',`${r.comparison.from} a ${r.comparison.to}`);
    add('Ventas anteriores CRC',(r.comparison.previous.revenue_cents/100).toFixed(2));
    add('Diferencia ventas CRC',(r.comparison.revenue_change_cents/100).toFixed(2));
    add('Variación de ventas %',r.comparison.revenue_change_pct===null?'Sin base comparable':r.comparison.revenue_change_pct);
    add('Transacciones anteriores',r.comparison.previous.sale_count);
    add('');add('Margen bruto estimado basado en costos históricos registrados');
    add('Líneas con costo',r.profitability.priced_lines);
    add('Líneas sin costo histórico',r.profitability.unpriced_lines);
    add('Cobertura de líneas %',r.profitability.coverage_pct);
    add('Ventas netas de IVA cubiertas CRC',(r.profitability.covered_net_sales_cents/100).toFixed(2));
    add('Costos históricos cubiertos CRC',(r.profitability.cost_cents/100).toFixed(2));
    add('Margen bruto estimado parcial CRC',(r.profitability.estimated_gross_margin_cents/100).toFixed(2));
    add('AVISO','No equivale a utilidad neta. Históricos sin costo se excluyen, no se estiman.');
    add('');add('Rentabilidad por artículo (solo líneas con costo histórico)');
    add('Artículo','Unidades','Líneas con costo','Líneas sin costo','Cobertura %','Ingresos cubiertos sin IVA CRC','Costo histórico CRC','Margen cubierto CRC','Margen % sobre ingresos cubiertos');
    for(const x of r.product_margins)add(x.description,x.units,x.priced_lines,x.unpriced_lines,x.coverage_pct,
      (x.covered_net_sales_cents/100).toFixed(2),(x.historical_cost_cents/100).toFixed(2),
      (x.margin_cents/100).toFixed(2),x.margin_pct===null?'No calculable':x.margin_pct);
    add('');add('Evolución mensual');add('Mes UTC','Ventas','Importe CRC');
    for(const x of r.monthly)add(x.month,x.sales,(x.revenue_cents/100).toFixed(2));
    add('');add('Clientes frecuentes');add('Cliente','Compras','Importe CRC');
    for(const x of r.frequent_clients)add(x.name,x.purchases,(x.revenue_cents/100).toFixed(2));
    add('');add('Productos más vendidos');add('Artículo','Unidades','Importe CRC');for(const x of r.top_products)add(x.description,x.units,(x.revenue_cents/100).toFixed(2));
    add('');add('Clientes principales');add('Cliente','Identificación','Ventas','Importe CRC');for(const x of r.top_clients)add(x.name,x.identification,x.purchases,(x.revenue_cents/100).toFixed(2));
    add('');add('Ventas por condición');add('Condición','Ventas','Importe CRC');for(const x of r.sale_types)add(x.type,x.sales,(x.amount_cents/100).toFixed(2));
    add('');add('Cobros por método');add('Método','Movimientos','Cobrado CRC');for(const x of r.payment_methods)add(x.method,x.operations,(x.amount_cents/100).toFixed(2));
    add('');add('Ventas por día');add('Fecha UTC','Ventas','Importe CRC');for(const x of r.daily)add(x.day,x.sales,(x.revenue_cents/100).toFixed(2));
    return '\ufeffsep=;\r\n'+rows.map(row=>row.map(csvCell).join(';')).join('\r\n');
  }
  app.get('/api/companies/:companyId/dashboard/export.csv',route((req,res,f)=>{
    const kind=String(req.query.kind||'resumen');if(!['resumen','detallado'].includes(kind))throw Error('Exportación inválida.');
    res.setHeader('Content-Type','text/csv; charset=utf-16le');res.setHeader('Content-Disposition',`attachment; filename="FacturaCR_${kind}_${f.from}_${f.to}.csv"`);
    res.send(csvExcelBuffer(csvReport(f,kind)));
  }));
  app.get('/api/companies/:companyId/dashboard/export.html',route((req,res,f)=>{
    const kind=String(req.query.kind||'resumen');if(!['resumen','detallado'].includes(kind))throw Error('Reporte inválido.');
    const r=report(f),s=r.summary;
    const comp=db.prepare('SELECT * FROM companies WHERE id=?').get(f.companyId);
    const rows = kind==='detallado'?salesRows(f,{all:true}):r.recent_sales.slice(0,15);
    const td=(v)=>`<td>${cleanHtml(v)}</td>`;
    const table=(headers,values)=>`<table><thead><tr>${headers.map(v=>`<th>${cleanHtml(v)}</th>`).join('')}</tr></thead><tbody>${values.map(row=>`<tr>${row.map(td).join('')}</tr>`).join('')||`<tr><td colspan="${headers.length}">Sin registros</td></tr>`}</tbody></table>`;
    const logoRow=db.prepare('SELECT settings_json FROM company_ticket_settings WHERE company_id=?').get(f.companyId);
    let logo='';try{const l=JSON.parse(logoRow?.settings_json||'{}').logo;if(typeof l==='string'&&l.length<360000&&/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/i.test(l))logo=l;}catch{}
    const meta=`${f.from} al ${f.to} (UTC) · Cliente: ${f.client==='todos'?'Todos':f.client==='final'?'Consumidor final':db.prepare('SELECT name FROM clients WHERE id=? AND company_id=?').get(Number(f.client),f.companyId)?.name||''} · Condición: ${f.type} · Estado: ${f.status} · Método: ${f.method}`;
    const html=`<!doctype html><html lang="es"><head><meta charset="UTF-8"><title>FacturaCR · Reporte ${kind}</title><style>@page{size:A4 ${kind==='detallado'?'landscape':'portrait'};margin:13mm}body{font:11px Arial,sans-serif;color:#193246}header{display:flex;gap:15px;align-items:center;border-bottom:3px solid #128373;padding-bottom:14px;margin-bottom:14px}header img{height:62px;max-width:110px;object-fit:contain}h1{font-size:23px;margin:0;color:#116b5f}h2{font-size:15px;margin:19px 0 8px;color:#174c5a}.meta{color:#607484;margin:9px 0 15px;line-height:1.6}.metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:7px}.metric{background:#eff7f5;border:1px solid #cddfd9;padding:11px;border-radius:9px}.metric b{font-size:16px;display:block;color:#0c6658;margin-top:5px}.muted{color:#627682}table{width:100%;border-collapse:collapse;font-size:${kind==='detallado'?'8':'10'}px}th,td{border-bottom:1px solid #e1e8eb;padding:6px;text-align:left;overflow-wrap:anywhere}th{background:#e9f2ef}tr{break-inside:avoid}footer{border-top:1px solid #d9e4e8;margin-top:20px;padding-top:10px;font-size:9px;color:#667b83} .numbers{white-space:nowrap}</style></head><body><header>${logo?`<img alt="Logo" src="${logo}">`:''}<div><h1>${cleanHtml(comp.trade_name||comp.legal_name)}</h1><div class="muted">${cleanHtml(comp.legal_name)} · ${cleanHtml(comp.identification)}</div><strong>Reporte comercial ${kind}</strong></div></header><p class="meta">${cleanHtml(meta)}<br>Generado: ${cleanHtml(new Date().toLocaleString('es-CR'))}</p><div class="metrics">${[['Ventas del período',cash(s.revenue_cents)],['Cobros recibidos',cash(s.collected_cents)],['Crédito pendiente histórico',cash(r.outstanding.balance_cents)],['Ventas válidas',s.sale_count],['Ticket promedio',cash(s.average_ticket_cents)],['Unidades vendidas',s.units],['Base sin IVA',cash(s.net_base_cents)],['Descuentos',cash(s.discount_cents)],['IVA',cash(s.tax_cents)]].map(([k,v])=>`<div class="metric">${cleanHtml(k)}<b>${cleanHtml(v)}</b></div>`).join('')}</div><h2>Comparación con período anterior</h2><p class="meta">${cleanHtml(r.comparison.from)} al ${cleanHtml(r.comparison.to)} (UTC). Ventas anteriores: ${cash(r.comparison.previous.revenue_cents)} · Variación: ${r.comparison.revenue_change_pct===null?'Sin base comparable':cleanHtml(r.comparison.revenue_change_pct+' %')}</p><h2>Margen bruto estimado (cobertura parcial)</h2><p class="meta">Líneas con costo histórico: ${r.profitability.priced_lines} / ${r.profitability.total_lines} (${r.profitability.coverage_pct}%). Base sin IVA cubierta: ${cash(r.profitability.covered_net_sales_cents)} · Costo cubierto: ${cash(r.profitability.cost_cents)} · Margen bruto parcial: ${cash(r.profitability.estimated_gross_margin_cents)}. No representa utilidad neta; se excluyen históricos sin costo.</p><h2>Rentabilidad por producto (solo costos históricos)</h2><p class="meta">Clasificado por margen bruto cubierto. Las líneas sin costo no aportan margen; el porcentaje se calcula sobre ingresos cubiertos y no representa utilidad neta.</p>${table(['Producto','Unidades','Cobertura','Ingresos cubiertos sin IVA','Costo histórico','Margen cubierto','Margen %'],r.product_margins.map(x=>[x.description,x.units,`${x.priced_lines}/${x.total_lines} (${x.coverage_pct}%)`,cash(x.covered_net_sales_cents),cash(x.historical_cost_cents),cash(x.margin_cents),x.margin_pct===null?'Sin base':`${x.margin_pct}%`]))}<h2>Ventas por mes</h2>${table(['Mes UTC','Operaciones','Importe'],r.monthly.map(x=>[x.month,x.sales,cash(x.revenue_cents)]))}<h2>Clientes frecuentes</h2>${table(['Cliente','Compras','Importe'],r.frequent_clients.map(x=>[x.name,x.purchases,cash(x.revenue_cents)]))}<h2>Productos destacados</h2>${table(['Producto','Unidades','Importe'],r.top_products.map(x=>[x.description,x.units,cash(x.revenue_cents)]))}<h2>Principales clientes</h2>${table(['Cliente','Identificación','Ventas','Importe'],r.top_clients.map(x=>[x.name,x.identification,x.purchases,cash(x.revenue_cents)]))}<h2>Ventas por condición</h2>${table(['Condición','Ventas','Importe'],r.sale_types.map(x=>[x.type,x.sales,cash(x.amount_cents)]))}<h2>Cobros por método</h2>${table(['Método','Movimientos','Cobrado'],r.payment_methods.map(x=>[x.method,x.operations,cash(x.amount_cents)]))}<h2>${kind==='detallado'?'Detalle completo de ventas filtradas':'Ventas recientes (máximo 15)'}</h2>${table(['#','Fecha UTC','Cliente','Condición','Estado','Subtotal','Descuento','IVA','Total','Abonado','Saldo','Métodos'],rows.map(x=>[x.id,x.created_at,x.client_name,x.sale_type,x.status,cash(x.subtotal_cents),cash(x.discount_cents),cash(x.tax_cents),cash(x.total_cents),cash(x.paid_cents),cash(x.balance_cents),x.methods]))}<footer>Documento comercial interno · Importes en colones (CRC). Las ventas se agrupan por fecha de registro; los cobros por fecha de pago y pueden corresponder a ventas anteriores. El saldo pendiente es histórico y respeta los filtros de cliente y condición. No constituye factura electrónica ni informe de utilidad neta.</footer></body></html>`;
    res.type('html').send(html);
  }));
}
