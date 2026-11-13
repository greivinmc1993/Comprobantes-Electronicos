import React,{useEffect,useRef,useState} from 'react';
import Icon from './Icon';
import SelectElegante from './SelectElegante';
import {crc} from '../reportes';
import {asignarEmpresaMasiva,empresaCompatible} from './asignacion-masiva.mjs';
import {esListo,necesitaRevision,esErrorDeLectura,esDuplicadoEnLote,exclusionInicial,marcarComprobantes,filtrarPorRevision} from './estado-revision.mjs';

export default function VistaPrevia({vista,perfiles,onCerrar,onConfirmar,cargando}) {
  const [selecciones,setSelecciones]=useState({});
  const [excluidos,setExcluidos]=useState(()=>exclusionInicial(vista?.filas||[]));
  const [filtro,setFiltro]=useState('todos');
  const tablaRef=useRef(null);
  const [empresaMasiva,setEmpresaMasiva]=useState('');
  const [avisoMasivo,setAvisoMasivo]=useState('');
  const [limiteVisibles,setLimiteVisibles]=useState(200);
  useEffect(()=>{
    setSelecciones(Object.fromEntries((vista?.filas||[]).map(f=>[f.indice,String(f.empresaSugerida||'')])));
    setExcluidos(exclusionInicial(vista?.filas||[]));
    setFiltro('todos');
    setEmpresaMasiva('');setAvisoMasivo('');setLimiteVisibles(200);
  },[vista?.token]);
  const filas=vista?.filas||[];
  const filasFiltradas=filtrarPorRevision(filas,filtro);
  const listos=filas.filter(esListo);
  const porRevisar=filas.filter(necesitaRevision).length;
  const duplicados=filas.filter(esDuplicadoEnLote).length;
  const cambiarFiltro=(nuevo)=>{setFiltro(nuevo);setLimiteVisibles(200);if(tablaRef.current){tablaRef.current.scrollTop=0;tablaRef.current.scrollIntoView?.({block:'nearest'});}};
  const aplicables=filas.filter(f=>!['error','duplicado_en_lote'].includes(f.estado));
  const elegidos=aplicables.filter(f=>!excluidos[f.indice]);
  const validos=elegidos.filter(f=>{
    const perfil=perfiles.find(p=>String(p.id)===String(selecciones[f.indice]));
    return empresaCompatible(f,perfil);
  });
  const pendientes=elegidos.length-validos.length;
  const errores=filas.filter(esErrorDeLectura).length;
  const conAjuste=elegidos.filter(f=>f.ajusteNetoSinTarifa && Math.abs(f.ajusteNetoSinTarifa)>0.00000001).length;
  const conBaseAmbigua=elegidos.filter(f=>Math.abs(Number(f.baseIVAnoAtribuida)||0)>0.00000001).length;
  if(!vista)return null;
  const asignarTodos=()=>{
    const perfil=perfiles.find(p=>String(p.id)===empresaMasiva);
    if(!perfil) return;
    const resultado=asignarEmpresaMasiva(filas,excluidos,selecciones,perfil);
    setSelecciones(resultado.selecciones);
    setAvisoMasivo(`${resultado.aplicados} XML asignados a «${perfil.nombre}»`+
      (resultado.incompatibles?`; ${resultado.incompatibles} no coinciden con la cédula de esa empresa`: '')+'.');
  };
  const marcarTodos=(checked)=>setExcluidos(prev=>marcarComprobantes(filas,prev,checked));
  const confirmar=()=>onConfirmar(validos.map(f=>({indice:f.indice,perfilId:Number(selecciones[f.indice])})));
  return <div className="overlay modal-overlay" role="presentation"><section className="company-modal qa-preview" role="dialog" aria-modal="true" aria-label="Vista previa de importación XML">
    <div className="modal-head"><div><div className="eyebrow">IMPORTACIÓN INTELIGENTE · XML 4.4</div><h2>Revisa antes de guardar</h2><p>Asigna una empresa a varios XML a la vez. No se guardará nada hasta confirmar.</p></div><button type="button" className="icon-button" disabled={cargando} onClick={onCerrar} aria-label="Cerrar vista previa"><Icon name="close"/></button></div>
    <div className="modal-body qa-preview-body">
      <div className="info-note"><Icon name="shield"/><span>Los documentos con cédula coincidente se asignan automáticamente. La asignación masiva no cambia XML con cédulas incompatibles. Antes de guardar, revisa la empresa elegida.</span></div>
      <div className="qa-summary" aria-live="polite">
        <span><strong>{filas.length}</strong> examinados</span><span><strong>{elegidos.length}</strong> seleccionados</span>
        <span><strong>{validos.length}</strong> listos para guardar</span>
        <button type="button" className="qa-summary-link qa-summary-warning" onClick={()=>cambiarFiltro('revisar')} disabled={cargando} title="Mostrar directamente los XML que requieren revisión" aria-label={`Ver ${porRevisar} XML por revisar`}><strong>{porRevisar}</strong> por revisar · Ver</button>
        {errores>0&&<button type="button" className="qa-summary-link qa-summary-warning" onClick={()=>cambiarFiltro('errores')} disabled={cargando} title="Mostrar directamente los XML con error" aria-label={`Ver ${errores} XML con error`}><strong>{errores}</strong> con error · Ver</button>}
        {pendientes>0&&<span className="qa-summary-warning"><strong>{pendientes}</strong> marcados sin empresa compatible</span>}
      </div>
      <div className="qa-bulk-toolbar">
        <label className="qa-bulk-field"><span>Empresa para los XML marcados</span>
          <SelectElegante aria-label="Empresa para asignación masiva" value={empresaMasiva} onChange={e=>{setEmpresaMasiva(e.target.value);setAvisoMasivo('');}} disabled={cargando}>
            <option value="">Seleccionar empresa…</option>{perfiles.map(p=><option key={p.id} value={p.id}>{p.nombre}{p.cedula?' · '+p.cedula:' · sin cédula'}</option>)}
          </SelectElegante>
        </label>
        <button type="button" className="btn btn-primary" onClick={asignarTodos} disabled={cargando||!empresaMasiva||!elegidos.length}><Icon name="building"/> Asignar a {elegidos.length} XML</button>
        <button type="button" className="btn btn-light" disabled={cargando||!listos.length} onClick={()=>marcarTodos(true)}>Marcar listos</button>
        <button type="button" className="btn btn-light" disabled={cargando||!elegidos.length} onClick={()=>marcarTodos(false)}>Desmarcar</button>
      </div>
      {avisoMasivo&&<p className="qa-bulk-notice" role="status">{avisoMasivo}</p>}
      {conAjuste>0&&<div className="qa-precision-note" role="note"><Icon name="alert"/><span>{conAjuste} XML tienen diferencias de impuestos conciliadas sin asignar a una tarifa. El impuesto neto declarado se conserva; revisa la observación fiscal para tus reportes.</span></div>}
      {conBaseAmbigua>0&&<div className="qa-precision-note" role="note"><Icon name="alert"/><span>{conBaseAmbigua} XML incluyen varias tarifas IVA en una línea sin desglose de base por tarifa. La base se conserva por separado y NO se duplica entre tarifas.</span></div>}
      <div className="qa-review-tools" role="group" aria-label="Filtrar XML según su revisión">
        <span className="qa-review-title">Mostrar documentos:</span>
        {[['todos','Todos',filas.length],['listos','Listos',listos.length],['revisar','Por revisar',porRevisar],['errores','Con errores',errores],...(duplicados?[['duplicados','Duplicados en lote',duplicados]]:[])].map(([clave,etiqueta,cantidad])=><button key={clave} type="button" className={`qa-review-filter ${filtro===clave?'qa-review-filter-active':''} ${clave==='revisar'||clave==='errores'?'qa-review-filter-warning':''}`} aria-pressed={filtro===clave} onClick={()=>cambiarFiltro(clave)} disabled={cargando}>
          {etiqueta} <strong>{cantidad}</strong>
        </button>)}
        <span className="qa-review-help">Los XML por revisar se dejan desmarcados hasta que los autorices.</span>
      </div>
      {filasFiltradas.length>limiteVisibles&&<p className="texto-secundario" role="status">Mostrando {limiteVisibles} de {filasFiltradas.length} comprobantes de esta vista. La asignación y confirmación incluyen todos los marcados, aunque no se vean en pantalla.</p>}
      <div className="qa-table-scroll" ref={tablaRef}><table className="qa-table"><thead><tr>
        <th><input type="checkbox" aria-label="Marcar todos los XML listos" disabled={cargando||!listos.length} checked={Boolean(listos.length)&&listos.every(f=>!excluidos[f.indice])} onChange={e=>marcarTodos(e.target.checked)}/></th>
        <th>XML / tipo</th><th>Importe</th><th>Empresa destino</th><th>Revisión</th></tr></thead>
      <tbody>{filasFiltradas.slice(0,limiteVisibles).map(f=>{
        const activo=!excluidos[f.indice];
        const elegido=perfiles.find(p=>String(p.id)===String(selecciones[f.indice]));
        const incompatible=activo&&Boolean(elegido)&&!empresaCompatible(f,elegido);
        return <tr key={f.indice} className={incompatible?'qa-incompatible':''}>
          <td><input aria-label={`Incluir ${f.archivo}`} type="checkbox" disabled={cargando||['error','duplicado_en_lote'].includes(f.estado)} checked={activo} onChange={e=>setExcluidos(v=>({...v,[f.indice]:!e.target.checked}))}/></td>
          <td><strong title={f.archivo}>{f.archivo}</strong><small>{f.tipo||'No procesado'} · {f.fecha?.slice(0,10)||'—'}</small><small className="qa-code" title={f.clave}>{f.clave||''}</small></td>
          <td><strong>{f.total==null?'—':crc(f.total)}</strong><small>{f.moneda||''}</small></td>
          <td><SelectElegante aria-label={`Empresa destino para ${f.archivo}`} value={selecciones[f.indice]||''} disabled={cargando||f.estado==='error'||f.estado==='duplicado_en_lote'} onChange={e=>setSelecciones(v=>({...v,[f.indice]:e.target.value}))}><option value="">Selecciona empresa</option>{perfiles.map(p=><option key={p.id} value={p.id}>{p.nombre}{f.empresasCompatibles?.includes(p.id)?' ✓':''}</option>)}</SelectElegante>
            {incompatible&&<small className="qa-inline-error">La cédula de esta empresa no coincide con el emisor ni el receptor.</small>}
          </td>
          <td><span className={`qa-status ${esListo(f)?'qa-ok':'qa-warning'}`}>{esListo(f)?'Detectado':esErrorDeLectura(f)?'Error':esDuplicadoEnLote(f)?'Duplicado en lote':'Revisar empresa'}</span>
            {f.error&&<small className="qa-inline-error">{f.error}</small>}{f.existentes?.length>0&&<small>Existe en: {f.existentes.map(e=>e.empresa).join(', ')}</small>}
            {f.advertencia&&<small>{f.advertencia}</small>}{f.advertenciaFiscal&&<small className="qa-fiscal-warning">Observación fiscal: {f.advertenciaFiscal}</small>}
          </td>
        </tr>;
      })}{filasFiltradas.length===0&&<tr><td className="qa-review-empty" colSpan="5">No hay comprobantes en la categoría «{filtro==='revisar'?'Por revisar':filtro==='errores'?'Con errores':filtro==='listos'?'Listos':filtro==='duplicados'?'Duplicados en lote':'Todos'}».</td></tr>}</tbody></table></div>
      {filasFiltradas.length>limiteVisibles&&<button type="button" className="btn btn-light" disabled={cargando} onClick={()=>setLimiteVisibles(n=>Math.min(n+200,filasFiltradas.length))}>Mostrar más comprobantes ({filasFiltradas.length-limiteVisibles} pendientes de visualizar)</button>}
      <p className="texto-secundario">Se importarán {validos.length} XML. Los documentos sin marcar o con errores no se incluyen; los duplicados en la empresa elegida se omiten. Se registrará el lote para poder deshacerlo.</p>
    </div>
    <div className="modal-footer"><button type="button" className="btn btn-light" onClick={onCerrar} disabled={cargando}>Cancelar</button><button type="button" className="btn btn-primary" disabled={cargando||validos.length===0||pendientes!==0} onClick={confirmar}><Icon name="check"/> {cargando?'Guardando…':`Confirmar ${validos.length} XML`}</button></div>
  </section></div>;
}
