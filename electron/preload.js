'use strict';
const {contextBridge, ipcRenderer} = require('electron');
// Puente de permisos mínimos entre React y el proceso principal de Electron.
contextBridge.exposeInMainWorld('comprobantesDesktop',Object.freeze({
  consultarTipoCambio:(forzar=false)=>ipcRenderer.invoke('comprobanteselectronicoscr:tipo-cambio',forzar),
  recalcularUSD:(confirmacion)=>ipcRenderer.invoke('comprobanteselectronicoscr:recalcular-usd',confirmacion),
  repararIVA:(confirmacion)=>ipcRenderer.invoke('comprobanteselectronicoscr:reparar-iva',confirmacion),
  listarPerfiles:()=>ipcRenderer.invoke('comprobanteselectronicoscr:perfiles'),
  crearPerfil:datos=>ipcRenderer.invoke('comprobanteselectronicoscr:crear-perfil',datos),
  actualizarPerfil:(id,datos)=>ipcRenderer.invoke('comprobanteselectronicoscr:editar-perfil',id,datos),
  eliminarPerfil:(id,confirmacion)=>ipcRenderer.invoke('comprobanteselectronicoscr:eliminar-perfil',id,confirmacion),
  listar:perfilId=>ipcRenderer.invoke('comprobanteselectronicoscr:listar',perfilId),
  importar:(perfilId,archivos)=>ipcRenderer.invoke('comprobanteselectronicoscr:importar',perfilId,archivos),
  eliminar:(perfilId,id)=>ipcRenderer.invoke('comprobanteselectronicoscr:eliminar',perfilId,id),
  moverDocumento:(desdeId,id,destinoId)=>ipcRenderer.invoke('comprobanteselectronicoscr:mover',desdeId,id,destinoId),
  respaldar:()=>ipcRenderer.invoke('comprobanteselectronicoscr:respaldo'),
  estadoRespaldos:()=>ipcRenderer.invoke('comprobanteselectronicoscr:respaldos-estado'),
  configurarRespaldos:datos=>ipcRenderer.invoke('comprobanteselectronicoscr:respaldos-configurar',datos),
  seleccionarCarpetaRespaldos:()=>ipcRenderer.invoke('comprobanteselectronicoscr:respaldos-carpeta'),
  crearRespaldo:()=>ipcRenderer.invoke('comprobanteselectronicoscr:respaldos-crear'),
  abrirCarpetaRespaldos:()=>ipcRenderer.invoke('comprobanteselectronicoscr:respaldos-abrir-carpeta'),
}));
