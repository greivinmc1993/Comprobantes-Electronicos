import React, {useEffect,useMemo,useRef,useState} from 'react';
import {Bar,Doughnut} from 'react-chartjs-2';
import 'chart.js/auto';
import Icon from './components/Icon';
import CentroGestion from './components/CentroGestion';
import VistaPrevia from './components/VistaPrevia';
import {
  TASAS,TIPOS,numero,crc,fechaCorta,resumenDatos,csvDocumentos,csvIVA,csvComercios,csvLineas,
  pdfResumen,pdfComercios,pdfIVA,pdfDetalle,excelDocumentos,excelIVA,excelComercios,excelLineas
} from './reportes';
import './App.css';
import {fechaLocal,obtenerRangoPanel,filtrarPorPeriodo,mismoMes,etiquetaRango} from './periodos.mjs';

const PERFIL_VACIO={nombre:'',cedula:'',correo:'',telefono:'',direccion:'',color:'#2563EB'};
const PALETA=['#2563EB','#0891B2','#0F766E','#7C3AED','#D97706','#DC5462'];
const NAVEGACION=[
  {id:'inicio',titulo:'Panel general',icono:'grid'},
  {id:'documentos',titulo:'Comprobantes',icono:'receipt'},
  {id:'importacion',titulo:'Importación inteligente',icono:'importar'},
  {id:'contabilidad',titulo:'Compras y ventas',icono:'wallet'},
  {id:'hacienda',titulo:'Mensajes Hacienda',icono:'shield'},
  {id:'auditoria',titulo:'Bitácora',icono:'file'},
  {id:'carpetas',titulo:'Carpetas vigiladas',icono:'folder'},
  {id:'papelera',titulo:'Papelera',icono:'trash'},
  {id:'reportes',titulo:'Reportes y exportaciones',icono:'report'},
  {id:'perfiles',titulo:'Empresas',icono:'building'},
  {id:'respaldos',titulo:'Respaldos automáticos',icono:'database'},
  {id:'divisas',titulo:'Tipo de cambio USD',icono:'trend'},
];
const TOTAL_PAGINA=20;

function rotuloTipo(tipo) {
  return tipo==='Nota de crédito'?'Nota de crédito':tipo==='Nota de débito'?'Nota de débito':tipo||'Documento';
}
function cssTipo(tipo) {
  return tipo==='Nota de crédito'?'etiqueta etiqueta-roja':tipo==='Nota de débito'?'etiqueta etiqueta-ambar':'etiqueta etiqueta-azul';
}
function porcentaje(valor,maximo) {return Math.max(3,Math.min(100,maximo ? Math.abs(valor)*100/maximo : 0));}
function Kpi({icono,etiqueta,valor,info,clase=''}) {
  return <article className={`kpi ${clase}`}>
    <div className="kpi-header"><span className="kpi-etiqueta">{etiqueta}</span><span className="kpi-icon"><Icon name={icono} size={20}/></span></div>
    <div className="kpi-valor" title={String(valor)}>{valor}</div>
    <div className="kpi-info">{info}</div>
  </article>;
}
function Vacio({icono='receipt',titulo,descripcion,accion}) {
  return <div className="empty-state">
    <div className="empty-icon"><Icon name={icono} size={28}/></div>
    <h3>{titulo}</h3><p>{descripcion}</p>
    {accion}
  </div>;
}
function Campo({titulo,children}) {return <label className="campo"><span>{titulo}</span>{children}</label>;}
function Boton({children,icono,clase='btn-primary',...props}) {
  return <button className={`btn ${clase}`} {...props}>{icono&&<Icon name={icono} size={17}/>}<span>{children}</span></button>;
}
function TablaComprobantes({docs,alSeleccionar,compacta=false,marcados=[],alMarcar,alMarcarPagina}) {
  if(!docs.length) return <Vacio titulo="No se encontraron comprobantes" descripcion="Prueba con otros filtros o importa documentos XML para esta empresa."/>;
  return <div className="table-scroll"><table className="data-table">
    <thead><tr>{alMarcar&&<th className="col-seleccion"><input type="checkbox" aria-label="Seleccionar comprobantes de esta página" checked={docs.length>0&&docs.every(f=>marcados.includes(f.id))} onChange={e=>alMarcarPagina(docs.map(f=>f.id),e.target.checked)}/></th>}<th>Documento</th><th>Emisor / Receptor</th><th>Fecha</th><th>Consecutivo</th><th className="numero-tabla">Total neto</th><th aria-label="Detalle"/></tr></thead>
    <tbody>{docs.map(f=><tr key={f.id} onClick={()=>alSeleccionar(f)} className="fila-interactiva" tabIndex={0} onKeyDown={e=>{if(e.key==='Enter'&&e.target===e.currentTarget) alSeleccionar(f);}}>
      {alMarcar&&<td className="col-seleccion" onClick={e=>e.stopPropagation()}><input type="checkbox" aria-label={`Seleccionar comprobante ${f.consecutivo||f.clave||f.id}`} checked={marcados.includes(f.id)} onChange={e=>alMarcar(f.id,e.target.checked)}/></td>}
      <td><span className={cssTipo(f.tipoDocumento)}>{rotuloTipo(f.tipoDocumento)}</span><small className="texto-secundario bloque">{f.versionXML?`XML ${f.versionXML}`:'XML'}</small></td>
      <td className="celda-negocio"><strong title={f.emisor?.nombre||f.comercio}>{f.emisor?.nombre||f.comercio||'Emisor no identificado'}</strong><small title={f.receptor?.nombre||''}>{f.receptor?.nombre||'Receptor no identificado'}</small></td>
      <td className="no-wrap">{fechaCorta(f.fecha)}</td>
      <td><code className="consecutivo" title={f.consecutivo||f.clave}>{f.consecutivo||'—'}</code></td>
      <td className={`numero-tabla importe ${numero(f.total)<0?'negativo':''}`}>{crc(f.total)}</td>
      <td><Icon name="arrow" size={17}/></td>
    </tr>)}</tbody>
  </table></div>;
}

/**
 * Selector de empresa propio: evita el menú nativo blanco de Windows y
 * conserva accesibilidad con teclado, foco visible y cierre al hacer clic fuera.
 */
function SelectorEmpresa({perfiles,perfil,perfilId,alCambiar,deshabilitado}) {
  const [abierto,setAbierto]=useState(false);
  const contenedor=useRef(null);
  const boton=useRef(null);
  const lista=useRef(null);

  useEffect(()=>{
    if(!abierto) return undefined;
    const fuera=e=>{
      if(contenedor.current && !contenedor.current.contains(e.target)) setAbierto(false);
    };
    const escapar=e=>{
      if(e.key==='Escape') {
        setAbierto(false);
        boton.current?.focus();
      }
    };
    document.addEventListener('pointerdown',fuera);
    document.addEventListener('keydown',escapar);
    return()=>{
      document.removeEventListener('pointerdown',fuera);
      document.removeEventListener('keydown',escapar);
    };
  },[abierto]);

  useEffect(()=>{
    if(!abierto) return;
    const seleccionado=lista.current?.querySelector('[aria-checked="true"]');
    (seleccionado || lista.current?.querySelector('[role="menuitemradio"]'))?.focus({preventScroll:true});
  },[abierto]);

  // Si otro flujo cambia el perfil, el desplegable nunca queda abierto.
  useEffect(()=>setAbierto(false),[perfilId,deshabilitado]);

  const elegir=id=>{
    setAbierto(false);
    if(id!==perfilId) alCambiar(id);
    boton.current?.focus();
  };

  const teclasLista=e=>{
    if(!['ArrowDown','ArrowUp','Home','End'].includes(e.key)) return;
    const opciones=[...(lista.current?.querySelectorAll('[role="menuitemradio"]')||[])];
    if(!opciones.length) return;
    e.preventDefault();
    const indice=opciones.indexOf(document.activeElement);
    let siguiente=0;
    if(e.key==='Home') siguiente=0;
    if(e.key==='End') siguiente=opciones.length-1;
    if(e.key==='ArrowDown') siguiente=(indice+1+opciones.length)%opciones.length;
    if(e.key==='ArrowUp') siguiente=(indice-1+opciones.length)%opciones.length;
    opciones[siguiente].focus();
  };

  return <div className={`perfil-switcher ${abierto?'is-open':''}`} ref={contenedor}>
    <button
      type="button" ref={boton} className="perfil-selector"
      disabled={deshabilitado || !perfiles.length}
      aria-label={`Empresa activa: ${perfil.nombre}. Cambiar empresa`}
      aria-haspopup="menu" aria-expanded={abierto} aria-controls={abierto?'menu-empresas':undefined}
      onClick={()=>setAbierto(v=>!v)}
      onKeyDown={e=>{
        if(e.key==='ArrowDown' || e.key==='ArrowUp') {
          e.preventDefault();setAbierto(true);
        }
      }}
    >
      <span className="avatar-empresa" style={{background:perfil.color||'#2563EB'}} aria-hidden="true">{perfil.nombre.slice(0,1).toUpperCase()}</span>
      <span className="perfil-seleccion-textos"><strong title={perfil.nombre}>{perfil.nombre}</strong><small>Seleccionar empresa</small></span>
      <Icon name="chevron" size={16} className="perfil-flecha"/>
    </button>
    {abierto&&<div id="menu-empresas" className="perfil-menu" role="menu" aria-label="Cambiar empresa" ref={lista} onKeyDown={teclasLista}>
      <div className="perfil-menu-titulo"><span>CAMBIAR DE EMPRESA</span><span>{perfiles.length} {perfiles.length===1?'perfil':'perfiles'}</span></div>
      <div className="perfil-menu-opciones">
        {perfiles.map(p=><button key={p.id} type="button" role="menuitemradio" aria-checked={p.id===perfilId}
          className={`perfil-menu-opcion ${p.id===perfilId?'seleccionada':''}`}
          onClick={()=>elegir(p.id)} title={p.nombre}>
          <span className="perfil-menu-avatar" style={{background:p.color||'#2563EB'}} aria-hidden="true">{p.nombre.slice(0,1).toUpperCase()}</span>
          <span className="perfil-menu-datos"><strong>{p.nombre}</strong><small>{p.cedula?`Cédula ${p.cedula}`:`${p.cantidad||0} comprobantes`}</small></span>
          {p.id===perfilId&&<span className="perfil-menu-marca" title="Empresa activa"><Icon name="check" size={15}/></span>}
        </button>)}
      </div>
      <div className="perfil-menu-pie">Selecciona el perfil para consultar sus comprobantes.</div>
    </div>}
  </div>;
}

