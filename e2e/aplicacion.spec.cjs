'use strict';
const {test,expect}=require('@playwright/test');

// Datos sintéticos en memoria; no hay SQLite real ni datos personales en el navegador.
test.beforeEach(async({page})=>{
 await page.addInitScript(()=>{
  const perfiles=[
    {id:1,nombre:'Empresa Ficticia Norte',cedula:'',color:'#2563EB',cantidad:1},
    {id:2,nombre:'Empresa Ficticia Sur',cedula:'',color:'#0F766E',cantidad:0}
  ];
  const factura={id:1,perfilId:1,clave:'50600000000000000000000000000000000000000000000001',consecutivo:'00100001010000000001',
   tipoDocumento:'Factura electrónica',versionXML:'4.4',fecha:'2026-11-02T10:00:00',
   total:113,monedaOriginal:'CRC',tipoCambioAplicado:1,totalOriginal:113,comercio:'Comercio ficticio',
   emisor:{nombre:'Comercio ficticio',identificacion:{numero:'3101111111'}},receptor:{nombre:'Cliente ficticio'},
   bases:{'13':100},impuestos:[{codigo:'01',tarifa:13,monto:13}],detalle:[]};
  const estado=id=>({perfil:perfiles.find(p=>p.id===id),facturas:id===1?[factura]:[],iva:{'13':id===1?13:0},base:{'13':id===1?100:0},totalNeto:id===1?113:0,documentos:{},errores:[]});
  window.comprobantesDesktop={
   listarPerfiles:async()=>({perfiles:[...perfiles]}),listar:async(id)=>estado(id),
   crearPerfil:async(p)=>{const perfil={...p,id:perfiles.length+1,cantidad:0};perfiles.push(perfil);return {perfil};},
   actualizarPerfil:async(id,p)=>{const perfil=perfiles.find(x=>x.id===id);Object.assign(perfil,p);return {perfil};},
   eliminarPerfil:async()=>({documentosAfectados:0,respaldo:'/mock/backup.sqlite'}),
   importar:async()=>({importacion:{nuevos:0,duplicados:0},errores:[],avisos:[]}),
   respaldar:async()=>({guardado:false}),estadoRespaldos:async()=>({habilitado:true,frecuencia:'diario',retener:14,carpeta:'/mock',copias:[]}),
   configurarRespaldos:async p=>({...p,carpeta:'/mock',copias:[]}),crearRespaldo:async()=>({nombre:'mock.sqlite'}),
   consultarTipoCambio:async()=>({disponible:false,advertencia:'Offline de prueba'}),
   recalcularUSD:async()=>({actualizados:0,respaldo:'/mock'}),repararIVA:async()=>({actualizados:0}),
   abrirCarpetaRespaldos:async()=>({}),seleccionarCarpetaRespaldos:async()=>({}),
   moverDocumento:async()=>({movido:false}),eliminar:async()=>({eliminado:false}),
   ultimoLote:async()=>({id:1,cantidad:1,deshecho_en:null,creado_en:'2026-11-05'}),
   previsualizar:async()=>({token:'vista-sintetica',filas:[{indice:0,archivo:'ejemplo.xml',estado:'listo',empresaSugerida:1,
     empresasCompatibles:[1],sinCedula:[1],existentes:[],tipo:'Factura electrónica',total:113,moneda:'CRC'}]}),
   confirmarImportacion:async()=>({loteId:2,nuevos:1,duplicados:0}),
   deshacerImportacion:async()=>({deshechos:1,respaldo:'/mock'}),
   gestionContable:async()=>({conciliaciones:[],resumen:{}}),
   mensajesHacienda:async()=>[],importarMensajes:async()=>({nuevos:0,duplicados:0,errores:[]}),
   auditoria:async()=>[],vigilanciaEstado:async()=>({habilitado:false,carpeta:'',pendientes:[]}),
   previsualizarPendientes:async()=>({token:'t',filas:[]}),
   validarRespaldo:async()=>({cancelado:true})
  };
 });
 await page.goto('/');
 await expect(page.getByRole('heading',{name:'Panel general'})).toBeVisible();
});

test('El panel muestra perfiles, métricas y filtro de período',async({page})=>{
 await expect(page.getByRole('button',{name:/Empresa activa: Empresa Ficticia Norte/})).toBeVisible();
 await expect(page.getByRole('region',{name:'Filtrar estadísticas del panel general por fecha'})).toBeVisible();
 await page.getByLabel('Seleccionar período del panel').selectOption('mes');
 await expect(page.getByLabel('Mes del panel general')).toBeVisible();
 await page.getByLabel('Mes del panel general').fill('2026-11');
 await expect(page.getByText(/1 comprobante en el período/)).toBeVisible();
});
test('Selector personalizado permite cambiar empresa sin mezclar comprobantes',async({page})=>{
 await page.getByRole('button',{name:/Empresa activa: Empresa Ficticia Norte/}).click();
 await expect(page.getByRole('menu',{name:'Cambiar empresa'})).toBeVisible();
 await page.getByRole('menuitemradio',{name:/Empresa Ficticia Sur/}).click();
 await expect(page.getByRole('button',{name:/Empresa activa: Empresa Ficticia Sur/})).toBeVisible();
 await expect(page.locator('.kpi-valor').first()).toHaveText('0');
});
test('Se abre el formulario de empresa y acepta un nombre nuevo',async({page})=>{
 await page.getByRole('button',{name:'Nueva empresa'}).first().click();
 const dlg=page.getByRole('dialog',{name:'Formulario de empresa'});
 await expect(dlg).toBeVisible();
 await dlg.getByPlaceholder('Ej. Comercial La Esperanza S.A.').fill('Empresa Ficticia Oeste');
 await dlg.getByRole('button',{name:'Crear empresa'}).click();
 await expect(dlg).toBeHidden();
 await expect(page.getByRole('button',{name:/Empresa activa: Empresa Ficticia Oeste/})).toBeVisible();
});

