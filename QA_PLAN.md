# Plan de QA — ComprobantesElectronicosCR v1.4.18

## Alcance y prioridades

Se diseñaron pruebas automatizadas de regresión para **XML, impuestos, moneda, perfiles, SQLite, API, copias, reportes, seguridad, período del panel, Electron y compilación**. Las verificaciones de interfaz se ejecutan con Playwright y un puente Electron simulado. **No equivalen** a pruebas del instalador en una sesión real de Windows ni a una validación oficial de Hacienda.

## Matriz de pruebas

| ID | Área | Casos | Automatización | Riesgo |
|---|---|---|---|---|
| XML-01 | XML 4.4 | Lectura, moneda y CAByS, tipos y errores mal formados | Node + API real | Alto |
| IVA-01 | IVA | Exoneración total/parcial, IVA asumido, neto y créditos | Node | Crítico |
| TC-01 | USD/CRC | Históricos, días no hábiles, tasa XML de respaldo y fechas inválidas | Node (API simulada) | Crítico |
| DB-01 | SQLite | Perfil aislado, reinicio, clave duplicada y migración heredada | SQLite real | Crítico |
| DB-02 | Borrado | Confirmación, cantidad esperada, movimiento y deduplicación | SQLite real | Crítico |
| BK-01 | Respaldos | WAL, quick_check, copia externa, retención y fallos | SQLite real | Crítico |
| API-01 | API local | Token, perfiles, importación, aislamiento, errores y borrado | HTTP local | Alto |
| CSV-01 | CSV | Separador, comillas, caracteres especiales, negativos e inyección de fórmulas | Node puro | Alto |
| UI-01 | React | Panel, fechas, menú personalizado y formulario de empresas | Playwright simulado | Medio |
| PKG-01 | Electron | Configuración segura, menú oculto, identidad Windows y archivos | Pruebas estáticas + NSIS | Alto |
| SEC-01 | Dependencias | Avisos de npm audit, políticas de privacidad y no inclusión de secretos | Acción semanal + revisión | Alto |

## Pruebas manuales obligatorias en Windows

- [ ] Compilar NSIS e **instalar** en un equipo de prueba sin sobrescribir FacturaCR.
- [ ] Cerrar/abrir diez veces y comprobar el historial SQLite y el perfil activo.
- [ ] Importar XML CRC y USD 4.4 válidos, uno de cada tipo relevante.
- [ ] Importar XML rechazados, corruptos, duplicados, con firma y sin ella; comparar mensajes.
- [ ] Comparar totales e IVA con comprobantes patrón calculados de manera independiente.
- [ ] Cortar Internet, importar XML USD y revisar tasa de origen y advertencias.
- [ ] Reiniciar sin Internet, comprobar que la cotización histórica en SQLite se conserva.
- [ ] Crear dos empresas y confirmar aislamiento de la lista, filtros y reportes.
- [ ] Intentar eliminar empresa con respaldo bloqueado; no debe borrar documentos.
- [ ] Restaurar una copia SQLite en instalación de prueba: comparar número de documentos y perfiles.
- [ ] Exportar CSV y Excel: abrir en Excel español y verificar ceros, negativos y tildes.
- [ ] Exportar PDF de varias páginas y revisar cortes, títulos, símbolos y cifras.
- [ ] Inspeccionar selector, barras, tablas y diálogos en 1366×768, 1920×1080 y ventanas pequeñas.
- [ ] Probar usuarios de Windows sin privilegios de administrador y carpetas de solo lectura.
- [ ] Verificar accesos directos, ícono, carpeta, desinstalación y comportamiento de actualización.
- [ ] Revisar alertas de SmartScreen y política de firma de código para distribución.

## Criterio para aprobar una versión

1. Ningún defecto **crítico** o **alto** abierto que afecte totales, impuestos, privacidad, pérdida de datos o identidad del instalador.
2. Trabajos de QA en GitHub Actions en verde para **Windows/Linux**, navegador en verde y NSIS generado.
3. Revisión manual firmada del ejecutable, respaldo y restauración, y conciliación con XML patrón.
4. Informe de `npm audit` revisado, con acciones o justificación para los hallazgos relevantes.
5. Historial de pruebas almacenado en los artefactos de Actions y respaldo previo a migraciones.

## Uso local y en GitHub

