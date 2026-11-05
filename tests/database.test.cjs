'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {abrirBaseDatos} = require('../backend/database');

test('SQLite: historial, deduplicación, reinicio, respaldo y eliminación', async()=>{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(),'comprobanteselectronicoscr-test-'));
  const archivo=path.join(dir,'historial.sqlite');
  const backup=path.join(dir,'respaldo.sqlite');
  let db;
  try {
    const comprobante={
      clave:'12345678901234567890123456789012345678901234567890', consecutivo:'000001',
      tipoDocumento:'Factura electrónica', versionXML:'4.4', fecha:'2026-10-27',
      comercio:'Comercio de prueba', emisor:{nombre:'Comercio de prueba'},
      receptor:{nombre:'Comprador'}, monedaOriginal:'USD', tipoCambioAplicado:500,
      totalOriginal:24.02, total:12010, nombreArchivo:'test.xml', bases:{'13':10630},
      impuestos:[{codigo:'01',tarifa:13,monto:1380}]
    };
    db=abrirBaseDatos(archivo);
    assert.equal(db.perfiles().length,0);
    const empresa=db.crearPerfil({nombre:'Mi empresa'});
    assert.equal(db.insertar('<FacturaElectronica />',comprobante,empresa.id),true);
    assert.equal(db.insertar('<FacturaElectronica />',comprobante,empresa.id),false);
    assert.equal(db.cantidad(empresa.id),1);
    let listado=db.listar(empresa.id);
    assert.equal(listado.length,1);
    assert.equal(listado[0].total,12010);
    assert.ok(listado[0].id);
    await db.respaldo(backup);
    assert.ok(fs.existsSync(backup));
    db.cerrar(); db=null;
    db=abrirBaseDatos(archivo);
    listado=db.listar(empresa.id);
    assert.equal(listado.length,1);
    assert.equal(db.eliminar(listado[0].id,empresa.id),true);
    assert.equal(db.cantidad(empresa.id),0);
  } finally {
    if (db) db.cerrar();
    fs.rmSync(dir,{recursive:true,force:true});
  }
});
