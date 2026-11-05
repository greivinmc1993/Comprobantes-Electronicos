<div align="center">

<img src="build/icons/ComprobantesElectronicosCR.png" alt="Ícono de ComprobantesElectronicosCR" width="112">

# ComprobantesElectronicosCR

**Gestión local de comprobantes electrónicos de Costa Rica**

Importa XML, organiza los documentos de varias empresas, consulta totales en colones y genera reportes. Una aplicación de escritorio para Windows con historial SQLite, respaldos y pruebas automatizadas.

![Versión](https://img.shields.io/badge/versi%C3%B3n-1.3.6-2563EB?style=flat-square)
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
- **Importación XML:** admite documentos estructurados de Hacienda 4.4 (con compatibilidad parcial para versiones anteriores), con CAByS, detalle de líneas, impuestos y metadatos.
- **Tipos:** factura electrónica, tiquete, nota de crédito, nota de débito, compra, exportación y recibo electrónico de pago, según el reconocimiento implementado.
- **Contabilidad de consulta:** suma documentos positivos, resta notas de crédito y muestra IVA neto y bases correspondientes a las líneas procesadas.
- **Dólares a colones:** consulta la **venta de referencia BCCR a través de Hacienda** según fecha de emisión; usa una cotización oficial guardada o, si no hay conectividad, la declarada en el XML con advertencia. Conserva la fuente y la tasa aplicada.
- **Panel general:** indicadores y gráficos filtrados por mes, año, períodos rápidos o fechas personalizadas.
- **Reportes:** PDF, CSV separado por `;` y Excel, siempre con el contexto del perfil y los filtros elegidos.
- **Respaldos:** SQLite con frecuencia configurable, validación de integridad, retención de copias automáticas y respaldo anterior a operaciones delicadas.
- **Seguridad local:** API escuchando en `127.0.0.1`, token interno para sus rutas, puente limitado entre React y Electron y almacenamiento sin servicios externos de cuentas.

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
release/ComprobantesElectronicosCR-Setup-1.3.6-x64.exe
```

El identificador interno es `cr.comprobanteselectronicoscr.desktop`; **no** es el identificador de FacturaCR. El instalador no está firmado digitalmente. Windows SmartScreen puede advertir sobre un editor desconocido.

## Uso básico

1. Abre **Empresas** y crea el perfil de la empresa que quieres administrar.
2. Selecciónala en el menú lateral. Si registraste una cédula, los XML deben corresponder a su emisor o receptor.
3. Presiona **Importar XML** y selecciona los archivos. Los duplicados se identifican dentro del perfil.
4. Consulta **Panel general** y configura el período para las estadísticas.
5. En **Comprobantes**, busca por clave, comercio, fechas o tipo de documento.
6. En **Reportes y exportaciones**, elige PDF, CSV o Excel para la empresa y filtros actuales.
7. En **Respaldos automáticos**, revisa la configuración y crea una copia antes de cambios importantes.

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

Documentación complementaria: [`QA_PLAN.md`](QA_PLAN.md) · [`README_XML_4_4.md`](README_XML_4_4.md).
