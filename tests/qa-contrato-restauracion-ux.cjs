'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../src/main.jsx'),'utf8');
let count=0;
function test(name,fn){fn();count++;console.log('PASS',name)}
test('La inspección muestra Continuar y no Eliminar',()=>{
 const code=src.split('const restoreBackup=async(event)=>')[1].split('const performRestore=async(file)=>')[0];
 assert.match(code,/false,'Continuar'/);
 assert.match(code,/true,'Restaurar respaldo'/);
});
test('Solo la respuesta exitosa del servidor abre el diálogo de éxito',()=>{
 const code=src.split('const performRestore=async(file)=>')[1].split('const refreshBackupStatus=async()=>')[0];
 assert.ok(code.indexOf('if(!response.ok)throw')<code.indexOf("title:'Restauración realizada con éxito'"));
 assert.ok(code.includes("fetch('/api/backups/restore'"));
 assert.ok(code.includes('previousBackup'));
});
test('El diálogo de éxito solo incluye botón Aceptar',()=>{
 assert.match(src,/dialog.kind!=='success'&&dialog.kind!=='error'&&<button/);
 assert.match(src,/dialog.kind==='success'\|\|dialog.kind==='error'\?'Aceptar'/);
 assert.match(src,/dialog.kind==='success'\|\|dialog.kind==='error'\?closeDialog:confirmDialog/);
});
test('Los diálogos peligrosos no pierden su comportamiento',()=>{
 assert.match(src,/dialog.confirmLabel\|\|\(dialog.kind==='success'\|\|dialog.kind==='error'\?'Aceptar':dialog.danger\?'Eliminar':'Confirmar'\)/);
});

test('Las restauraciones utilizan un bloqueo síncrono y un estado de carga',()=>{
 const code=src.split('const performRestore=async(file)=>')[1].split('const refreshBackupStatus=async()=>')[0];
 assert.match(code,/if\(restoreRunningRef.current\)return/);
 assert.match(code,/restoreRunningRef.current=true/);
 assert.match(code,/finally\{restoreRunningRef.current=false/);
 assert.match(src,/role="status" aria-live="polite"/);
});
test('Error de red no se anuncia como éxito y la actualización de pantalla es independiente',()=>{
 const code=src.split('const performRestore=async(file)=>')[1].split('const refreshBackupStatus=async()=>')[0];
 assert.match(code,/kind:'error'/);
 assert.match(code,/const updatedCompanies=await api\('\/api\/companies'\)/);
 assert.ok(code.indexOf('if(!response.ok)throw')<code.indexOf('const updatedCompanies'));
});
console.log(`QA restauración UX: ${count}/${count}`);
