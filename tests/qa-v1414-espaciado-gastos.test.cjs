'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const css=fs.readFileSync(path.join(root,'frontend/src/App.css'),'utf8');
const jsx=fs.readFileSync(path.join(root,'frontend/src/App.jsx'),'utf8');
const section=css.slice(css.indexOf('/* v1.4.14 - Espaciado'));

test('ambas tarjetas de gastos reciben padding de encabezado',()=>{
 assert.match(section,/\.gastos-comercios-panel\s*>\s*\.section-head[\s\S]*?\.gastos-panel\s*>\s*\.section-head\s*\{\s*padding:24px 24px 0/);
});
test('contenido y acciones de comercio cuentan con separación propia',()=>{
 assert.match(section,/\.gastos-comercios-contenido\s*\{padding:0 24px 24px/);
 assert.match(section,/\.gastos-comercios-acciones\s*\{gap:12px/);
});
test('tarjetas y botones del informe no quedan junto al borde',()=>{
 assert.match(section,/\.gastos-resumen\s*\{padding:0 24px 20px/);
 assert.match(section,/\.gastos-acciones\s*\{padding:0 24px 20px/);
});
test('avisos y estados vacíos se separan del borde de la tarjeta',()=>{
 assert.match(section,/\.gastos-panel\s*>\s*\.gastos-nota\s*\{[\s\S]*?margin:0 24px 22px/);
 assert.match(section,/\.gastos-panel\s+\.gastos-vacio\s*\{[\s\S]*?margin:18px 24px 24px/);
 assert.match(section,/\.gastos-comercios-contenido\s*>\s*\.gastos-nota\s*\{[\s\S]*?padding:15px 18px/);
});
test('móvil y tableta mantienen paddings interiores',()=>{
 assert.match(section,/@media \(max-width:800px\)/);
 assert.match(section,/@media \(max-width:500px\)/);
 assert.match(section,/padding:18px 16px 0/);
});
test('ambas tarjetas y sus clases continúan presentes en React',()=>{
 for(const fragment of ['gastos-comercios-panel','gastos-comercios-contenido','gastos-panel','gastos-vacio','gastos-resumen','gastos-acciones']) assert.ok(jsx.includes(fragment),fragment);
});
