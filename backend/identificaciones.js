'use strict';
function normalizarIdentificacion(value){return String(value||'').replace(/[^\dA-Za-z]/g,'').toUpperCase();}
module.exports={normalizarIdentificacion};
