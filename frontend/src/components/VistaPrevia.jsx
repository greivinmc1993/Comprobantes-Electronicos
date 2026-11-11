import React,{useEffect,useState} from 'react';
import Icon from './Icon';
import SelectElegante from './SelectElegante';
import {crc} from '../reportes';
import {asignarEmpresaMasiva,empresaCompatible} from './asignacion-masiva.mjs';

export default function VistaPrevia({vista,perfiles,onCerrar,onConfirmar,cargando}) {
  const [selecciones,setSelecciones]=useState({});
  const [excluidos,setExcluidos]=useState({});
  const [empresaMasiva,setEmpresaMasiva]=useState('');
  const [avisoMasivo,setAvisoMasivo]=useState('');
  const [limiteVisibles,setLimiteVisibles]=useState(200);
  useEffect(()=>{
    setSelecciones(Object.fromEntries((vista?.filas||[]).map(f=>[f.indice,String(f.empresaSugerida||'')])));
    setExcluidos(Object.fromEntries((vista?.filas||[]).filter(f=>['error','duplicado_en_lote'].includes(f.estado)).map(f=>[f.indice,true])));
    setEmpresaMasiva('');setAvisoMasivo('');setLimiteVisibles(200);
  },[vista?.token]);
  const filas=vista?.filas||[];
  const aplicables=filas.filter(f=>!['error','duplicado_en_lote'].includes(f.estado));
  const elegidos=aplicables.filter(f=>!excluidos[f.indice]);
  const validos=elegidos.filter(f=>{
    const perfil=perfiles.find(p=>String(p.id)===String(selecciones[f.indice]));
    return empresaCompatible(f,perfil);
  });
  const pendientes=elegidos.length-validos.length;
  const errores=filas.filter(f=>f.estado==='error').length;
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
  const marcarTodos=(checked)=>setExcluidos(prev=>{
    const siguiente={...prev};for(const f of aplicables)siguiente[f.indice]=!checked;return siguiente;
  });
  const confirmar=()=>onConfirmar(validos.map(f=>({indice:f.indice,perfilId:Number(selecciones[f.indice])})));
  return <div className="overlay modal-overlay" role="presentation"><section className="company-modal qa-preview" role="dialog" aria-modal="true" aria-label="Vista previa de importación XML">
    <div className="modal-head"><div><div className="eyebrow">IMPORTACIÓN INTELIGENTE · XML 4.4</div><h2>Revisa antes de guardar</h2><p>Asigna una empresa a varios XML a la vez. No se guardará nada hasta confirmar.</p></div><button type="button" className="icon-button" disabled={cargando} onClick={onCerrar} aria-label="Cerrar vista previa"><Icon name="close"/></button></div>
    <div className="modal-body qa-preview-body">
      <div className="info-note"><Icon name="shield"/><span>Los documentos con cédula coincidente se asignan automáticamente. La asignación masiva no cambia XML con cédulas incompatibles. Antes de guardar, revisa la empresa elegida.</span></div>
      <div className="qa-summary" aria-live="polite">
        <span><strong>{filas.length}</strong> examinados</span><span><strong>{elegidos.length}</strong> seleccionados</span>
        <span><strong>{validos.length}</strong> listos</span><span className={pendientes?'qa-summary-warning':''}><strong>{pendientes}</strong> por asignar o revisar</span>
        {errores>0&&<span className="qa-summary-warning"><strong>{errores}</strong> con error de lectura</span>}
      </div>
      <div className="qa-bulk-toolbar">
        <label className="qa-bulk-field"><span>Empresa para los XML marcados</span>
          <SelectElegante aria-label="Empresa para asignación masiva" value={empresaMasiva} onChange={e=>{setEmpresaMasiva(e.target.value);setAvisoMasivo('');}} disabled={cargando}>
            <option value="">Seleccionar empresa…</option>{perfiles.map(p=><option key={p.id} value={p.id}>{p.nombre}{p.cedula?' · '+p.cedula:' · sin cédula'}</option>)}
          </SelectElegante>
        </label>
        <button type="button" className="btn btn-primary" onClick={asignarTodos} disabled={cargando||!empresaMasiva||!elegidos.length}><Icon name="building"/> Asignar a {elegidos.length} XML</button>
        <button type="button" className="btn btn-light" disabled={cargando||!aplicables.length} onClick={()=>marcarTodos(true)}>Marcar todos</button>
        <button type="button" className="btn btn-light" disabled={cargando||!elegidos.length} onClick={()=>marcarTodos(false)}>Desmarcar</button>
      </div>
      {avisoMasivo&&<p className="qa-bulk-notice" role="status">{avisoMasivo}</p>}
      {conAjuste>0&&<div className="qa-precision-note" role="note"><Icon name="alert"/><span>{conAjuste} XML tienen diferencias de impuestos conciliadas sin asignar a una tarifa. El impuesto neto declarado se conserva; revisa la observación fiscal para tus reportes.</span></div>}
      {conBaseAmbigua>0&&<div className="qa-precision-note" role="note"><Icon name="alert"/><span>{conBaseAmbigua} XML incluyen varias tarifas IVA en una línea sin desglose de base por tarifa. La base se conserva por separado y NO se duplica entre tarifas.</span></div>}
      {filas.length>limiteVisibles&&<p className="texto-secundario" role="status">Mostrando {limiteVisibles} de {filas.length} comprobantes. La asignación y confirmación afectan a todos los seleccionados.</p>}
      <div className="qa-table-scroll"><table className="qa-table"><thead><tr>
        <th><input type="checkbox" aria-label="Seleccionar todos los XML válidos" disabled={cargando||!aplicables.length} checked={Boolean(aplicables.length)&&aplicables.every(f=>!excluidos[f.indice])} onChange={e=>marcarTodos(e.target.checked)}/></th>
        <th>XML / tipo</th><th>Importe</th><th>Empresa destino</th><th>Revisión</th></tr></thead>
      <tbody>{filas.slice(0,limiteVisibles).map(f=>{
        const activo=!excluidos[f.indice];
        const elegido=perfiles.find(p=>String(p.id)===String(selecciones[f.indice]));
        const incompatible=activo&&Boolean(elegido)&&!empresaCompatible(f,elegido);
        return <tr key={f.indice} className={incompatible?'qa-incompatible':''}>
          <td><input aria-label={`Incluir ${f.archivo}`} type="checkbox" disabled={cargando||['error','duplicado_en_lote'].includes(f.estado)} checked={activo} onChange={e=>setExcluidos(v=>({...v,[f.indice]:!e.target.checked}))}/></td>
          <td><strong title={f.archivo}>{f.archivo}</strong><small>{f.tipo||'No procesado'} · {f.fecha?.slice(0,10)||'—'}</small><small className="qa-code" title={f.clave}>{f.clave||''}</small></td>
          <td><strong>{f.total==null?'—':crc(f.total)}</strong><small>{f.moneda||''}</small></td>
          <td><SelectElegante aria-label={`Empresa destino para ${f.archivo}`} value={selecciones[f.indice]||''} disabled={cargando||Boolean(excluidos[f.indice])||f.estado==='error'} onChange={e=>setSelecciones(v=>({...v,[f.indice]:e.target.value}))}><option value="">Selecciona empresa</option>{perfiles.map(p=><option key={p.id} value={p.id}>{p.nombre}{f.empresasCompatibles?.includes(p.id)?' ✓':''}</option>)}</SelectElegante>
            {incompatible&&<small className="qa-inline-error">La cédula de esta empresa no coincide con el emisor ni el receptor.</small>}
          </td>
          <td><span className={`qa-status ${f.estado==='listo'?'qa-ok':'qa-warning'}`}>{f.estado==='listo'?'Detectado':f.estado==='error'?'Error':f.estado==='duplicado_en_lote'?'Duplicado en lote':'Revisar empresa'}</span>
            {f.error&&<small className="qa-inline-error">{f.error}</small>}{f.existentes?.length>0&&<small>Existe en: {f.existentes.map(e=>e.empresa).join(', ')}</small>}
            {f.advertencia&&<small>{f.advertencia}</small>}{f.advertenciaFiscal&&<small className="qa-fiscal-warning">Observación fiscal: {f.advertenciaFiscal}</small>}
          </td>
        </tr>;
      })}</tbody></table></div>
      {filas.length>limiteVisibles&&<button type="button" className="btn btn-light" disabled={cargando} onClick={()=>setLimiteVisibles(n=>Math.min(n+200,filas.length))}>Mostrar más comprobantes ({filas.length-limiteVisibles} pendientes de visualizar)</button>}
      <p className="texto-secundario">Se importarán {validos.length} XML. Los documentos con errores no se incluyen; los duplicados en la empresa elegida se omiten. Se registrará el lote para poder deshacerlo.</p>
    </div>
    <div className="modal-footer"><button type="button" className="btn btn-light" onClick={onCerrar} disabled={cargando}>Cancelar</button><button type="button" className="btn btn-primary" disabled={cargando||validos.length===0||pendientes!==0} onClick={confirmar}><Icon name="check"/> {cargando?'Guardando…':`Confirmar ${validos.length} XML`}</button></div>
  </section></div>;
}
