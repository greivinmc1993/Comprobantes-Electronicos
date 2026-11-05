const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const raiz=path.join(__dirname,'..');
const mod=()=>import('../frontend/src/periodos.mjs');
const hoy=new Date(2026,10,4,13,0,0);
test('filtro: por defecto conserva todo el historial',async()=>{
 const {obtenerRangoPanel,filtrarPorPeriodo}=await mod();
 const rango=obtenerRangoPanel({modo:'todos'},hoy);
 assert.deepEqual(rango,{desde:'',hasta:'',valido:true});
 assert.equal(filtrarPorPeriodo([{fecha:'2020-01-01'},{fecha:null}],rango).length,2);
});
test('filtro: mes actual y anterior con limites inclusivos',async()=>{
 const {obtenerRangoPanel,filtrarPorPeriodo}=await mod();
 assert.deepEqual(obtenerRangoPanel({modo:'actual'},hoy),{desde:'2026-11-01',hasta:'2026-11-04',valido:true});
 assert.deepEqual(obtenerRangoPanel({modo:'anterior'},hoy),{desde:'2026-10-01',hasta:'2026-10-31',valido:true});
 const docs=[{fecha:'2026-10-01T00:00:00-06:00'},{fecha:'2026-10-31T23:59:59-06:00'},{fecha:'2026-11-01T00:00:00-06:00'}];
 assert.equal(filtrarPorPeriodo(docs,obtenerRangoPanel({modo:'anterior'},hoy)).length,2);
});
test('filtro: últimos tres meses y año actual cruzando año',async()=>{
 const {obtenerRangoPanel}=await mod();
 const enero=new Date(2027,0,10);
 assert.deepEqual(obtenerRangoPanel({modo:'tres'},enero),{desde:'2026-11-01',hasta:'2027-01-10',valido:true});
 assert.deepEqual(obtenerRangoPanel({modo:'anio'},enero),{desde:'2027-01-01',hasta:'2027-01-10',valido:true});
});
test('filtro: febrero bisiesto y mes elegido',async()=>{
 const {obtenerRangoPanel,mismoMes}=await mod();
 const r=obtenerRangoPanel({modo:'mes',mes:'2024-02'},hoy);
 assert.deepEqual(r,{desde:'2024-02-01',hasta:'2024-02-29',valido:true});
 assert.equal(mismoMes(r),true);
});
test('filtro: rango personalizado incluye ambos extremos y respeta notas de crédito',async()=>{
 const {obtenerRangoPanel,filtrarPorPeriodo}=await mod();
 const r=obtenerRangoPanel({modo:'rango',desde:'2026-10-10',hasta:'2026-10-20'},hoy);
 const docs=[{fecha:'2026-10-10T23:00:00-06:00',total:3000},{fecha:'2026-10-20',total:-1000},{fecha:'2026-10-21',total:5000},{fecha:'',total:77}];
 assert.deepEqual(filtrarPorPeriodo(docs,r).map(x=>x.total),[3000,-1000]);
});
test('filtro: no interpreta intervalos inválidos como todo el historial',async()=>{
 const {obtenerRangoPanel,filtrarPorPeriodo}=await mod();
 const docs=[{fecha:'2026-11-04'}];
 for(const filtro of [{modo:'rango',desde:'2026-12-01',hasta:'2026-11-01'},{modo:'rango',desde:'2026-02-30',hasta:'2026-12-30'},{modo:'mes',mes:'2026-13'}]) {
  const rango=obtenerRangoPanel(filtro,hoy);
  assert.equal(rango.valido,false);
  assert.deepEqual(filtrarPorPeriodo(docs,rango),[]);
 }
});
test('integración: panel usa datos filtrados para tarjetas, gráficos y recientes',()=>{
 const app=fs.readFileSync(path.join(raiz,'frontend/src/App.jsx'),'utf8');
 assert.match(app,/resumenPanel=useMemo\(\(\)=>resumenDatos\(documentosPanel\)/);
 assert.match(app,/for\(const f of documentosPanel\)/);
 assert.match(app,/docs=\{\[\.\.\.documentosPanel\]/);
 assert.match(app,/abrirDesdePanel\('reportes'\)/);
 assert.match(app,/abrirDesdePanel\('documentos'\)/);
});
