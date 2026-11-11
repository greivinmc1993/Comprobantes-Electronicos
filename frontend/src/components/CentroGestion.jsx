import React,{useEffect,useMemo,useState} from 'react';
import Icon from './Icon';
import {crc,fechaCorta,pdfComprasVentas,csvComprasVentas,excelComprasVentas,csvContrapartes,csvComparativoMensual} from '../reportes';
import {tablaContable,clasificacion,agruparContrapartes,compararMeses} from '../contabilidad.mjs';

function Card({titulo,descripcion,children}){return <section className="surface-card qa-card"><h2>{titulo}</h2>{descripcion&&<p className="texto-secundario">{descripcion}</p>}{children}</section>;}
export default function CentroGestion({tipo,desktop,perfil,perfiles,documentos,abrirArchivos,onVista,mostrar,actualizar}){
  const [lote,setLote]=useState(null),[frase,setFrase]=useState(''),[ocupado,setOcupado]=useState(false);
  const [datos,setDatos]=useState(null),[auditoria,setAuditoria]=useState([]),[mensajes,setMensajes]=useState([]);
  const [vigilancia,setVigilancia]=useState(null),[seleccion,setSeleccion]=useState([]);
  const [desde,setDesde]=useState(''),[hasta,setHasta]=useState('');
  const filtrados=useMemo(()=>(documentos||[]).filter(d=>{
    const fecha=String(d.fecha||'').slice(0,10);
    return (!desde||fecha>=desde)&&(!hasta||fecha<=hasta);
  }),[documentos,desde,hasta]);
  const resumen=useMemo(()=>tablaContable(perfil,filtrados),[perfil,filtrados]);
  const ejecutar=async(fn,exito)=>{setOcupado(true);try{const res=await fn();if(exito)mostrar(exito(res));return res;}catch(e){mostrar(e.message,'error');return null;}finally{setOcupado(false);}};
  const refrescar=async()=>{
    if(!desktop)return;
    try{
      if(tipo==='importacion')setLote(await desktop.ultimoLote());
      if(tipo==='contabilidad'&&perfil?.id)setDatos(await desktop.gestionContable(perfil.id));
      if(tipo==='hacienda'&&perfil?.id)setMensajes(await desktop.mensajesHacienda(perfil.id));
      if(tipo==='auditoria')setAuditoria(await desktop.auditoria());
      if(tipo==='carpetas')setVigilancia(await desktop.vigilanciaEstado());
    }catch(e){mostrar(e.message,'error');}
  };
  useEffect(()=>{refrescar();},[tipo,perfil?.id]);
  if(tipo==='importacion')return <div className="qa-columns">
    <Card titulo="Centro de importación inteligente" descripcion="Cada archivo pasa por una vista previa antes de guardar datos en SQLite.">
      <div className="qa-step"><span>1</span><div><strong>Seleccionar XML</strong><small>Revisa todos los XML seleccionados en un solo lote, con confirmación previa.</small></div></div>
      <div className="qa-step"><span>2</span><div><strong>Detectar empresa, duplicados e impuestos</strong><small>Asigna cada archivo al perfil correcto y revisa sus observaciones.</small></div></div>
      <div className="qa-step"><span>3</span><div><strong>Confirmar importación</strong><small>Se guardan los documentos en una transacción, con número de lote.</small></div></div>
      <button className="btn btn-primary" onClick={abrirArchivos} disabled={ocupado||!perfiles.length}><Icon name="importar"/> Seleccionar archivos XML</button>
    </Card>
    <Card titulo="Deshacer última importación" descripcion="Solo se permite deshacer el último lote, y únicamente si sus documentos no cambiaron. Se conserva en Papelera con respaldo previo.">
      {lote?<div className="qa-info"><strong>Lote #{lote.id}</strong><span>{lote.cantidad} documentos · {fechaCorta(lote.creado_en)}</span><span>{lote.deshecho_en?'Ya deshecho':'Disponible para deshacer'}</span></div>:<p>No hay importaciones con seguimiento de lotes todavía.</p>}
      <label className="campo"><span>Escribe DESHACER</span><input value={frase} placeholder="DESHACER" onChange={e=>setFrase(e.target.value)}/></label>
      <button className="btn btn-danger-light" disabled={ocupado||!lote||Boolean(lote.deshecho_en)||frase!=='DESHACER'||!lote.cantidad} onClick={()=>ejecutar(async()=>{const r=await desktop.deshacerImportacion(lote.id,frase);setFrase('');await actualizar();await refrescar();return r;},r=>`${r.deshechos} documento(s) enviados a Papelera. Respaldo: ${r.respaldo}`)}><Icon name="trash"/> Deshacer y enviar a Papelera</button>
    </Card>
  </div>;
  if(tipo==='contabilidad')return <>
    <Card titulo="Compras, ventas y conciliación" descripcion="Se clasifica según el papel de la cédula de la empresa activa como emisor o receptor. Los signos de notas de crédito se conservan.">
      {!perfil?.cedula&&<div className="info-note"><Icon name="alert"/><span>Configura la cédula de la empresa para clasificar compras y ventas automáticamente. Sin cédula, los documentos permanecen sin clasificar.</span></div>}
      <div className="qa-actions"><label>Desde <input type="date" value={desde} onChange={e=>setDesde(e.target.value)}/></label><label>Hasta <input type="date" value={hasta} onChange={e=>setHasta(e.target.value)}/></label><button className="btn btn-light" onClick={()=>{setDesde('');setHasta('');}}>Todo el historial</button></div>
      <div className="qa-metric-grid">{resumen.map(r=><div key={r.tipo} className="qa-metric"><span>{r.tipo} · {r.cantidad}</span><strong>{crc(r.total)}</strong><small>Base {crc(r.base)} · IVA {crc(r.iva)}</small></div>)}</div>
      <div className="qa-actions"><button className="btn btn-light" onClick={()=>csvComprasVentas(perfil,filtrados)}>CSV</button><button className="btn btn-light" onClick={()=>excelComprasVentas(perfil,filtrados)}>Excel</button><button className="btn btn-primary" onClick={()=>pdfComprasVentas(perfil,filtrados)}>PDF contable</button><button className="btn btn-light" onClick={()=>csvContrapartes(perfil,filtrados)}>CSV contrapartes</button><button className="btn btn-light" onClick={()=>csvComparativoMensual(perfil,filtrados)}>CSV mensual</button></div>
    </Card>
    <Card titulo="Contrapartes principales" descripcion="Compras agrupadas por proveedor y ventas por cliente, según la empresa y período seleccionado.">
      <div className="qa-table-scroll"><table className="qa-table"><thead><tr><th>Movimiento</th><th>Proveedor / cliente</th><th>Documentos</th><th>Total neto CRC</th><th>IVA neto</th></tr></thead><tbody>{agruparContrapartes(perfil,filtrados).slice(0,50).map((r,i)=><tr key={i}><td>{r.tipo}</td><td>{r.nombre}</td><td>{r.cantidad}</td><td>{crc(r.total)}</td><td>{crc(r.iva)}</td></tr>)}</tbody></table></div>
    </Card>
    <Card titulo="Comparativo por mes" descripcion="Resumen mensual con notas de crédito y débito aplicadas a sus movimientos.">
      <div className="qa-table-scroll"><table className="qa-table"><thead><tr><th>Mes</th><th>Compras netas</th><th>Ventas netas</th><th>Diferencia</th></tr></thead><tbody>{compararMeses(perfil,filtrados).map(r=><tr key={r.mes}><td>{r.mes}</td><td>{crc(r.compras)}</td><td>{crc(r.ventas)}</td><td>{crc(r.ventas-r.compras)}</td></tr>)}</tbody></table></div>
    </Card>
    <Card titulo="Notas de crédito y débito relacionadas" descripcion="Busca el comprobante de referencia dentro del mismo perfil. Una coincidencia no certifica la anulación ante Hacienda.">
      <div className="qa-table-scroll"><table className="qa-table"><thead><tr><th>Documento</th><th>Referencia</th><th>Importe</th><th>Resultado</th></tr></thead><tbody>{(datos?.conciliaciones||[]).map(r=><tr key={r.id}><td>{r.numero}<small>{r.tipo}</small></td><td className="qa-code">{r.claveReferencia||'Sin referencia'}</td><td>{crc(r.importe)}</td><td><span className={`qa-status ${r.referenciaEnEmpresa?'qa-ok':'qa-warning'}`}>{r.estado}</span></td></tr>)}</tbody></table></div>
      {!datos?.conciliaciones?.length&&<p>No hay notas relacionadas con el historial de la empresa.</p>}
      <button className="btn btn-light" onClick={refrescar}>Actualizar conciliación</button>
    </Card>
  </>;
  if(tipo==='hacienda')return <Card titulo="Mensajes XML de Hacienda" descripcion="Importa respuestas MensajeHacienda y relaciónalas mediante la clave de 50 dígitos. No se consulta Hacienda en línea ni se comprueba la firma digital.">
    <div className="qa-actions"><label className="btn btn-primary" style={{cursor:'pointer'}}><Icon name="importar"/> Importar respuestas XML <input style={{display:'none'}} type="file" accept=".xml" multiple onChange={async e=>{
      const files=[...e.target.files].slice(0,10);e.target.value='';
      await ejecutar(async()=>{const res=await desktop.importarMensajes(await Promise.all(files.map(async f=>({nombre:f.name,bytes:new Uint8Array(await f.arrayBuffer())}))));setMensajes(await desktop.mensajesHacienda(perfil.id));return res;},r=>`${r.nuevos} respuestas guardadas, ${r.duplicados} repetidas, ${r.errores.length} errores${r.errores.length?': '+r.errores[0].error:''}`);
    }}/></label><button className="btn btn-light" onClick={refrescar}>Actualizar</button></div>
    <div className="qa-table-scroll"><table className="qa-table"><thead><tr><th>Archivo</th><th>Clave</th><th>Estado informado</th><th>Detalle</th></tr></thead><tbody>{mensajes.map(m=><tr key={m.id}><td>{m.archivo}</td><td className="qa-code">{m.clave}</td><td><span className={`qa-status ${m.estado==='Aceptado'?'qa-ok':'qa-warning'}`}>{m.estado}</span></td><td>{m.detalle||'—'}</td></tr>)}</tbody></table></div>
    {!mensajes.length&&<p>Esta empresa todavía no tiene respuestas de Hacienda vinculadas con sus comprobantes activos.</p>}
    <div className="info-note"><Icon name="info"/><span>El estado proviene del XML aportado; no implica que hayamos verificado en tiempo real su autenticidad ni vigencia.</span></div>
  </Card>;
  if(tipo==='auditoria')return <Card titulo="Bitácora de operaciones" descripcion="Conserva el historial de importaciones revisadas, traslados, envíos a Papelera y restauraciones.">
    <button className="btn btn-light" onClick={refrescar}>Actualizar registro</button>
    <div className="qa-table-scroll"><table className="qa-table"><thead><tr><th>Fecha</th><th>Operación</th><th>Empresa ID</th><th>Detalle</th></tr></thead><tbody>{auditoria.map(r=><tr key={r.id}><td>{r.fecha?.replace('T',' ').slice(0,19)}</td><td><strong>{r.accion}</strong></td><td>{r.perfilId||'Varias'}</td><td className="qa-code">{JSON.stringify(r.detalles)}</td></tr>)}</tbody></table></div>
    {!auditoria.length&&<p>No se han registrado operaciones recientes en la nueva bitácora.</p>}
  </Card>;
  if(tipo==='carpetas')return <Card titulo="Vigilar carpeta de Windows" descripcion="Detecta nuevos XML cuando el programa está abierto, pero nunca importa sin tu revisión y confirmación.">
    <div className="qa-actions"><button className="btn btn-primary" disabled={ocupado} onClick={()=>ejecutar(async()=>{const r=await desktop.configurarVigilancia(true);setVigilancia(r);setSeleccion([]);return r;},()=> 'Carpeta configurada para vigilancia.')}>Elegir carpeta</button>
      <button className="btn btn-light" disabled={ocupado||!vigilancia?.carpeta} onClick={()=>ejecutar(async()=>{const r=await desktop.habilitarVigilancia(!vigilancia.habilitado);setVigilancia(r);return r;},r=>r.habilitado?'Vigilancia activada':'Vigilancia desactivada')}>{vigilancia?.habilitado?'Pausar':'Activar'} vigilancia</button>
      <button className="btn btn-light" onClick={refrescar}>Buscar XML</button></div>
    <p className="qa-info">{vigilancia?.carpeta||'No se ha seleccionado carpeta'} · {vigilancia?.habilitado?'Vigilando':'Pausada'} · {vigilancia?.pendientes?.length||0} pendiente(s)</p>
    <div className="qa-table-scroll"><table className="qa-table"><thead><tr><th>Revisar</th><th>Archivo XML</th><th>Tamaño</th></tr></thead><tbody>{(vigilancia?.pendientes||[]).map(f=><tr key={f.id}><td><input aria-label={`Seleccionar ${f.nombre}`} type="checkbox" checked={seleccion.includes(f.id)} onChange={e=>setSeleccion(v=>e.target.checked?[...v,f.id]:v.filter(id=>id!==f.id))}/></td><td>{f.nombre}</td><td>{(f.bytes/1024).toFixed(1)} KB</td></tr>)}</tbody></table></div>
    <button className="btn btn-primary" disabled={!seleccion.length||ocupado||!perfil?.id} onClick={()=>ejecutar(async()=>{await onVista(await desktop.previsualizarPendientes(perfil.id,seleccion));setSeleccion([]);return null;})}>Revisar {seleccion.length} XML seleccionados</button>
    <p className="texto-secundario">El seguimiento revisa la carpeta periódicamente. Solo examina archivos .xml estables de hasta 15 MB. No analiza subcarpetas.</p>
  </Card>;
  return null;
}
