import React,{useEffect,useRef} from 'react';
import Icon from './Icon';

/** Confirmación con el diseño del programa; nunca decide por el usuario. */
export default function ConfirmacionElegante({datos,onResponder}){
  const cancelar=useRef(null);
  const dialogo=useRef(null);
  useEffect(()=>{
    if(!datos)return undefined;
    const anterior=document.activeElement;
    cancelar.current?.focus({preventScroll:true});
    const tecla=e=>{
      if(e.key==='Escape'){e.preventDefault();onResponder(false);return;}
      if(e.key==='Tab' && dialogo.current){
        const botones=[...dialogo.current.querySelectorAll('button:not([disabled])')];
        if(!botones.length)return;
        const primero=botones[0],ultimo=botones[botones.length-1];
        if(e.shiftKey && document.activeElement===primero){e.preventDefault();ultimo.focus();}
        else if(!e.shiftKey && document.activeElement===ultimo){e.preventDefault();primero.focus();}
      }
    };
    document.addEventListener('keydown',tecla);
    return()=>{document.removeEventListener('keydown',tecla);anterior?.focus?.({preventScroll:true});};
  },[datos]);
  if(!datos)return null;
  return <div className="overlay modal-overlay confirmacion-fondo" role="presentation">
    <section className="company-modal confirmacion-elegante" ref={dialogo} role="alertdialog" aria-modal="true"
      aria-labelledby="titulo-confirmacion" aria-describedby="mensaje-confirmacion">
      <div className="modal-head"><div><div className="eyebrow">CONFIRMACIÓN SEGURA</div>
        <h2 id="titulo-confirmacion">{datos.titulo||'Confirmar operación'}</h2>
        <p>Revisa los detalles antes de continuar.</p></div>
        <button type="button" className="icon-button" aria-label="Cancelar operación" onClick={()=>onResponder(false)}><Icon name="close"/></button></div>
      <div className="modal-body"><div className="confirmacion-mensaje"><span className="confirmacion-icono"><Icon name="shield" size={23}/></span>
        <p id="mensaje-confirmacion">{datos.mensaje}</p></div>
        <div className="info-note"><Icon name="info" size={16}/><span>No se realizará ningún cambio hasta que lo confirmes.</span></div></div>
      <div className="modal-footer"><button type="button" ref={cancelar} className="btn btn-light" onClick={()=>onResponder(false)}>Cancelar</button>
        <button type="button" className={`btn ${datos.peligro?'btn-danger':'btn-primary'}`} onClick={()=>onResponder(true)}>
          <Icon name="check" size={17}/>{datos.accion||'Confirmar'}</button></div>
    </section>
  </div>;
}
