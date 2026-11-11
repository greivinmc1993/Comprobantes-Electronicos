'use strict';
// Límite por revisión, no un número de sublotes a confirmar.
// La memoria total del lote se acota para proteger a Electron/Windows.
const MAX_ARCHIVOS_XML = 2000;
const MAX_BYTES_XML = 15 * 1024 * 1024;
const MAX_BYTES_LOTE = 256 * 1024 * 1024;
module.exports = {MAX_ARCHIVOS_XML, MAX_BYTES_XML, MAX_BYTES_LOTE};
