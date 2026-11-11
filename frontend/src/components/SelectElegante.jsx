import React, {useEffect,useMemo,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import Icon from './Icon';

/**
 * Selector coherente con la aplicación. Mantiene un <select> REAL, visible y
 * controlado: los lectores de pantalla y Playwright (selectOption) pueden usarlo.
 * Para interacciones humanas interceptamos la apertura nativa y dibujamos un
 * listado en portal, evitando los menús blancos del sistema y los recortes de modal.
 */
export default function SelectElegante({children,value,onChange,disabled=false,className='',style={},...props}) {
  const raiz=useRef(null);
  const nativo=useRef(null);
  const menu=useRef(null);
  const [abierto,setAbierto]=useState(false);
  const [filtro,setFiltro]=useState('');
  const [actual,setActual]=useState(0);
  const [posicion,setPosicion]=useState(null);
  const [etiquetaLocal,setEtiquetaLocal]=useState('');
  const opciones=useMemo(()=>React.Children.toArray(children).filter(x=>React.isValidElement(x)&&x.type==='option').map(x=>({
    valor:String(x.props.value===undefined ? x.props.children : x.props.value),
    etiqueta:String(x.props.children??''),
    deshabilitado:Boolean(x.props.disabled)
  })),[children]);
  const seleccionado=opciones.findIndex(o=>o.valor===String(value??''));
  const visibles=opciones.filter(o=>o.etiqueta.toLocaleLowerCase('es').includes(filtro.toLocaleLowerCase('es')));
  const nombre=props['aria-label']||etiquetaLocal||'Seleccionar opción';
  const elegir=op=>{
    if(op.deshabilitado)return;
    onChange?.({target:{value:op.valor},currentTarget:{value:op.valor}});
    setAbierto(false);setFiltro('');
    nativo.current?.focus({preventScroll:true});
  };
  const abrir=()=>{
    if(disabled || !nativo.current)return;
    if(abierto){setAbierto(false);return;}
    setEtiquetaLocal(nativo.current.closest('label')?.querySelector(':scope > span')?.textContent?.trim()||'');
    const rect=nativo.current.getBoundingClientRect();
    const alto=Math.min(325,window.innerHeight-32);
    const arriba=window.innerHeight-rect.bottom<Math.min(240,alto) && rect.top>window.innerHeight-rect.bottom;
    const ancho=Math.min(Math.max(220,rect.width),window.innerWidth-24);
    setPosicion({left:Math.max(12,Math.min(rect.left,window.innerWidth-ancho-12)),width:ancho,
      top:arriba?undefined:Math.max(12,rect.bottom+5),bottom:arriba?Math.max(12,window.innerHeight-rect.top+5):undefined,
      maxHeight:Math.min(350,Math.max(120,arriba?rect.top-20:window.innerHeight-rect.bottom-20))});
    setActual(Math.max(0,seleccionado));setFiltro('');setAbierto(true);
  };
  useEffect(()=>{
    if(!abierto)return undefined;
    const fuera=e=>{if(!raiz.current?.contains(e.target)&&!menu.current?.contains(e.target))setAbierto(false);};
    const cerrar=()=>setAbierto(false);
    const esc=e=>{if(e.key==='Escape'){e.preventDefault();cerrar();nativo.current?.focus({preventScroll:true});}};
    document.addEventListener('pointerdown',fuera);
    document.addEventListener('keydown',esc);
    window.addEventListener('resize',cerrar);
    window.addEventListener('scroll',cerrar,true);
    return()=>{document.removeEventListener('pointerdown',fuera);document.removeEventListener('keydown',esc);window.removeEventListener('resize',cerrar);window.removeEventListener('scroll',cerrar,true);};
  },[abierto]);
  useEffect(()=>{if(abierto)menu.current?.focus({preventScroll:true});},[abierto]);
  useEffect(()=>setAbierto(false),[value,disabled]);
  const manejarTecla=e=>{
    if(!abierto){
      if(['ArrowDown','ArrowUp','Enter',' '].includes(e.key)){e.preventDefault();abrir();}
      return;
    }
    if(e.key==='ArrowDown'||e.key==='ArrowUp'){
      e.preventDefault();setActual(i=>Math.max(0,Math.min(visibles.length-1,i+(e.key==='ArrowDown'?1:-1))));
    }
    if(e.key==='Home'){e.preventDefault();setActual(0);}
    if(e.key==='End'){e.preventDefault();setActual(Math.max(0,visibles.length-1));}
    if(e.key==='Enter' && visibles[actual]){e.preventDefault();elegir(visibles[actual]);}
  };
  return <div className={`select-elegante ${abierto?'esta-abierto':''} ${className}`} ref={raiz} style={style}>
    <select {...props} ref={nativo} value={value} disabled={disabled} onChange={onChange}
      aria-expanded={abierto} aria-haspopup="listbox" onPointerDown={e=>{
        // No bloquear eventos sintéticos de automatización. Los clics humanos
        // usan el menú visual sin abrir el widget nativo del sistema.
        if(e.isPrimary && e.button===0){e.preventDefault();abrir();}
      }} onKeyDown={manejarTecla}>
      {children}
    </select>
    <span className="select-elegante-flecha" aria-hidden="true"><Icon name="chevron" size={15}/></span>
    {abierto&&posicion&&createPortal(<div className="select-elegante-lista" ref={menu} tabIndex={-1}
      role="listbox" aria-label={nombre} onKeyDown={manejarTecla}
      style={{position:'fixed',zIndex:130,...posicion}}>
      <div className="select-elegante-cabecera"><span>{nombre}</span><small>{opciones.length} opciones</small></div>
      {opciones.length>=9&&<div className="select-elegante-busqueda"><Icon name="search" size={15}/><input
        aria-label={`Buscar en ${nombre}`} value={filtro} placeholder="Buscar opción…"
        onChange={e=>{setFiltro(e.target.value);setActual(0);}}/></div>}
      <div className="select-elegante-opciones">
        {visibles.map((op,i)=><button key={`${op.valor}-${i}`} role="option" aria-selected={op.valor===String(value??'')}
          type="button" disabled={op.deshabilitado} className={`select-elegante-opcion ${i===actual?'activa':''}`}
          onMouseMove={()=>setActual(i)} onClick={()=>elegir(op)}>
          <span>{op.etiqueta}</span>{op.valor===String(value??'')&&<Icon name="check" size={16}/>}</button>)}
        {!visibles.length&&<div className="select-elegante-sin-opciones">No se encontraron opciones.</div>}
      </div>
      <div className="select-elegante-ayuda">Usa ↑ ↓ y Enter para seleccionar · Esc para cerrar</div>
    </div>,document.body)}
  </div>;
}
