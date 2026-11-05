'use strict';
const {test} = require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const leer=r=>fs.readFileSync(path.join(root,r),'utf8');
const bd=leer('backend/database.js');
const main=leer('electron/main.js');
const ui=leer('frontend/src/App.jsx');

test('una instalación nueva no crea el perfil heredado',()=>{
  assert.doesNotMatch(bd,/VALUES\s*\(1, 'Sin asignar/);
  assert.match(bd,/if \(existe && !tienePerfil\)/);
  assert.match(bd,/tienePerfilLegado\(\)/);
});
test('Electron respalda ANTES de eliminar el perfil heredado y no reintenta si falla',()=>{
  const inicio=main.indexOf('if (base.tienePerfilLegado())');
  const copia=main.indexOf("gestorRespaldos.crear('antes-eliminar')",inicio);
  const borrar=main.indexOf('base.eliminarPerfilLegado()',inicio);
  assert.ok(inicio>0 && copia>inicio && borrar>copia);
  assert.match(main,/No se borró «Sin asignar» porque no se pudo crear el respaldo previo/);
});
test('frontend no incluye el perfil falso ni la selección automática del perfil 1',()=>{
  assert.doesNotMatch(ui,/setPerfilId\(1\)/);
  assert.doesNotMatch(ui,/nombre:'Sin asignar \(historial anterior\)'/);
  assert.match(ui,/Todavía no tienes empresas/);
  assert.match(ui,/destinoPerfilId:modoEliminar==='mover'\?Number\(destinoEliminar\):null/);
});
