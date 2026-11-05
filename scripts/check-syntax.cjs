'use strict';
const {spawnSync}=require('node:child_process');
const fs=require('node:fs');const path=require('node:path');
const root=path.resolve(__dirname,'..');
const targets=['backend','electron','tests','scripts'];
const files=targets.flatMap(dir=>fs.readdirSync(path.join(root,dir))
  .filter(name=>/\.(?:js|cjs|mjs)$/.test(name))
  .map(name=>path.join(root,dir,name)));
files.push(path.join(root,'frontend/src/periodos.mjs'),path.join(root,'frontend/src/export-utils.mjs'),path.join(root,'vite.config.mjs'));
let errors=0;
for(const file of files){
 if(file===__filename)continue;
 const result=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});
 if(result.status!==0){errors++;console.error(`✗ ${path.relative(root,file)}\n${result.stderr}`);}
}
if(errors){console.error(`Fallaron ${errors} revisiones de sintaxis.`);process.exit(1);}
console.log(`✓ Sintaxis válida: ${files.length} archivos JS/CJS/MJS. JSX se valida con Vite.`);
