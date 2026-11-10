import {csvCell,csvExcelBuffer,reportHtml} from './report-format.js';
// Valoración actual a costo de adquisición. Nunca modifica existencias.
// CRC y USD no se mezclan sin una tasa de cambio comprobable.
const escHtml = v => String(v ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const escCsv=csvCell;
const toCRC = cents => '₡' + (cents/100).toLocaleString('es-CR',{minimumFractionDigits:2,maximumFractionDigits:2});
const statuses = ['all','available','low','out'];
const costs = ['all','known','missing'];
export function valuationFilters(query={}){
 const search=String(query.search??'').trim();
 const status=String(query.status??'all'),cost=String(query.cost??'all');
 const page=Number(query.page??1);
 if(search.length>100)throw Error('Búsqueda demasiado larga.');
 if(!statuses.includes(status)||!costs.includes(cost))throw Error('Filtro de inventario inválido.');
 if(!Number.isSafeInteger(page)||page<1||page>1000000)throw Error('Página inválida.');
 return {search,status,cost,page};
}
export function valuationOf(p){
 const stock=Number(p.stock),unitCost=Number(p.cost);
 const costKnown=p.currency==='CRC'&&Number.isFinite(unitCost)&&unitCost>0;
 // No se redondean los importes de cada unidad antes de multiplicar.
 const valueCents=costKnown?Math.round(stock*unitCost*100):null;
 return {id:p.id,sku:p.product_code||'',description:p.description,unit:p.unit||'Unid',stock,minStock:Number(p.min_stock||0),currency:p.currency,unitCost:costKnown?unitCost:null,valueCents,costKnown,status:stock<=0?'Agotado':stock<=Number(p.min_stock||0)?'Stock bajo':'Disponible',isDeleted:!!p.is_deleted};
}
export function valuationReport(products,filters){
 const all=products.filter(p=>p.kind==='producto'&&Number(p.track_stock)===1&&Number(p.is_deleted)===0).map(valuationOf);
 const search=filters.search.toLocaleLowerCase('es');
 const rows=all.filter(p=>
  (!search||[p.description,p.sku].some(v=>String(v).toLocaleLowerCase('es').includes(search)))&&
  (filters.status==='all'||(filters.status==='out'?p.status==='Agotado':filters.status==='low'?p.status==='Stock bajo':p.status==='Disponible'))&&
  (filters.cost==='all'||(filters.cost==='known'?p.costKnown:!p.costKnown))
 ).sort((a,b)=>a.description.localeCompare(b.description,'es')||a.id-b.id);
 const summary={products:rows.length,units:rows.reduce((n,p)=>n+p.stock,0),
  valuedProducts:rows.filter(p=>p.costKnown).length,missingCostProducts:rows.filter(p=>!p.costKnown).length,
  valuedUnits:rows.filter(p=>p.costKnown).reduce((n,p)=>n+p.stock,0),
  valueCents:rows.reduce((n,p)=>n+(p.valueCents??0),0),
  exhausted:rows.filter(p=>p.status==='Agotado').length,low:rows.filter(p=>p.status==='Stock bajo').length};
 return {rows,summary};
}
export function registerInventoryValuationRoutes(app,db){
 function run(req,res){
  const companyId=Number(req.params.companyId);
  if(!Number.isSafeInteger(companyId)||companyId<1||!db.prepare('SELECT id FROM companies WHERE id=?').get(companyId)){
   res.status(404).json({error:'Empresa no encontrada.'});return null;
  }
  try{
   const f=valuationFilters(req.query);
   const company=db.prepare('SELECT legal_name,trade_name,identification FROM companies WHERE id=?').get(companyId);
   const products=db.prepare(`SELECT id,product_code,description,unit,stock,min_stock,cost,currency,kind,track_stock,is_deleted
      FROM products WHERE company_id=? AND kind='producto' AND track_stock=1 AND is_deleted=0`).all(companyId);
   return {...valuationReport(products,f),filters:f,company};
  }catch(e){res.status(400).json({error:e.message});return null}
 }
 app.get('/api/companies/:companyId/inventory/valuation',(req,res)=>{
  const r=run(req,res);if(!r)return;
  const {rows,summary,filters}=r,pageSize=50,offset=(filters.page-1)*pageSize;
  res.json({rows:rows.slice(offset,offset+pageSize),summary,page:filters.page,pageSize,totalPages:Math.max(1,Math.ceil(rows.length/pageSize))});
 });
 app.get('/api/companies/:companyId/inventory/valuation/export.csv',(req,res)=>{
  const r=run(req,res);if(!r)return;
  res.setHeader('Content-Type','text/csv; charset=utf-16le');
  res.setHeader('Content-Disposition','attachment; filename="FacturaCR_valoracion_inventario.csv"');
  res.write(csvExcelBuffer('sep=;\r\n'));
  const header=['Empresa','Identificación','SKU','Producto','Unidad','Existencias','Existencias mínimas','Estado','Moneda del producto','Costo unitario CRC','Valor al costo CRC','¿Costo válido?'];
  res.write(Buffer.from(header.map(escCsv).join(';')+'\r\n','utf16le'));
  for(const row of r.rows){
   res.write(Buffer.from([r.company.trade_name||r.company.legal_name,r.company.identification,row.sku,row.description,row.unit,row.stock,row.minStock,row.status,row.currency,
    row.costKnown?row.unitCost.toFixed(2):'',row.valueCents===null?'':(row.valueCents/100).toFixed(2),row.costKnown?'Sí':'No'].map(escCsv).join(';')+'\r\n','utf16le'));
  }
  res.end();
 });
 app.get('/api/companies/:companyId/inventory/valuation/export.html',(req,res)=>{
  const r=run(req,res);if(!r)return;
  const {summary:s}=r;
  const html=`<!doctype html><html lang="es"><head><meta charset="UTF-8"><title>Valoración de inventario</title>
  <style>@page{size:A4 landscape;margin:12mm}body{font:11px Arial,sans-serif;color:#263b4a}h1{font-size:20px;margin:0 0 5px}h2{font-size:14px}header{border-bottom:3px solid #177f72;padding-bottom:12px;margin-bottom:15px}small{color:#546779}.cards{display:flex;gap:12px;margin:14px 0}.cards>div{background:#eff7f4;border:1px solid #d0e5dc;border-radius:8px;padding:12px;flex:1}.cards b{display:block;font-size:16px;margin-top:6px}table{width:100%;border-collapse:collapse}th,td{padding:7px;border-bottom:1px solid #dce6e7;text-align:left}th{background:#e6f2ee}td.num{text-align:right;font-variant-numeric:tabular-nums}tr{break-inside:avoid}.warning{background:#fff6df;padding:10px;border-radius:6px;margin:12px 0}footer{margin-top:16px;color:#617687;font-size:10px}</style></head>
  <body><header><h1>Valoración de inventario · FacturaCR</h1><strong>${escHtml(r.company.trade_name||r.company.legal_name)}</strong><div>Identificación: ${escHtml(r.company.identification)} · Generado: ${escHtml(new Date().toLocaleString('es-CR'))}</div>
  <small>Filtros: ${escHtml(r.filters.search||'Todos los productos')} / ${escHtml(r.filters.status)} / ${escHtml(r.filters.cost)}</small></header>
  <div class="cards"><div>Productos<b>${s.products}</b></div><div>Unidades<b>${s.units}</b></div><div>Valor conocido al costo<b>${toCRC(s.valueCents)}</b></div><div>Sin costo CRC válido<b>${s.missingCostProducts}</b></div></div>
  ${s.missingCostProducts?`<div class="warning">Atención: ${s.missingCostProducts} producto(s) sin costo válido en CRC. El valor total es <strong>parcial</strong>. Los productos en USD no se convierten automáticamente.</div>`:''}
  <h2>Detalle de existencias valorizadas</h2><table><thead><tr><th>SKU</th><th>Artículo</th><th>Estado</th><th>Unidades</th><th>Mínimo</th><th>Costo unitario CRC</th><th>Valor al costo CRC</th></tr></thead><tbody>${r.rows.map(p=>`<tr><td>${escHtml(p.sku)}</td><td>${escHtml(p.description)}</td><td>${escHtml(p.status)}</td><td class="num">${p.stock}</td><td class="num">${p.minStock}</td><td class="num">${p.costKnown?toCRC(Math.round(p.unitCost*100)):'Sin costo'}</td><td class="num">${p.valueCents===null?'Sin valorar':toCRC(p.valueCents)}</td></tr>`).join('')||'<tr><td colspan="7">No hay productos para estos filtros.</td></tr>'}</tbody></table>
  <footer>Reporte administrativo, valorado a costo registrado del catálogo en CRC. No constituye comprobante electrónico ni valoración contable auditada. No incluye productos sin seguimiento de existencias o dados de baja.</footer></body></html>`;
  res.type('html').send(html);
 });
}
