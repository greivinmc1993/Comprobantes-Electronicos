'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const raiz=path.resolve(__dirname,'..');
const leer=rel=>fs.readFileSync(path.join(raiz,rel),'utf8');
const paquete=JSON.parse(leer('package.json'));

test('La versión se define desde package.json para la interfaz e instalador',()=>{
 const vite=leer('vite.config.mjs');
 const app=leer('frontend/src/App.jsx');
 assert.match(vite,/readFileSync\(path\.join\(projectRoot,'package\.json'\)/);
 assert.match(vite,/__APP_VERSION__:\s*JSON\.stringify\(version\)/);
 assert.match(app,/v\{VERSION_APLICACION\}/);
 assert.doesNotMatch(app,/<span className="app-version">[^<]*v\d+\.\d+\.\d+/);
 assert.match(paquete.version,/^\d+\.\d+\.\d+$/);
 assert.equal(paquete.build.appId,'cr.comprobanteselectronicoscr.desktop');
 assert.match(paquete.build.nsis.artifactName,/\$\{version\}/);
});

test('Los selectores del panel, formularios y vista previa se ven uniformes',()=>{
 for(const archivo of ['frontend/src/App.jsx','frontend/src/components/VistaPrevia.jsx']){
  const jsx=leer(archivo);
  assert.match(jsx,/import SelectElegante/);
  assert.match(jsx,/<SelectElegante/);
  assert.doesNotMatch(jsx,/<select(?:\s|>)/,'No introducir selectores sin estilo en '+archivo);
 }
 const control=leer('frontend/src/components/SelectElegante.jsx');
 assert.match(control,/<select \{\.\.\.props\}/,'Conservar select real y pruebas selectOption');
 assert.match(control,/createPortal/,'Evitar recortar desplegables dentro de cuadros y paneles');
 assert.match(control,/role="listbox"/);
 assert.match(control,/e\.key==='Escape'/);
 assert.match(control,/setFiltro/,'Buscar en listas de muchos comercios');
});

test('Confirmaciones no usan diálogo nativo ni alteran protecciones de datos',()=>{
 const app=leer('frontend/src/App.jsx');
 const modal=leer('frontend/src/components/ConfirmacionElegante.jsx');
 assert.doesNotMatch(app,/window\.(?:confirm|alert|prompt)\(/);
 assert.match(app,/solicitarConfirmacion/);
 assert.match(modal,/role="alertdialog"/);
 assert.match(modal,/onResponder\(false\)/);
 assert.match(app,/desktop\.enviarPapelera\(/);
 assert.match(app,/desktop\.clasificarGastosComercio\(/);
 assert.match(app,/desktop\.restaurarPapelera\(/);
});

test('Los tests de Playwright usan los nuevos controles sin ocultar errores',()=>{
 const e2e=leer('e2e/aplicacion.spec.cjs');
 assert.match(e2e,/getByRole\('alertdialog'/);
 assert.match(e2e,/getByRole\('listbox'/);
 assert.match(e2e,/page\.locator\('\.app-version'\)/);
 assert.match(e2e,/\.selectOption\('rango'\)/);
 assert.doesNotMatch(e2e,/page\.once\('dialog'/);
 assert.doesNotMatch(e2e,/page\.on\('dialog'/);
});

test('Estilos con z-index y vista móvil para desplegables y modales',()=>{
 const css=leer('frontend/src/components/ui-controls.css');
 assert.match(css,/\.select-elegante-lista/);
 assert.match(leer('frontend/src/components/SelectElegante.jsx'),/zIndex:130/);
 assert.match(css,/\.confirmacion-fondo\s*\{z-index:160/);
 assert.match(css,/@media\(max-width:620px\)/);
});
