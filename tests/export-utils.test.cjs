'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const file = path.resolve(__dirname, '../frontend/src/export-utils.mjs');
const load = () => import(`file://${file}`);

test('CSV: separador Excel español, CRLF, comillas, acentos y montos negativos', async () => {
  const {construirCSV,csvMonto,csvTasa} = await load();
  const csv = construirCSV(['Nombre','Monto','Tipo de cambio'], [['Comercio; "San José"',csvMonto(-145.5),csvTasa(455.53)]]);
  assert.equal(csv, '"Nombre";"Monto";"Tipo de cambio"\r\n"Comercio; ""San José""";"-145,50";"455,53000"');
});
test('CSV: neutraliza posibles fórmulas de hoja de cálculo', async () => {
  const {escaparCSV} = await load();
  for (const valor of ['=2+2','+SUM(A1:A2)','@SUM(A1)','-cmd','\t=IMPORTXML("x")',' \r=HYPERLINK("x")']) {
    assert.ok(escaparCSV(valor).startsWith('"\''), `No protegido: ${JSON.stringify(valor)}`);
  }
  assert.equal(escaparCSV('empresa normal'),'"empresa normal"');
  assert.equal(escaparCSV('-155,25'),'"-155,25"');
});
test('CSV: valores no finitos no contaminan los reportes', async () => {
  const {csvMonto,csvTasa} = await load();
  assert.equal(csvMonto(Infinity),'0,00');
  assert.equal(csvTasa(NaN),'0,00000');
});
