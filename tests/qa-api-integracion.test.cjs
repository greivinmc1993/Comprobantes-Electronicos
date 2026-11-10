'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const {abrirBaseDatos}=require('../backend/database');
const {crearAPI}=require('../backend/server');

// Únicamente datos sintéticos. La prueba nunca consulta Internet ni Hacienda.
function xmlCRC(clave='50600000000000000000000000000000000000000000000001',tipo='FacturaElectronica') {
  return `<?xml version="1.0" encoding="UTF-8"?>
  <${tipo} xmlns="https://cdn.comprobanteselectronicos.go.cr/xml-schemas/v4.4/facturaElectronica">
   <Clave>${clave}</Clave><NumeroConsecutivo>00100001010000000001</NumeroConsecutivo>
   <FechaEmision>2026-11-03T10:30:00</FechaEmision>
   <Emisor><Nombre>Emisor Sintético S.A.</Nombre><Identificacion><Tipo>02</Tipo><Numero>3101111111</Numero></Identificacion></Emisor>
   <Receptor><Nombre>Comprador Sintético</Nombre><Identificacion><Tipo>01</Tipo><Numero>101110111</Numero></Identificacion></Receptor>
   <DetalleServicio><LineaDetalle><NumeroLinea>1</NumeroLinea><Cantidad>1</Cantidad>
    <CodigoCABYS>9799000000000</CodigoCABYS><Detalle>Servicio de prueba</Detalle>
    <PrecioUnitario>100.00</PrecioUnitario><MontoTotal>100.00</MontoTotal><SubTotal>100.00</SubTotal>
    <BaseImponible>100.00</BaseImponible><Impuesto><Codigo>01</Codigo><CodigoTarifaIVA>08</CodigoTarifaIVA><Tarifa>13.00</Tarifa><Monto>13</Monto></Impuesto>
    <ImpuestoNeto>13.00</ImpuestoNeto><MontoTotalLinea>113.00</MontoTotalLinea>
   </LineaDetalle></DetalleServicio>
   <ResumenFactura><CodigoTipoMoneda><CodigoMoneda>CRC</CodigoMoneda><TipoCambio>1</TipoCambio></CodigoTipoMoneda>
    <TotalVenta>100.00</TotalVenta><TotalVentaNeta>100.00</TotalVentaNeta><TotalImpuesto>13.00</TotalImpuesto><TotalComprobante>113.00</TotalComprobante></ResumenFactura>
  </${tipo}>`;
}