```powershell
npm install
npm test
npm run test:ci
npm run build
npm run check:package
npx playwright install chromium
npm run test:e2e
npm run dist:win
```

El comando `npm run test:ci` produce `qa-results/junit.xml`. El reporte UI produce `qa-results/playwright-junit.xml`, `playwright-report/` y `test-results/`. Esos directorios están excluidos del repositorio mediante `.gitignore` y se cargan como artefactos temporales de las ejecuciones.

**Estado de esta entrega:** las pruebas de Node sin dependencias instaladas pueden ejecutarse aquí; la suite SQLite/API, la UI Playwright, la compilación completa y el NSIS se comprobarán al instalar dependencias en Windows y GitHub Actions. Cualquier prueba no ejecutada debe figurar como **pendiente**, no como aprobada.


## Gestión de importaciones equivocadas (v1.3.9)

La suite `tests/papelera-restauracion.test.cjs` comprueba en SQLite: envío recuperable, aislamiento entre empresas, atomicidad de lotes, manejo de duplicados, validación de cédulas, XML conservado al reabrir y restauración correcta. `tests/papelera-integracion.test.cjs` comprueba la configuración IPC, la separación de los reportes activos y la presencia de los controles de interfaz.

Para completar en Windows: instalar dependencias, ejecutar `npm test`, `npm run build`, `npm run test:e2e` y generar el instalador NSIS. Después comprobar manualmente la selección de múltiples páginas y el flujo de restauración en SQLite real.


## Pruebas nuevas v1.4.0 (incluidas en `tests/*.test.cjs`)

- **Lotes de XML**: operaciones atómicas, duplicados, validación por cédula, deshacer y protección contra movimientos posteriores.
- **Vista previa con xml2js real**: documentos sintéticos 4.4, sugerencia de empresa, detección de XML inválidos y claves ya registradas.
- **Compras y ventas**: clasificación por roles, nota de crédito negativa, recibo de pago a revisar, agrupación de contrapartes y comparativo mensual.
- **Restauración**: integridad SQLite, estructura, identidad de la aplicación, copia previa y conservación de datos en caso de error.
- **Carpetas vigiladas**: detección solo de archivos XML estables, no importación automática y persistencia de archivos procesados.
- **Mensajes de Hacienda**: parser de respuesta y asociación de clave solo al perfil donde está el comprobante; no se afirma verificación criptográfica.
- **E2E Playwright**: abrir vista previa, confirmar un XML sintético, navegar a compras/ventas y consultar la bitácora.

Los archivos reales de los usuarios **no forman parte de los fixtures**. Las pruebas obligatorias en GitHub Actions se ejecutan después de `npm install` y las pruebas E2E usan Chromium. Un merge no debe considerarse aprobado hasta que terminen los jobs QA y el instalador Windows.

## QA adicional v1.4.2

- `tests/qa-v142-bases-multiples.test.cjs`: IVA 13 % + 1 % en la misma línea, otros tributos, surtidos con bases explícitas, nota de crédito, límites de redondeo, totales del reporte.
- `tests/qa-v142-xml-real.integration.test.cjs`: XML 4.4 sintéticos procesados con `xml2js` real en Actions, rechazo de archivo fiscal incoherente sin bloquear los demás archivos del lote.
- `tests/qa-v142-actions.test.cjs`: verifica CI Windows/Linux, JUnit de errores reales, auditoría de seguridad y protección frente a filtración de XML o bases locales.
- `e2e/aplicacion.spec.cjs`: aviso de base sin tarifa atribuida en la vista previa de React.

**Criterio de aprobación:** GitHub Actions en verde en Windows y Linux, Playwright en Chromium, instalador NSIS descargable y ejecución manual en Windows con copia de base SQLite de prueba. No marcar como aprobado lo no ejecutado.

## Regresiones de GitHub Actions v1.4.3

- API: rechazo de borrado entre empresas (HTTP 400), comprobación de que los registros siguen intactos y borrado autorizado posterior.
- Node ESM Windows/Linux: `pathToFileURL` para importar módulos `.mjs` en pruebas de asignación masiva.
- Chromium: selector estricto por nivel de encabezado para la sección de Bitácora.
- Acciones CI: los trabajos no deben ocultar fallos, se conservan JUnit y capturas.

## Pruebas nuevas v1.4.4 — Gastos administrativos

