'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const css=fs.readFileSync(path.join(root,'frontend/src/App.css'),'utf8');
const jsx=fs.readFileSync(path.join(root,'frontend/src/components/VistaPrevia.jsx'),'utf8');
const e2e=fs.readFileSync(path.join(root,'e2e/aplicacion.spec.cjs'),'utf8');
const responsive=css.slice(css.indexOf('/* v1.4.16'));

test('móvil no anida un contenedor vertical desplazable dentro del modal',()=>{
 assert.match(responsive,/\.qa-preview \.qa-table-scroll\s*\{[^}]*flex:0 0 auto;max-height:none;[^}]*overflow:clip;/s);
 assert.match(responsive,/\.qa-preview \.modal-body\.qa-preview-body\s*\{[^}]*overflow-y:auto;overflow-x:hidden;/s);
 assert.doesNotMatch(responsive,/max-height:46dvh/);
});

test('filtrado actualiza scroll del cuerpo y mantiene lista sin auto desplazamiento interno',()=>{
 assert.match(jsx,/ref=\{cuerpoRef\}/);
 assert.match(jsx,/if\(cuerpoRef\.current\) cuerpoRef\.current\.scrollTop=0/);
 assert.match(jsx,/setExcluidos\(v=>\(\{\.\.\.v,\[f\.indice\]:!e\.target\.checked\}\)\)/);
});

test('QA móvil ejerce check() real y comprueba persistencia después de filtrar',()=>{
 assert.match(e2e,/Vista previa móvil: marcar XML al final de una lista larga sin interceptación de clics/);
 assert.match(e2e,/await checkbox\.check\(\); \/\/ NO force:true/);
 assert.match(e2e,/await expect\(ultimo\.getByRole\('checkbox'/);
});
