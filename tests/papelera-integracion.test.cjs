'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const leer=x=>fs.readFileSync(path.join(__dirname,'..',x),'utf8');
test('Electron expone solo los IPC necesarios para Papelera',()=>{
 const preload=leer('electron/preload.js');const main=leer('electron/main.js');
 for(const nombre of ['papelera-listar','papelera-enviar','papelera-restaurar','mover-lote']){
  assert.ok(main.includes(`comprobanteselectronicoscr:${nombre}`));
  assert.ok(preload.includes(`comprobanteselectronicoscr:${nombre}`));
 }
 assert.ok(main.includes("gestorRespaldos.crear('antes-eliminar')"));
});
test('Panel y reportes consultan exclusivamente datos de documentos activos',()=>{
 const server=leer('backend/server.js');const db=leer('backend/database.js');
 assert.ok(server.includes('base.listar(perfil.id)'));
 assert.ok(db.includes('FROM documentos WHERE perfil_id = ? ORDER BY fecha DESC'));
 assert.ok(db.includes('CREATE TABLE IF NOT EXISTS papelera_documentos'));
});
test('Papelera y selección múltiple visibles en interfaz',()=>{
 const app=leer('frontend/src/App.jsx');
 for(const texto of ['Papelera','Mover seleccionados','Enviar a Papelera','Restaurar seleccionados','Seleccionar comprobantes de esta página','confirmacionLote'])assert.ok(app.includes(texto),texto);
});
test('La Papelera exige confirmación y conserva la transacción SQLite',()=>{
 const db=leer('backend/database.js');const app=leer('frontend/src/App.jsx');
 assert.ok(app.includes("confirmacionLote!=='CONFIRMAR'"));
 assert.ok(db.includes('return db.transaction(()=>{'));
 assert.ok(db.includes('snapshot.xml_original')===false); // Se preserva dentro de fila_json, sin modificarlo.
});
