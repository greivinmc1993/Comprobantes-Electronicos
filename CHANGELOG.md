# Historial de cambios — ComprobantesElectronicosCR

## v1.4.1 — Importación XML revisada

- Selección de empresa en lote desde la vista previa: aplicar a todos los XML marcados.
- Seleccionar/deseleccionar todos los XML procesables, contador de pendientes y validación de cédula por empresa.
- Conciliación restringida de `ImpuestoNeto` con varios impuestos: máximo ₡0,01 y confirmación con `MontoTotalLinea` y `SubTotal`.
- Diferencias no atribuibles a una tarifa quedan registradas separadamente como ajuste fiscal, sin imputarlas arbitrariamente al IVA.
- Observaciones fiscales visibles en la vista previa; nuevos tests QA de impuestos múltiples y selección masiva.
- Se mantienen XML originales, tipo de cambio almacenado, SQLite y `appId` independiente de FacturaCR.

## v1.4.0 — Gestión contable e importación inteligente

- Vista previa, lotes reversibles, compra/venta, notas relacionadas, respuestas Hacienda y bitácora.
- Restauración SQLite y vigilancia de carpetas con confirmación.

## v1.3.9 y anteriores

- Papelera y restauración; corrección XML 4.4, IVA exonerado, redondeos, consulta BCCR; perfiles independientes; respaldos, reportes, Electron + NSIS.
