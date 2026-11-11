'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
const {pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..');

test('Scroll dentro de la lista en portal no provoca cierre',async()=>{
 const {scrollEsInterno}=await import(pathToFileURL(path.join(root,'frontend/src/components/scroll-selector.mjs')).href);
 const opcion={};const lista={};const subarbol={};const externo={};
 const raiz={contains:target=>target===subarbol};
 const menu={contains:target=>target===lista||target===opcion};
 assert.equal(scrollEsInterno(lista,raiz,menu),true,'scroll de lista');
 assert.equal(scrollEsInterno(opcion,raiz,menu),true,'scroll de opción');
 assert.equal(scrollEsInterno(subarbol,raiz,menu),true,'scroll del control');
 assert.equal(scrollEsInterno(externo,raiz,menu),false,'scroll de otro panel');
 assert.equal(scrollEsInterno(null,raiz,menu),false);
});

test('El componente cierra solo por scroll externo; conserva Escape, selección y click fuera',()=>{
 const jsx=fs.readFileSync(path.join(root,'frontend/src/components/SelectElegante.jsx'),'utf8');
 assert.match(jsx,/const scrollExterno=e=>\{if\(!scrollEsInterno\(e\.target,raiz\.current,menu\.current\)\)cerrar\(\);\};/);
 assert.match(jsx,/window\.addEventListener\('scroll',scrollExterno,true\)/);
 assert.match(jsx,/window\.removeEventListener\('scroll',scrollExterno,true\)/);
 assert.doesNotMatch(jsx,/window\.addEventListener\('scroll',cerrar,true\)/);
 assert.match(jsx,/document\.addEventListener\('pointerdown',fuera\)/);
 assert.match(jsx,/e\.key==='Escape'/);
 assert.match(jsx,/onClick=\{\(\)=>elegir\(op\)\}/);
});

test('CSS contiene el scroll interno sin propagarse a la página',()=>{
 const css=fs.readFileSync(path.join(root,'frontend/src/components/ui-controls.css'),'utf8');
 assert.match(css,/\.select-elegante-opciones\s*\{[^}]*overflow:auto/);
 assert.match(css,/overscroll-behavior:contain/);
});

test('Playwright cubre scroll con rueda, selección y Escape en escritorio y móvil',()=>{
 const e2e=fs.readFileSync(path.join(root,'e2e/aplicacion.spec.cjs'),'utf8');
 assert.match(e2e,/Scroll en el menú de tipos no cierra el desplegable/);
 assert.match(e2e,/page\.mouse\.wheel\(/);
 assert.match(e2e,/\.scrollTop/);
 assert.match(e2e,/Escape/);
});
