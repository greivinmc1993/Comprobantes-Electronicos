'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const server=fs.readFileSync(path.join(root,'server/index.js'),'utf8');
const main=fs.readFileSync(path.join(root,'src/main.jsx'),'utf8');
const css=fs.readFileSync(path.join(root,'src/style.css'),'utf8');
let passed=0;
function check(name,fn){fn();passed++;console.log('PASS',name)}
check('Existe inspección previa independiente de restauración',()=>{
 assert.ok(server.includes("app.post('/api/backups/inspect'"));
 assert.ok(server.includes("app.post('/api/backups/restore'"));
 assert.ok(server.indexOf("app.post('/api/backups/inspect'")<server.indexOf("app.post('/api/backups/restore'"));
});
check('El servidor examina la integridad y compatibilidad',()=>{
 const segment=server.split("app.post('/api/backups/inspect'")[1].split("app.post('/api/backups/restore'")[0];
 for(const phrase of ["integrity_check", "PRAGMA table_info", "readonly:true", "fileMustExist:true", "cleanTempDir(dir)", "pipeline(req", "companyNames", "quotations"]) assert.ok(segment.includes(phrase),phrase);
 assert.equal(segment.includes('renameSync(candidate,databasePath)'),false);
});
check('La interfaz inspecciona antes de solicitar restauración',()=>{
 const part=main.split('const restoreBackup=async(event)=>')[1].split('const performRestore=async(file)=>')[0];
 assert.ok(part.includes("fetch('/api/backups/inspect'"));
 assert.ok(part.includes('result.backup'));
 assert.ok(part.includes('result.current'));
 assert.ok(part.includes('askConfirm('));
 assert.ok(part.includes('performRestore(file)'));
 assert.ok(css.includes('#dialog-description{white-space:pre-line}'));
});
console.log(`QA inspección de respaldos: ${passed}/${passed}`);
