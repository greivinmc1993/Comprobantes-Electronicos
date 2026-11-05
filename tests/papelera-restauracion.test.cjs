'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {abrirBaseDatos}=require('../backend/database');
function doc(clave,cedula='3101234567') {return {
  clave,consecutivo:clave,tipoDocumento:'Factura electrónica',fecha:'2026-11-05T12:00:00',
  monedaOriginal:'CRC',tipoCambioAplicado:1,totalOriginal:100,total:100,nombreArchivo:clave+'.xml',
  emisor:{nombre:'Empresa origen',identificacion:{numero:cedula}},
  receptor:{nombre:'Cliente',identificacion:{numero:'109999999'}},impuestos:[],bases:{},detalle:[]
};}
function entorno(fn) {const dir=fs.mkdtempSync(path.join(os.tmpdir(),'crc-papelera-'));const base=abrirBaseDatos(path.join(dir,'db.sqlite'));
  try{return fn(base);}finally{base.cerrar();fs.rmSync(dir,{recursive:true,force:true});}}
test('Papelera: retirar y recuperar XML sin modificar otras empresas',()=>entorno(db=>{
  const a=db.crearPerfil({nombre:'Empresa A'}),b=db.crearPerfil({nombre:'Empresa B'});
  db.insertar('<xml>uno</xml>',doc('uno'),a.id);db.insertar('<xml>dos</xml>',doc('dos'),a.id);
  db.insertar('<xml>tres</xml>',doc('tres'),b.id);
  const ids=db.listar(a.id).map(x=>x.id);
  assert.equal(db.enviarPapelera(a.id,ids).enviados,2);
  assert.equal(db.listar(a.id).length,0);assert.equal(db.listar(b.id).length,1);
  const papelera=db.listarPapelera();assert.equal(papelera.length,2);
  assert.equal(db.restaurarPapelera(papelera.map(x=>x.id),a.id).restaurados,2);
  assert.equal(db.listar(a.id).length,2);assert.equal(db.listarPapelera().length,0);
}));
test('Lote de envío atómico y protección por perfil',()=>entorno(db=>{
  const a=db.crearPerfil({nombre:'A'}),b=db.crearPerfil({nombre:'B'});
  db.insertar('<xml>uno</xml>',doc('uno'),a.id);db.insertar('<xml>dos</xml>',doc('dos'),b.id);
  const propio=db.listar(a.id)[0].id,ajeno=db.listar(b.id)[0].id;
  assert.throws(()=>db.enviarPapelera(a.id,[propio,ajeno]),/no está/);
  assert.equal(db.listar(a.id).length,1);assert.equal(db.listarPapelera().length,0);
  assert.throws(()=>db.enviarPapelera(a.id,[propio,propio]),/duplicados/);
}));
test('Traslado en lote atómico: duplicados bloquean toda la operación',()=>entorno(db=>{
  const a=db.crearPerfil({nombre:'A'}),b=db.crearPerfil({nombre:'B'});
  db.insertar('<xml>uno</xml>',doc('uno'),a.id);db.insertar('<xml>dos</xml>',doc('dos'),a.id);
  db.insertar('<xml>dos</xml>',doc('dos'),b.id);
  assert.throws(()=>db.moverLote(a.id,db.listar(a.id).map(x=>x.id),b.id),/ya existe/);
  assert.equal(db.listar(a.id).length,2);assert.equal(db.listar(b.id).length,1);
}));
test('Papelera conserva XML y permite reimportar sin bloquear, pero evita restauración duplicada',()=>entorno(db=>{
  const a=db.crearPerfil({nombre:'A'});
  const valor=doc('uno');db.insertar('<xml>original</xml>',valor,a.id);
  const id=db.listar(a.id)[0].id;db.enviarPapelera(a.id,[id]);
  assert.equal(db.insertar('<xml>nuevo</xml>',valor,a.id),true);
  assert.throws(()=>db.restaurarPapelera([db.listarPapelera()[0].id],a.id),/ya existe/);
  assert.equal(db.listar(a.id).length,1);assert.equal(db.listarPapelera().length,1);
}));
test('Restauración a empresa con cédula ajena rechazada, y destino correcto permitido',()=>entorno(db=>{
  const a=db.crearPerfil({nombre:'A'}),b=db.crearPerfil({nombre:'B',cedula:'999999999'}),c=db.crearPerfil({nombre:'C',cedula:'3101234567'});
  db.insertar('<xml>uno</xml>',doc('uno'),a.id);
  db.enviarPapelera(a.id,[db.listar(a.id)[0].id]);
  const id=db.listarPapelera()[0].id;
  assert.throws(()=>db.restaurarPapelera([id],b.id),/no corresponde/);
  assert.equal(db.restaurarPapelera([id],c.id).restaurados,1);
  assert.equal(db.listar(c.id).length,1);
}));
test('Papelera permanece al reabrir SQLite',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'crc-papelera-reinicio-'));const ruta=path.join(dir,'db.sqlite');let base;
  try {base=abrirBaseDatos(ruta);const p=base.crearPerfil({nombre:'A'});base.insertar('<xml>persistente</xml>',doc('uno'),p.id);
    base.enviarPapelera(p.id,[base.listar(p.id)[0].id]);base.cerrar();base=abrirBaseDatos(ruta);
    assert.equal(base.listarPapelera().length,1);assert.equal(base.listar(p.id).length,0);
    assert.equal(base.restaurarPapelera([base.listarPapelera()[0].id],p.id).restaurados,1);
  }finally{if(base)base.cerrar();fs.rmSync(dir,{recursive:true,force:true});}
});
