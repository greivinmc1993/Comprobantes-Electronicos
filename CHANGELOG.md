## 1.4.15 — Revisión rápida de importaciones

- Filtros de resultados por estado: todos, listos, por revisar, errores y duplicados del lote.
- Acceso directo desde contadores de XML pendientes/con errores; filtrado antes del límite de 200 filas visibles.
- XML que requieren revisión desmarcados al abrir; la selección global solo incluye los listos.
- Selección manual y asignación de empresa disponibles para cada XML pendiente, sin aprobarlo automáticamente.
- Pruebas unitarias y escenarios de Playwright para los nuevos controles. Sin cambios en SQLite o impuestos.

# Historial de cambios — ComprobantesElectronicosCR

## 1.4.14 — Espaciado de Gastos administrativos
- Se agrega relleno interior a los títulos y contenidos de las secciones «Clasificar gastos por comercio» y «Reporte de gastos administrativos».
- Mejora de márgenes en avisos, exportaciones y estados vacíos; ajustes responsive para móvil.
- Sin cambios en SQLite, impuestos, informes, importación, instalador o lógica fiscal.
- Regresiones QA de espaciado en CSS y prueba visual Playwright.

## 1.4.13 — Una revisión para todos los XML, manteniendo la validación anterior

- Base funcional: v1.4.11. **Se revierten los cambios de la v1.4.12 relacionados con la omisión parcial automática y los nuevos estados de duplicados.**
- Única mejora funcional: más de diez comprobantes pueden revisarse y guardarse en un solo lote (máximo 2.000, 256 MB), con renderizado progresivo de filas.
- Se conserva la identificación de duplicados, la validación de empresa y las reglas de confirmación originales.
- Pruebas QA y GitHub Actions conservados; pruebas nuevas para límites y regresión del comportamiento de revisión.

## 1.4.11 — Accesibilidad de confirmaciones y QA E2E

- Diferenciados los nombres accesibles de los botones «Cancelar» y «Cerrar diálogo de confirmación» para evitar coincidencias ambiguas en Playwright.
- Localizadores E2E de cancelación con `exact:true` y nueva regresión que prueba X y Escape en escritorio y móvil, verificando que no se realizan cambios.
- Se conserva íntegra la lógica de confirmación y el control de SQLite, IVA, respaldos y perfiles.
- La compilación y Playwright completos se validarán en GitHub Actions; la entrega no afirma resultados E2E sin ejecutarlos.

## 1.4.10 — Desplegables con desplazamiento estable

- Corregido el menú que se cerraba al usar rueda de mouse, trackpad o desplazamiento táctil dentro de la lista de opciones.
- Se distingue el scroll interno del desplazamiento externo; se conserva el cierre al pulsar Escape, seleccionar una opción o hacer clic fuera.
- La navegación con flechas mantiene visible la opción activa sin desplazar la página.
- Pruebas unitarias de lógica del scroll y prueba Playwright sobre el filtro de tipo de comprobante para escritorio y móvil, incluidas en GitHub Actions.
- Se preservan los datos SQLite, la identidad NSIS y todas las funciones existentes.

## 1.4.9 — Interfaz coherente y numeración automática

- Todos los selectores HTML principales usan un mismo desplegable visual, con búsqueda y navegación por teclado; mantiene el `<select>` real para accesibilidad y QA.
- Sustituidas las confirmaciones `window.confirm` por un diálogo seguro y consistente.
- Versión del menú lateral vinculada automáticamente a `package.json` mediante Vite.
- Pruebas nuevas de regresión de configuración, accesibilidad y estilos.

## 1.4.8 — Gastos administrativos por comercio

- Selección de un comercio por cédula fiscal del emisor, con nombre normalizado solo cuando la cédula falta.
- Resumen de documentos totales, clasificados y pendientes en la empresa activa.
- Clasificación masiva reversible para todos los documentos activos del emisor (incluye notas de crédito) con confirmación explícita y respaldo SQLite previo.
- Operación transaccional con control de cantidad esperada, bitácora y aislamiento entre empresas; conserva importes manuales ya registrados al marcar.
- Si un perfil tiene cédula registrada, se excluyen sus propias ventas de la clasificación masiva de gastos.
- No cambia los XML, el IVA ni los reportes generales; los documentos con total fiscal cero siguen requiriendo revisión de un importe manual.
- Pruebas QA automatizadas para agrupación, clasificación, duplicidad de nombres, permisos, transacciones, preservación de importes y registro de auditoría.

## 1.4.7 — Pruebas E2E de gastos y cupones reproducibles

- Preparar los escenarios de XML total cero y cupón en la inicialización de Playwright, antes del montaje de React.
- Evitar carreras del test que alternaba perfiles para actualizar la API simulada.
- Verificar confirmación explícita y efectos sobre gasto, total fiscal e IVA con datos sintéticos.
- Conservar componentes, SQLite, Electron y NSIS sin cambios funcionales.


## 1.4.6 — Comprobantes con cupón y total fiscal cero

- Mostrar pago con cupón y mercancías no sujetas cuando el XML declara descuento total.
- Sugerir el monto documental del cupón como referencia, sin sumarlo al gasto ni al IVA automáticamente.
- Botón de confirmación para registrar importe manual del cupón como gasto administrativo.
- Reportes CSV y Excel separan la referencia de cupón de los importes contables efectivamente registrados.
- QA sintético para cupones, sin incluir XML reales de clientes.


## 1.4.5 — Navegación accesible y E2E de gastos administrativos

- Nombre accesible estable para «Comprobantes» pese a su contador visual; estado de navegación expuesto con `aria-current`.
- Pruebas Playwright localizan botones en el menú «Secciones» y verifican los encabezados antes de continuar.
- Test E2E adicional y tres pruebas de regresión sin dependencias externas.
- Sin migraciones SQLite ni cambios en identidad NSIS; conserva la clasificación administrativa y los reportes.

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
