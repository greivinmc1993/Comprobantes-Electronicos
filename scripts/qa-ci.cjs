'use strict';
const {spawnSync}=require('node:child_process');
const fs=require('node:fs');const path=require('node:path');
const destino=path.resolve(__dirname,'../qa-results');fs.mkdirSync(destino,{recursive:true});
const xml=path.join(destino,'junit.xml');
const files=fs.readdirSync(path.resolve(__dirname,'../tests')).filter(f=>f.endsWith('.test.cjs')).map(f=>path.resolve(__dirname,'../tests',f));
const args=['--test','--experimental-test-coverage',
  '--test-reporter=spec','--test-reporter=junit',
  '--test-reporter-destination=stdout','--test-reporter-destination='+xml,...files];
const proc=spawnSync(process.execPath,args,{stdio:'inherit',env:process.env});
if(proc.error){console.error(proc.error.message);process.exit(1);}
if(!fs.existsSync(xml) || !fs.statSync(xml).size) {console.error('No se generó el informe JUnit.');process.exit(1);}
console.log('JUnit:',xml);process.exit(proc.status??1);
