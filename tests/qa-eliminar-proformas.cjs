'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');const server=fs.readFileSync(path.join(root,'server/index.js'),'utf8');const view=fs.readFileSync(path.join(root,'src/QuotesPanel.jsx'),'utf8');
assert.match(server,/app\.delete\('\/api\/companies\/:companyId\/quotations\/:quoteId'/);
assert.match(server,/SELECT id FROM quotations WHERE id=\? AND company_id=\?/);
assert.match(server,/DELETE FROM quotation_lines WHERE quotation_id=\?/);
assert.match(server,/DELETE FROM quotations WHERE id=\? AND company_id=\?/);
assert.match(view,/Eliminar proforma/);assert.match(view,/role="alertdialog"/);assert.match(view,/disabled=\{deleting\}/);assert.match(view,/method:'DELETE'/);
console.log('PASS Eliminar proforma: endpoint, empresa, líneas, confirmación y bloqueo');