- `tests/qa-v144-gastos-administrativos.test.cjs`: IVA real inalterado, gasto sin IVA, factura sin IVA, total XML cero, monto manual, notas de crédito con signo negativo y reportes.
- `tests/qa-v144-gastos-sqlite.integration.test.cjs`: persistencia por perfil, rechazo de otra empresa, validación del importe manual, papelera y restauración; requiere `better-sqlite3` instalado en GitHub Actions.
- `e2e/aplicacion.spec.cjs`: cambio de la casilla y visibilidad de reportes en Chromium; prueba del aviso para documentos con total XML cero.
- Auditoría y base de datos original no deben modificarse para corregir el importe de una factura. La clasificación administrativa jamás debe excluir IVA real del resumen general.
- Validación manual requerida: factura de combustible real y su XML para distinguir un total efectivamente cero de un error del emisor. No incluir datos reales en fixtures de GitHub.

## Regresión v1.4.5 — Navegación con contadores y gastos administrativos

- **Accesibilidad:** el botón «Comprobantes» conserva nombre accesible exacto aunque la insignia muestre el número de documentos; se anuncia el estado activo con `aria-current`.
- **Playwright:** seleccionar la sección mediante la navegación «Secciones», comprobar el `h1` correspondiente y realizar después las acciones de gasto.
- **Desktop y móvil:** verificar casilla de clasificación administrativa, monto base de ₡100, IVA de ₡13 inalterado y factura con total XML cero con monto manual de ₡30.003.
- Los casos no utilizan documentos reales. Los resultados completos deben verificarse en GitHub Actions con Chromium y npm instalados.


### v1.4.6 — Comprobante de combustible pagado con cupón

- El `TotalComprobante=0` no se cambia por el valor del cupón.
- Solo se sugiere referencia si hay coincidencia entre venta, descuento, no sujeto, cupón y medio de pago único.
- Registrar gasto manual requiere consentimiento en la interfaz; IVA se conserva.
- Nota de crédito no dispara sugerencia.
- CSV y Excel distinguen monto de gasto y referencia de cupón sin sumarla a totales.


## Regresión v1.4.7 — cupón, total cero y Playwright

- E2E: los escenarios de cupones y de venta con descuento completo se inyectan antes de cargar React (`?qa-fixture=cupon-cero` y `?qa-fixture=xml-cero`).
- E2E: comprueba la presencia de la referencia, la marca voluntaria, la confirmación de `window.confirm`, el importe manual guardado y que el total fiscal y el IVA siguen en cero.
- Unitarias: `tests/qa-v147-flujo-cupon.test.cjs` comprueba que el cupón no se contabiliza sin intervención, el flujo de marcado y la separación de importes.
- Ejecución requerida: `npm run test:e2e` en GitHub Actions para Chromium de escritorio y móvil; conservar trazas si falla.
- **No se da por aprobado Playwright hasta ver el resultado del workflow.**

### QA v1.4.8 — Clasificación por comercio

`tests/qa-v148-comercios-gastos.test.cjs` verifica agrupación por cédula, fallback de nombre, aislamiento y reversibilidad. `tests/qa-v148-comercios-sqlite.integration.test.cjs` requiere better-sqlite3 real y prueba transacciones, persistencia, auditoría e importes manuales; corre en la matriz Windows/Linux de GitHub Actions.

## QA de interfaz v1.4.9

- Verificar que la versión visible en el menú lateral coincida con `package.json` y el instalador NSIS.
- Verificar desplegables de empresas, filtros, importación y respaldos en escritorio y móvil, con búsqueda y teclado.
- Confirmaciones de Papelera, traslados, cupón y clasificación masiva: Cancelar no puede modificar SQLite.
- Los tests deben seguir funcionando con `selectOption` del selector HTML real y con los diálogos propios.
- Los selectores de archivos y carpetas de Windows conservan el diálogo nativo del sistema por seguridad.


## QA v1.4.10 — Scroll interno de desplegables

- Unidad (`tests/qa-v1410-scroll-desplegables.test.cjs`): diferencia desplazamiento dentro del portal, del selector y de otros paneles; prueba cierre por Escape/clic externo y la contención CSS.
- Playwright (`e2e/aplicacion.spec.cjs`): abre filtros de Comprobantes, usa rueda del mouse dentro del menú, verifica que el scroll cambie y que siga abierto; comprueba selección y Escape en Chromium escritorio/móvil.
- Los workflows existentes ejecutan estas pruebas mediante `npm run test:ci` y `npm run test:e2e`.

