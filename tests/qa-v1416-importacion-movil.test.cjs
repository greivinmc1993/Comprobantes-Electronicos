'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const raiz=path.resolve(__dirname,'..');
const css=fs.readFileSync(path.join(raiz,'frontend/src/App.css'),'utf8');
const vista=fs.readFileSync(path.join(raiz,'frontend/src/components/VistaPrevia.jsx'),'utf8');
const e2e=fs.readFileSync(path.join(raiz,'e2e/aplicacion.spec.cjs'),'utf8');
const estadoURL=pathToFileURL(path.join(raiz,'frontend/src/components/estado-revision.mjs')).href;
const masivaURL=pathToFileURL(path.join(raiz,'frontend/src/components/asignacion-masiva.mjs')).href;

test('vista previa apila los XML sin mínimo horizontal en móvil',()=>{
 assert.match(css,/@media\s*\(max-width:\s*620px\)/);
 assert.match(css,/\.qa-preview \.qa-table\s*,\s*\.qa-preview \.qa-table tbody\s*\{[^}]*min-width:0/s);
 assert.match(css,/\.qa-preview \.qa-table-scroll\s*\{[^}]*overflow:clip/s);
 assert.match(css,/\.qa-preview \.qa-table tbody tr\s*\{[^}]*display:grid/s);
 assert.match(css,/\.qa-preview \.qa-table tbody td:nth-child\(4\)::before\s*\{content:'Empresa destino'\}/);
});

test('filtrar pendientes reinicia el scroll del cuerpo y no depende de scrollIntoView',()=>{
 assert.match(vista,/const cambiarFiltro=\(nuevo\)=>\{/);
 assert.match(vista,/if\(cuerpoRef\.current\) cuerpoRef\.current\.scrollTop=0/);
 assert.doesNotMatch(vista,/tablaRef\.current\.scrollIntoView\??\(/);
});

test('pendientes permanecen desmarcados tras filtrar y asignar perfil',async()=>{
 const {exclusionInicial,filtrarPorRevision,marcarComprobantes}=await import(estadoURL);
 const {asignarEmpresaMasiva}=await import(masivaURL);
 const filas=[{indice:0,estado:'listo',empresasCompatibles:[1]},
  {indice:1,estado:'requiere_empresa',empresasCompatibles:[],sinCedula:[1,2]},
  {indice:2,estado:'error'}];
 let excluidos=exclusionInicial(filas);
 assert.deepEqual(filtrarPorRevision(filas,'revisar').map(f=>f.indice),[1]);
 excluidos=marcarComprobantes(filas,excluidos,true);
 assert.equal(excluidos[1],true);
 const resultado=asignarEmpresaMasiva(filas,excluidos,{0:'1'}, {id:2,nombre:'Empresa B',cedula:''});
 assert.equal(resultado.aplicados,1);
 assert.equal(resultado.selecciones[1],undefined);
});

test('Playwright verifica el destino, la selección y la ausencia de scroll horizontal',()=>{
 assert.match(e2e,/Vista previa móvil: empresa y revisión accesibles sin desplazamiento horizontal/);
 assert.match(e2e,/dimensiones\.real\)\.toBeLessThanOrEqual\(dimensiones\.visible\+2\)/);
 assert.match(e2e,/await expect\(checkbox\)\.not\.toBeChecked\(\)/);
 assert.match(e2e,/await destino\.selectOption\('2'\)/);
});
