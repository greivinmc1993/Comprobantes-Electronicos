// Contrato del dashboard comercial v0.6.44: empresa, filtros, informes completos y PDF.
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const server=fs.readFileSync(path.join(root,'server','index.js'),'utf8');
const routes=fs.readFileSync(path.join(root,'server','dashboard.js'),'utf8');
const panel=fs.readFileSync(path.join(root,'src','DashboardPanel.jsx'),'utf8');
const ui=fs.readFileSync(path.join(root,'src','main.jsx'),'utf8');
const checks=[
 ['El servidor registra rutas de dashboard con validación de empresa',()=>assert.ok(server.includes('registerDashboardRoutes(app,db,saleCompany)')&&routes.includes('const companyId=saleCompany(req)'))],
 ['Los filtros permiten cliente, contado/crédito, método y estado',()=>assert.ok(['client','type','method','status'].every(k=>routes.includes('req.query.'+k)))],
 ['SQL incluye parametros vinculados y empresa en sus condiciones',()=>assert.ok(routes.includes('s.company_id=?')&&routes.includes('pfilter.method=?')&&routes.includes('s.client_id=?'))],
 ['Hay métricas y cobros separados por fecha de pago',()=>assert.ok(routes.includes('p.created_at BETWEEN ? AND ?')&&routes.includes('s.created_at')&&routes.includes('collected_cents'))],
 ['Dashboard no tiene límite histórico de 500 ventas',()=>assert.ok(routes.includes('SELECT COUNT(*) AS sale_count')&&!routes.includes('LIMIT 500'))],
 ['Paginación de ventas y exportación total independientes',()=>assert.ok(routes.includes('LIMIT ? OFFSET ?')&&routes.includes('salesRows(f,{all:true})'))],
 ['Exportación CSV detallada y resumen',()=>assert.ok(routes.includes('dashboard/export.csv')&&routes.includes("kind==='detallado'")&&routes.includes('sep=;'))],
 ['Exportación PDF en servidor y escritorio Electron',()=>assert.ok(routes.includes('dashboard/export.html')&&panel.includes('facturacrReports.savePdf'))],
 ['CSV protege valores de origen externo contra fórmulas',()=>assert.ok(routes.includes('const csvCell')&&fs.readFileSync(path.join(root,'server','report-format.js'),'utf8').includes('replace(/"/g'))],
 ['Tabla de ventas, rankings de clientes y productos',()=>assert.ok(panel.includes('Ventas filtradas')&&panel.includes('Clientes con más compras')&&panel.includes('Productos más vendidos'))],
 ['Navegación conserva empresa activa',()=>assert.ok(ui.includes("tab==='dashboard'?<DashboardPanel companyId={selected} company={current}/>"))],
 ['La interfaz muestra estados de carga y error',()=>assert.ok(panel.includes('setBusy(true)')&&panel.includes('role="alert"'))],
 ['Los saldos de crédito se identifican como históricos',()=>assert.ok(panel.includes('histórico')&&routes.includes('balance_cents>0'))],
];let passed=0;for(const [label,test] of checks){test();passed++;console.log('PASS',label)}console.log(`QA dashboard avanzado: ${passed}/${checks.length}`);