export default function App() {
  const [seccion,setSeccion]=useState('inicio');
  const [perfiles,setPerfiles]=useState([]);
  const [perfilId,setPerfilId]=useState(null);
  const [datos,setDatos]=useState({facturas:[]});
  const [iniciando,setIniciando]=useState(true);
  const [cargando,setCargando]=useState(false);
  const [aviso,setAviso]=useState(null);
  const [seleccionado,setSeleccionado]=useState(null);
  const [marcados,setMarcados]=useState([]);
  const [marcadosPapelera,setMarcadosPapelera]=useState([]);
  const [papelera,setPapelera]=useState([]);
  const [destinoLote,setDestinoLote]=useState('');
  const [destinoPapelera,setDestinoPapelera]=useState('');
  const [operacionLote,setOperacionLote]=useState(null);
  const [confirmacionLote,setConfirmacionLote]=useState('');
  const [modalPerfil,setModalPerfil]=useState(null);
  const [empresaEliminar,setEmpresaEliminar]=useState(null);
  const [nombreEliminar,setNombreEliminar]=useState('');
  const [modoEliminar,setModoEliminar]=useState('eliminar');
  const [destinoEliminar,setDestinoEliminar]=useState('');
  const [aceptaEliminar,setAceptaEliminar]=useState(false);
  const [errorEliminar,setErrorEliminar]=useState('');
  const [estadoRespaldos,setEstadoRespaldos]=useState(null);
  const [configRespaldos,setConfigRespaldos]=useState({habilitado:true,frecuencia:'diario',retener:14});
  const [trabajandoRespaldo,setTrabajandoRespaldo]=useState(false);
  const [cotizacion,setCotizacion]=useState(null);
  const [cargandoCambio,setCargandoCambio]=useState(false);
  const [recalculando,setRecalculando]=useState(false);
  const [confirmarRecalculo,setConfirmarRecalculo]=useState('');
  const [confirmarIVA,setConfirmarIVA]=useState('');
  const [reparandoIVA,setReparandoIVA]=useState(false);
  const [avisosCambio,setAvisosCambio]=useState([]);
  const [errorPerfil,setErrorPerfil]=useState('');
  const [limiteLineas,setLimiteLineas]=useState(30);
  const [formPerfil,setFormPerfil]=useState(PERFIL_VACIO);
  const [destinoId,setDestinoId]=useState('');
  const [erroresImportacion,setErroresImportacion]=useState([]);
  const [vistaImportacion,setVistaImportacion]=useState(null);
  const [colaPendiente,setColaPendiente]=useState([]);
  const [respaldoParaRestaurar,setRespaldoParaRestaurar]=useState(null);
  const [confirmarRestauracion,setConfirmarRestauracion]=useState('');
  const [textoBuscar,setTextoBuscar]=useState('');
  const [filtroTipo,setFiltroTipo]=useState('TODOS');
  const [filtroComercio,setFiltroComercio]=useState('TODOS');
  const [filtroIVA,setFiltroIVA]=useState('TODOS');
  const [desde,setDesde]=useState('');
  const [hasta,setHasta]=useState('');
  const [pagina,setPagina]=useState(1);
  const [filtroPanel,setFiltroPanel]=useState(()=>({modo:'todos',mes:fechaLocal(new Date()).slice(0,7),desde:'',hasta:''}));
  const fileInput=useRef(null);
  const desktop=window.comprobantesDesktop;
  const perfil=perfiles.find(p=>p.id===perfilId)||{id:null,nombre:'Ninguna empresa seleccionada',color:'#64748B',cedula:''};

  const mensaje=(texto,tipo='ok')=>setAviso({texto,tipo});
  const recuperarPerfiles=async()=>{
    if(!desktop) return [];
    const resp=await desktop.listarPerfiles();
    setPerfiles(resp.perfiles||[]);
    return resp.perfiles||[];
  };
  const recargar=async(id=perfilId)=>{
    if (!Number.isSafeInteger(id) || id<=0) {const vacio={facturas:[]};setDatos(vacio);return vacio;}
    const resp=await desktop.listar(id);
    setDatos(resp);return resp;
  };

  const recargarPapelera=async()=>{
    if(!desktop) return [];
    const res=await desktop.listarPapelera();
    const items=res.documentos||[];
    setPapelera(items);
    setMarcadosPapelera(m=>m.filter(id=>items.some(d=>d.id===id)));
    return items;
  };
  useEffect(()=>{
    if(seccion==='papelera' && desktop) recargarPapelera().catch(err=>mensaje(err.message,'error'));
  },[seccion]);

  useEffect(()=>{
    let vivo=true;
    async function inicio() {
      if(!desktop) {setIniciando(false);mensaje('Abre el programa desde Electron (npm run dev o el instalador).','error');return;}
      try {
        const res=await desktop.listarPerfiles();
        if(!vivo) return;
        setPerfiles(res.perfiles||[]);
        const favorita=(res.perfiles||[])[0];
        setPerfilId(favorita?.id||null);
      } catch(err) {if(vivo) mensaje(err.message,'error');}
      finally {if(vivo) setIniciando(false);}
    }
    inicio();return()=>{vivo=false;};
  },[]);

  useEffect(()=>{
    let vivo=true;
    setDatos({facturas:[]});setSeleccionado(null);setPagina(1);
    setMarcados([]);setDestinoLote('');
    setTextoBuscar('');setFiltroTipo('TODOS');setFiltroComercio('TODOS');setFiltroIVA('TODOS');setDesde('');setHasta('');
    if(desktop && Number.isSafeInteger(perfilId) && perfilId>0) desktop.listar(perfilId).then(res=>{if(vivo) setDatos(res);}).catch(err=>{if(vivo) mensaje(err.message,'error');});
    return()=>{vivo=false;};
  },[perfilId]);

  const todos=datos.facturas||[];
  const filtrados=useMemo(()=>todos.filter(f=>{
    const consulta=textoBuscar.trim().toLocaleLowerCase('es');
    if(consulta && ![f.emisor?.nombre,f.receptor?.nombre,f.nombreArchivo,f.clave,f.consecutivo,f.tipoDocumento,f.comercio]
      .some(v=>String(v||'').toLocaleLowerCase('es').includes(consulta))) return false;
    if(filtroTipo!=='TODOS' && f.tipoDocumento!==filtroTipo) return false;
    if(filtroComercio!=='TODOS' && (f.emisor?.nombre||f.comercio||'')!==filtroComercio) return false;
    if(filtroIVA!=='TODOS' && !(numero(f.bases?.[filtroIVA]) || (f.impuestos||[]).some(i=>i.codigo==='01'&&String(i.tarifa)===filtroIVA))) return false;
    const fecha=String(f.fecha||'').slice(0,10);
    if(desde && (!fecha || fecha<desde)) return false;
    if(hasta && (!fecha || fecha>hasta)) return false;
    return true;
  }),[todos,textoBuscar,filtroTipo,filtroComercio,filtroIVA,desde,hasta]);
  // El período del Panel general se controla por separado de los filtros de Reportes.
  const rangoPanel=useMemo(()=>obtenerRangoPanel(filtroPanel),[filtroPanel]);
  const documentosPanel=useMemo(()=>filtrarPorPeriodo(todos,rangoPanel),[todos,rangoPanel]);
  const resumenPanel=useMemo(()=>resumenDatos(documentosPanel),[documentosPanel]);
  const resumenReportes=useMemo(()=>resumenDatos(filtrados),[filtrados]);
  const resumen=seccion==='inicio'?resumenPanel:resumenReportes;
  const docsVista=seccion==='inicio'?documentosPanel:filtrados;
  const totalPaginas=Math.max(1,Math.ceil(filtrados.length/TOTAL_PAGINA));
  const docsPagina=filtrados.slice((Math.min(pagina,totalPaginas)-1)*TOTAL_PAGINA,Math.min(pagina,totalPaginas)*TOTAL_PAGINA);
  const hayFiltros=Boolean(textoBuscar||desde||hasta||filtroTipo!=='TODOS'||filtroComercio!=='TODOS'||filtroIVA!=='TODOS');
  const comerciosDisponibles=[...new Set(todos.map(f=>f.emisor?.nombre||f.comercio).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es'));
  const limpiar=()=>{setTextoBuscar('');setFiltroTipo('TODOS');setFiltroComercio('TODOS');setFiltroIVA('TODOS');setDesde('');setHasta('');setPagina(1);};

  const prepararVista=async(files)=>{
    if(!files.length)return;
    setCargando(true);
    try{
      const lote=await Promise.all(files.slice(0,10).map(async f=>({nombre:f.name,bytes:new Uint8Array(await f.arrayBuffer())})));
      const resultado=await desktop.previsualizar(perfilId,lote);
      setVistaImportacion(resultado);
      setSeccion('importacion');
    }catch(error){mensaje(`Vista previa: ${error.message}`,'error');}
    finally{setCargando(false);}
  };
  const importar=async e=>{
    const files=[...(e.target.files||[])];e.target.value='';
    if(!files.length)return;
    if(!perfiles.length)return mensaje('Primero registra una empresa.','warn');
    setColaPendiente(files.slice(10));
    if(files.length>10)mensaje(`Se revisarán los primeros 10 XML. Quedan ${files.length-10} para el siguiente lote.`, 'warn');
    await prepararVista(files.slice(0,10));
  };
  const confirmarImportacionInteligente=async selecciones=>{
    if(!vistaImportacion||!desktop)return;
    setCargando(true);
    try{
      const r=await desktop.confirmarImportacion(vistaImportacion.token,selecciones);
      setVistaImportacion(null);
      await recargar();await recuperarPerfiles();
      mensaje(`Lote #${r.loteId}: ${r.nuevos} nuevo(s), ${r.duplicados} duplicado(s). Puedes deshacerlo en Importación inteligente.`);
      if(colaPendiente.length){
        const siguiente=colaPendiente.slice(0,10);
        setColaPendiente(v=>v.slice(10));
        // La siguiente vista previa exige su propia confirmación.
        await prepararVista(siguiente);
      }
    }catch(error){mensaje(`No se guardó el lote: ${error.message}`,'error');setVistaImportacion(null);}
    finally{setCargando(false);}
  };
  const elegirRespaldo=async()=>{
    try{const r=await desktop.validarRespaldo();if(!r?.cancelado){setRespaldoParaRestaurar(r);setConfirmarRestauracion('');}}
    catch(error){mensaje(`Respaldo inválido: ${error.message}`,'error');}
  };
  const restaurarCopia=async()=>{
    if(!respaldoParaRestaurar||confirmarRestauracion!=='RESTAURAR')return;
    setTrabajandoRespaldo(true);
    try{await desktop.restaurarRespaldo(respaldoParaRestaurar.token,confirmarRestauracion);
      mensaje('El programa se reiniciará con la base restaurada.');setRespaldoParaRestaurar(null);
    }catch(error){mensaje(`No se pudo restaurar: ${error.message}`,'error');}
    finally{setTrabajandoRespaldo(false);}
  };

  const cargarTipoCambio=async(forzar=false)=>{
    if (!desktop) return;
    setCargandoCambio(true);
    try { const r=await desktop.consultarTipoCambio(forzar);setCotizacion(r); }
    catch(error) {setCotizacion({disponible:false,advertencia:error.message});}
    finally {setCargandoCambio(false);}
  };
  useEffect(()=>{
    if(seccion==='divisas' && desktop) cargarTipoCambio();
  },[seccion]);
  const recalcularHistoricosUSD=async()=>{
    if(confirmarRecalculo!=='ACTUALIZAR') return;
    setRecalculando(true);
    try {
      const res=await desktop.recalcularUSD(confirmarRecalculo);
      await recargar();setConfirmarRecalculo('');
      mensaje(`${res.actualizados} comprobantes USD recalculados. Respaldo previo: ${res.respaldo}`);
    } catch(err) {mensaje(`No se modificó el historial: ${err.message}`,'error');}
    finally {setRecalculando(false);}
  };
  const repararHistorialIVA=async()=>{
    if (confirmarIVA!=='REPARAR IVA' || !desktop) return;
    setReparandoIVA(true);
    try {
      const resultado=await desktop.repararIVA(confirmarIVA);
      setConfirmarIVA('');
      await recargar();
      if(seccion==='respaldos') await cargarRespaldos();
      mensaje(`Revisión completada: ${resultado.actualizados} comprobante(s). ${resultado.respaldo?`Respaldo previo: ${resultado.respaldo}`:'No había comprobantes para revisar.'}`);
    } catch(error) {mensaje(`No se corrigió el historial: ${error.message}`,'error');}
    finally {setReparandoIVA(false);}
  };
  const respaldo=async()=>{
    try {const r=await desktop.respaldar();if(r?.guardado) {mensaje(`Respaldo guardado en ${r.ruta}`);if(seccion==='respaldos') await cargarRespaldos();}}
    catch(err){mensaje(err.message,'error');}
  };

  const cargarRespaldos=async()=>{
    if(!desktop) return;
    const info=await desktop.estadoRespaldos();
    setEstadoRespaldos(info);
    setConfigRespaldos({habilitado:info.habilitado,frecuencia:info.frecuencia,retener:info.retener});
    return info;
  };
  useEffect(()=>{
    if(seccion==='respaldos' && desktop) cargarRespaldos().catch(err=>mensaje(err.message,'error'));
  },[seccion]);
  const guardarConfigRespaldos=async()=>{
    setTrabajandoRespaldo(true);
    try {
      const info=await desktop.configurarRespaldos(configRespaldos);
      setEstadoRespaldos(info);
      mensaje('Configuración de respaldos guardada.');
    } catch(err){mensaje(err.message,'error');}
    finally{setTrabajandoRespaldo(false);}
  };
  const cambiarCarpetaRespaldos=async()=>{
    setTrabajandoRespaldo(true);
    try {await desktop.seleccionarCarpetaRespaldos();await cargarRespaldos();mensaje('Carpeta de respaldos actualizada.');}
    catch(err){mensaje(err.message,'error');}finally{setTrabajandoRespaldo(false);}
  };
  const crearRespaldoAhora=async()=>{
    setTrabajandoRespaldo(true);
    try {const r=await desktop.crearRespaldo();await cargarRespaldos();mensaje(`Copia SQLite verificada y guardada: ${r.nombre}`);}
    catch(err){mensaje(`No se pudo crear el respaldo: ${err.message}`,'error');}
    finally{setTrabajandoRespaldo(false);}
  };
  const abrirCarpetaRespaldos=async()=>{
    try{await desktop.abrirCarpetaRespaldos();}catch(err){mensaje(err.message,'error');}
  };
  const fechaRespaldo=valor=>valor?new Date(valor).toLocaleString('es-CR'):'Sin respaldos todavía';
  const tamanoRespaldo=bytes=>`${(Number(bytes||0)/1024).toLocaleString('es-CR',{maximumFractionDigits:1})} KB`;

  function abrirPerfil(p=null) {setErrorPerfil('');setFormPerfil(p?{
    nombre:p.nombre,cedula:p.cedula||'',correo:p.correo||'',telefono:p.telefono||'',direccion:p.direccion||'',color:p.color||'#2563EB'
  }:{...PERFIL_VACIO});setModalPerfil(p||'nuevo');}
  const guardarPerfil=async e=>{
    e.preventDefault();setCargando(true);
    try {
      const res=modalPerfil==='nuevo' ? await desktop.crearPerfil(formPerfil):await desktop.actualizarPerfil(modalPerfil.id,formPerfil);
      await recuperarPerfiles();
      setPerfilId(res.perfil.id);setModalPerfil(null);
      mensaje(modalPerfil==='nuevo'?'Empresa creada correctamente.':'Empresa actualizada correctamente.');
    } catch(err){setErrorPerfil(err.message);}
    finally{setCargando(false);}
  };
  const solicitarEliminarEmpresa=p=>{
    const otra=perfiles.find(x=>x.id!==p.id);
    setEmpresaEliminar(p);setNombreEliminar('');setModoEliminar(otra?'mover':'eliminar');
    setDestinoEliminar(otra?String(otra.id):'');setAceptaEliminar(false);setErrorEliminar('');
  };
  const borrarPerfil=async e=>{
    e.preventDefault();
    const p=empresaEliminar;
    if(!p||nombreEliminar!==p.nombre||!aceptaEliminar) return;
    setCargando(true);setErrorEliminar('');
    try {
      const res=await desktop.eliminarPerfil(p.id,{
        nombreConfirmacion:nombreEliminar,modo:modoEliminar,confirmado:true,
        destinoPerfilId:modoEliminar==='mover'?Number(destinoEliminar):null,
        documentosEsperados:p.cantidad||0
      });
      const lista=await recuperarPerfiles();
      if(perfilId===p.id || !lista.some(x=>x.id===perfilId)) setPerfilId(lista[0]?.id||null);
      else await recargar(perfilId);
      setEmpresaEliminar(null);
      mensaje(`Empresa eliminada. ${res.documentosAfectados} comprobante(s) ${modoEliminar==='mover'?'trasladados a otra empresa':'eliminados'}. Se creó un respaldo previo en ${res.respaldo}`);
    } catch(err){setErrorEliminar(err.message);}
    finally{setCargando(false);}
  };
  const borrarDocumento=async f=>{
    if(!window.confirm(`¿Enviar el comprobante ${f.consecutivo||f.clave||f.id} de «${perfil.nombre}» a la Papelera? Podrás restaurarlo después. Se generará un respaldo previo.`))return;
    setCargando(true);
    try {
      await desktop.enviarPapelera(perfilId,[f.id]);
      await recargar();await recuperarPerfiles();setMarcados(m=>m.filter(id=>id!==f.id));
      setSeleccionado(null);mensaje('Comprobante enviado a la Papelera. Puedes recuperarlo desde el menú lateral.');
    } catch(err){mensaje(`No se modificó el documento: ${err.message}`,'error');}
    finally{setCargando(false);}
  };
  const marcar=(id,checked)=>setMarcados(actual=>checked?[...new Set([...actual,id])]:actual.filter(x=>x!==id));
  const marcarPagina=(ids,checked)=>setMarcados(actual=>checked?[...new Set([...actual,...ids])]:actual.filter(id=>!ids.includes(id)));
  const abrirOperacionLote=tipo=>{
    const ids=marcados.filter(id=>todos.some(f=>f.id===id));
    if(!ids.length) return mensaje('Marca al menos un comprobante.','warn');
    if(tipo==='mover' && !Number(destinoLote)) return mensaje('Selecciona la empresa destino.','warn');
    setConfirmacionLote('');setOperacionLote({tipo,ids,perfilId,destinoId:Number(destinoLote)});
  };
  const ejecutarOperacionLote=async e=>{
    e.preventDefault();
    const op=operacionLote;
    if(!op||confirmacionLote!=='CONFIRMAR'||op.perfilId!==perfilId)return;
    setCargando(true);
    try {
      const resultado=op.tipo==='papelera'
        ?await desktop.enviarPapelera(op.perfilId,op.ids)
        :await desktop.moverLote(op.perfilId,op.ids,op.destinoId);
      await recargar();await recuperarPerfiles();
      setMarcados([]);setOperacionLote(null);setConfirmacionLote('');
      mensaje(`${op.ids.length} comprobantes ${op.tipo==='papelera'?'enviados a la Papelera':'trasladados correctamente'}. Respaldo previo: ${resultado.respaldo}`);
    } catch(err){mensaje(`Operación cancelada sin cambios: ${err.message}`,'error');}
    finally{setCargando(false);}
  };
  const restaurarSeleccionados=async()=>{
    const ids=marcadosPapelera.filter(id=>papelera.some(x=>x.id===id));
    const destino=Number(destinoPapelera);
    if(!ids.length || !destino) return mensaje('Selecciona documentos de la Papelera y una empresa destino.','warn');
    if(!window.confirm(`¿Restaurar ${ids.length} comprobante(s) en «${perfiles.find(p=>p.id===destino)?.nombre}»? Se verificará la cédula y que no haya duplicados. Se creará respaldo.`))return;
    setCargando(true);
    try {
      const res=await desktop.restaurarPapelera(ids,destino);
      setMarcadosPapelera([]);await recargarPapelera();await recargar();await recuperarPerfiles();
      mensaje(`${res.restaurados} comprobante(s) restaurados en la empresa seleccionada.`);
    } catch(err){mensaje(`No se restauró ningún comprobante: ${err.message}`,'error');}
    finally{setCargando(false);}
  };
  const moverDocumento=async()=>{
    const dest=Number(destinoId);
    if(!dest || !seleccionado)return;
    if(!window.confirm(`¿Mover este comprobante desde «${perfil.nombre}» hacia «${perfiles.find(p=>p.id===dest)?.nombre}»?`))return;
    setCargando(true);
    try{await desktop.moverDocumento(perfilId,seleccionado.id,dest);await recargar();await recuperarPerfiles();setSeleccionado(null);setDestinoId('');mensaje('Comprobante movido a la empresa seleccionada.');}
    catch(err){mensaje(err.message,'error');}finally{setCargando(false);}
  };
  const ejecutarReporte=fn=>{
    if(!filtrados.length) return mensaje('No hay comprobantes para exportar con los filtros actuales.','warn');
    try{fn(perfil,filtrados);mensaje(`Reporte generado para «${perfil.nombre}» (${filtrados.length} documentos).`);}
    catch(err){mensaje(`No se pudo exportar: ${err.message}`,'error');}
  };
  const abrirDetalle=f=>{setSeleccionado(f);setDestinoId('');setLimiteLineas(30);};
  const abrirDesdePanel=destino=>{
    if(!rangoPanel.valido) return mensaje('Corrige el rango de fechas del panel general antes de continuar.','warn');
    setTextoBuscar('');setFiltroTipo('TODOS');setFiltroComercio('TODOS');setFiltroIVA('TODOS');
    setDesde(rangoPanel.desde);setHasta(rangoPanel.hasta);setPagina(1);
    setSeccion(destino);
  };
  const graficoDiario=mismoMes(rangoPanel);
  const balanceMensual=useMemo(()=>{
    const agrupados=new Map();
    for(const f of documentosPanel) {
      const fecha=String(f.fecha||'').slice(0,10);
      const clave=graficoDiario?fecha:fecha.slice(0,7);
      if(!(/\d{4}-\d{2}-\d{2}/.test(clave)&&graficoDiario || /^\d{4}-\d{2}$/.test(clave)&&!graficoDiario)) continue;
      agrupados.set(clave,(agrupados.get(clave)||0)+numero(f.total));
    }
    const claves=[...agrupados.keys()].sort().slice(graficoDiario?-31:-12);
    return {labels:claves.map(k=>graficoDiario?k.slice(8,10):`${k.slice(5,7)}/${k.slice(2,4)}`),datasets:[{label:'Total neto CRC',data:claves.map(k=>agrupados.get(k)),backgroundColor:'#3C75EF',borderRadius:6,maxBarThickness:graficoDiario?24:48}]};
  },[documentosPanel,graficoDiario]);
  const tiposVisibles=Object.entries(resumen.tipos).filter(([,n])=>n>0);
  const graficoTipos={labels:tiposVisibles.map(([t])=>t),datasets:[{data:tiposVisibles.map(([,n])=>n),backgroundColor:['#3877F3','#15A5AB','#F5AB55','#8B73E7','#E86A79','#8AABD3','#2B8C66'],borderWidth:0,hoverOffset:6}]};
  const chartOpts={responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>crc(c.parsed?.y??c.parsed)}}},scales:{y:{ticks:{callback:v=>`₡${Number(v).toLocaleString('es-CR')}`},grid:{color:'#edf1f7'},border:{display:false}},x:{grid:{display:false},border:{display:false}}}};

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><img src="/app-icon.png" alt="Ícono de ComprobantesElectronicosCR" width="43" height="43"/></div><div className="brand-text"><strong>Comprobantes<span>CR</span></strong><small>GESTOR ELECTRÓNICO</small></div></div>
      <div className="selector-empresa"><div className="sidebar-subtitulo">EMPRESA ACTIVA</div><SelectorEmpresa perfiles={perfiles} perfil={perfil} perfilId={perfilId} alCambiar={setPerfilId} deshabilitado={cargando}/><button className="sidebar-link" onClick={()=>abrirPerfil()}><Icon name="plus" size={15}/> Nueva empresa</button></div>
      <div className="sidebar-subtitulo nav-titulo">ESPACIO DE TRABAJO</div>
      <nav className="nav-list" aria-label="Secciones">
        {NAVEGACION.map(n=><button key={n.id} className={`nav-item ${seccion===n.id?'nav-activo':''}`} onClick={()=>setSeccion(n.id)}><Icon name={n.icono} size={19}/><span>{n.titulo}</span>{n.id==='documentos'&&<span className="nav-count">{todos.length}</span>}</button>)}
      </nav>
      <div className="sidebar-bottom"><div className="sidebar-card"><Icon name="shield" size={21}/><strong>Tus datos, en tu equipo</strong><p>Historial guardado en SQLite. No se envía a la nube.</p></div><button className="sidebar-backup" onClick={respaldo} disabled={cargando}><Icon name="database" size={18}/> Respaldar base SQLite</button><span className="app-version">ComprobantesElectronicosCR · v1.4.0</span></div>
    </aside>

    <div className="workspace">
      <header className="topbar"><div className="migas"><span>ComprobantesElectronicosCR</span><Icon name="chevron" size={13}/><strong>{NAVEGACION.find(n=>n.id===seccion)?.titulo}</strong></div><div className="topbar-right"><span className="local-status"><i/> Base de datos local</span><div className="top-avatar" style={{background:perfil.color}}>{perfil.nombre.slice(0,1).toUpperCase()}</div></div></header>
      <main className="main-content">
        <div className="page-top"><div><div className="eyebrow">GESTIÓN DE COMPROBANTES · COSTA RICA</div><h1>{seccion==='inicio'?'Panel general':seccion==='documentos'?'Comprobantes':seccion==='papelera'?'Papelera de comprobantes':seccion==='importacion'?'Importación inteligente':seccion==='contabilidad'?'Centro contable':seccion==='hacienda'?'Mensajes de Hacienda':seccion==='auditoria'?'Bitácora de operaciones':seccion==='carpetas'?'Carpetas vigiladas':seccion==='reportes'?'Centro de reportes':seccion==='respaldos'?'Copias de seguridad':seccion==='divisas'?'Tipo de cambio USD':'Perfiles de empresas'}</h1><p>{seccion==='inicio'?'Una vista clara de la facturación y los impuestos de tu empresa.':seccion==='documentos'?'Consulta, filtra y organiza tus archivos electrónicos XML 4.4.':seccion==='papelera'?'Recupera importaciones retiradas del historial, sin alterar las otras empresas.':['importacion','contabilidad','hacienda','auditoria','carpetas'].includes(seccion)?'Herramientas de revisión, trazabilidad y control de comprobantes.':seccion==='reportes'?'Exportaciones con filtros, desglose de IVA y datos en colones.':seccion==='respaldos'?'Protege el historial SQLite de todas tus empresas con copias locales.':seccion==='divisas'?'Referencia oficial BCCR publicada por Hacienda; importes históricos guardados por fecha.':'Administra los documentos de cada empresa por separado.'}</p></div><div className="page-actions">{seccion==='perfiles'?<Boton icono="plus" onClick={()=>abrirPerfil()}>Nueva empresa</Boton>:seccion==='papelera'?<Boton icono="refresh" clase="btn-light" onClick={()=>recargarPapelera()} disabled={cargando}>Actualizar papelera</Boton>:seccion==='respaldos'?<Boton icono="database" onClick={crearRespaldoAhora} disabled={trabajandoRespaldo}>{trabajandoRespaldo?'Creando copia...':'Crear respaldo ahora'}</Boton>:<><Boton clase="btn-light" icono="exportar" title="Ir a los reportes para exportar archivos" onClick={()=>seccion==='inicio'?abrirDesdePanel('reportes'):setSeccion('reportes')}>Exportar</Boton><Boton icono="importar" title="Importar comprobantes XML a la empresa activa" onClick={()=>fileInput.current?.click()} disabled={cargando||!perfilId}>{cargando?'Procesando...':'Importar XML'}</Boton></>}</div></div>
        {avisosCambio.length>0&&<div className="alerta aviso-warn" role="status"><Icon name="alert" size={18}/><span>{avisosCambio.length} observación(es) de importación (tipo de cambio o redondeos fiscales). <details><summary>Ver detalles</summary><ul>{avisosCambio.map((aviso,i)=><li key={i}><strong>{aviso.archivo}</strong>: {aviso.mensaje}</li>)}</ul></details><button className="text-button" onClick={()=>setAvisosCambio([])}>Cerrar</button></span></div>}
        <input ref={fileInput} type="file" multiple accept=".xml,application/xml,text/xml" className="oculto" onChange={importar}/>
        {aviso&&<div className={`alerta aviso-${aviso.tipo||'ok'}`} role="status"><Icon name={aviso.tipo==='error'?'alert':'check'} size={18}/><span>{aviso.texto}</span><button title="Cerrar aviso" onClick={()=>setAviso(null)}><Icon name="close" size={16}/></button></div>}
        {erroresImportacion.length>0&&<details className="errores-xml"><summary>{erroresImportacion.length} archivo(s) no importados — ver detalles</summary><ul>{erroresImportacion.map((err,i)=><li key={i}><strong>{err.archivo}</strong>: {err.mensaje}</li>)}</ul></details>}
        {iniciando&&<p className="cargando-texto">Cargando perfiles y base SQLite…</p>}
        {!iniciando&&!perfiles.length&&<section className="surface-card" style={{padding:24,marginBottom:20}}>
          <Vacio icono="building" titulo="Todavía no tienes empresas" descripcion="Crea una empresa para importar, organizar y consultar sus comprobantes electrónicos."
            accion={<Boton icono="plus" onClick={()=>abrirPerfil()}>Crear primera empresa</Boton>}/>
        </section>}

        {seccion!=='perfiles'&&seccion!=='respaldos'&&seccion!=='papelera'&&<section className="active-company"><span className="company-dot" style={{background:perfil.color}}/><div><strong>{perfil.nombre}</strong><span>{perfil.cedula?`Cédula ${perfil.cedula}`:'Perfil local · Identificación opcional'}</span></div><span className="chip-neutro"><Icon name="database" size={14}/> {todos.length} comprobantes guardados</span></section>}

        {seccion==='inicio'&&<>
          <section className="surface-card periodo-panel" aria-label="Filtrar estadísticas del panel general por fecha">
            <div className="periodo-heading">
              <span className="periodo-icono"><Icon name="calendar" size={20}/></span>
              <div><h2>Período del panel</h2><p>Estadísticas y gráficos según la fecha de emisión de cada comprobante</p></div>
            </div>
            <div className="periodo-controles">
              <label className="periodo-control"><span>Mostrar información de</span>
                <select aria-label="Seleccionar período del panel" value={filtroPanel.modo}
                  onChange={e=>setFiltroPanel(f=>({...f,modo:e.target.value}))}>
                  <option value="todos">Todo el historial</option>
                  <option value="actual">Este mes</option>
                  <option value="anterior">Mes anterior</option>
                  <option value="tres">Últimos 3 meses</option>
                  <option value="anio">Este año</option>
                  <option value="mes">Seleccionar mes</option>
                  <option value="rango">Rango personalizado</option>
                </select>
              </label>
              {filtroPanel.modo==='mes'&&<label className="periodo-control"><span>Mes y año</span>
                <input aria-label="Mes del panel general" type="month" value={filtroPanel.mes} onChange={e=>setFiltroPanel(f=>({...f,mes:e.target.value}))}/>
              </label>}
              {filtroPanel.modo==='rango'&&<>
                <label className="periodo-control"><span>Desde</span>
                  <input aria-label="Fecha inicial del panel" type="date" value={filtroPanel.desde} max={filtroPanel.hasta||undefined} onChange={e=>setFiltroPanel(f=>({...f,desde:e.target.value}))}/>
                </label>
                <label className="periodo-control"><span>Hasta</span>
                  <input aria-label="Fecha final del panel" type="date" value={filtroPanel.hasta} min={filtroPanel.desde||undefined} onChange={e=>setFiltroPanel(f=>({...f,hasta:e.target.value}))}/>
                </label>
              </>}
              {filtroPanel.modo!=='todos'&&<button className="periodo-reset" onClick={()=>setFiltroPanel(f=>({...f,modo:'todos'}))} type="button"><Icon name="refresh" size={15}/> Mostrar todo</button>}
            </div>
            <div className={`periodo-resultado ${rangoPanel.valido?'':'periodo-error'}`} role="status">
              <Icon name={rangoPanel.valido?'check':'alert'} size={15}/>
              <span>{etiquetaRango(rangoPanel)}</span>
              {rangoPanel.valido&&<strong>{documentosPanel.length} comprobante{documentosPanel.length===1?'':'s'} en el período</strong>}
              {!rangoPanel.valido&&<strong>Selecciona fechas válidas; la inicial no puede ser posterior a la final.</strong>}
            </div>
          </section>
          <div className="kpis">
            <Kpi icono="receipt" etiqueta="Comprobantes" valor={resumen.cantidad.toLocaleString('es-CR')} info="Documentos del período seleccionado"/>
            <Kpi icono="wallet" etiqueta="Total neto" valor={crc(resumen.total)} info="Incluye notas de crédito" clase="kpi-azul"/>
            <Kpi icono="grid" etiqueta="Base imponible" valor={crc(resumen.base)} info="Base por tarifas de IVA"/>
            <Kpi icono="tax" etiqueta="IVA neto" valor={crc(resumen.totalIVA)} info="Impuestos según XML"/>
          </div>
          <div className="dashboard-grid">
            <section className="surface-card chart-panel"><div className="section-head"><div><h2>{graficoDiario?'Movimiento diario':'Movimiento mensual'}</h2><p>Total neto según fecha de emisión y período seleccionado</p></div><span className="chip-neutro">CRC</span></div><div className="chart-area">{balanceMensual.labels.length?<Bar data={balanceMensual} options={chartOpts}/>:<Vacio icono="report" titulo="Sin actividad" descripcion="No hay actividad en el período seleccionado."/>}</div></section>
            <section className="surface-card tipos-panel"><div className="section-head"><div><h2>Tipos de documento</h2><p>Distribución de comprobantes</p></div></div><div className="types-wrap">{tiposVisibles.length?<><div className="donut-wrap"><Doughnut data={graficoTipos} options={{cutout:'70%',plugins:{legend:{display:false}}}}/><div className="donut-center"><strong>{resumen.cantidad}</strong><small>Total</small></div></div><div className="types-legend">{tiposVisibles.map(([tipo,n],i)=><div key={tipo}><i style={{background:graficoTipos.datasets[0].backgroundColor[i%7]}}/><span>{tipo}</span><strong>{n}</strong></div>)}</div></>:<Vacio icono="receipt" titulo="Sin documentos" descripcion="Importa XML para ver el desglose."/>}</div></section>
          </div>
          <div className="dashboard-grid dashboard-bottom">
            <section className="surface-card recent-panel"><div className="section-head"><div><h2>Comprobantes recientes</h2><p>Últimos movimientos dentro del período</p></div><button className="text-button" onClick={()=>abrirDesdePanel('documentos')}>Ver todos <Icon name="arrow" size={16}/></button></div><TablaComprobantes compacta docs={[...documentosPanel].sort((a,b)=>String(b.fecha||'').localeCompare(String(a.fecha||''))).slice(0,6)} alSeleccionar={abrirDetalle}/></section>
            <section className="surface-card iva-panel"><div className="section-head"><div><h2>IVA por tarifa</h2><p>Base e impuesto en colones</p></div></div>{TASAS.map(t=><div className="iva-line" key={t}><div className="iva-label"><span>{t}%</span><strong>{crc(resumen.iva[t])}</strong></div><div className="iva-track"><i style={{width:`${porcentaje(resumen.iva[t],Math.max(1,...Object.values(resumen.iva).map(v=>Math.abs(v))))}%`}}/></div></div>)}<button className="text-button" onClick={()=>abrirDesdePanel('reportes')}>Consultar reporte IVA <Icon name="arrow" size={16}/></button></section>
          </div>
        </>}

        {(seccion==='documentos'||seccion==='reportes')&&<section className="surface-card filtro-panel"><div className="filtros-header"><strong><Icon name="filter" size={18}/> Filtros de información</strong><button className="text-button" disabled={!hayFiltros} onClick={limpiar}>Limpiar filtros <Icon name="close" size={15}/></button></div><div className="filtros-grid">
          <Campo titulo="Buscar comprobantes"><div className="input-icon"><Icon name="search" size={17}/><input placeholder="Clave, comercio, nombre..." value={textoBuscar} onChange={e=>{setTextoBuscar(e.target.value);setPagina(1);}}/></div></Campo>
          <Campo titulo="Tipo de comprobante"><select value={filtroTipo} onChange={e=>{setFiltroTipo(e.target.value);setPagina(1);}}><option value="TODOS">Todos los tipos</option>{TIPOS.map(t=><option key={t}>{t}</option>)}</select></Campo>
          <Campo titulo="Comercio emisor"><select value={filtroComercio} onChange={e=>{setFiltroComercio(e.target.value);setPagina(1);}}><option value="TODOS">Todos los comercios</option>{comerciosDisponibles.map(t=><option key={t} value={t}>{t}</option>)}</select></Campo>
          <Campo titulo="Tarifa de IVA"><select value={filtroIVA} onChange={e=>{setFiltroIVA(e.target.value);setPagina(1);}}><option value="TODOS">Todas las tarifas</option>{TASAS.map(t=><option key={t} value={t}>{t}%</option>)}</select></Campo>
          <Campo titulo="Desde"><input type="date" value={desde} max={hasta||undefined} onChange={e=>{setDesde(e.target.value);setPagina(1);}}/></Campo>
          <Campo titulo="Hasta"><input type="date" value={hasta} min={desde||undefined} onChange={e=>{setHasta(e.target.value);setPagina(1);}}/></Campo>
        </div><div className="filtros-summary"><Icon name="info" size={14}/> {filtrados.length} comprobante(s) coinciden con los filtros. Las exportaciones respetan esta selección.</div></section>}

        {seccion==='documentos'&&<section className="surface-card documentos-panel"><div className="section-head"><div><h2>Listado de comprobantes <span className="numero-gris">({filtrados.length})</span></h2><p>Haz clic en una fila para abrir el detalle completo.</p></div><div className="actions-inline"><Boton icono="download" clase="btn-light" disabled={!filtrados.length} onClick={()=>ejecutarReporte(csvDocumentos)}>CSV</Boton><Boton icono="download" clase="btn-light" disabled={!filtrados.length} onClick={()=>ejecutarReporte(excelDocumentos)}>Excel</Boton><Boton icono="download" clase="btn-light" disabled={!filtrados.length} onClick={()=>ejecutarReporte(pdfResumen)}>PDF resumen</Boton></div></div><div className="seleccion-lote" role="group" aria-label="Acciones para comprobantes seleccionados">
          <div className="seleccion-info"><Icon name="check" size={17}/><strong>{marcados.length} seleccionados</strong><span>Marca las facturas equivocadas; también puedes buscar y filtrar antes de seleccionarlas.</span></div>
          <div className="seleccion-acciones">
            <Boton clase="btn-light" disabled={!marcados.length||cargando} onClick={()=>setMarcados([])}>Limpiar selección</Boton>
            <select aria-label="Empresa destino para trasladar selección" value={destinoLote} onChange={e=>setDestinoLote(e.target.value)}>
              <option value="">Empresa destino...</option>{perfiles.filter(p=>p.id!==perfilId).map(p=><option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
            <Boton icono="transfer" clase="btn-light" disabled={!marcados.length||!destinoLote||cargando} onClick={()=>abrirOperacionLote('mover')}>Mover seleccionados</Boton>
            <Boton icono="trash" clase="btn-danger-light" disabled={!marcados.length||cargando} onClick={()=>abrirOperacionLote('papelera')}>Enviar a Papelera</Boton>
          </div>
        </div>
        <TablaComprobantes docs={docsPagina} alSeleccionar={abrirDetalle} marcados={marcados} alMarcar={marcar} alMarcarPagina={marcarPagina}/>{filtrados.length>TOTAL_PAGINA&&<div className="paginador"><span>Mostrando {(pagina-1)*TOTAL_PAGINA+1}–{Math.min(pagina*TOTAL_PAGINA,filtrados.length)} de {filtrados.length}</span><div><button disabled={pagina===1} onClick={()=>setPagina(p=>p-1)}>Anterior</button><strong>{pagina} / {totalPaginas}</strong><button disabled={pagina===totalPaginas} onClick={()=>setPagina(p=>p+1)}>Siguiente</button></div></div>}</section>}

        {seccion==='papelera'&&<section className="surface-card papelera-panel">
          <div className="section-head"><div><h2>Comprobantes en Papelera <span className="numero-gris">({papelera.length})</span></h2><p>Los documentos de esta lista no se incluyen en los informes ni gráficos. Conservan su XML y se pueden restaurar.</p></div></div>
          <div className="info-note"><Icon name="shield" size={18}/><span>Restaurar verifica los comprobantes repetidos y la identificación de la empresa de destino. Si alguno falla, no se restaura ninguno del lote.</span></div>
          {papelera.length===0?<Vacio icono="trash" titulo="Papelera vacía" descripcion="Cuando quites comprobantes importados por error, aparecerán aquí hasta que los restaures."/>:<>
            <div className="seleccion-lote">
              <label className="papelera-marcar"><input type="checkbox" aria-label="Seleccionar toda la Papelera" checked={marcadosPapelera.length===papelera.length} onChange={e=>setMarcadosPapelera(e.target.checked?papelera.map(x=>x.id):[])}/> Seleccionar todos ({papelera.length})</label>
              <div className="seleccion-acciones"><strong>{marcadosPapelera.length} marcados</strong>
                <select aria-label="Empresa para restaurar los comprobantes" value={destinoPapelera} onChange={e=>setDestinoPapelera(e.target.value)}><option value="">Restaurar en empresa...</option>{perfiles.map(x=><option key={x.id} value={x.id}>{x.nombre}</option>)}</select>
                <Boton icono="refresh" disabled={!marcadosPapelera.length||!destinoPapelera||cargando} onClick={restaurarSeleccionados}>Restaurar seleccionados</Boton>
              </div>
            </div>
            <div className="table-scroll"><table className="data-table"><thead><tr><th className="col-seleccion" aria-label="Marcar"/><th>Comprobante</th><th>Empresa anterior</th><th>Eliminado</th><th>Total</th></tr></thead><tbody>
              {papelera.map(d=><tr key={d.id}><td className="col-seleccion"><input type="checkbox" aria-label={`Seleccionar documento de la Papelera ${d.consecutivo||d.clave||d.id}`} checked={marcadosPapelera.includes(d.id)} onChange={e=>setMarcadosPapelera(actual=>e.target.checked?[...new Set([...actual,d.id])]:actual.filter(id=>id!==d.id))}/></td>
                <td><strong>{d.nombreArchivo}</strong><small className="texto-secundario bloque">{d.tipoDocumento} · {d.consecutivo||d.clave||'Sin consecutivo'}</small></td>
                <td>{d.perfilOriginalNombre}</td><td>{new Date(d.eliminadoEn).toLocaleString('es-CR')}</td><td className="numero-tabla importe">{crc(d.total)}</td></tr>)}
            </tbody></table></div>
          </>}
        </section>}

        {['importacion','contabilidad','hacienda','auditoria','carpetas'].includes(seccion)&&
          <CentroGestion key={`${seccion}-${perfilId}`} tipo={seccion} desktop={desktop} perfil={perfil}
            perfiles={perfiles} documentos={todos} abrirArchivos={()=>fileInput.current?.click()}
            onVista={async vista=>{setVistaImportacion(vista);setSeccion('importacion');}}
            mostrar={mensaje} actualizar={async()=>{await recargar();await recuperarPerfiles();}}/>}

        {seccion==='reportes'&&<>
          <div className="reports-intro"><div><span className="eyebrow">EXPORTACIONES PROFESIONALES</span><h2>Informes listos para usar</h2><p>Generados con los filtros actuales, separados por empresa y con importes normalizados a CRC.</p></div><span><Icon name="report" size={48}/></span></div>
          <div className="export-grid">
            <div className="surface-card export-card"><div className="export-head"><span className="export-icon azul"><Icon name="file" size={23}/></span><span className="etiqueta etiqueta-azul">PDF</span></div><h3>Resumen general</h3><p>Totales, tipos de comprobante, IVA por tarifa y comercios.</p><Boton icono="download" disabled={!filtrados.length} onClick={()=>ejecutarReporte(pdfResumen)}>Generar PDF</Boton></div>
            <div className="surface-card export-card"><div className="export-head"><span className="export-icon cyan"><Icon name="building" size={23}/></span><span className="etiqueta etiqueta-azul">PDF · CSV</span></div><h3>Totales por comercio</h3><p>Resumen de documentos, base neta e IVA por emisor.</p><div className="export-actions"><Boton clase="btn-light" disabled={!filtrados.length} onClick={()=>ejecutarReporte(csvComercios)}>CSV</Boton><Boton clase="btn-light" disabled={!filtrados.length} onClick={()=>ejecutarReporte(excelComercios)}>Excel</Boton><Boton disabled={!filtrados.length} onClick={()=>ejecutarReporte(pdfComercios)}>PDF</Boton></div></div>
            <div className="surface-card export-card"><div className="export-head"><span className="export-icon violet"><Icon name="tax" size={23}/></span><span className="etiqueta etiqueta-azul">PDF · CSV</span></div><h3>IVA por tarifa</h3><p>Bases imponibles e IVA neto de 0 % a 13 %.</p><div className="export-actions"><Boton clase="btn-light" disabled={!filtrados.length} onClick={()=>ejecutarReporte(csvIVA)}>CSV</Boton><Boton clase="btn-light" disabled={!filtrados.length} onClick={()=>ejecutarReporte(excelIVA)}>Excel</Boton><Boton disabled={!filtrados.length} onClick={()=>ejecutarReporte(pdfIVA)}>PDF</Boton></div></div>
            <div className="surface-card export-card"><div className="export-head"><span className="export-icon amber"><Icon name="receipt" size={23}/></span><span className="etiqueta etiqueta-ambar">CSV</span></div><h3>Comprobantes completos</h3><p>Clave, consecutivo, moneda original, conversión e importes.</p><div className="export-actions"><Boton icono="download" clase="btn-light" disabled={!filtrados.length} onClick={()=>ejecutarReporte(csvDocumentos)}>CSV</Boton><Boton icono="download" disabled={!filtrados.length} onClick={()=>ejecutarReporte(excelDocumentos)}>Excel</Boton></div></div>
            <div className="surface-card export-card"><div className="export-head"><span className="export-icon teal"><Icon name="grid" size={23}/></span><span className="etiqueta etiqueta-ambar">CSV</span></div><h3>Artículos y servicios</h3><p>CAByS, precio unitario, cantidad, IVA y total de cada línea.</p><div className="export-actions"><Boton icono="download" clase="btn-light" disabled={!filtrados.length} onClick={()=>ejecutarReporte(csvLineas)}>CSV</Boton><Boton icono="download" disabled={!filtrados.length} onClick={()=>ejecutarReporte(excelLineas)}>Excel</Boton></div></div>
          </div>
          <section className="surface-card iva-report"><div className="section-head"><div><h2>Vista previa del IVA</h2><p>Resumen calculado con los comprobantes filtrados</p></div><span className="chip-neutro">₡ CRC</span></div><div className="table-scroll"><table className="data-table"><thead><tr><th>Tarifa</th><th className="numero-tabla">Base neta</th><th className="numero-tabla">IVA neto</th></tr></thead><tbody>{TASAS.map(t=><tr key={t}><td><span className="tarifa-chip">{t}%</span></td><td className="numero-tabla importe">{crc(resumen.bases[t])}</td><td className="numero-tabla importe">{crc(resumen.iva[t])}</td></tr>)}</tbody><tfoot><tr><th>Total</th><th className="numero-tabla">{crc(resumen.base)}</th><th className="numero-tabla">{crc(resumen.totalIVA)}</th></tr></tfoot></table></div></section>
        </>}

        {seccion==='perfiles'&&<><section className="perfiles-intro"><div><Icon name="shield" size={20}/><span>Las empresas comparten una base SQLite local, pero sus documentos, totales y exportaciones se consultan por separado. Para prevenir errores, puedes asociar una cédula a cada empresa.</span></div></section><div className="perfiles-grid">{perfiles.map(p=><article className={`surface-card perfil-card ${p.id===perfilId?'perfil-card-active':''}`} key={p.id}><div className="perfil-card-top"><span className="perfil-icon" style={{background:p.color}}>{p.nombre.slice(0,1).toUpperCase()}</span>{p.id===perfilId&&<span className="etiqueta etiqueta-verde">Activa</span>}</div><h3 title={p.nombre}>{p.nombre}</h3><p>{p.cedula?`Identificación: ${p.cedula}`:'Sin cédula configurada'}</p><div className="perfil-stat"><Icon name="receipt" size={16}/><strong>{p.cantidad||0}</strong> comprobantes</div><div className="perfil-buttons"><Boton clase="btn-light" onClick={()=>{setPerfilId(p.id);setSeccion('documentos');}}>Abrir perfil</Boton><><button title="Editar empresa" className="icon-button" onClick={()=>abrirPerfil(p)}><Icon name="edit" size={17}/></button><button title="Eliminar empresa con confirmación y respaldo previo" className="icon-button danger-hover" onClick={()=>solicitarEliminarEmpresa(p)} disabled={cargando}><Icon name="trash" size={17}/></button></></div></article>)}<button className="perfil-add-card" onClick={()=>abrirPerfil()}><span><Icon name="plus" size={27}/></span><strong>Agregar empresa</strong><small>Crea un espacio para sus comprobantes</small></button></div></>}

        {seccion==='divisas'&&<>
          <section className="surface-card fx-hero">
            <div className="fx-header"><div><span className="eyebrow">MINISTERIO DE HACIENDA · BCCR</span><h2>Cotización oficial USD / CRC</h2><p>Los comprobantes en dólares se convierten usando el cambio de <strong>venta de referencia</strong> de su fecha de emisión.</p></div><Boton icono="refresh" clase="btn-light" disabled={cargandoCambio} onClick={()=>cargarTipoCambio(true)}>{cargandoCambio?'Consultando...':'Consultar ahora'}</Boton></div>
            <div className="fx-values">
              <div><small>COMPRA</small><strong>{cotizacion?.compra ? crc(cotizacion.compra) : 'No disponible'}</strong></div>
              <div><small>VENTA · APLICADA A DOCUMENTOS USD</small><strong>{cotizacion?.venta ? crc(cotizacion.venta) : 'No disponible'}</strong></div>
            </div>
            <p className="fx-caption">Fecha de referencia: <strong>{cotizacion?.fecha||'Sin datos'}</strong> · Fuente: {cotizacion?.fuente==='cache'?'Último registro local de Hacienda':'API pública de Hacienda / BCCR'} {cotizacion?.advertencia&&<span className="fx-warning">· {cotizacion.advertencia}</span>}</p>
          </section>
          <section className="surface-card fx-hero"><h2>Comprobantes y tipo de cambio histórico</h2>
            <p>Para cada XML USD se consulta la referencia de venta de la fecha de emisión. Si Hacienda no responde, se utiliza el tipo de cambio declarado en el XML (sin verificación en línea). El importe y su fuente quedan guardados con el documento y no cambian al consultar otro día.</p>
            <div className="info-note"><Icon name="shield" size={20}/><span>El programa solo consulta fechas a Hacienda. Los XML y datos de las empresas permanecen en tu SQLite local.</span></div>
          </section>
          <section className="surface-card fx-hero"><h2>Actualizar importes USD de versiones anteriores</h2>
            <p>Los documentos importados con el antiguo tipo de cambio fijo de ₡500 <strong>no se modifican automáticamente</strong>. Esta herramienta reconstruye sus importes desde los XML originales, hace un respaldo SQLite previo y actualiza los valores en una sola operación.</p>
            <p className="fx-warning">Atención: esta acción puede cambiar totales, impuestos, bases, PDF y CSV del historial. Si falla un documento, no se actualiza ninguno.</p>
            <div className="fx-actions"><Campo titulo="Escribe ACTUALIZAR para confirmar"><input value={confirmarRecalculo} onChange={e=>setConfirmarRecalculo(e.target.value)} placeholder="ACTUALIZAR" disabled={recalculando}/></Campo><Boton icono="refresh" disabled={recalculando||confirmarRecalculo!=='ACTUALIZAR'} onClick={recalcularHistoricosUSD}>{recalculando?'Respaldando y actualizando...':'Recalcular documentos USD guardados'}</Boton></div>
          </section>
        </>}

        {seccion==='respaldos'&&<>
          <section className="backup-hero">
            <div className="backup-hero-icon"><Icon name="shield" size={31}/></div>
            <div><span className="eyebrow">PROTECCIÓN DE DATOS LOCALES</span><h2>Tu historial, protegido</h2><p>Las copias incluyen todas las empresas y sus XML originales. Se guardan en una carpeta local. La aplicación no los sube a servidores; una carpeta sincronizada por Windows sí podría hacerlo.</p></div>
            <span className={`backup-status ${estadoRespaldos?.habilitado?'activo':''}`}><i/>{estadoRespaldos?.habilitado?'Automáticos activos':'Automáticos desactivados'}</span>
          </section>
          <div className="backup-stats">
            <div className="surface-card backup-stat"><span>Último respaldo</span><strong>{fechaRespaldo(estadoRespaldos?.ultimaCopia)}</strong><small>De cualquier tipo</small></div>
            <div className="surface-card backup-stat"><span>Último automático</span><strong>{fechaRespaldo(estadoRespaldos?.ultimaAutomatica)}</strong><small>Generado mientras la app estuvo abierta</small></div>
            <div className="surface-card backup-stat"><span>Copias registradas</span><strong>{estadoRespaldos?.copias?.length??0}</strong><small>En la carpeta configurada (máximo 60 visibles)</small></div>
          </div>
          {estadoRespaldos?.ultimoError&&<div className="alerta aviso-error" role="alert"><Icon name="alert" size={18}/><span>{estadoRespaldos.ultimoError}</span></div>}
          <div className="backup-columns">
            <section className="surface-card backup-config">
              <div className="section-head"><div><h2>Programación automática</h2><p>Configura la frecuencia y cuántas copias automáticas conservar.</p></div><Icon name="settings" size={22}/></div>
              <label className="backup-toggle"><input type="checkbox" checked={configRespaldos.habilitado} onChange={e=>setConfigRespaldos(v=>({...v,habilitado:e.target.checked}))}/><span><strong>Activar respaldos automáticos</strong><small>Al iniciar o según el intervalo elegido, siempre que el programa esté abierto.</small></span></label>
              <div className="backup-options"><Campo titulo="Frecuencia"><select value={configRespaldos.frecuencia} disabled={!configRespaldos.habilitado} onChange={e=>setConfigRespaldos(v=>({...v,frecuencia:e.target.value}))}><option value="inicio">En cada apertura del programa</option><option value="diario">Diario (cada 24 horas)</option><option value="semanal">Semanal (cada 7 días)</option></select></Campo>
              <Campo titulo="Conservar últimas copias automáticas"><select value={configRespaldos.retener} onChange={e=>setConfigRespaldos(v=>({...v,retener:Number(e.target.value)}))}>{[5,14,30,60].map(n=><option key={n} value={n}>{n} copias</option>)}</select></Campo></div>
              <div className="backup-folder"><small>CARPETA DE RESPALDOS</small><code title={estadoRespaldos?.carpeta}>{estadoRespaldos?.carpeta||'Cargando...'}</code><div className="actions-inline"><Boton clase="btn-light" icono="folder" onClick={cambiarCarpetaRespaldos} disabled={trabajandoRespaldo}>Cambiar carpeta</Boton><Boton clase="btn-light" icono="external" onClick={abrirCarpetaRespaldos}>Abrir carpeta</Boton></div></div>
              <div className="backup-config-actions"><Boton icono="check" onClick={guardarConfigRespaldos} disabled={trabajandoRespaldo||!estadoRespaldos}>Guardar configuración</Boton><Boton icono="download" clase="btn-light" onClick={respaldo} disabled={trabajandoRespaldo}>Guardar copia en...</Boton></div>
            </section>
            <section className="surface-card backup-history"><div className="section-head"><div><h2>Historial de respaldos</h2><p>Copias verificadas en la carpeta configurada</p></div><button className="text-button" onClick={()=>cargarRespaldos().catch(err=>mensaje(err.message,'error'))}><Icon name="refresh" size={16}/> Actualizar</button></div>
            {estadoRespaldos?.copias?.length?<div className="backup-list">{estadoRespaldos.copias.map(c=><div className="backup-list-item" key={c.nombre}><span className="backup-file-icon"><Icon name={c.tipo==='antes-eliminar'?'shield':'database'} size={18}/></span><div className="backup-file-meta"><strong title={c.nombre}>{c.nombre}</strong><small>{fechaRespaldo(c.fecha)} · {tamanoRespaldo(c.bytes)}</small><span className="backup-label">{c.tipo==='automatico'?'Automático':c.tipo==='antes-eliminar'?'Previo a eliminar empresa':c.tipo==='antes-recalcular'?'Previo a recalcular importes / revisar IVA':'Manual'}</span></div></div>)}</div>:<Vacio icono="database" titulo="Todavía no hay copias" descripcion="Crea un respaldo para proteger los documentos de todas las empresas."/>}
            </section>
          </div>
          <section className="surface-card backup-config" style={{marginTop:20,padding:22}}>
            <div className="section-head"><div><h2>Revisar IVA de comprobantes anteriores</h2>
              <p>Corrige el IVA neto de XML con exoneraciones importados antes de esta actualización. Incluye todas las empresas.</p>
            </div><Icon name="shield" size={22}/></div>
            <p className="texto-secundario">Se genera un respaldo SQLite antes del cambio. Los totales de los comprobantes y los tipos de cambio históricos permanecerán intactos. No se requiere Internet.</p>
            <div className="actions-inline" style={{flexWrap:'wrap',marginTop:14}}>
              <input type="text" aria-label="Escribe REPARAR IVA para confirmar" placeholder="Escribe REPARAR IVA" value={confirmarIVA}
                onChange={e=>setConfirmarIVA(e.target.value)} style={{minWidth:210,flex:'1 1 210px'}}/>
              <Boton icono="check" disabled={reparandoIVA||confirmarIVA!=='REPARAR IVA'} onClick={repararHistorialIVA}>
                {reparandoIVA?'Revisando comprobantes...':'Corregir IVA histórico'}
              </Boton>
            </div>
          </section>
          <section className="surface-card backup-config qa-restore" style={{marginTop:20,padding:22}}>
            <div className="section-head"><div><h2>Restaurar respaldo completo</h2><p>Valida una copia SQLite y sustituye la base local con confirmación reforzada.</p></div><Icon name="shield" size={22}/></div>
            <div className="info-note"><Icon name="alert" size={18}/><span>La restauración reemplaza los perfiles, documentos, mensajes y registros actuales por los del archivo elegido. Antes se crea una copia de emergencia y el programa se reinicia. No mezcles bases de otras aplicaciones.</span></div>
            <div className="qa-actions"><button className="btn btn-light" onClick={elegirRespaldo} disabled={trabajandoRespaldo}>Seleccionar y verificar SQLite</button></div>
            {respaldoParaRestaurar&&<div className="qa-info"><strong>{respaldoParaRestaurar.archivo}</strong><span>{respaldoParaRestaurar.empresas} empresas · {respaldoParaRestaurar.documentos} comprobantes</span><label className="campo">Escribe RESTAURAR<input value={confirmarRestauracion} onChange={e=>setConfirmarRestauracion(e.target.value)} placeholder="RESTAURAR"/></label><div className="qa-actions"><button className="btn btn-danger-light" disabled={trabajandoRespaldo||confirmarRestauracion!=='RESTAURAR'} onClick={restaurarCopia}>Restaurar y reiniciar</button><button className="btn btn-light" onClick={()=>setRespaldoParaRestaurar(null)}>Cancelar</button></div></div>}
          </section>
          <div className="info-note backup-info"><Icon name="info" size={18}/><span>Los respaldos automáticos solo se ejecutan con la aplicación abierta. La aplicación no sube datos por sí misma; evita carpetas sincronizadas si quieres copias exclusivamente locales. Una actualización no debe eliminar la base; conserva además una copia en un disco externo. Para recuperar una copia, conserva el archivo SQLite y sigue las instrucciones del README antes de sustituir una base.</span></div>
        </>}

        <footer className="footer"><span>ComprobantesElectronicosCR · Windows · XML 4.4</span><span><Icon name="shield" size={14}/> Datos locales · USD: referencia de venta BCCR/Hacienda por fecha</span></footer>
      </main>
    </div>

    <VistaPrevia vista={vistaImportacion} perfiles={perfiles} cargando={cargando}
      onCerrar={()=>{setVistaImportacion(null);setColaPendiente([]);}}
      onConfirmar={confirmarImportacionInteligente}/>

    {seleccionado&&<div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setSeleccionado(null);}}><aside className="detail-drawer" role="dialog" aria-modal="true" aria-label="Detalle de comprobante"><div className="drawer-header"><div><div className="eyebrow">DOCUMENTO ELECTRÓNICO</div><h2>Detalle del comprobante</h2><p>{seleccionado.tipoDocumento}</p></div><button className="icon-button" onClick={()=>setSeleccionado(null)} title="Cerrar"><Icon name="close" size={20}/></button></div><div className="drawer-body"><div className="detail-total"><span>Total neto · CRC</span><strong className={numero(seleccionado.total)<0?'negativo':''}>{crc(seleccionado.total)}</strong><small>{seleccionado.monedaOriginal==='USD'?`Importe original US$${numero(seleccionado.totalOriginal).toFixed(2)} · cambio aplicado ₡${numero(seleccionado.tipoCambioAplicado).toLocaleString('es-CR',{minimumFractionDigits:2,maximumFractionDigits:5})} (${seleccionado.fechaTipoCambio||'fecha no indicada'})`: 'Documento expresado originalmente en colones'}</small></div>
      <h3 className="drawer-section-title">Información del comprobante</h3><div className="detail-grid">
        {[['Tipo',seleccionado.tipoDocumento],['Fecha',fechaCorta(seleccionado.fecha)],['Versión',seleccionado.versionXML||'—'],['Archivo',seleccionado.nombreArchivo],['Clave',seleccionado.clave],['Consecutivo',seleccionado.consecutivo],['Moneda original',seleccionado.monedaOriginal],['Cambio original XML',seleccionado.tipoCambioOriginalXML ? `${seleccionado.tipoCambioOriginalXML}`:'—'],['Cambio aplicado',seleccionado.tipoCambioAplicado||1],['Fuente del tipo de cambio',seleccionado.fuenteTipoCambio||'Versión anterior: no registrada'],['Fecha de la referencia',seleccionado.fechaTipoCambio||'—'],['Actividad emisor',seleccionado.codigoActividadEmisor||'—']].map(([k,v])=><div key={k}><span>{k}</span><strong>{v||'—'}</strong></div>)}
      </div><h3 className="drawer-section-title">Emisor y receptor</h3><div className="entity-pair"><div><small>EMISOR</small><strong>{seleccionado.emisor?.nombre||'—'}</strong><span>{seleccionado.emisor?.identificacion?.numero||'Sin identificación'}</span></div><div><small>RECEPTOR</small><strong>{seleccionado.receptor?.nombre||'—'}</strong><span>{seleccionado.receptor?.identificacion?.numero||'Sin identificación'}</span></div></div>
      <h3 className="drawer-section-title">Resumen monetario</h3><div className="money-lines">{[['Total de venta',seleccionado.resumen?.totalVenta],['Descuentos',seleccionado.resumen?.totalDescuentos],['Venta neta',seleccionado.resumen?.totalVentaNeta],['Impuestos',seleccionado.resumen?.totalImpuesto],['Total comprobante',seleccionado.total]].map(([k,v])=><div key={k}><span>{k}</span><strong>{crc(v)}</strong></div>)}</div>
      <h3 className="drawer-section-title">Artículos y servicios ({seleccionado.detalle?.length||0})</h3><div className="lineas-detalle">{(seleccionado.detalle||[]).slice(0,limiteLineas).map((l,i)=><div className="linea-card" key={i}><div><span className="linea-id">#{l.linea}</span><strong>{l.detalle||'Sin descripción'}</strong></div><small>CAByS: {l.codigoCABYS||l.codigo||'—'}</small><div className="linea-montos"><span>{l.cantidad} × {crc(l.precioUnitario)}</span><strong>{crc(l.montoTotalLinea)}</strong></div><small>IVA: {(l.impuestos||[]).map(x=>`${x.tarifa}%`).join(', ')||'No indicado'}</small></div>)}{!seleccionado.detalle?.length&&<p className="texto-secundario">Este documento no incluye líneas de detalle.</p>}{(seleccionado.detalle?.length||0)>limiteLineas&&<Boton clase="btn-light" onClick={()=>setLimiteLineas(n=>n+30)}>Mostrar 30 líneas más</Boton>}</div>
      <h3 className="drawer-section-title">Organización</h3><div className="mover-documento"><Campo titulo="Mover comprobante a otra empresa"><select value={destinoId} onChange={e=>setDestinoId(e.target.value)}><option value="">Seleccionar empresa destino</option>{perfiles.filter(p=>p.id!==perfilId).map(p=><option key={p.id} value={p.id}>{p.nombre}</option>)}</select></Campo><Boton icono="transfer" clase="btn-light" disabled={!destinoId||cargando} onClick={moverDocumento}>Mover</Boton></div>
      </div><div className="drawer-footer"><Boton icono="download" onClick={()=>{try{pdfDetalle(perfil,seleccionado);}catch(err){mensaje(err.message,'error');}}}>PDF detalle</Boton><Boton icono="trash" clase="btn-danger-light" disabled={cargando} onClick={()=>borrarDocumento(seleccionado)}>Enviar a Papelera</Boton></div></aside></div>}

    {operacionLote&&<div className="overlay modal-overlay"><form className="company-modal delete-company-modal" onSubmit={ejecutarOperacionLote} role="dialog" aria-modal="true" aria-label="Confirmar operación de comprobantes">
      <div className="modal-head"><div><div className="eyebrow">CORREGIR IMPORTACIÓN</div><h2>{operacionLote.tipo==='papelera'?'Enviar a Papelera':'Mover comprobantes'}</h2><p>{operacionLote.ids.length} comprobante(s) seleccionados de «{perfil.nombre}».</p></div><button type="button" className="icon-button" disabled={cargando} onClick={()=>setOperacionLote(null)} aria-label="Cancelar"><Icon name="close" size={20}/></button></div>
      <div className="modal-body"><div className="info-note"><Icon name="shield" size={18}/><span>Se creará un respaldo verificado antes de modificar SQLite. La operación será completa o no cambiará ningún comprobante.</span></div>
        <p>{operacionLote.tipo==='papelera'?'Los comprobantes dejarán de sumar en el Panel general y los reportes, pero podrás recuperarlos desde Papelera.':`Los comprobantes se trasladarán a «${perfiles.find(p=>p.id===operacionLote.destinoId)?.nombre||'destino'}». Se validarán cédulas y duplicados.`}</p>
        <div className="confirmar-archivos"><strong>Comprobantes seleccionados:</strong><ul>{operacionLote.ids.slice(0,12).map(id=>{const d=todos.find(f=>f.id===id);return <li key={id}>{d?.nombreArchivo||d?.consecutivo||`Documento ${id}`}</li>;})}</ul>{operacionLote.ids.length>12&&<small>Y {operacionLote.ids.length-12} documento(s) más.</small>}</div>
        <Campo titulo="Escribe CONFIRMAR para continuar"><input autoFocus autoComplete="off" value={confirmacionLote} onChange={e=>setConfirmacionLote(e.target.value)} placeholder="CONFIRMAR"/></Campo>
      </div><div className="modal-footer"><Boton clase="btn-light" type="button" disabled={cargando} onClick={()=>setOperacionLote(null)}>Cancelar</Boton><Boton icono={operacionLote.tipo==='papelera'?'trash':'transfer'} clase={operacionLote.tipo==='papelera'?'btn-danger':'btn-primary'} type="submit" disabled={cargando||confirmacionLote!=='CONFIRMAR'}>{cargando?'Procesando...':'Confirmar operación'}</Boton></div>
    </form></div>}

    {empresaEliminar&&<div className="overlay modal-overlay" onMouseDown={e=>{if(e.target===e.currentTarget&&!cargando)setEmpresaEliminar(null);}}>
      <form className="company-modal delete-company-modal" onSubmit={borrarPerfil} role="dialog" aria-modal="true" aria-label="Confirmar eliminación de empresa">
        <div className="modal-head"><div><div className="eyebrow peligro">ACCIÓN DELICADA</div><h2>Eliminar empresa</h2><p>Se creará una copia de seguridad antes de modificar SQLite.</p></div><button className="icon-button" type="button" disabled={cargando} onClick={()=>setEmpresaEliminar(null)} aria-label="Cerrar"><Icon name="close" size={20}/></button></div>
        <div className="modal-body">
          {errorEliminar&&<div className="alerta aviso-error" role="alert"><Icon name="alert" size={18}/><span>{errorEliminar}</span></div>}
          <div className="delete-summary"><span className="delete-company-avatar" style={{background:empresaEliminar.color}}>{empresaEliminar.nombre.slice(0,1).toUpperCase()}</span><div><strong>{empresaEliminar.nombre}</strong><small>{empresaEliminar.cantidad||0} comprobantes asociados</small></div></div>
          <fieldset className="delete-modes"><legend>¿Qué hacemos con los comprobantes?</legend>
          {perfiles.some(p=>p.id!==empresaEliminar.id)&&<label><input type="radio" name="modoEliminar" value="mover" checked={modoEliminar==='mover'} onChange={()=>setModoEliminar('mover')}/><span><strong>Conservar los documentos (recomendado)</strong><small>Trasladarlos a otra empresa registrada. Se validarán cédulas y duplicados.</small></span></label>}
          {modoEliminar==='mover'&&<Campo titulo="Empresa que recibirá los comprobantes"><select value={destinoEliminar} onChange={e=>setDestinoEliminar(e.target.value)} required>{perfiles.filter(p=>p.id!==empresaEliminar.id).map(p=><option value={p.id} key={p.id}>{p.nombre}</option>)}</select></Campo>}
          <label><input type="radio" name="modoEliminar" value="eliminar" checked={modoEliminar==='eliminar'} onChange={()=>setModoEliminar('eliminar')}/><span><strong>Eliminar empresa y sus documentos</strong><small>Se eliminarán {empresaEliminar.cantidad||0} comprobantes de esta empresa. Solo podrás recuperarlos desde un respaldo.</small></span></label></fieldset>
          <div className="info-note"><Icon name="shield" size={18}/><span>Antes de confirmar se generará y verificará un respaldo SQLite completo, incluyendo todas las empresas. Si falla, no se borrará nada.</span></div>
          <Campo titulo={`Escribe exactamente «${empresaEliminar.nombre}» para confirmar`}><input autoFocus autoComplete="off" spellCheck="false" value={nombreEliminar} onChange={e=>setNombreEliminar(e.target.value)} placeholder="Nombre exacto de la empresa"/></Campo>
          <label className="delete-agreement"><input type="checkbox" checked={aceptaEliminar} onChange={e=>setAceptaEliminar(e.target.checked)}/><span>Entiendo qué ocurrirá con los comprobantes y confirmo la eliminación de esta empresa.</span></label>
        </div>
        <div className="modal-footer"><Boton clase="btn-light" type="button" disabled={cargando} onClick={()=>setEmpresaEliminar(null)}>Cancelar</Boton><Boton clase="btn-danger" icono="trash" type="submit" disabled={cargando||!aceptaEliminar||nombreEliminar!==empresaEliminar.nombre||(modoEliminar==='mover'&&!destinoEliminar)}>{cargando?'Respaldando y eliminando...':'Eliminar empresa'}</Boton></div>
      </form>
    </div>}

    {modalPerfil&&<div className="overlay modal-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setModalPerfil(null);}}><form className="company-modal" onSubmit={guardarPerfil} role="dialog" aria-modal="true" aria-label="Formulario de empresa"><div className="modal-head"><div><div className="eyebrow">PERFILES INDEPENDIENTES</div><h2>{modalPerfil==='nuevo'?'Registrar nueva empresa':'Editar empresa'}</h2><p>Los comprobantes se guardarán solo en este perfil.</p></div><button type="button" className="icon-button" onClick={()=>setModalPerfil(null)} aria-label="Cerrar"><Icon name="close" size={20}/></button></div><div className="modal-body">{errorPerfil&&<div className="alerta aviso-error" role="alert"><Icon name="alert" size={17}/><span>{errorPerfil}</span></div>}<Campo titulo="Nombre de la empresa *"><input autoFocus maxLength={120} required placeholder="Ej. Comercial La Esperanza S.A." value={formPerfil.nombre} onChange={e=>setFormPerfil({...formPerfil,nombre:e.target.value})}/></Campo><div className="modal-columns"><Campo titulo="Cédula jurídica o física (opcional)"><input maxLength={30} placeholder="3101234567" value={formPerfil.cedula} onChange={e=>setFormPerfil({...formPerfil,cedula:e.target.value})}/></Campo><Campo titulo="Teléfono"><input maxLength={40} placeholder="8888-8888" value={formPerfil.telefono} onChange={e=>setFormPerfil({...formPerfil,telefono:e.target.value})}/></Campo></div><Campo titulo="Correo electrónico"><input type="email" maxLength={160} placeholder="contabilidad@empresa.com" value={formPerfil.correo} onChange={e=>setFormPerfil({...formPerfil,correo:e.target.value})}/></Campo><Campo titulo="Dirección"><textarea rows={2} maxLength={320} placeholder="Ubicación de la empresa" value={formPerfil.direccion} onChange={e=>setFormPerfil({...formPerfil,direccion:e.target.value})}/></Campo><div className="campo"><span>Color de identificación</span><div className="color-options">{PALETA.map(c=><button key={c} type="button" className={`color-option ${formPerfil.color===c?'selected':''}`} style={{background:c}} onClick={()=>setFormPerfil({...formPerfil,color:c})} title={c}>{formPerfil.color===c&&<Icon name="check" size={17}/>}</button>)}</div></div><div className="info-note"><Icon name="info" size={17}/><span>Si indicas una cédula, solo se importarán comprobantes donde la empresa aparezca como emisor o receptor. Esto evita mezclar empresas por error.</span></div></div><div className="modal-footer"><Boton clase="btn-light" type="button" onClick={()=>setModalPerfil(null)}>Cancelar</Boton><Boton type="submit" icono="check" disabled={cargando}>{cargando?'Guardando...':modalPerfil==='nuevo'?'Crear empresa':'Guardar cambios'}</Boton></div></form></div>}
  </div>;
}
