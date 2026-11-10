// FacturaCR: sugerencias conservadoras de reposición, sin alterar existencias.
export function buildInventoryAlerts(products) {
  const rows=[];
  for(const p of products){
    if(p.is_deleted || p.kind!=='producto' || Number(p.track_stock)!==1 || Number(p.alert_enabled)!==1)continue;
    const stock=Number(p.stock), minimum=Number(p.min_stock);
    if(!Number.isSafeInteger(stock)||!Number.isSafeInteger(minimum)||minimum<0||stock>minimum)continue;
    const target=Math.max(minimum,1); // Agotados con mínimo cero: sugerencia inicial de 1 unidad.
    const suggested=Math.max(0,target-stock);
    const cost=Number(p.cost);
    const hasCost=p.currency==='CRC'&&Number.isFinite(cost)&&cost>0;
    rows.push({id:p.id,code:p.product_code||'',description:p.description,unit:p.unit||'Unid',
      stock,minimum,missing:Math.max(0,minimum-stock),suggested,
      status:stock<=0?'agotado':'bajo',costKnown:hasCost,
      estimatedCostCRC:hasCost?Math.round(suggested*cost*100)/100:null});
  }
  rows.sort((a,b)=>(a.status==='agotado'?0:1)-(b.status==='agotado'?0:1)||a.stock-b.stock||a.description.localeCompare(b.description,'es'));
  return {rows,summary:{total:rows.length,out:rows.filter(r=>r.status==='agotado').length,
    low:rows.filter(r=>r.status==='bajo').length,
    suggestedUnits:rows.reduce((n,r)=>n+r.suggested,0),
    estimatedCostCRC:Math.round(rows.reduce((n,r)=>n+(r.estimatedCostCRC??0),0)*100)/100,
    missingCost:rows.filter(r=>!r.costKnown).length}};
}
