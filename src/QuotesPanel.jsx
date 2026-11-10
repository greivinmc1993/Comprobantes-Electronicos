import React,{useEffect,useState} from 'react';

const money=cents=>'₡'+Math.round(Number(cents||0)/100).toLocaleString('es-CR');
const safe=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
async function req(url,options={}){
 const response=await fetch(url,{...options,headers:{'Content-Type':'application/json',...options.headers}});
 const data=await response.json();
 if(!response.ok)throw Error(data.error||'Ocurrió un error.');
 return data;
}
function quoteDocument(quote,company){
 const today=new Date(String(quote.created_at).replace(' ','T')+'Z');
 const issued=Number.isNaN(today.getTime())?quote.created_at:today.toLocaleDateString('es-CR');
 const valid=Number.isNaN(today.getTime())?'Según condiciones':new Date(today.getTime()+Number(quote.valid_days)*86400000).toLocaleDateString('es-CR');
 const logo=typeof quote.logo_snapshot==='string'&&/^data:image\/(png|jpeg|webp);base64,/i.test(quote.logo_snapshot)?`<img alt="Logo empresarial" class="brandlogo" src="${quote.logo_snapshot}"/>`:'';
 const rows=(quote.lines||[]).map(line=>`<tr><td>${safe(line.description)}</td><td class="number">${safe(line.quantity)}</td><td class="number">${safe(money(line.unit_price_cents))}</td><td class="number">${safe(Number(line.tax_rate))}%</td><td class="number">${safe(money(line.total_cents))}</td></tr>`).join('');
 const details=[company?.identification?`Cédula: ${company.identification}`:'',company?.phone?`Tel.: ${company.phone}`:'',company?.email||'',company?.address||''].filter(Boolean).map(x=>`<div>${safe(x)}</div>`).join('');
 return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Proforma ${safe(quote.id)}</title><style>@page{size:A4;margin:14mm}*{box-sizing:border-box}body{font:12px Arial,sans-serif;color:#233246;margin:0;background:white}.top{display:flex;justify-content:space-between;gap:26px;align-items:center;border-bottom:3px solid #167d73;padding-bottom:22px}.brand{display:flex;align-items:center;gap:15px}.brandlogo{max-height:80px;max-width:130px;object-fit:contain}.brand h1{font-size:21px;margin:0 0 5px}.meta{text-align:right}.meta h2{font-size:24px;margin:0 0 10px;color:#167d73}.muted{color:#62748b}.cols{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:22px 0}.card{background:#f4f8fa;border:1px solid #e0e8ec;border-radius:8px;padding:14px;min-width:0;overflow-wrap:anywhere}.card strong{display:block;margin-bottom:6px}.card div{margin-top:3px}.heading{font-size:15px;margin:20px 0 12px}table{width:100%;border-collapse:collapse}th{background:#e7f3f0;color:#204b43;text-align:left}th,td{padding:11px 9px;border-bottom:1px solid #dfe8ed;vertical-align:top}tr{break-inside:avoid}.number{text-align:right;white-space:nowrap}.totals{margin:18px 0 0 auto;max-width:285px}.totals div{display:flex;justify-content:space-between;padding:8px 10px}.totals .final{background:#e0f3ed;font-size:17px;font-weight:bold;border-radius:7px}.notes{margin-top:28px;background:#f7f9fc;padding:14px;border-radius:7px;white-space:pre-wrap}.foot{margin-top:32px;padding-top:14px;border-top:1px solid #e0e8ec;color:#637589;font-size:11px}p{line-height:1.5}</style></head><body><div class="top"><div class="brand">${logo}<div><h1>${safe(company?.trade_name||company?.legal_name||'FacturaCR')}</h1>${details}</div></div><div class="meta"><h2>COTIZACIÓN / PROFORMA</h2><div><strong>N.º ${safe(quote.id)}</strong></div><div>Fecha: ${safe(issued)}</div><div>Válida hasta: ${safe(valid)}</div></div></div><div class="cols"><div class="card"><strong>Preparada para</strong><div><b>${safe(quote.client_name)}</b></div>${quote.client_trade_name?`<div>Nombre comercial: ${safe(quote.client_trade_name)}</div>`:''}${quote.client_identification?`<div>${quote.client_identification_type?`Identificación (${safe(quote.client_identification_type)})`:'Identificación'}: ${safe(quote.client_identification)}</div>`:''}${quote.client_phone?`<div>Tel.: ${safe(quote.client_phone)}</div>`:''}${quote.client_phone_alt?`<div>Tel. alternativo: ${safe(quote.client_phone_alt)}</div>`:''}${quote.client_email?`<div>Correo: ${safe(quote.client_email)}</div>`:''}${quote.client_address?`<div>Dirección: ${safe(quote.client_address)}</div>`:''}</div><div class="card"><strong>Información</strong><div>${safe(quote.title||'Estimación de productos y servicios')}</div><div>Moneda: colones costarricenses (CRC)</div><div>Vigencia: ${safe(quote.valid_days)} días</div></div></div><h3 class="heading">Detalle estimado</h3><table><thead><tr><th>Descripción</th><th class="number">Cant.</th><th class="number">Precio sin IVA</th><th class="number">IVA</th><th class="number">Total</th></tr></thead><tbody>${rows}</tbody></table><div class="totals"><div><span>Subtotal sin IVA</span><b>${safe(money(quote.subtotal_cents))}</b></div><div><span>Impuestos</span><b>${safe(money(quote.tax_cents))}</b></div><div class="final"><span>TOTAL ESTIMADO</span><b>${safe(money(quote.total_cents))}</b></div></div>${quote.notes?`<div class="notes"><b>Observaciones</b><p>${safe(quote.notes)}</p></div>`:''}<div class="notes"><b>Condiciones</b><p>${safe(quote.terms)}</p></div><div class="foot">Documento comercial informativo. No constituye factura electrónica, comprobante fiscal, reserva de inventario ni confirmación de pago.</div></body></html>`;
}

export default function QuotesPanel({companyId,company}){
 const [products,setProducts]=useState([]),[clients,setClients]=useState([]),[quotes,setQuotes]=useState([]);
 const [settings,setSettings]=useState({valid_days:15,show_logo:true,logo:'',terms:''}),[companyLogo,setCompanyLogo]=useState('');
 const [settingsOpen,setSettingsOpen]=useState(false),[settingsBusy,setSettingsBusy]=useState(false);
 const [notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
 const [clientSearch,setClientSearch]=useState(''),[client,setClient]=useState(null),[clientName,setClientName]=useState('');
 const [freeClient,setFreeClient]=useState({client_identification:'',client_trade_name:'',client_phone:'',client_phone_alt:'',client_email:'',client_address:''});
 const [editingQuote,setEditingQuote]=useState(null);
 const [productSearch,setProductSearch]=useState(''),[lines,setLines]=useState([]);
 const [title,setTitle]=useState(''),[notes,setNotes]=useState('');
 const [manualDesc,setManualDesc]=useState(''),[manualPrice,setManualPrice]=useState(''),[manualRate,setManualRate]=useState('13');
 const [selectedQuote,setSelectedQuote]=useState(null);
 const [deleteCandidate,setDeleteCandidate]=useState(null),[deleting,setDeleting]=useState(false);
 useEffect(()=>{
  let active=true;
  setProducts([]);setClients([]);setQuotes([]);setClient(null);setClientSearch('');setClientName('');setLines([]);setTitle('');setNotes('');setSelectedQuote(null);setEditingQuote(null);setDeleteCandidate(null);setFreeClient({client_identification:'',client_trade_name:'',client_phone:'',client_phone_alt:'',client_email:'',client_address:''});setNotice('');
  if(!companyId)return;
  Promise.all([req(`/api/companies/${companyId}/products`),req(`/api/companies/${companyId}/clients`),req(`/api/companies/${companyId}/quote-settings`),req(`/api/companies/${companyId}/quotations`)]).then(([p,c,s,q])=>{
   if(!active)return;
   setProducts(Array.isArray(p)?p:[]);setClients(Array.isArray(c)?c:[]);setSettings(s.settings);setCompanyLogo(s.company_logo||'');setQuotes(Array.isArray(q)?q:[]);
  }).catch(e=>{if(active)setNotice(e.message)});
  return ()=>{active=false};
 },[companyId]);
 const matchingClients=clientSearch.trim()?clients.filter(c=>[c.name,c.trade_name,c.identification,c.email,c.phone].some(t=>String(t||'').toLowerCase().includes(clientSearch.toLowerCase().trim())||String(t||'').replace(/\D/g,'').includes(clientSearch.replace(/\D/g,'')||'~'))).slice(0,8):[];
 const matchingProducts=productSearch.trim()?products.filter(p=>[p.description,p.product_code,p.barcode].some(t=>String(t||'').toLowerCase().includes(productSearch.toLowerCase().trim()))).slice(0,10):[];
 const addCatalogProduct=p=>{
  if(p.currency!=='CRC'){setNotice('Este artículo está en USD. Configura el precio en CRC para cotizarlo.');return}
  setLines(old=>old.some(l=>l.product_id===p.id)?old.map(l=>l.product_id===p.id?{...l,quantity:l.quantity+1}:l):[...old,{id:`p${p.id}`,product_id:p.id,description:p.description,quantity:1,price:Number(p.price),tax_rate:Number(p.tax_rate),price_includes_tax:Number(p.price_includes_tax)===1}]);
  setProductSearch('');
 };
 const addManual=()=>{
  const price=Number(manualPrice),taxRate=Number(manualRate);
  if(!manualDesc.trim()||!Number.isFinite(price)||price<=0||!Number.isFinite(taxRate)||taxRate<0||taxRate>100){setNotice('Revisa la descripción, precio y tarifa del concepto manual.');return}
  setLines(old=>[...old,{id:`m${Date.now()}-${old.length}`,product_id:null,description:manualDesc.trim(),quantity:1,price,tax_rate:taxRate,price_includes_tax:true}]);
  setManualDesc('');setManualPrice('');setNotice('Concepto manual agregado.');
 };
 const estimate=lines.map(l=>{
  const rate=Number(l.tax_rate),qty=Math.max(1,Math.round(Number(l.quantity)||1));
  const unit=Math.round((l.price_includes_tax?Number(l.price)/(1+rate/100):Number(l.price)))*100;
  const subtotal=unit*qty;
  const tax=l.price_includes_tax?Math.round(Number(l.price))*100*qty-subtotal:Math.round(subtotal*rate/10000)*100;
  return {...l,qty,subtotal,tax,total:subtotal+tax};
 });
 const estimateTotal=estimate.reduce((sum,l)=>sum+l.total,0);
 const uploadLogo=event=>{
  const file=event.target.files?.[0];event.target.value='';if(!file)return;
  if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>250000){setNotice('Selecciona una imagen PNG, JPG o WebP menor de 250 KB.');return}
  const reader=new FileReader();reader.onload=()=>setSettings(old=>({...old,logo:String(reader.result)}));reader.readAsDataURL(file);
 };
 const saveSettings=async()=>{
  setSettingsBusy(true);
  try{const result=await req(`/api/companies/${companyId}/quote-settings`,{method:'PUT',body:JSON.stringify(settings)});setSettings(result.settings);setSettingsOpen(false);setNotice('Preferencias de proforma guardadas para esta empresa. Se usarán automáticamente en futuras cotizaciones.')}catch(e){setNotice(e.message)}finally{setSettingsBusy(false)}
 };
 const resetDraft=()=>{setEditingQuote(null);setLines([]);setProductSearch('');setNotes('');setTitle('');setClient(null);setClientSearch('');setClientName('');setFreeClient({client_identification:'',client_trade_name:'',client_phone:'',client_phone_alt:'',client_email:'',client_address:''});};
 const saveQuote=async()=>{
  if(!lines.length||estimateTotal<=0){setNotice('Agrega al menos un concepto con importe positivo.');return}
  setBusy(true);
  try{
   const editing=!!editingQuote;
   const url=editing?`/api/companies/${companyId}/quotations/${editingQuote.id}`:`/api/companies/${companyId}/quotations`;
   const body={client_id:client?.id||null,client_name:client?client.name:clientName||'Consumidor final',...(!client?freeClient:{}),title,notes,lines:lines.map(l=>({existing_line_id:l.existing_line_id??null,product_id:l.product_id,description:l.description,quantity:l.quantity,price:l.price,tax_rate:l.tax_rate,price_includes_tax:l.price_includes_tax}))};
   const result=await req(url,{method:editing?'PUT':'POST',body:JSON.stringify(body)});
   const detail=await req(`/api/companies/${companyId}/quotations/${result.id}`);
   setSelectedQuote(detail);setQuotes(await req(`/api/companies/${companyId}/quotations`));resetDraft();
   setNotice(`Proforma #${result.id} ${editing?'actualizada':'guardada'} por ${money(result.total_cents)}. No se modificaron las existencias.`);
  }catch(e){setNotice(e.message)}finally{setBusy(false)}
 };
 const openQuote=async id=>{try{setSelectedQuote(await req(`/api/companies/${companyId}/quotations/${id}`))}catch(e){setNotice(e.message)}};
 const editQuote=async id=>{
  try{
   const quote=await req(`/api/companies/${companyId}/quotations/${id}`);
   const c=clients.find(x=>Number(x.id)===Number(quote.client_id))||null;
   setEditingQuote({id:quote.id});setSelectedQuote(quote);setClient(c);
   setClientName(c?'':quote.client_name==='Consumidor final'?'':quote.client_name);
   setFreeClient({client_identification:quote.client_identification||'',client_trade_name:quote.client_trade_name||'',client_phone:quote.client_phone||'',client_phone_alt:quote.client_phone_alt||'',client_email:quote.client_email||'',client_address:quote.client_address||''});
   setClientSearch('');setTitle(quote.title||'');setNotes(quote.notes||'');
   setLines((quote.lines||[]).map(l=>({id:`q${l.id}`,existing_line_id:l.id,product_id:null,description:l.description,quantity:l.quantity,price:l.input_price_cents!==null?Number(l.input_price_cents)/100:(l.quantity>0&&l.total_cents%l.quantity===0?Number(l.total_cents)/100/l.quantity:Number(l.unit_price_cents)/100),tax_rate:l.tax_rate,price_includes_tax:l.input_includes_tax!==null?l.input_includes_tax===1:l.quantity>0&&l.total_cents%l.quantity===0})));
   setNotice(`Editando la proforma #${id}. Conservaremos su número y el logo con que fue guardada.`);
  }catch(e){setNotice(e.message)}
 };
 const deleteQuote=async()=>{
  if(!deleteCandidate||deleting)return;
  const id=deleteCandidate.id;
  setDeleting(true);
  try{
   await req(`/api/companies/${companyId}/quotations/${id}`,{method:'DELETE'});
   setQuotes(old=>old.filter(q=>Number(q.id)!==Number(id)));
   if(Number(selectedQuote?.id)===Number(id))setSelectedQuote(null);
   if(Number(editingQuote?.id)===Number(id))resetDraft();
   setDeleteCandidate(null);
   setNotice(`Proforma #${id} eliminada correctamente. No se modificaron ventas ni existencias.`);
   try{setQuotes(await req(`/api/companies/${companyId}/quotations`))}catch{setNotice(`Proforma #${id} eliminada correctamente. No se pudo actualizar el historial; vuelve a abrir Cotizaciones para actualizarlo.`)}
  }catch(e){setNotice(`No se pudo eliminar la proforma #${id}: ${e.message}`)}finally{setDeleting(false)}
 };
 const savePDF=async()=>{
  if(!selectedQuote)return;
  try{
   if(!window.facturacrReports?.savePdf)throw Error('El PDF necesita la aplicación de escritorio de Windows.');
   const result=await window.facturacrReports.savePdf(quoteDocument(selectedQuote,company),`FacturaCR_Proforma_${selectedQuote.id}.pdf`,{landscape:false});
   if(result?.cancelled)return;
   if(!result?.success)throw Error(result?.error||'No se pudo guardar el documento.');
   setNotice(`Cotización PDF guardada: ${result.path}`);
  }catch(e){setNotice(e.message)}
 };
 if(!companyId)return <div className="card">Selecciona una empresa para crear cotizaciones.</div>;
 return <section className="quotesWorkspace">
  <div className="quotesHero"><div><p className="companiesOverline">Documentos comerciales · Costa Rica</p><h3>Cotizaciones y proformas</h3><p className="hint">Prepara estimaciones sin registrar ventas, cobros ni movimientos de inventario.</p></div><button type="button" className="secondary" onClick={()=>setSettingsOpen(v=>!v)}>{settingsOpen?'Cerrar preferencias':'⚙ Personalizar proformas'}</button></div>
  {notice&&<div className="notice" role="status">{notice}</div>}
  {settingsOpen&&<div className="card quotesSettings"><h3>Preferencias de esta empresa</h3><div className="two"><label className="field">Vigencia (días)<input type="number" min="1" max="365" value={settings.valid_days} onChange={e=>setSettings(s=>({...s,valid_days:Number(e.target.value)}))}/></label><div className="quoteLogoSetting"><label><input type="checkbox" checked={!!settings.show_logo} onChange={e=>setSettings(s=>({...s,show_logo:e.target.checked}))}/> Incluir logo de la empresa</label>{settings.logo||companyLogo?<img src={settings.logo||companyLogo} alt="Logo guardado de la empresa"/>:<small>No hay logo guardado. Puedes subirlo aquí o desde Ventas → Personalizar tiquete.</small>}<input type="file" accept="image/png,image/jpeg,image/webp" onChange={uploadLogo} aria-label="Seleccionar logo para proformas"/><small>PNG, JPG o WebP · máximo 250 KB. El archivo se guarda una vez por empresa.</small>{settings.logo&&<button type="button" className="secondary" onClick={()=>setSettings(old=>({...old,logo:''}))}>Usar el logo general de la empresa</button>}</div></div><label className="field">Condiciones que aparecerán siempre en las cotizaciones<textarea rows="3" maxLength="1500" value={settings.terms} onChange={e=>setSettings(s=>({...s,terms:e.target.value}))}/></label><button type="button" onClick={saveSettings} disabled={settingsBusy}>{settingsBusy?'Guardando…':'Guardar preferencias'}</button></div>}
  <div className="quotesGrid"><div className="card"><div className="quoteEditorHeading"><h3>{editingQuote?`Editar proforma #${editingQuote.id}`:"Nueva cotización"}</h3>{editingQuote&&<button type="button" className="secondary" onClick={()=>{resetDraft();setNotice("Edición cancelada. La proforma guardada no cambió.")}}>Cancelar edición</button>}</div><label className="field">Título o descripción general<input value={title} onChange={e=>setTitle(e.target.value)} maxLength="160" placeholder="Ej.: Servicio de mantenimiento"/></label><div className="quotesClientBlock"><label className="field">Cliente (buscar nombre o cédula)<input value={clientSearch} onChange={e=>{setClientSearch(e.target.value);setClient(null)}} placeholder="Nombre o identificación" autoComplete="off"/></label>{client&&<div className="quotePicked"><b>✓ {client.name}</b> · {client.identification}{client.trade_name?` · ${client.trade_name}`:''}<button type="button" className="secondary" onClick={()=>{setClient(null);setClientSearch('')}}>Cambiar</button></div>}{!client&&matchingClients.length>0&&<div className="quoteChoices">{matchingClients.map(c=><button type="button" key={c.id} className="secondary" onClick={()=>{setClient(c);setClientSearch('')}}><strong>{c.name}</strong><small>{c.identification}{c.trade_name?` · ${c.trade_name}`:''}</small></button>)}</div>}{!client&&<div className="quoteFreeClient"><label className="field">Nombre libre del destinatario (si no está registrado)<input value={clientName} maxLength="160" onChange={e=>setClientName(e.target.value)} placeholder="Opcional; consumidor final si se deja vacío"/></label><details><summary>Agregar identificación y datos de contacto del cliente</summary><div className="quoteClientFields"><label className="field">Identificación<input value={freeClient.client_identification} maxLength="30" onChange={e=>setFreeClient(o=>({...o,client_identification:e.target.value}))}/></label><label className="field">Nombre comercial<input value={freeClient.client_trade_name} maxLength="160" onChange={e=>setFreeClient(o=>({...o,client_trade_name:e.target.value}))}/></label><label className="field">Teléfono<input value={freeClient.client_phone} maxLength="40" onChange={e=>setFreeClient(o=>({...o,client_phone:e.target.value}))}/></label><label className="field">Teléfono alternativo<input value={freeClient.client_phone_alt} maxLength="40" onChange={e=>setFreeClient(o=>({...o,client_phone_alt:e.target.value}))}/></label><label className="field">Correo electrónico<input type="email" value={freeClient.client_email} maxLength="160" onChange={e=>setFreeClient(o=>({...o,client_email:e.target.value}))}/></label><label className="field">Dirección<textarea rows="2" value={freeClient.client_address} maxLength="350" onChange={e=>setFreeClient(o=>({...o,client_address:e.target.value}))}/></label></div></details></div>}</div>
    <label className="field">Agregar artículo o servicio registrado<input value={productSearch} onChange={e=>setProductSearch(e.target.value)} placeholder="Busca por nombre, SKU o código de barras"/></label>{matchingProducts.length>0&&<div className="quoteChoices">{matchingProducts.map(p=><button type="button" className="secondary" key={p.id} onClick={()=>addCatalogProduct(p)}><strong>{p.description}</strong><small>{p.kind==='servicio'?'Servicio':'Producto'} · ₡{Number(p.price).toLocaleString('es-CR')}</small></button>)}</div>}
    <div className="quoteManual"><h4>O agrega un concepto personalizado</h4><div className="quoteManualFields"><label className="field">Descripción<input maxLength="250" value={manualDesc} onChange={e=>setManualDesc(e.target.value)} placeholder="Servicio o trabajo a realizar"/></label><label className="field">Precio con IVA (₡)<input type="number" min="0" value={manualPrice} onChange={e=>setManualPrice(e.target.value)}/></label><label className="field">IVA (%)<select value={manualRate} onChange={e=>setManualRate(e.target.value)}><option value="13">13%</option><option value="4">4%</option><option value="2">2%</option><option value="1">1%</option><option value="0">0%</option></select></label></div><button type="button" className="secondary" onClick={addManual}>+ Agregar concepto</button></div>
    <h4>Detalle estimado</h4>{estimate.length?<div className="quoteLines">{estimate.map(l=><div className="quoteLine" key={l.id}><div><strong>{l.description}</strong><small>IVA {l.tax_rate}% · {money(l.total)}</small></div><input aria-label={`Cantidad de ${l.description}`} type="number" min="1" max="100000" value={l.quantity} onChange={e=>setLines(old=>old.map(x=>x.id===l.id?{...x,quantity:Number(e.target.value)}:x))}/><button type="button" className="danger" onClick={()=>setLines(old=>old.filter(x=>x.id!==l.id))}>Quitar</button></div>)}</div>:<p className="hint">Agrega artículos del catálogo o conceptos de servicio personalizados.</p>}
    <label className="field">Observaciones de esta cotización<textarea rows="2" maxLength="1500" value={notes} onChange={e=>setNotes(e.target.value)}/></label><div className="quoteTotal"><span>Importe estimado (IVA incluido)</span><strong>{money(estimateTotal)}</strong></div><p className="hint">Vigencia configurada: {settings.valid_days} días. El logo y las condiciones se toman de tus preferencias guardadas.</p><button type="button" disabled={busy||!lines.length||estimateTotal<=0} onClick={saveQuote}>{busy?'Guardando…':editingQuote?'Guardar cambios de proforma':'Guardar cotización'}</button>
   </div><div className="card"><h3>Historial de cotizaciones</h3><p className="hint">Hasta las 300 más recientes. Abre cualquiera para descargar nuevamente su PDF.</p><div className="quoteHistory">{quotes.length?quotes.map(q=><button type="button" className={'quoteHistoryItem '+(selectedQuote?.id===q.id?'selected':'')} key={q.id} onClick={()=>openQuote(q.id)}><strong>Proforma #{q.id} · {money(q.total_cents)}</strong><small>{q.client_name}</small><small>{q.created_at} · {q.title||'Sin título'}</small></button>):<p className="hint">Todavía no has guardado cotizaciones.</p>}</div>{selectedQuote&&<div className="quoteSelected"><h4>Proforma #{selectedQuote.id}</h4><p><strong>{selectedQuote.client_name}</strong> · {money(selectedQuote.total_cents)}</p><p className="hint">{selectedQuote.lines?.length} conceptos · {selectedQuote.valid_days} días de vigencia · Logo guardado en el documento: {selectedQuote.logo_snapshot?'Sí':'No'}</p><div className="quoteSelectedActions"><button type="button" className="secondary" onClick={()=>editQuote(selectedQuote.id)}>Editar proforma</button><button type="button" onClick={savePDF}>Guardar PDF de la proforma</button><button type="button" className="danger" disabled={deleting||busy} onClick={()=>setDeleteCandidate({id:selectedQuote.id,client_name:selectedQuote.client_name})}>Eliminar proforma</button></div></div>}</div></div>
  {deleteCandidate&&<div className="quoteDeleteOverlay" role="presentation"><div className="quoteDeleteDialog" role="alertdialog" aria-modal="true" aria-labelledby="quoteDeleteTitle" aria-describedby="quoteDeleteMessage"><h3 id="quoteDeleteTitle">¿Eliminar la proforma #{deleteCandidate.id}?</h3><p id="quoteDeleteMessage">Se eliminarán esta proforma y sus conceptos del historial de <strong>{deleteCandidate.client_name}</strong>. Esta acción no se puede deshacer. No se modificarán ventas, pagos ni inventario.</p><div className="quoteDeleteActions"><button type="button" className="secondary" disabled={deleting} onClick={()=>setDeleteCandidate(null)}>Cancelar</button><button type="button" className="danger" disabled={deleting} onClick={deleteQuote}>{deleting?'Eliminando…':'Sí, eliminar proforma'}</button></div></div></div>}
 </section>;
}
