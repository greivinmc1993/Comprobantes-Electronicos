// Preflight de la ABI de better-sqlite3 para el proceso Node.js del runner.
// No abre archivos ni toca bases de datos comerciales: solo usa memoria.
'use strict';
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const db = new Database(':memory:');
try {
  const result = db.prepare('SELECT 1 AS ok').get();
  assert.equal(result.ok, 1);
  console.log(`PASS better-sqlite3 cargado en Node.js ${process.version} (ABI ${process.versions.modules})`);
} finally {
  db.close();
}
