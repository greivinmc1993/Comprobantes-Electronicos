# Plan de QA — ComprobantesElectronicosCR v1.3.6

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
