const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const app=fs.readFileSync(path.join(__dirname,'../frontend/src/App.jsx'),'utf8');
const iconos=fs.readFileSync(path.join(__dirname,'../frontend/src/components/Icon.jsx'),'utf8');
test('Exportar muestra flecha hacia afuera y abre sección de reportes',()=>{
  assert.match(app, /icono="exportar"[^>]*onClick=\{\(\)=>seccion===/);
  assert.match(iconos, /exportar:<><path d="M4 17v3h16v-3"\/><path d="M12 16V3m-5 5 5-5 5 5"\/><\/>/);
});
test('Importar XML muestra flecha hacia adentro y abre selector de archivos',()=>{
  assert.match(app, /icono="importar"[^>]*onClick=\{\(\)=>fileInput.current\?\.click\(\)/);
  assert.match(iconos, /importar:<><path d="M4 17v3h16v-3"\/><path d="M12 3v13m-5-5 5 5 5-5"\/><\/>/);
});
test('Iconos de descarga para PDF, CSV y respaldos se conservan',()=>{
  assert.match(app, /icono="download"[^\n]*Generar PDF/);
  assert.match(app, /icono="download"[^\n]*PDF detalle/);
});
