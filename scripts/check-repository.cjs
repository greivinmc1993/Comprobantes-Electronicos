'use strict';
/** Protege el ZIP y los commits contra datos fiscales, secretos y artefactos accidentales. */
const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const omitidos=new Set(['.git','node_modules','dist','release','qa-results','coverage','test-results','playwright-report','.vite']);
const prohibido=rel=>{
  const n=path.basename(rel).toLowerCase();
  const ruta=rel.replace(/\\/g,'/').replace(/^\.\//,'');
  if(/^(?:cambios|resultados|informe)[_\-].*\.md$/i.test(n))return 'Markdown acumulado de versiones';
  if(n==='.env'||(n.startsWith('.env.')&&!['.env.example','.env.sample'].includes(n)) || n==='.npmrc')return 'Archivo de secretos local';
  if(/\.(?:sqlite|sqlite3|db|db3)(?:-(?:wal|shm|journal))?$/i.test(n))return 'Base de datos privada';
  if(/\.(?:p12|pfx|pem|key|keystore)$/i.test(n))return 'Material criptográfico privado';
  if(/\.(?:xml|pdf|csv|xls|xlsx)$/i.test(n)&&
    !/^tests\/fixtures\//.test(ruta)&&!/^e2e\/fixtures\//.test(ruta))return 'Documento potencialmente fiscal privado';
  return null;
};
const lista=[];
// En GitHub Actions se escanean únicamente archivos versionados. Las copias
// privadas locales ignoradas por Git no provocan un fallo de QA.
const git=spawnSync('git',['ls-files','-z'],{cwd:root,encoding:'buffer'});
if(git.status===0 && git.stdout.length){
  for(const b of git.stdout.toString().split('\0'))if(b)lista.push(b);
}else{
  // Para ZIP entregados sin .git, recorrer solo fuentes y documentación.
  function visitar(dir){
    for(const e of fs.readdirSync(path.join(root,dir),{withFileTypes:true})){
      const rel=path.join(dir,e.name);
      if(e.isDirectory()){if(!omitidos.has(e.name))visitar(rel);}
      else if(e.isFile())lista.push(rel);
    }
  }
  visitar('.');
}
const fallos=lista.map(rel=>({rel,motivo:prohibido(rel)})).filter(x=>x.motivo);
for(const {rel,motivo} of fallos)console.error(`✗ ${rel}: ${motivo}`);
if(fallos.length){console.error(`Repositorio con ${fallos.length} archivo(s) que NO deben distribuirse.`);process.exit(1);}
console.log(`✓ Privacidad y limpieza del proyecto: ${lista.length} archivos revisados.`);