test('Importación inteligente muestra vista previa y exige confirmar destino',async({page})=>{
 await page.getByRole('button',{name:'Importación inteligente'}).click();
 await page.locator('input[type=file]').first().setInputFiles({name:'ejemplo.xml',mimeType:'application/xml',buffer:Buffer.from('<FacturaElectronica/>')});
 const modal=page.getByRole('dialog',{name:'Vista previa de importación XML'});
 await expect(modal).toBeVisible();
 await expect(modal.getByText('ejemplo.xml')).toBeVisible();
 await modal.getByRole('button',{name:/Confirmar 1 XML/}).click();
 await expect(modal).toBeHidden();
});
test('Centro contable y auditoría están disponibles en menú',async({page})=>{
 await page.getByRole('button',{name:'Compras y ventas'}).click();
 await expect(page.getByRole('heading',{name:'Compras, ventas y conciliación'})).toBeVisible();
 await page.getByRole('button',{name:'Bitácora'}).click();
 await expect(page.getByRole('heading',{name:'Bitácora de operaciones',level:1})).toBeVisible();
});

test('Importación masiva: asignar dos XML a una empresa con una sola acción',async({page})=>{
 await page.evaluate(()=>{
   window.comprobantesDesktop.previsualizar=async()=>({
     token:'lote-masivo-qa',filas:[
       {indice:0,archivo:'ficticio-a.xml',estado:'requiere_empresa',empresaSugerida:null,empresasCompatibles:[],sinCedula:[1,2],existentes:[],tipo:'Factura electrónica',total:113,moneda:'CRC'},
       {indice:1,archivo:'ficticio-b.xml',estado:'requiere_empresa',empresaSugerida:null,empresasCompatibles:[],sinCedula:[1,2],existentes:[],tipo:'Nota de crédito',total:-15,moneda:'CRC'},
     ]
   });
   window.comprobantesDesktop.confirmarImportacion=async(token,selecciones)=>{
     window.__qaImportacionMasiva={token,selecciones};
     return {loteId:5,nuevos:2,duplicados:0};
   };
 });
 await page.getByRole('button',{name:'Importación inteligente'}).click();
 await page.locator('input[type=file]').first().setInputFiles({name:'lote.xml',mimeType:'application/xml',buffer:Buffer.from('<FacturaElectronica/>')});
 const modal=page.getByRole('dialog',{name:'Vista previa de importación XML'});
 await expect(modal).toBeVisible();
 await expect(modal.getByText('2', {exact:true}).first()).toBeVisible();
 await modal.getByLabel('Empresa para asignación masiva').selectOption('2');
 await modal.getByRole('button',{name:/Asignar a 2 XML/}).click();
 await expect(modal.getByRole('status')).toContainText('2 XML asignados');
 await modal.getByRole('button',{name:'Confirmar 2 XML'}).click();
 await expect(modal).toBeHidden();
 const importacion=await page.evaluate(()=>window.__qaImportacionMasiva);
 expect(importacion.token).toBe('lote-masivo-qa');
 expect(importacion.selecciones).toEqual([{indice:0,perfilId:2},{indice:1,perfilId:2}]);
});

test('Vista previa muestra advertencia de base IVA multitarifa no atribuida sin guardar',async({page})=>{
 await page.evaluate(()=>{
  window.comprobantesDesktop.previsualizar=async()=>({
    token:'base-ambigua-sintetica',filas:[{indice:0,archivo:'fiscal-sintetico.xml',
      estado:'listo',empresaSugerida:1,empresasCompatibles:[1],existentes:[],
      clave:'QA-SINTETICA',tipo:'Factura electrónica',fecha:'2026-11-02',
      total:114,moneda:'CRC',baseIVAnoAtribuida:100,
      advertenciaFiscal:'Base imponible sin desglose por tarifa'}]
  });
 });
 await page.getByRole('button',{name:'Importación inteligente'}).click();
 await page.locator('input[type=file]').first().setInputFiles({name:'sintetico.xml',mimeType:'application/xml',buffer:Buffer.from('<FacturaElectronica/>')});
 const modal=page.getByRole('dialog',{name:'Vista previa de importación XML'});
 await expect(modal.getByRole('note')).toContainText('NO se duplica entre tarifas');
 await expect(modal.getByText('fiscal-sintetico.xml')).toBeVisible();
 await modal.getByRole('button',{name:'Cancelar'}).click();
 await expect(modal).toBeHidden();
});
