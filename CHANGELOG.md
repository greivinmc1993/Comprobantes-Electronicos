# Historial de cambios — ComprobantesElectronicosCR

## 1.4.4 — Gastos administrativos

- Marca por documento en SQLite y reporte separado de gasto sin IVA, base gravada para IVA e IVA real, sin alterar el XML.
- Campo manual opcional para documentos con total cero, claramente separado del importe fiscal original.
- Exportaciones PDF, CSV y Excel; filtros por empresa y período.
- Clasificación conservada en Papelera, restauración y copias SQLite; auditoría de cambios.
- Nuevas pruebas unitarias, integración nativa SQLite (CI) y Playwright.

## 1.4.3 — QA multiplataforma (GitHub Actions)

- **Linux / API:** la prueba de borrado de una nota de crédito desde una empresa ajena ahora comprueba el rechazo HTTP 400, el mensaje de error y que no se alteran los datos de ninguna de las dos empresas.
- **Windows / Node ESM:** las pruebas de asignación masiva importan el módulo mediante `pathToFileURL()` para aceptar rutas con unidades (`C:\\`, `D:\\`).
- **Playwright:** el selector del encabezado de Bitácora utiliza `level: 1` para no confundirse con el `h2` de la tarjeta interior.
- **Regresión:** pruebas automáticas de las tres correcciones y de que GitHub Actions mantiene pruebas reales en Windows, Linux y Chromium.
- No se alteran los comprobantes, las migraciones SQLite, ni el identificador de instalación `cr.comprobanteselectronicoscr.desktop`.


## v1.4.2 — Corrección de bases multitarifa y GitHub Actions

- Evitar atribuir la misma base imponible a múltiples tarifas IVA de una línea sin desglose; registrar base sin tarifa individual identificada.
- Conservar el impuesto neto declarado, el signo de notas de crédito y la distribución explícita de surtidos.
- Advertencia en vista previa y reportes PDF, CSV y Excel.
- Pruebas sintéticas de IVA, XML real con xml2js, scripts QA y Playwright; nunca se adjuntan XML de clientes.
- GitHub Actions valida limpieza del repositorio y ya no oculta auditorías de seguridad altas o críticas.


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