test('API local: autenticación, perfiles, XML 4.4, deduplicación, aislamiento, cambio y borrado',async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cecr-qa-api-'));
  const db=abrirBaseDatos(path.join(dir,'integration.sqlite'));
  const fakeFX={vigente:async()=>({fecha:'2026-11-03',venta:455.5,compra:450,origen:'prueba'}),resolverUSD:async()=>{throw Error('No debe consultarse USD para CRC');}};
  const servidor=crearAPI(db,'token-sintetico',null,fakeFX).listen(0,'127.0.0.1');
  await new Promise(resolve=>servidor.once('listening',resolve));
  const base=`http://127.0.0.1:${servidor.address().port}`;
  const req=async(url,{auth=true,...ops}={})=>{
    const headers={...(auth?{Authorization:'Bearer token-sintetico'}:{}),...ops.headers};
    const resp=await fetch(base+url,{...ops,headers});
    const data=await resp.json();return {status:resp.status,data,headers:resp.headers};
  };
  const crear=nombre=>req('/api/perfiles',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({nombre})});
  const subir=(perfil,xml,nombre='sintetico.xml')=>{
    const form=new FormData();form.append('files',new Blob([xml],{type:'text/xml'}),nombre);
    return req(`/api/perfiles/${perfil}/importar`,{method:'POST',body:form});
  };
  try{
    await t.test('rechaza rutas sin token y no revela servidor',async()=>{
      for(const ruta of ['/api/perfiles','/api/estado','/api/tipo-cambio']) assert.equal((await req(ruta,{auth:false})).status,403);
      assert.equal((await req('/api/perfiles')).headers.get('x-powered-by'),null);
      assert.equal((await req('/api/no-existe')).status,404);
    });
    const a=(await crear('Empresa A')).data.perfil;
    const b=(await crear('Empresa B')).data.perfil;
    assert.ok(a.id>0 && b.id>0 && a.id!==b.id);
    await t.test('valida perfil, correo y nombre duplicado',async()=>{
      assert.equal((await crear('Empresa A')).status,400);
      const invalid=await req('/api/perfiles',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({nombre:'Otra',correo:'no-es-correo'})});
      assert.equal(invalid.status,400);
    });
    await t.test('importa XML 4.4, calcula total e identifica duplicados',async()=>{
      const primero=await subir(a.id,xmlCRC());
      assert.equal(primero.status,200);
      assert.deepEqual(primero.data.importacion,{nuevos:1,duplicados:0});
      const segundo=await subir(a.id,xmlCRC());
      assert.deepEqual(segundo.data.importacion,{nuevos:0,duplicados:1});
      const estado=await req(`/api/perfiles/${a.id}/estado`);
      assert.equal(estado.data.facturas.length,1);
      assert.equal(estado.data.totalNeto,113);
      assert.equal(estado.data.iva['13'],13);
    });
    await t.test('misma clave puede registrarse en otra empresa sin cruzar datos',async()=>{
      assert.equal((await subir(b.id,xmlCRC())).data.importacion.nuevos,1);
      assert.equal((await req(`/api/perfiles/${b.id}/estado`)).data.facturas.length,1);
      assert.equal((await req(`/api/perfiles/${a.id}/estado`)).data.facturas.length,1);
    });
    await t.test('rechaza contenido inválido y archivos con extensión no XML',async()=>{
      assert.equal((await subir(a.id,'<xml>no cerrado')).data.errores.length,1);
      assert.equal((await subir(a.id,xmlCRC(),'contenido.txt')).data.errores.length,1);
      assert.equal((await req('/api/perfiles/999999/estado')).status,400);
    });
    await t.test('nota de crédito resta y su borrado no afecta otro perfil',async()=>{
      const credito=xmlCRC('50600000000000000000000000000000000000000000000002','NotaCreditoElectronica');
      assert.equal((await subir(a.id,credito)).data.importacion.nuevos,1);
      const estado=(await req(`/api/perfiles/${a.id}/estado`)).data;
      assert.equal(estado.totalNeto,0);
      const idCredito=estado.facturas.find(f=>f.tipoDocumento==='Nota de crédito').id;
      // El API protege la pertenencia: un documento de A no se puede borrar desde B.
      // La ruta inválida responde 400 con {error}, NO {eliminado:false}.
      const ajeno=await req(`/api/perfiles/${b.id}/documentos/${idCredito}`,{method:'DELETE'});
      assert.equal(ajeno.status,400);
      assert.match(ajeno.data.error,/no est[aá] en la empresa/i);
      assert.equal((await req(`/api/perfiles/${a.id}/estado`)).data.totalNeto,0);
      assert.equal((await req(`/api/perfiles/${b.id}/estado`)).data.facturas.length,1);
      const correcto=await req(`/api/perfiles/${a.id}/documentos/${idCredito}`,{method:'DELETE'});
      assert.equal(correcto.status,200);
      assert.equal(correcto.data.eliminado,true);
      assert.equal((await req(`/api/perfiles/${a.id}/estado`)).data.totalNeto,113);
      assert.equal((await req(`/api/perfiles/${b.id}/estado`)).data.facturas.length,1);
    });
  } finally {
    await new Promise(resolve=>servidor.close(resolve));db.cerrar();fs.rmSync(dir,{recursive:true,force:true});
  }
});
