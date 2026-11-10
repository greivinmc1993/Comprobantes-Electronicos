'use strict';
const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const path=require('node:path');
(async()=>{
 const {buildInventoryAlerts}=await import(pathToFileURL(path.join(__dirname,'../server/inventory-alerts.js')).href);
 const product=(id,overrides={})=>({id,product_code:`P${id}`,description:`Producto ${id}`,kind:'producto',track_stock:1,alert_enabled:1,is_deleted:0,stock:1,min_stock:3,unit:'Unid',cost:100,currency:'CRC',...overrides});
 const result=buildInventoryAlerts([
  product(1,{stock:0,min_stock:0}),product(2,{stock:2,min_stock:5}),product(3,{stock:5,min_stock:5}),
  product(4,{stock:10,min_stock:5}),product(5,{kind:'servicio',stock:0}),product(6,{alert_enabled:0,stock:0}),
  product(7,{track_stock:0,stock:0}),product(8,{is_deleted:1,stock:0}),product(9,{stock:0,min_stock:3,currency:'USD'}),
  product(10,{stock:0,min_stock:4,cost:0})
 ]);
 assert.deepEqual(result.rows.map(r=>r.id),[1,10,9,2,3]);
 assert.equal(result.summary.out,3);assert.equal(result.summary.low,2);
 assert.equal(result.rows.find(r=>r.id===1).suggested,1);
 assert.equal(result.rows.find(r=>r.id===2).suggested,3);
 assert.equal(result.rows.find(r=>r.id===3).suggested,0);
 assert.equal(result.summary.missingCost,2);
 assert.equal(result.summary.estimatedCostCRC,400);
 assert.equal(result.summary.suggestedUnits,11);
 assert.equal(result.summary.total,5);
 console.log('PASS Alertas: prioridades, mínimos, SKU, agotados, costos desconocidos y exclusiones.');
})().catch(e=>{console.error(e);process.exitCode=1});
