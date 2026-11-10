'use strict';
const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const path=require('node:path');
(async()=>{
 const {valuationFilters,valuationReport}=await import(pathToFileURL(path.resolve(__dirname,'../server/inventory-valuation.js')).href);
 let passed=0;const check=(label,fn)=>{fn();passed++;console.log('PASS',label)};
 const products=[
  {id:1,company_id:1,kind:'producto',track_stock:1,is_deleted:0,product_code:'P01',description:'Refresco',unit:'Unid',stock:20,min_stock:5,cost:350,currency:'CRC'},
  {id:2,company_id:1,kind:'producto',track_stock:1,is_deleted:0,product_code:'P02',description:'Tinta negra',unit:'Unid',stock:2,min_stock:4,cost:0,currency:'CRC'},
  {id:3,company_id:1,kind:'producto',track_stock:1,is_deleted:0,product_code:'P03',description:'Papel',unit:'Unid',stock:3,min_stock:0,cost:9.99,currency:'USD'},
  {id:4,company_id:1,kind:'producto',track_stock:1,is_deleted:0,product_code:'P04',description:'Galletas',unit:'Unid',stock:0,min_stock:0,cost:100,currency:'CRC'},
  {id:5,company_id:1,kind:'servicio',track_stock:0,is_deleted:0,description:'Instalación',stock:1,cost:300,currency:'CRC'},
  {id:6,company_id:1,kind:'producto',track_stock:1,is_deleted:1,description:'Retirado',stock:500,cost:800,currency:'CRC'},
  {id:7,company_id:1,kind:'producto',track_stock:0,is_deleted:0,description:'Sin seguimiento',stock:20,cost:100,currency:'CRC'}
 ];
 check('Valora exclusivamente productos activos con control de existencias',()=>{const r=valuationReport(products,valuationFilters());assert.equal(r.summary.products,4);assert.equal(r.summary.units,25);assert.equal(r.summary.valueCents,700000);assert.equal(r.summary.valuedProducts,2)});
 check('Productos sin costo CRC permanecen sin valorar (no se mezclan USD)',()=>{const r=valuationReport(products,valuationFilters());assert.equal(r.summary.missingCostProducts,2);assert.equal(r.rows.find(x=>x.id===3).valueCents,null);assert.equal(r.rows.find(x=>x.id===2).valueCents,null)});
 check('Permite filtro por agotados y costo válido',()=>{const r=valuationReport(products,valuationFilters({status:'out',cost:'known'}));assert.equal(r.summary.products,1);assert.equal(r.rows[0].id,4);assert.equal(r.rows[0].valueCents,0)});
 check('Filtra por nombre y SKU, respetando acentos y minúsculas',()=>{assert.equal(valuationReport(products,valuationFilters({search:'tinta'})).rows.length,1);assert.equal(valuationReport(products,valuationFilters({search:'P01'})).rows[0].id,1)});
 check('Valida filtros y límites de paginación',()=>{assert.throws(()=>valuationFilters({status:'wrong'}));assert.throws(()=>valuationFilters({cost:'wrong'}));assert.throws(()=>valuationFilters({page:0}));assert.throws(()=>valuationFilters({search:'x'.repeat(101)}))});
 check('La valoración usa centavos exactos al sumar costos con decimales',()=>{const x={...products[0],stock:3,cost:2.33};const r=valuationReport([x],valuationFilters());assert.equal(r.summary.valueCents,699)});
 console.log(`QA valoración inventario: ${passed}/${passed}`);
})().catch(e=>{console.error(e);process.exitCode=1});