### Regresión v1.4.11 — Confirmaciones personalizadas

- El botón inferior «Cancelar» tiene nombre accesible **exacto** independiente del botón X «Cerrar diálogo de confirmación».
- Playwright, en escritorio y móvil: abrir clasificación por comercio y cancelar con «Cancelar», X y Escape. La API de clasificación no debe ejecutarse, el contador pendiente no debe variar y el botón de clasificación debe seguir habilitado.
- El caso de confirmación positiva sigue comprobando la llamada y la actualización del contador.
- En CI, el trabajo de Chromium publica trazas, capturas y JUnit si falla un selector o una operación.

### Regresión v1.4.13 — Importación en una sola revisión

- Aceptar selecciones de 11, 50 y 75 XML sin fragmentación en lotes de diez, con límite máximo de 2.000 documentos.
- Rechazar con claridad lotes superiores a 2.000 o a 256 MB acumulados, conservando el límite de 15 MB por XML.
- Confirmar que asignación masiva y selección operan sobre todos los XML, incluso aquellos que no se muestran todavía en la tabla de vista previa.
- Verificar que los duplicados y las empresas pendientes conservan el comportamiento previo a la v1.4.12.
- Validar el módulo SQLite real y Playwright en GitHub Actions para escritorio y móvil.

## QA UI v1.4.14 — Gastos administrativos
- Verificar padding del encabezado y la descripción en ambas tarjetas de gastos.
- Comprobar espaciado de avisos, botones de exportación y estado vacío de la tabla en 390 px y escritorio.
- Playwright valida separaciones reales del contenido y que los controles y los encabezados siguen visibles.


## QA v1.4.15 — Revisión y selección segura de XML

- Comprobar que una vista con múltiples empresas tenga «Por revisar» desmarcados por defecto.
- «Marcar listos» no debe marcar documentos pendientes, duplicados ni con error; «Desmarcar» elimina todas las selecciones.
- Filtrar por «Por revisar» y «Con errores» incluso si las filas están después de la posición 200.
- Revisar XML pendientes: elegir empresa compatible, marcarlo manualmente y confirmar únicamente los elegidos.
- Los contadores de revisión son accesos directos; cambios de filtros no alteran la selección del lote.
- Ejecutar la suite Node y Playwright en GitHub Actions (Chromium escritorio y móvil).

## QA v1.4.17 — Revisión XML móvil

- En Chromium móvil, comprobar que los controles de una fila (casilla, empresa y observación) están disponibles sin desplazamiento horizontal.
- En escritorio y móvil, un XML por revisar se inicia desmarcado y no se activa con «Marcar listos».
- Filtrar por estado nunca debe desplazar toda la ventana de revisión ni modificar las selecciones.
- Asignar empresa a dos XML seleccionados conserva la validación individual y requiere confirmación.
- Los resultados finales de Playwright se comprueban en GitHub Actions; la prueba no se considera superada hasta ejecutar Chromium con las dependencias instaladas.

## v1.4.17 — Diagnóstico de las pruebas móviles

Las pruebas `Importación masiva` y `Vista previa: filtrar pendientes y errores` usan `test.step()` para separar preparación, marcado, selección de empresa, aplicación y confirmación. En cada fase se verifica el estado antes de continuar. Si falla en Actions, abrir los artefactos `playwright-report` y `test-results` (traza y captura) para identificar el paso exacto; el resultado resumido `2 failed` no permite identificarlo.

Los XML `requiere_empresa` deben comenzar desmarcados, y los `error` no deben admitirse. La asignación por cédula y el comportamiento de duplicados **no se han modificado**.

## QA v1.4.18 — Intercepción de toques en móvil

- Validar que `.qa-preview-body` sea el único contenedor de scroll vertical a 390 px de ancho.
- Asegurar que `.qa-table-scroll` no tenga un segundo scroll anidado en esa resolución.
- Filtrar un XML «Por revisar», escoger empresa, marcarlo con una acción Playwright `check()` real y conservar la selección al cambiar de filtro.
- Repetir con una fila situada al final de 24 XML sintéticos. No utilizar `force:true`, cambios directos al DOM ni tiempos artificiales.
- Ejecutar ambos proyectos de Playwright en GitHub Actions y revisar capturas/trazas si algo falla.
