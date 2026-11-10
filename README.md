<div align="center">

<img src="build/icons/ComprobantesElectronicosCR.png" alt="Ícono de ComprobantesElectronicosCR" width="112">

# ComprobantesElectronicosCR

**Gestión local de comprobantes electrónicos de Costa Rica**

Importa XML, organiza los documentos de varias empresas, consulta totales en colones y genera reportes. Una aplicación de escritorio para Windows con historial SQLite, respaldos y pruebas automatizadas.

![Versión](https://img.shields.io/badge/versi%C3%B3n-1.4.4-2563EB?style=flat-square)
![Windows](https://img.shields.io/badge/Windows-64%20bits-0F766E?style=flat-square)
![XML](https://img.shields.io/badge/XML-Hacienda%204.4-64748B?style=flat-square)
![Licencia](https://img.shields.io/badge/licencia-sin%20definir-64748B?style=flat-square)

</div>

---

## Descripción

**ComprobantesElectronicosCR** es un gestor **local** de comprobantes fiscales costarricenses. El frontend de React trabaja dentro de Electron; Node.js/Express procesa los XML, y SQLite guarda el historial de cada empresa. No requiere un servidor remoto para funcionar; la consulta de cotizaciones oficiales sí necesita conexión a Internet.

> **Alcance:** es un lector, organizador y generador de reportes. **No** emite, firma, transmite ni valida tributariamente documentos ante Hacienda, y no sustituye la revisión de un profesional contable.

## Características

- **Perfiles empresariales:** crea y edita empresas con nombre, identificación opcional, correo, teléfono y dirección. Sus comprobantes se consultan por separado.
- **Importación XML:** admite documentos estructurados de Hacienda 4.4 (con compatibilidad parcial para versiones anteriores), con CAByS, detalle de líneas, impuestos y metadatos. La v1.4.0 conserva la lectura de importes decimales como `.00`, concilia ajustes de redondeo comprobables por total de línea y conserva por separado IVA bruto e IVA neto. Las discrepancias importantes se rechazan.
- **Tipos:** factura electrónica, tiquete, nota de crédito, nota de débito, compra, exportación y recibo electrónico de pago, según el reconocimiento implementado.
- **Contabilidad de consulta:** suma documentos positivos, resta notas de crédito y muestra IVA neto y bases correspondientes a las líneas procesadas.
- **Dólares a colones:** consulta la **venta de referencia BCCR a través de Hacienda** según fecha de emisión; usa una cotización oficial guardada o, si no hay conectividad, la declarada en el XML con advertencia. Conserva la fuente y la tasa aplicada.
- **Panel general:** indicadores y gráficos filtrados por mes, año, períodos rápidos o fechas personalizadas.
- **Reportes:** PDF, CSV separado por `;` y Excel, siempre con el contexto del perfil y los filtros elegidos.
- **Gastos administrativos:** cada comprobante puede marcarse individualmente como gasto; su base de gasto sin IVA, base gravada para IVA y el impuesto declarado se muestran por separado. Existe reporte específico PDF/CSV/Excel, sin modificar el IVA del Panel general.
- **Respaldos:** SQLite con frecuencia configurable, validación de integridad, retención de copias automáticas y respaldo anterior a operaciones delicadas.
- **Seguridad local:** API escuchando en `127.0.0.1`, token interno para sus rutas, puente limitado entre React y Electron y almacenamiento sin servicios externos de cuentas.


## Novedades v1.4.4 — Gastos administrativos y facturas de combustible

- Casilla **«Gasto adm.»** en la tabla de comprobantes y opción equivalente en el detalle.
- Clasificación guardada en SQLite por empresa y por XML, preservada en la Papelera, su restauración y los respaldos.
- Nuevo apartado **Gastos administrativos**, con filtro por fecha, resumen de gasto sin IVA, base gravada para IVA y **IVA realmente declarado**. Reportes PDF, CSV y Excel.
- Si una factura (por ejemplo, combustible) declara **TotalComprobante = 0**, el programa **no altera ni supone** el total del XML. Permite indicar explícitamente un **monto manual de gasto sin IVA** solo para el reporte administrativo y muestra una advertencia.
- Ejemplo: XML con TotalVenta=30.003, TotalDescuentos=30.003, TotalComprobante=0. Su total fiscal seguirá en cero. Si revisas el comprobante y confirmas un gasto de 30.003, puedes introducir ese importe manualmente para los reportes de gastos, sin modificar impuestos ni historial de IVA.
- La marca de gasto **no significa automáticamente deducibilidad fiscal**. Los ajustes manuales quedan en el registro de auditoría y se distinguen de los importes del XML.
- Pruebas QA nuevas con datos sintéticos: importes manuales, cero IVA, notas de crédito, aislamiento entre empresas, restauración y Playwright. Los tests se incluyen automáticamente en GitHub Actions.

## Novedades v1.4.3 — Correcciones QA para GitHub Actions

- **Ubuntu:** la prueba de API reconoce correctamente la respuesta de rechazo cuando alguien intenta borrar una nota de crédito desde otra empresa y verifica que ambos historiales permanecen sin cambios.
- **Windows:** los módulos `.mjs` de asignación masiva se importan mediante `pathToFileURL()` para evitar `ERR_UNSUPPORTED_ESM_URL_SCHEME` con rutas `C:\` o `D:\`.
- **Playwright:** la Bitácora selecciona el encabezado `h1` por su nivel para evitar la ambigüedad con el `h2` de contenido.
- Cuatro verificaciones de regresión adicionales permiten detectar que vuelvan esos fallos. Se mantienen los flujos de GitHub Actions y la identidad del instalador.

## Novedades v1.4.2 — QA y bases IVA multitarifa

- Se corrige la **duplicación de la base imponible** cuando una misma línea contiene dos tarifas IVA distintas y no informa la base individual por tarifa. El impuesto declarado se conserva; la base se señala como **«sin tarifa atribuida»** en lugar de inventar una distribución.
- En un surtido con bases por componente, cada base sí se atribuye a su tarifa correspondiente.
- En la vista previa se muestra una advertencia de base sin atribuir. Los PDF, CSV y Excel incorporan ese valor de forma separada para su revisión contable.
- Se ampliaron las pruebas unitarias, de integración con `xml2js` real y las pruebas de interfaz Playwright con comprobantes **sintéticos**.
- **GitHub Actions** revisa la privacidad del repositorio antes de compilar; la auditoría de seguridad falla si detecta vulnerabilidades altas/críticas en dependencias de producción (antes podía finalizar en verde aunque existieran alertas).
- Esta mejora no equivale a una validación tributaria de Hacienda. Para errores XML aún no reproducidos se necesitan los archivos originales, que deben permanecer fuera de GitHub.

## Novedades v1.4.1

- **Asignación masiva:** en la vista previa marca los XML y selecciona una empresa en la barra superior para aplicar el destino a todos los marcados; los que no coinciden con una cédula registrada se omiten.
- **Seleccionar todos / desmarcar:** evita elegir empresas individualmente al importar lotes.
- **IVA con impuestos múltiples:** las diferencias de hasta ₡0,01, respaldadas por el total declarado de la línea, se admiten con advertencia. Cuando no se conoce la tarifa del ajuste, se registra como `ajusteNetoSinTarifa` y no se suma a una tarifa de IVA por suposición.
- **Precaución:** las facturas con diferencias no conciliables siguen mostrando error; estas comprobaciones no validan la aceptación fiscal ante Hacienda.
- **Documentación limpia:** un `CHANGELOG.md` consolidado.

## Novedades v1.4.0 — Desarrollo organizado en etapas

**Etapa A — Seguridad y recuperación**

- Restauración desde un respaldo `.sqlite` elegido mediante el diálogo de Windows, con comprobación de integridad, estructura e identidad (cuando está disponible), respaldo de emergencia y reinicio de Electron. Es una **sustitución completa** de la base, no una fusión; se conserva además una copia de la base anterior en el directorio de datos de la aplicación.
- Los eventos de creación/edición de empresas, movimientos, Papelera, importación confirmada y mensajes Hacienda se registran en una bitácora SQLite.
- El `appId` permanece `cr.comprobanteselectronicoscr.desktop`; **no** se utiliza el identificador de FacturaCR.

**Etapa B — Importación inteligente**

- Antes de guardar se muestra una **vista previa con datos de emisor, receptor, importe, moneda y empresa sugerida por cédula**. Las importaciones son explícitas; el usuario asigna el perfil y confirma.
- Detección de claves ya existentes en otras empresas, duplicados dentro del lote y errores por archivo. SQLite confirma cada lote en una transacción y conserva su identificador.
- **Deshacer última importación**: tras crear un respaldo, mueve los documentos de ese lote a la Papelera. Si fueron movidos de empresa o alterados, se bloquea para impedir retirar documentos inesperados.
- Por revisión se admiten hasta 10 XML y 60 MB; si se seleccionan más, se presentan por lotes sucesivos.

**Etapa C — Clasificación y conciliación**

- **Compras y ventas**: separadas por la identificación del perfil como emisor o receptor; IVA, base y total conservan el signo de las notas de crédito. Sin cédula hay categoría «Sin clasificar».
- Los **recibos electrónicos de pago** quedan en «Pago / revisar» para evitar contarlos como ventas nuevas por inferencia.
- Conciliación de notas de crédito/débito con `InformacionReferencia.Numero` cuando el comprobante original existe en el mismo perfil. Se distingue coincidencia total/parcial de importe y referencia ausente. **No certifica una anulación fiscal**.
- Reportes de compras y ventas por período en PDF, CSV y Excel, comparación mensual y CSV de contrapartes (proveedores/clientes).

**Etapa D — Hacienda, auditoría y automatización**

- Importación local de XML **MensajeHacienda** (respuesta de aceptación/rechazo), vinculados por clave a los comprobantes del perfil. La aplicación **no** verifica firmas XAdES ni consulta el estado en línea, por lo que el estado visual indica lo informado en el archivo.
- **Bitácora** con fecha, acción, empresa y detalles de la operación, guardada en SQLite.
- **Carpetas vigiladas**: elegir una carpeta en Windows y revisar XML nuevos mientras la aplicación permanece abierta. Los archivos detectados se ofrecen a la misma vista previa; **nunca se importan automáticamente sin confirmación**. No se examinan subcarpetas.

### Limitaciones y comprobaciones necesarias

- Los resultados y reportes son auxiliares: requieren revisión contable para declaración de IVA, exoneraciones y la naturaleza de documentos de compra o pago.
- Las respuestas de Hacienda importadas **no están verificadas criptográficamente**, y su presencia no implica una consulta oficial en tiempo real.
- Las pruebas integrales con `better-sqlite3` nativo, `xml2js`, Electron, Playwright y el instalador NSIS deben ejecutarse en Windows o GitHub Actions después de instalar dependencias.
- El repositorio no incluye XML reales con datos fiscales; usa únicamente casos de prueba sintéticos.

### Cómo probar los nuevos apartados

1. Registra dos empresas con cédulas distintas y prepara XML sintéticos para cada una.
2. Revisa **Importación inteligente**: la empresa sugerida, duplicados, confirmación y deshacer un lote.
3. Consulta **Compras y ventas** y exporta PDF/CSV/Excel; confirma que las notas de crédito resten.
4. Importa un **MensajeHacienda** sintético y comprueba que aparezca solo en la empresa con la clave correspondiente.
5. Comprueba la **Bitácora** después de importar y mover documentos.
6. Configura una **Carpeta vigilada** y verifica que sus XML no entren sin revisión.
7. Crea un respaldo, verifica su integridad y ensaya la restauración **en una base de prueba**, nunca por primera vez sobre el historial de producción.

## Tecnologías

| Capa | Tecnología |
|---|---|
| Interfaz | React 19, Vite 6, CSS |
| Escritorio | Electron 44 |
| Servidor local | Node.js 22, Express 4 |
| Datos | SQLite mediante `better-sqlite3` |
| Reportes | jsPDF, jsPDF-AutoTable, XLSX, CSV |
| Visualizaciones | Chart.js |
| Empaquetado | electron-builder, NSIS x64 |
| QA | `node:test`, Playwright, GitHub Actions |

## Requisitos

- **Windows de 64 bits** para compilar y ejecutar el instalador NSIS de Electron 44.
- **Node.js 22 LTS** y npm para desarrollar/compilar. Git es recomendable para guardar el proyecto en GitHub.
- Conexión a Internet para instalar npm, descargar Electron y consultar cotizaciones oficiales.
- Espacio y permisos de escritura en la carpeta personal para la base SQLite y los respaldos.

## Iniciar en desarrollo

Desde PowerShell, dentro de la raíz del proyecto:

```powershell
node --version
npm --version
npm install
npm run dev
```

`npm run dev` arranca Vite y Electron, y recompila los módulos nativos requeridos por Electron. No necesitas iniciar el backend por separado.

**Si `better-sqlite3` falla en Windows**, verifica que tengas Node.js 22 x64; elimina `node_modules`, vuelve a ejecutar `npm install` y prueba `npm run rebuild:electron`. No borres tu base SQLite ni la carpeta de respaldos para solucionar un problema de compilación.

## Crear el instalador

```powershell
npm run check:syntax
npm test
npm run build
npm run check:package
npm run dist:win
```

El instalador se guardará en:

```text
release/ComprobantesElectronicosCR-Setup-1.4.4-x64.exe
```

El identificador interno es `cr.comprobanteselectronicoscr.desktop`; **no** es el identificador de FacturaCR. El instalador no está firmado digitalmente. Windows SmartScreen puede advertir sobre un editor desconocido.

## Uso básico

1. Abre **Empresas** y crea el perfil de la empresa que quieres administrar.
2. Selecciónala en el menú lateral. Si registraste una cédula, los XML deben corresponder a su emisor o receptor.
3. En **Importación inteligente**, selecciona hasta 10 XML por revisión, comprueba la empresa sugerida y confirma los documentos que quieres guardar. Los duplicados se identifican antes de confirmar. Puedes deshacer el último lote desde ese mismo apartado.
4. Consulta **Panel general** y configura el período para las estadísticas.
5. En **Comprobantes**, busca por clave, comercio, fechas o tipo de documento.
6. En **Reportes y exportaciones**, elige PDF, CSV o Excel para la empresa y filtros actuales.
7. En **Respaldos automáticos**, revisa la configuración, valida un archivo SQLite antes de restaurarlo y crea copias antes de cambios importantes.

### Moneda y tipo de cambio

Para XML en USD, el sistema intenta encontrar la tasa de **venta** de referencia correspondiente a la fecha de emisión. Guarda la cotización aplicada; **una factura histórica no debe cambiar de valor solo porque hoy cambie el dólar**. Cuando no logra verificar la tasa oficial, usa la del XML cuando es válida y lo indica como no verificado. Los documentos en CRC no se convierten.

### Perfiles y eliminación

La eliminación de una empresa exige confirmación, elección de destino de sus documentos o borrado y respaldo previo. Los documentos de una empresa **no** aparecen automáticamente en otra. El perfil antiguo «Sin asignar» fue retirado en la v1.3.3; para consultar datos anteriores se requiere un respaldo de esa instalación.

## Datos y respaldos

- La base es **local por usuario de Windows**, dentro del directorio `userData` administrado por Electron.
- Su archivo se llama `comprobanteselectronicoscr.sqlite`.
- La ubicación inicial de respaldos es `Documentos/ComprobantesElectronicosCR/Respaldos`; puede cambiarse desde la aplicación.
- Un respaldo es una copia SQLite validada. **No** copies manualmente el `.sqlite` abierto como mecanismo principal de respaldo, especialmente si se usa WAL.
- Antes de actualizar, respalda la base. Para restaurar una copia, **cierra el programa**, realiza otra copia de resguardo y sigue un procedimiento controlado; esta versión todavía no incorpora un asistente visual de restauración.
- Los respaldos automáticos se revisan **mientras la aplicación está abierta**; no se ejecuta una tarea programada con el programa cerrado.

## Organización del código

```text
ComprobantesElectronicosCR/
├── backend/                 # XML, API, SQLite, cambio, respaldos
├── electron/                # Ventana, menú, IPC y preload
├── frontend/
│   ├── public/              # Recursos de interfaz
│   └── src/                 # React, CSS, períodos y reportes
├── build/                   # Íconos y recursos NSIS
├── tests/                   # Pruebas unitarias e integración Node
├── e2e/                     # Pruebas UI con Playwright y Electron simulado
├── scripts/                 # QA, sintaxis y verificación de compilación
├── .github/workflows/       # QA Linux/Windows, interfaz, instalador, auditoría
├── playwright.config.cjs
├── vite.config.mjs
├── QA_PLAN.md
└── package.json
```

## Control de calidad (QA)

| Comando | Valida |
|---|---|
| `npm run check:syntax` | Sintaxis Node, API, utilidades y configuración |
| `npm test` | Pruebas unitarias/integración SQLite, XML, respaldos, TC, perfiles, seguridad y reportes |
| `npm run test:qa` | Pruebas de Node con cobertura experimental |
| `npm run test:ci` | Pruebas de Node con cobertura y reporte **JUnit XML** |
| `npm run build` | Compilación real de React 19 con Vite 6 |
| `npm run check:package` | Existencia e integridad básica del frontend compilado |
| `npm run test:e2e` | Pruebas del navegador en escritorio y móvil con React y puente Electron **simulado** |
| `npm run dist:win` | Instalador real NSIS para Windows x64 |

Los casos cubren, entre otros: moneda USD/CRC, IVA neto y exoneraciones, notas de crédito, fechas y días no hábiles, aislamiento entre empresas, duplicados, confirmación de borrado, copias verificadas, prevención de fórmulas maliciosas en CSV, API con token, menú Electron y visualización de perfiles y períodos.

### Qué pruebas NO equivalen a una certificación completa

- Playwright ejecuta **React con un puente simulado**: no sustituye abrir el `.exe` y probar ventanas, diálogos, archivos y el motor SQLite en Windows.
- No se verifica criptográficamente la firma XML ni la aceptación ante Hacienda.
- El script de instalación comprueba la existencia del `.exe`, no una instalación/desinstalación interactiva completa ni su firma digital.
- Las pruebas de cotización usan respuestas **simuladas** para ser repetibles; la disponibilidad y respuesta del API oficial deben comprobarse en operación.
- Recomendamos una ronda manual con datos de prueba y las instrucciones de [`QA_PLAN.md`](QA_PLAN.md) antes de utilizar resultados para cierres contables.

## GitHub Actions

Al subir la carpeta completa a un repositorio privado:

1. En **Actions** encontrarás **QA - Pruebas integrales**, que corre con cada push a `main` o `develop`, en pull requests, los lunes y cuando se lanza manualmente.
2. Sus trabajos prueban Node/SQLite/API en **Windows y Linux** y ejecutan Playwright con Chromium para vista de escritorio y móvil.
3. Los informes JUnit, trazas y capturas quedan disponibles en **Artifacts**, incluso cuando una prueba falla.
4. **Build - Instalador NSIS Windows** se ejecuta manualmente desde Actions o al subir una etiqueta `v*`. Genera el `.exe` como artefacto privado de Actions.
5. **Seguridad - Auditoría de dependencias** corre semanalmente o manualmente. Descarga el informe npm (los hallazgos son informativos, no bloquean compilaciones por sí mismos).
6. **Dependabot** propone actualizaciones semanales de dependencias npm y acciones de GitHub; deben revisarse y aprobarse antes de integrarse.

**Lockfile:** el ZIP base v1.3.5 no incluía `package-lock.json`. Por esa razón los flujos iniciales usan `npm install`. Después del primer `npm install` exitoso en tu PC, **sube el `package-lock.json` generado** a GitHub y reemplaza los comandos `npm install` de Actions por `npm ci` para que las dependencias sean reproducibles. No subas `node_modules`.

**Cómo descargar el instalador:** entra en GitHub → repositorio → **Actions** → **Build - Instalador NSIS Windows** → **Run workflow** → abre la ejecución aprobada → descarga el artefacto **ComprobantesElectronicosCR-Instalador-Windows**.

## Privacidad y seguridad

- No subas XML de clientes, bases `.sqlite`, archivos `.env`, claves ni datos personales al repositorio, aunque sea privado.
- Los archivos sintéticos de las pruebas son ficticios y no contienen información real de contribuyentes.
- La API solo escucha en la máquina local y exige un token secreto para sus rutas; esto **no sustituye** el cifrado del disco ni los controles de usuario de Windows.
- Los respaldos contienen datos fiscales y deben almacenarse con permisos adecuados y, si se transfieren, con cifrado.
- Antes de utilizar el programa en producción, verifica restricciones contables, tributarias y de conservación documental aplicables.

## Problemas frecuentes

| Problema | Revisión sugerida |
|---|---|
| No carga React | Ejecuta `npm run dev`, revisa que el puerto 5173 esté libre. |
| Error de `better-sqlite3` | Reinstala dependencias en Node 22 y ejecuta `npm run rebuild:electron`. |
| XML no reconocido | Revisa la raíz, estructura del comprobante y versión; consulta los errores de importación. |
| Conversión USD sin Internet | Comprueba si se utilizó una tasa oficial guardada o la declarada en el XML. |
| No puedo borrar una empresa | Revisa cantidad de documentos, nombre exacto y respaldo previo. |
| No hay historial | Verifica el perfil activo y si Windows está usando el mismo usuario/base. |
| Fallan pruebas GitHub Actions | Abre el job fallido, revisa el log y descarga los reportes JUnit/Playwright. |

## Estado del proyecto

**Versión 1.3.6 — QA y CI:** incluye infraestructura de pruebas y documentación renovada. No debe considerarse listo para uso contable hasta completar las pruebas reales del ejecutable en Windows, revisar sus informes y validar muestras de XML propias en un ambiente de pruebas.

Documentación complementaria: [`QA_PLAN.md`](QA_PLAN.md) · [`CHANGELOG.md`](CHANGELOG.md).

## Diagnóstico de `ImpuestoNeto` (v1.3.7)

Si Hacienda 4.4 trae líneas donde `ImpuestoNeto` difiere de la suma de `Impuesto.Monto`, revise primero exoneraciones, impuesto asumido por el emisor y desglose `DetalleSurtido`. La aplicación contempla la precisión real de los decimales y muestra cantidades en los errores sin modificar automáticamente diferencias materiales.

Para ver las diferencias localmente (sin enviar XML a terceros):

```powershell
npm run qa:diagnosticar-iva -- "C:\Facturas\archivo.xml"
```

En caso de persistir el problema, revise el XML completo antes de decidir qué monto contable debe prevalecer. El programa no sustituye una validación tributaria ante Hacienda.


## Conciliación fiscal de XML 4.4 — versión 1.3.9

Algunos emisores declaran `ImpuestoAsumidoEmisorFabrica` como `.00` o `.000`, formas decimales que el parser ahora reconoce. También existen diferencias pequeñas entre `Impuesto.Monto` e `ImpuestoNeto` por redondeo de cinco a dos decimales.

- Se admite una discrepancia **microscópica** (hasta 0.0001 CRC) con el IVA neto declarado.
- Un ajuste de **hasta un céntimo** solo se admite con **un único impuesto**, cuando concuerda con `MontoTotalLinea - SubTotal` y, adicionalmente, coincide el impuesto expresado en céntimos o el cálculo de base imponible × tarifa (también en céntimos).
- Se conserva el IVA bruto original y se utiliza `ImpuestoNeto` para el IVA contable. El ajuste aceptado se registra como observación de importación.
- Las discrepancias superiores a un céntimo, y las que no se puedan conciliar siguen provocando error. Para varios impuestos, los ajustes pequeños comprobados quedan separados del IVA por tarifa y exigen revisión.
- Los archivos XML nunca se reescriben. **La aceptación de importación no garantiza la validez tributaria del documento ante Hacienda**.

Para probar exclusivamente las regresiones de redondeo:

```powershell
node --test tests/qa-redondeos-reales-xml44.test.cjs
```

Para diagnosticar localmente un XML sin subirlo a GitHub:

```powershell
npm run qa:diagnosticar-iva -- "C:\Ruta\Factura.xml"
```

Los ocho XML aportados durante el diagnóstico **no se incluyen en el proyecto ni en GitHub**. Se reemplazaron por pruebas sintéticas que contienen únicamente montos y estructuras de ejemplo. Consulta [`CHANGELOG.md`](CHANGELOG.md).


## Corregir facturas importadas en la empresa equivocada (v1.3.9)

En **Comprobantes**, usa las casillas de cada fila para elegir uno o varios XML y selecciona **Mover seleccionados** hacia la empresa correcta, o **Enviar a Papelera** para retirarlos del historial y los reportes sin perder los archivos. Se crea una copia SQLite antes de modificar registros.

En la nueva sección **Papelera**, selecciona documentos y una empresa destino para **Restaurar seleccionados**. La restauración comprueba cédulas y duplicados; si falla un comprobante, no cambia ninguno del lote. El XML original se conserva. Más información en `CHANGELOG.md`.

### Protección del repositorio antes de subir cambios

Ejecuta `npm run check:repository` para verificar que no estés incluyendo XML reales, bases SQLite, credenciales o informes Markdown por versión. Este control se ejecuta también en GitHub Actions. **No elimina archivos**.

Las pruebas con XML real de integración requieren instalar `xml2js` mediante `npm install`. El ZIP fuente no incluye `package-lock.json`, porque no se pudo resolver npm en el entorno de preparación; genera y versiona el lockfile desde Windows antes del primer despliegue reproducible:

```powershell
npm install
git add package-lock.json
```

Después de subir el lockfile y verificar la instalación, se recomienda cambiar los workflows de `npm install` a `npm ci`.
