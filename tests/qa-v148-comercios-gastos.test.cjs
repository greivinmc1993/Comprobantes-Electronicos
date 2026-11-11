'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const {identidadComercio,agruparGastosComercios}=require('../backend/comercios-gastos');
function doc(cedula,nombre,extra={}) {return {emisor:{nombre,identificacion:{numero:cedula}},gastoAdministrativo:false,...extra};}

test('la cédula identifica al comercio sin mezclar emisores con el mismo nombre',()=>{
 const docs=[doc('3-101-111111','Comercial ABC'),doc('3101222222','Comercial ABC'),
  doc('3101111111','Comercial ABC',{gastoAdministrativo:true,montoGastoManual:123})];
 const grupos=agruparGastosComercios(docs);
 assert.equal(grupos.length,2);
 assert.equal(grupos.find(g=>g.clave==='cedula:3101111111').total,2);
 assert.equal(grupos.find(g=>g.clave==='cedula:3101111111').marcados,1);
 assert.equal(grupos.find(g=>g.clave==='cedula:3101111111').manuales,1);
 assert.equal(grupos.find(g=>g.clave==='cedula:3101222222').total,1);
});
test('sin cédula utiliza nombre sin tildes o espacios duplicados, nunca agrupa emisor vacío',()=>{
 const a={comercio:'  SERVICIOS  JOSÉ  '},b={emisor:{nombre:'Servicios Jose'}},c={};
 assert.equal(identidadComercio(a),identidadComercio(b));
 assert.equal(identidadComercio(c),null);
 assert.equal(agruparGastosComercios([a,b,c]).length,1);
});
test('nota de crédito y total fiscal cero se incluyen, sin crear importes manuales',()=>{
 const grupo=agruparGastosComercios([doc('123','Gasolinera',{tipoDocumento:'Nota de crédito',total:-50}),
 doc('123','Gasolinera',{total:0,montoGastoManual:null})])[0];
 assert.equal(grupo.total,2);assert.equal(grupo.pendientes,2);assert.equal(grupo.manuales,0);
});
test('el puente exige confirmación, crea respaldo y opera solo con la empresa activa',()=>{
 const main=fs.readFileSync(path.join(root,'electron/main.js'),'utf8');
 const preload=fs.readFileSync(path.join(root,'electron/preload.js'),'utf8');
 assert.match(main,/clasificar-gastos-comercio/);assert.match(main,/confirmado!==true/);
 assert.match(main,/gestorRespaldos\.crear\('antes-clasificar'\)/);
 assert.match(preload,/clasificarGastosComercio/);
});
test('la interfaz pide confirmación, permite quitar y advierte sobre total fiscal cero',()=>{
 const app=fs.readFileSync(path.join(root,'frontend/src/App.jsx'),'utf8');
 assert.match(app,/Clasificar gastos por comercio/);assert.match(app,/solicitarConfirmacion\(aviso,/);
 assert.match(app,/Quitar comercio de gastos/);
 assert.match(app,/Las facturas con total cero no reciben automáticamente/);
});
