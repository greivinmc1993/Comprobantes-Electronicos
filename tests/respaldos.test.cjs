'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {crearGestorRespaldos,validarConfiguracion,necesitaRespaldo} = require('../backend/respaldos');

test('Respaldos: valida frecuencia, carpeta y política de retención',()=>{
  assert.throws(()=>validarConfiguracion({habilitado:true, frecuencia:'cada5min', retener:14,carpeta:'/tmp'}),/Frecuencia/);
  assert.throws(()=>validarConfiguracion({habilitado:true, frecuencia:'diario', retener:2,carpeta:'/tmp'}),/Cantidad/);
  assert.equal(necesitaRespaldo('diario',null),true);
  assert.equal(necesitaRespaldo('diario',new Date(Date.now()-1000).toISOString()),false);
  assert.equal(necesitaRespaldo('inicio',null,Date.now(),true),true);
  assert.equal(necesitaRespaldo('inicio',null,Date.now(),false),false);
});

test('Respaldo: fallos no dejan archivos incompletos ni sustituyen respaldos válidos',async()=>{
  const carpeta=fs.mkdtempSync(path.join(os.tmpdir(),'cecr-respaldos-'));
  const base={ruta:path.join(carpeta,'base.sqlite'),respaldo:async destino=>fs.writeFileSync(destino,'sqlite-TEST')};
  let valido=true;
  const gestor=crearGestorRespaldos({base,configuracionDir:path.join(carpeta,'config'),carpetaInicial:path.join(carpeta,'copias'),verificar:ruta=>{
    assert.equal(fs.readFileSync(ruta,'utf8'),'sqlite-TEST');
    if(!valido) throw new Error('Copia inválida');
  }});
  try {
    let estado=gestor.estado();
    assert.equal(estado.habilitado,true);
    assert.equal(estado.copias.length,0);
    const r=await gestor.revisarAutomatico(true);
    assert.equal(r.guardado,true);
    assert.equal(gestor.estado().copias.length,1);
    assert.equal((await gestor.revisarAutomatico(false)).realizado,false);
    await gestor.crear('antes-eliminar');
    await gestor.crear('antes-recalcular');
    await gestor.crear('manual');
    estado=gestor.estado();
    assert.equal(estado.copias.length,4);
    assert.deepEqual(estado.copias.map(x=>x.tipo).sort(),['antes-eliminar','antes-recalcular','automatico','manual']);
    valido=false;
    await assert.rejects(gestor.crear('automatico'),/Copia inválida/);
    assert.equal(gestor.estado().copias.length,4);
    assert.ok(fs.readdirSync(path.join(carpeta,'copias')).every(x=>!x.endsWith('.partial')));
    assert.match(gestor.estado().ultimoError,/Copia inválida/);
  } finally {fs.rmSync(carpeta,{recursive:true,force:true});}
});

test('Respaldos: cambio de carpeta y retención automática sin borrar copias de emergencia',async()=>{
  const carpeta=fs.mkdtempSync(path.join(os.tmpdir(),'cecr-retencion-'));
  const base={ruta:path.join(carpeta,'base.sqlite'),respaldo:async p=>fs.writeFileSync(p,'sqlite-TEST')};
  const gestor=crearGestorRespaldos({base,configuracionDir:path.join(carpeta,'config'),carpetaInicial:path.join(carpeta,'copias'),verificar:()=>{}});
  try {
    const nueva=path.join(carpeta,'nueva');
    gestor.configurar({habilitado:true,frecuencia:'inicio',retener:5,carpeta:nueva});
    await gestor.crear('antes-eliminar');
    for(let i=0;i<7;i++) await gestor.crear('automatico');
    const copias=gestor.estado().copias;
    assert.equal(copias.filter(x=>x.tipo==='automatico').length,5);
    assert.equal(copias.filter(x=>x.tipo==='antes-eliminar').length,1);
    assert.ok(copias.every(x=>x.ruta.startsWith(nueva+path.sep)));
  }finally{fs.rmSync(carpeta,{recursive:true,force:true});}
});
