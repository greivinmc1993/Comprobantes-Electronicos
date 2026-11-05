/** Funciones puras para preparar datos de exportación (probables sin navegador). */
export const csvMonto = value => {
  const n = Number(value);
  return (Number.isFinite(n) ? n : 0).toFixed(2).replace('.', ',');
};
export const csvTasa = value => {
  const n = Number(value);
  return (Number.isFinite(n) ? n : 0).toFixed(5).replace('.', ',');
};
export function escaparCSV(value) {
  let texto = String(value ?? '');
  // Evita que Excel/Calc ejecuten texto como fórmula. Los importes se producen
  // mediante csvMonto/csvTasa, no deben entregarse a través de texto libre.
  if (/^[\s\r\n]*[=+\-@\t]/.test(texto) && !/^-\d+(?:,\d+)?$/.test(texto)) texto = `'${texto}`;
  return `"${texto.replace(/"/g, '""')}"`;
}
export function construirCSV(encabezados, filas) {
  if (!Array.isArray(encabezados) || !Array.isArray(filas)) throw new TypeError('Filas CSV inválidas');
  return [encabezados, ...filas].map(fila => fila.map(escaparCSV).join(';')).join('\r\n');
}
