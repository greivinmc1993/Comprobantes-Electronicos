import React,{useEffect,useState} from 'react';
import Icon from './Icon';
import {crc} from '../reportes';
export default function VistaPrevia({vista,perfiles,onCerrar,onConfirmar,cargando}){
 const [selecciones,setSelecciones]=useState({});
 const [excluidos,setExcluidos]=useState({});
 useEffect(()=>{
   setSelecciones(Object.fromEntries((vista?.filas||[]).map(f=>[f.indice,String(f.empresaSugerida||'')])));
   setExcluidos(Object.fromEntries((vista?.filas||[]).filter(f=>['error','duplicado_en_lote'].includes(f.estado)).map(f=>[f.indice,true])));
 },[vista?.token]);
 if(!vista)return null;
 const elegidos=vista.filas.filter(f=>!excluidos[f.indice]&&f.estado!=='error');
 const validos=elegidos.filter(f=>Number(selecciones[f.indice])>0 && f.estado!=='duplicado_en_lote');
 return <div className="overlay modal-overlay" role="presentation"><section className="company-modal qa-preview" role="dialog" aria-modal="true" aria-label="Vista previa de importación XML">
  <div className="modal-head"><div><div className="eyebrow">IMPORTACIÓN INTELIGENTE · XML 4.4</div><h2>Revisa antes de guardar</h2><p>Confirma la empresa correcta para cada comprobante. Ninguno se ha guardado todavía.</p></div><button type="button" className="icon-button" disabled={cargando} onClick={onCerrar} aria-label="Cerrar vista previa"><Icon name="close"/></button></div>
  <div className="modal-body"><div className="info-note"><Icon name="shield"/><span>Los documentos con cédula coincidente se sugieren automáticamente. Si no hay coincidencia, debes seleccionar la empresa manualmente; se validará nuevamente al guardar. Los duplicados se omiten.</span></div>
  <div className="qa-table-scroll"><table className="qa-table"><thead><tr><th>Incluir</th><th>XML / tipo</th><th>Importe</th><th>Empresa destino</th><th>Revisión</th></tr></thead><tbody>{vista.filas.map(f=><tr key={f.indice}>
   <td><input aria-label={`Incluir ${f.archivo}`} type="checkbox" disabled={cargando||f.estado==='error'||f.estado==='duplicado_en_lote'} checked={!excluidos[f.indice]} onChange={e=>setExcluidos(v=>({...v,[f.indice]:!e.target.checked}))}/></td>
   <td><strong title={f.archivo}>{f.archivo}</strong><small>{f.tipo||'No procesado'} · {f.fecha?.slice(0,10)||'—'}</small><small className="qa-code" title={f.clave}>{f.clave||''}</small></td>
   <td><strong>{f.total==null?'—':crc(f.total)}</strong><small>{f.moneda||''}</small></td>
   <td><select aria-label={`Empresa destino para ${f.archivo}`} value={selecciones[f.indice]||''} disabled={cargando||Boolean(excluidos[f.indice])} onChange={e=>setSelecciones(v=>({...v,[f.indice]:e.target.value}))}><option value="">Selecciona empresa</option>{perfiles.map(p=><option key={p.id} value={p.id}>{p.nombre}{f.empresasCompatibles?.includes(p.id)?' ✓':''}</option>)}</select></td>
   <td><span className={`qa-status ${f.estado==='listo'?'qa-ok':'qa-warning'}`}>{f.estado==='listo'?'Detectado':f.estado==='error'?'Error':f.estado==='duplicado_en_lote'?'Duplicado en lote':'Revisar empresa'}</span>{f.error&&<small>{f.error}</small>}{f.existentes?.length>0&&<small>Existe en: {f.existentes.map(e=>e.empresa).join(', ')}</small>}{f.advertencia&&<small>{f.advertencia}</small>}</td>
 </tr>)}</tbody></table></div>
 <p className="texto-secundario">Se importarán {validos.length} archivo(s). Los duplicados existentes en la empresa elegida se omitirán; se registrará un lote para poder deshacerlo.</p>
 </div><div className="modal-footer"><button type="button" className="btn btn-light" onClick={onCerrar} disabled={cargando}>Cancelar</button><button type="button" className="btn btn-primary" disabled={cargando||validos.length===0||elegidos.length!==validos.length} onClick={()=>onConfirmar(validos.map(f=>({indice:f.indice,perfilId:Number(selecciones[f.indice])})))}><Icon name="check"/> {cargando?'Guardando…':`Confirmar ${validos.length} XML`}</button></div>
 </section></div>;
}
