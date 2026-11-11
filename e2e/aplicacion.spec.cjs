'use strict';
const {test,expect}=require('@playwright/test');
const {version}=require('../package.json');

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
   bases:{'13':100},impuestos:[{codigo:'01',tarifa:13,monto:13}],resumen:{totalVenta:100,totalVentaNeta:100,totalGravado:100,totalImpuesto:13},detalle:[],gastoAdministrativo:false,montoGastoManual:null};
  // Los escenarios se preparan ANTES de montar React y de consultar la API.
  // Cambiar el mock tras montar la interfaz producía pruebas sensibles a carreras.
  const escenario=new URLSearchParams(window.location.search).get('qa-fixture');
  if(escenario==='xml-cero') Object.assign(factura,{
    total:0,totalOriginal:0,impuestos:[],
    resumen:{...factura.resumen,totalVenta:30003,totalDescuentos:30003,
      totalVentaNeta:0,totalGravado:0,totalImpuesto:0,totalNoSujeto:30003}
  });
  if(escenario==='cupon-cero') Object.assign(factura,{
    total:0,totalOriginal:0,impuestos:[],
    resumen:{...factura.resumen,totalVenta:10025,totalNoSujeto:10025,
      totalDescuentos:10025,totalVentaNeta:0,totalGravado:0,totalImpuesto:0,
      medioPago:[{tipo:'99',medio:'Cupón',total:10025}]}
  });
  window.__qaGastosGuardados=[];
  const estado=id=>({perfil:perfiles.find(p=>p.id===id),facturas:id===1?[factura]:[],
   comerciosGastos:id===1?[{clave:'cedula:3101111111',nombre:'Comercio ficticio',cedula:'3101111111',total:1,marcados:factura.gastoAdministrativo?1:0,pendientes:factura.gastoAdministrativo?0:1}]:[],iva:{'13':id===1?factura.resumen.totalImpuesto:0},base:{'13':id===1?factura.resumen.totalGravado:0},totalNeto:id===1?factura.total:0,documentos:{},errores:[]});
  window.comprobantesDesktop={
   listarPerfiles:async()=>({perfiles:[...perfiles]}),listar:async(id)=>estado(id),
   clasificarGastosComercio:async(perfilId,clave,habilitado,cantidadEsperada,confirmado)=>{
     if(perfilId!==1||clave!=='cedula:3101111111'||!confirmado||cantidadEsperada!==1) throw new Error('Operación masiva inválida');
     factura.gastoAdministrativo=habilitado;
     if(!habilitado) factura.montoGastoManual=null;
     window.__qaComercioClasificado={perfilId,clave,habilitado,cantidadEsperada};
     return {afectados:1,totalComercio:1,habilitado,respaldo:'/mock/copia.sqlite'};
   },
   marcarGastoAdministrativo:async(perfilId,docId,habilitado,montoManual)=>{
     if(perfilId!==1 || docId!==1) throw new Error('No pertenece a la empresa');
     window.__qaGastosGuardados.push({perfilId,docId,habilitado,montoManual});
     factura.gastoAdministrativo=habilitado;
     factura.montoGastoManual=habilitado?(montoManual??null):null;
     return {resultado:{documentoId:docId,gastoAdministrativo:habilitado,montoGastoManual:factura.montoGastoManual}};
   },
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


// Regresión: el contador visible de comprobantes no modifica el nombre accesible del botón.
test('Navegación: Comprobantes tiene nombre estable aunque muestre contador',async({page})=>{
 const navegacion=page.getByRole('navigation',{name:'Secciones'});
 const enlace=navegacion.getByRole('button',{name:'Comprobantes',exact:true});
 await expect(enlace).toBeVisible();
 await expect(enlace.locator('.nav-count')).toHaveText('1');
 await enlace.click();
 await expect(page.getByRole('heading',{name:'Comprobantes',level:1})).toBeVisible();
 await expect(enlace).toHaveAttribute('aria-current','page');
});

test('Gasto administrativo: checkbox, reporte y permanencia del IVA en el panel',async({page})=>{
 await page.getByRole('navigation',{name:'Secciones'}).getByRole('button',{name:'Comprobantes',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Comprobantes',level:1})).toBeVisible();
 const checkbox=page.getByRole('checkbox',{name:/Marcar como gasto administrativo/});
 await checkbox.check();
 await expect(checkbox).toBeChecked();
 await page.getByRole('navigation',{name:'Secciones'}).getByRole('button',{name:'Gastos administrativos',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Gastos administrativos',level:1})).toBeVisible();
 await expect(page.getByRole('heading',{name:'Reporte de gastos administrativos'})).toBeVisible();
 await expect(page.locator('.gastos-resumen')).toContainText('₡100,00');
 await expect(page.locator('.gastos-resumen')).toContainText('₡13,00');
 await page.getByRole('button',{name:'Panel general'}).click();
 await expect(page.locator('.iva-panel')).toContainText('₡13,00');
});

// Cargar un escenario nuevo hace que la API simulada y el estado de React
// coincidan desde el primer render. No alternar perfiles para forzar recargas.
async function abrirDetalleFixture(page,escenario) {
 await page.goto(`/?qa-fixture=${escenario}`);
 await expect(page.getByRole('heading',{name:'Panel general',level:1})).toBeVisible();
 const menu=page.getByRole('navigation',{name:'Secciones'});
 await menu.getByRole('button',{name:'Comprobantes',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Comprobantes',level:1})).toBeVisible();
 const fila=page.locator('tr.fila-interactiva').first();
 await expect(fila).toBeVisible();
 await fila.click();
 const detalle=page.getByRole('dialog',{name:'Detalle de comprobante'});
 await expect(detalle).toBeVisible();
 return detalle;
}

test('Total XML cero: importe manual solo afecta al reporte de gastos',async({page})=>{
 const dlg=await abrirDetalleFixture(page,'xml-cero');
 await expect(dlg.getByRole('note')).toContainText('Este XML declara total ₡0,00');
 await dlg.getByRole('checkbox',{name:/Guardar este comprobante como gasto administrativo/}).check();
 await expect(dlg.getByRole('checkbox',{name:/Guardar este comprobante como gasto administrativo/})).toBeChecked();
 await dlg.getByPlaceholder(/Ej\.: 30003/).fill('30003');
 await dlg.getByRole('button',{name:'Guardar monto'}).click();
 await expect(dlg.locator('.detail-gasto-admin')).toContainText(/₡30[.,\s]003,00/);
 const ultima=await page.evaluate(()=>window.__qaGastosGuardados.at(-1));
 expect(ultima).toMatchObject({perfilId:1,docId:1,habilitado:true,montoManual:30003});
 await expect(dlg.locator('.detail-total')).toContainText('₡0,00');
 await dlg.getByTitle('Cerrar').click();
 await page.getByRole('navigation',{name:'Secciones'}).getByRole('button',{name:'Gastos administrativos',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Gastos administrativos',level:1})).toBeVisible();
 await expect(page.locator('.gastos-resumen')).toContainText(/₡30[.,\s]003,00/);
});

test('Cupón sin IVA y total fiscal cero: referencia se registra solo con confirmación',async({page})=>{
 const dlg=await abrirDetalleFixture(page,'cupon-cero');
 await expect(dlg.locator('.detail-total')).toContainText('₡0,00');
 await expect(dlg.locator('.cupon-referencia')).toContainText(/₡10[.,\s]025,00/);
 expect(await page.evaluate(()=>window.__qaGastosGuardados.length)).toBe(0);
 await dlg.getByRole('checkbox',{name:/Guardar este comprobante como gasto administrativo/}).check();
 await expect(dlg.getByRole('checkbox',{name:/Guardar este comprobante como gasto administrativo/})).toBeChecked();
 await expect(dlg.locator('.detail-gasto-admin')).toContainText('₡0,00');
 const guardarReferencia=dlg.getByRole('button',{name:'Registrar referencia como gasto manual'});
 await expect(guardarReferencia).toBeVisible();
 await guardarReferencia.click();
 const confirmacion=page.getByRole('alertdialog',{name:'Registrar importe de referencia'});
 await expect(confirmacion).toBeVisible();
 await expect(confirmacion).toContainText('total ₡0,00');
 expect(await page.evaluate(()=>window.__qaGastosGuardados.at(-1)?.montoManual??null)).toBeNull();
 await confirmacion.getByRole('button',{name:'Registrar gasto manual'}).click();
 await expect.poll(async()=>page.evaluate(()=>window.__qaGastosGuardados.at(-1)?.montoManual)).toBe(10025);
 await expect(dlg.locator('.detail-gasto-admin')).toContainText(/₡10[.,\s]025,00/);
 await expect(dlg.locator('.detail-total')).toContainText('₡0,00');
 await dlg.getByTitle('Cerrar').click();
 await page.getByRole('navigation',{name:'Secciones'}).getByRole('button',{name:'Gastos administrativos',exact:true}).click();
 await expect(page.locator('.gastos-resumen')).toContainText(/₡10[.,\s]025,00/);
 await expect(page.locator('.gastos-resumen')).toContainText('₡0,00');
 await page.getByRole('navigation',{name:'Secciones'}).getByRole('button',{name:'Panel general',exact:true}).click();
 await expect(page.locator('.iva-panel')).toContainText('₡0,00');
});

// v1.4.8 - el comercio se marca por empresa y no modifica el IVA del panel.
test('Clasificación por comercio marca y desmarca todos sus comprobantes con confirmación',async({page})=>{
 const menu=page.getByRole('navigation',{name:'Secciones'});
 await menu.getByRole('button',{name:'Gastos administrativos'}).click();
 await expect(page.getByRole('heading',{name:'Clasificar gastos por comercio'})).toBeVisible();
 await page.getByRole('combobox',{name:'Comercio para gastos administrativos'}).selectOption('cedula:3101111111');
 await expect(page.locator('.gastos-comercios-panel').getByRole('status')).toContainText('Sin clasificar: 1');
 await page.getByRole('button',{name:'Agregar comercio a gastos'}).click();
 const confirmacion=page.getByRole('alertdialog',{name:'Clasificar gastos por comercio'});
 await expect(confirmacion).toBeVisible();
 await confirmacion.getByRole('button',{name:'Agregar a gastos'}).click();
 await expect(page.locator('.gastos-resumen')).toContainText('₡100,00');
 await expect(page.locator('.gastos-comercios-panel').getByRole('status')).toContainText('Ya clasificados: 1');
 await page.getByRole('button',{name:'Quitar comercio de gastos'}).click();
 await expect(confirmacion).toBeVisible();
 await confirmacion.getByRole('button',{name:'Quitar de gastos'}).click();
 await expect(page.locator('.gastos-resumen')).toContainText('0');
 await expect(page.locator('.gastos-comercios-panel').getByRole('status')).toContainText('Sin clasificar: 1');
 await menu.getByRole('button',{name:'Panel general'}).click();
 await expect(page.locator('.iva-panel')).toContainText('₡13,00');
});


test('Versión del menú coincide con package.json y no depende de una cadena fija',async({page})=>{
 await expect(page.locator('.app-version')).toHaveText(`ComprobantesElectronicosCR · v${version}`);
});

test('Los desplegables utilizan el menú personalizado, se pueden buscar y conservan el select HTML',async({page})=>{
 const periodo=page.getByLabel('Seleccionar período del panel');
 await periodo.click();
 const lista=page.getByRole('listbox',{name:'Seleccionar período del panel'});
 await expect(lista).toBeVisible();
 await lista.getByRole('option',{name:'Seleccionar mes'}).click();
 await expect(lista).toBeHidden();
 await expect(periodo).toHaveValue('mes');
 await expect(page.getByLabel('Mes del panel general')).toBeVisible();
 await periodo.selectOption('rango');
 await expect(periodo).toHaveValue('rango');
});

test('Confirmaciones propias permiten cancelar sin ejecutar operaciones',async({page})=>{
 await page.getByRole('navigation',{name:'Secciones'}).getByRole('button',{name:'Gastos administrativos'}).click();
 await page.getByRole('combobox',{name:'Comercio para gastos administrativos'}).selectOption('cedula:3101111111');
 await page.getByRole('button',{name:'Agregar comercio a gastos'}).click();
 const confirmacion=page.getByRole('alertdialog',{name:'Clasificar gastos por comercio'});
 await expect(confirmacion).toBeVisible();
 await confirmacion.getByRole('button',{name:'Cancelar'}).click();
 await expect(confirmacion).toBeHidden();
 expect(await page.evaluate(()=>window.__qaComercioClasificado??null)).toBeNull();
 await expect(page.locator('.gastos-comercios-panel').getByRole('status')).toContainText('Sin clasificar: 1');
});

// v1.4.10: La rueda del mouse debe desplazar las opciones, no cerrar el popup.
// Este escenario corre en los proyectos Chromium escritorio y móvil.
test('Scroll en el menú de tipos no cierra el desplegable',async({page})=>{
 const navegacion=page.getByRole('navigation',{name:'Secciones'});
 await navegacion.getByRole('button',{name:'Comprobantes',exact:true}).click();
 const campo=page.getByRole('combobox',{name:'Tipo de comprobante'});
 await campo.click();
 const lista=page.getByRole('listbox',{name:'Tipo de comprobante'});
 const opciones=lista.locator('.select-elegante-opciones');
 await expect(lista).toBeVisible();
 await expect.poll(async()=>opciones.evaluate(node=>node.scrollHeight-node.clientHeight)).toBeGreaterThan(0);
 await opciones.hover();
 await page.mouse.wheel(0,250);
 await expect.poll(async()=>opciones.evaluate(node=>node.scrollTop)).toBeGreaterThan(0);
 await expect(lista).toBeVisible();
 // Al mover una opción a la vista, sigue abierto y se puede seleccionar.
 await lista.getByRole('option',{name:'Nota de crédito'}).click();
 await expect(lista).toBeHidden();
 await expect(campo).toHaveValue('Nota de crédito');
 await campo.click();
 await expect(lista).toBeVisible();
 await page.keyboard.press('Escape');
 await expect(lista).toBeHidden();
});
