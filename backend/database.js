'use strict';
const Database = require('better-sqlite3');
const crypto = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs');
const {normalizarIdentificacion} = require('./identificaciones');

const LEGACY_PROFILE_NAME = 'Sin asignar (historial anterior)';


function validarPerfil(input) {
  const nombre = String(input?.nombre || '').trim();
  if (!nombre || nombre.length > 120) throw new Error('El nombre de la empresa debe tener entre 1 y 120 caracteres');
  if (nombre.toLocaleLowerCase('es') === LEGACY_PROFILE_NAME.toLocaleLowerCase('es')) throw new Error('Este nombre corresponde a un perfil heredado eliminado');
  const cedula = normalizarIdentificacion(input?.cedula);
  if (cedula.length > 30) throw new Error('La identificación es demasiado larga');
  const correo = String(input?.correo || '').trim();
  if (correo.length > 160 || (correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo))) throw new Error('Correo electrónico no válido');
  const telefono = String(input?.telefono || '').trim();
  const direccion = String(input?.direccion || '').trim();
  if (telefono.length > 40 || direccion.length > 320) throw new Error('Teléfono o dirección demasiado largos');
  const color = /^#[0-9a-fA-F]{6}$/.test(String(input?.color || '')) ? input.color : '#2563EB';
  return {nombre, cedula, correo, telefono, direccion, color};
}

function instalarEsquema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS perfiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL COLLATE NOCASE UNIQUE,
      cedula TEXT NOT NULL DEFAULT '',
      correo TEXT NOT NULL DEFAULT '',
      telefono TEXT NOT NULL DEFAULT '',
      direccion TEXT NOT NULL DEFAULT '',
      color TEXT NOT NULL DEFAULT '#2563EB',
      creado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
  `);

  const existe = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='documentos'").get();
  const tienePerfil = existe && db.pragma('table_info(documentos)').some(col => col.name === 'perfil_id');

  if (existe && !tienePerfil) {
    // Los historiales anteriores sin perfiles requieren un perfil temporal para migrar.
    // Electron realiza una copia SQLite antes de borrar este perfil heredado y sus XML.
    db.transaction(() => {
      db.prepare('INSERT OR IGNORE INTO perfiles(id,nombre,color) VALUES (1,?,?)')
        .run(LEGACY_PROFILE_NAME,'#64748B');
      db.exec(`
        CREATE TABLE documentos_perfiles (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          perfil_id INTEGER NOT NULL REFERENCES perfiles(id),
          identidad TEXT NOT NULL,
          clave TEXT,
          consecutivo TEXT,
          version_xml TEXT,
          tipo TEXT NOT NULL,
          fecha TEXT,
          emisor TEXT,
          receptor TEXT,
          moneda_original TEXT NOT NULL,
          tipo_cambio_aplicado REAL NOT NULL,
          total_original REAL NOT NULL,
          total_crc REAL NOT NULL,
          nombre_archivo TEXT NOT NULL,
          xml_original TEXT NOT NULL,
          datos_json TEXT NOT NULL,
          creado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
          UNIQUE(perfil_id, identidad)
        );
        INSERT INTO documentos_perfiles (id, perfil_id, identidad, clave, consecutivo, version_xml,
          tipo, fecha, emisor, receptor, moneda_original, tipo_cambio_aplicado, total_original,
          total_crc, nombre_archivo, xml_original, datos_json, creado_en)
        SELECT id, 1, identidad, clave, consecutivo, version_xml, tipo, fecha, emisor, receptor,
          moneda_original, tipo_cambio_aplicado, total_original, total_crc, nombre_archivo, xml_original,
          datos_json, creado_en FROM documentos;
        DROP TABLE documentos;
        ALTER TABLE documentos_perfiles RENAME TO documentos;
      `);
    })();
  } else if (!existe) {
    db.exec(`
      CREATE TABLE documentos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        perfil_id INTEGER NOT NULL REFERENCES perfiles(id),
        identidad TEXT NOT NULL,
        clave TEXT,
        consecutivo TEXT,
        version_xml TEXT,
        tipo TEXT NOT NULL,
        fecha TEXT,
        emisor TEXT,
        receptor TEXT,
        moneda_original TEXT NOT NULL,
        tipo_cambio_aplicado REAL NOT NULL,
        total_original REAL NOT NULL,
        total_crc REAL NOT NULL,
        nombre_archivo TEXT NOT NULL,
        xml_original TEXT NOT NULL,
        datos_json TEXT NOT NULL,
        creado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        UNIQUE(perfil_id, identidad)
      );
    `);
  }
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_documentos_perfil_fecha ON documentos(perfil_id, fecha);
    CREATE INDEX IF NOT EXISTS idx_documentos_emisor ON documentos(emisor);
    CREATE INDEX IF NOT EXISTS idx_documentos_tipo ON documentos(tipo);
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS tipos_cambio (
      fecha TEXT PRIMARY KEY,
      compra REAL NOT NULL CHECK(compra>0),
      venta REAL NOT NULL CHECK(venta>0),
      origen TEXT NOT NULL,
      consultado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
  `);
  // Una consulta de un día no hábil usa la última fecha con tasa publicada.
  // Guardar la asociación evita que dos importaciones del mismo día cambien
  // de cotización al reiniciar sin Internet.
  db.exec(`
    CREATE TABLE IF NOT EXISTS tipos_cambio_fechas (
      fecha_solicitada TEXT PRIMARY KEY,
      fecha_cotizacion TEXT NOT NULL REFERENCES tipos_cambio(fecha)
    );
    CREATE INDEX IF NOT EXISTS idx_tc_fecha_cotizacion ON tipos_cambio_fechas(fecha_cotizacion);
  `);
  // La papelera conserva una copia íntegra de cada XML y de las columnas SQLite.
  // Un documento en papelera NO aparece en balances ni bloquea reimportaciones.
  db.exec(`
    CREATE TABLE IF NOT EXISTS papelera_documentos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      perfil_id_original INTEGER NOT NULL,
      perfil_nombre_original TEXT NOT NULL,
      documento_id_original INTEGER NOT NULL,
      identidad TEXT NOT NULL,
      clave TEXT,
      consecutivo TEXT,
      nombre_archivo TEXT NOT NULL,
      fecha TEXT,
      datos_json TEXT NOT NULL,
      fila_json TEXT NOT NULL,
      eliminado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE INDEX IF NOT EXISTS idx_papelera_eliminado_en ON papelera_documentos(eliminado_en);
    CREATE INDEX IF NOT EXISTS idx_papelera_perfil ON papelera_documentos(perfil_id_original);
  `);
  // v1.4.0: importaciones auditables y mensajes externos de Hacienda.
  if (!db.pragma('table_info(documentos)').some(col=>col.name==='lote_id'))
    db.exec('ALTER TABLE documentos ADD COLUMN lote_id INTEGER');
  db.exec(`
    CREATE TABLE IF NOT EXISTS lotes_importacion (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      creado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      cantidad INTEGER NOT NULL DEFAULT 0,
      deshecho_en TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_documentos_lote ON documentos(lote_id);
    CREATE TABLE IF NOT EXISTS lotes_documentos (
      lote_id INTEGER NOT NULL REFERENCES lotes_importacion(id),
      documento_id INTEGER NOT NULL,
      perfil_id_original INTEGER NOT NULL,
      PRIMARY KEY(lote_id, documento_id)
    );
    CREATE TABLE IF NOT EXISTS auditoria (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fecha TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      perfil_id INTEGER,
      accion TEXT NOT NULL,
      detalles TEXT NOT NULL DEFAULT '{}'
    );
    CREATE INDEX IF NOT EXISTS idx_auditoria_fecha ON auditoria(fecha);
    CREATE TABLE IF NOT EXISTS mensajes_hacienda (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      clave TEXT NOT NULL,
      codigo TEXT NOT NULL,
      estado TEXT NOT NULL,
      detalle TEXT NOT NULL,
      archivo TEXT NOT NULL,
      hash TEXT NOT NULL UNIQUE,
      xml_original TEXT NOT NULL,
      importado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE INDEX IF NOT EXISTS idx_mensajes_clave ON mensajes_hacienda(clave);
    CREATE TABLE IF NOT EXISTS metadatos_aplicacion (
      clave TEXT PRIMARY KEY,
      valor TEXT NOT NULL
    );
    INSERT OR IGNORE INTO metadatos_aplicacion(clave,valor)
      VALUES ('identidad','cr.comprobanteselectronicoscr.desktop');
  `);
  // v1.4.4: clasificación voluntaria; no modifica XML ni valores fiscales.
  const columnasGasto = new Set(db.pragma('table_info(documentos)').map(c => c.name));
  if (!columnasGasto.has('gasto_administrativo'))
    db.exec('ALTER TABLE documentos ADD COLUMN gasto_administrativo INTEGER NOT NULL DEFAULT 0 CHECK(gasto_administrativo IN (0,1))');
  if (!columnasGasto.has('monto_gasto_manual'))
    db.exec('ALTER TABLE documentos ADD COLUMN monto_gasto_manual REAL');
  db.pragma('user_version = 8');
}

/** Una sola base por usuario Windows, con perfiles independientes dentro de SQLite. */
function abrirBaseDatos(ruta) {
  fs.mkdirSync(path.dirname(ruta), {recursive: true});
  const db = new Database(ruta);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  instalarEsquema(db);

  const perfilPorId = db.prepare('SELECT * FROM perfiles WHERE id = ?');
  const obtenerDocumento = db.prepare('SELECT id,perfil_id,identidad FROM documentos WHERE id = ?');
  const insertar = db.prepare(`
    INSERT INTO documentos (perfil_id, identidad, clave, consecutivo, version_xml, tipo, fecha, emisor, receptor,
      moneda_original, tipo_cambio_aplicado, total_original, total_crc, nombre_archivo, xml_original, datos_json)
    VALUES (@perfil_id,@identidad,@clave,@consecutivo,@version_xml,@tipo,@fecha,@emisor,@receptor,
      @moneda_original,@tipo_cambio_aplicado,@total_original,@total_crc,@nombre_archivo,@xml_original,@datos_json)
    ON CONFLICT(perfil_id, identidad) DO NOTHING
  `);
  const listar = db.prepare('SELECT id, perfil_id, datos_json, gasto_administrativo, monto_gasto_manual FROM documentos WHERE perfil_id = ? ORDER BY fecha DESC, id DESC');
  const editarClasificacionGasto = db.prepare(`UPDATE documentos
    SET gasto_administrativo = ?, monto_gasto_manual = ?
    WHERE id = ? AND perfil_id = ?`);
  const quitarActivo = db.prepare('DELETE FROM documentos WHERE id = ? AND perfil_id = ?');
  const buscarActivoCompleto = db.prepare('SELECT * FROM documentos WHERE id = ? AND perfil_id = ?');
  const agregarAPapelera = db.prepare(`INSERT INTO papelera_documentos
    (perfil_id_original,perfil_nombre_original,documento_id_original,identidad,clave,consecutivo,
      nombre_archivo,fecha,datos_json,fila_json)
    VALUES (@perfil_id_original,@perfil_nombre_original,@documento_id_original,@identidad,@clave,
      @consecutivo,@nombre_archivo,@fecha,@datos_json,@fila_json)`);
  const obtenerPapelera = db.prepare('SELECT * FROM papelera_documentos WHERE id = ?');
  const listarPapeleraSQL = db.prepare('SELECT * FROM papelera_documentos ORDER BY eliminado_en DESC,id DESC');
  const quitarPapelera = db.prepare('DELETE FROM papelera_documentos WHERE id = ?');
  const reinsertarActivo = db.prepare(`INSERT INTO documentos
    (perfil_id,identidad,clave,consecutivo,version_xml,tipo,fecha,emisor,receptor,moneda_original,
     tipo_cambio_aplicado,total_original,total_crc,nombre_archivo,xml_original,datos_json,creado_en,
     gasto_administrativo,monto_gasto_manual)
    VALUES (@perfil_id,@identidad,@clave,@consecutivo,@version_xml,@tipo,@fecha,@emisor,@receptor,
     @moneda_original,@tipo_cambio_aplicado,@total_original,@total_crc,@nombre_archivo,@xml_original,
     @datos_json,@creado_en,@gasto_administrativo,@monto_gasto_manual)`);
  const contar = db.prepare('SELECT COUNT(*) AS cantidad FROM documentos WHERE perfil_id = ?');
  const crear = db.prepare(`INSERT INTO perfiles(nombre,cedula,correo,telefono,direccion,color)
    VALUES (@nombre,@cedula,@correo,@telefono,@direccion,@color)`);
  const actualizar = db.prepare(`UPDATE perfiles SET nombre=@nombre, cedula=@cedula, correo=@correo,
    telefono=@telefono, direccion=@direccion, color=@color WHERE id=@id`);
  const borrarPerfil = db.prepare('DELETE FROM perfiles WHERE id = ?');
  const mover = db.prepare('UPDATE documentos SET perfil_id = ? WHERE id = ?');
  const contarReferencias = db.prepare('SELECT COUNT(*) AS cantidad FROM documentos WHERE perfil_id = ?');
  const contarDuplicadosDestino = db.prepare(`SELECT COUNT(*) AS cantidad FROM documentos origen
    INNER JOIN documentos destino ON destino.perfil_id = ? AND destino.identidad = origen.identidad
    WHERE origen.perfil_id = ?`);
  const transferirADestino = db.prepare('UPDATE documentos SET perfil_id = ? WHERE perfil_id = ?');
  const documentosPerfil = db.prepare('SELECT datos_json FROM documentos WHERE perfil_id = ?');
  const buscarLegado = db.prepare('SELECT id,nombre FROM perfiles WHERE nombre = ? COLLATE NOCASE');
  const borrarDocsPerfil = db.prepare('DELETE FROM documentos WHERE perfil_id = ?');
  const obtenerTasa = db.prepare('SELECT fecha, compra, venta, origen, consultado_en FROM tipos_cambio WHERE fecha = ?');
  const ultimaTasa = db.prepare('SELECT fecha, compra, venta, origen, consultado_en FROM tipos_cambio ORDER BY fecha DESC LIMIT 1');
  const guardarTasa = db.prepare(`INSERT INTO tipos_cambio(fecha,compra,venta,origen) VALUES (@fecha,@compra,@venta,@origen)
    ON CONFLICT(fecha) DO UPDATE SET compra=excluded.compra,venta=excluded.venta,
      origen=excluded.origen,consultado_en=strftime('%Y-%m-%dT%H:%M:%fZ','now')`);
  const obtenerTasaResuelta = db.prepare(`SELECT t.fecha, t.compra, t.venta, t.origen, t.consultado_en
    FROM tipos_cambio_fechas f INNER JOIN tipos_cambio t ON t.fecha=f.fecha_cotizacion
    WHERE f.fecha_solicitada = ?`);
  const guardarFechaResuelta = db.prepare(`INSERT INTO tipos_cambio_fechas(fecha_solicitada,fecha_cotizacion)
    VALUES (?,?) ON CONFLICT(fecha_solicitada) DO UPDATE SET fecha_cotizacion=excluded.fecha_cotizacion`);
  const obtenerDocumentosRevisionIVA = db.prepare(`SELECT id, nombre_archivo AS nombreArchivo, xml_original AS xml,
    datos_json AS datos FROM documentos ORDER BY id`);
  const guardarRevisionIVA = db.prepare('UPDATE documentos SET datos_json = ? WHERE id = ?');
  const leerValoresRevisionIVA = db.prepare('SELECT total_crc, tipo_cambio_aplicado FROM documentos WHERE id = ?');
  const obtenerUSDParaRevision = db.prepare("SELECT id, nombre_archivo AS nombreArchivo, xml_original AS xml, datos_json AS datos FROM documentos WHERE moneda_original='USD' ORDER BY id");
  const auditoriaSQL=db.prepare('INSERT INTO auditoria(perfil_id,accion,detalles) VALUES (?,?,?)');
  const nuevoLote=db.prepare('INSERT INTO lotes_importacion(cantidad) VALUES (0)');
  const asignarLote=db.prepare('UPDATE documentos SET lote_id=? WHERE id=?');
  const registrarOrigenLote=db.prepare('INSERT INTO lotes_documentos(lote_id,documento_id,perfil_id_original) VALUES (?,?,?)');
  const leerOrigenLote=db.prepare('SELECT documento_id,perfil_id_original FROM lotes_documentos WHERE lote_id=?');
  const ultimoInsertado=db.prepare('SELECT last_insert_rowid() AS id');
  const obtenerLote=db.prepare('SELECT * FROM lotes_importacion WHERE id=?');
  const docsLote=db.prepare('SELECT id, perfil_id FROM documentos WHERE lote_id=? ORDER BY id');
  const finalizarLote=db.prepare('UPDATE lotes_importacion SET cantidad=? WHERE id=?');
  const deshacerLoteSQL=db.prepare("UPDATE lotes_importacion SET deshecho_en=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND deshecho_en IS NULL");
  const guardarMensaje=db.prepare(`INSERT INTO mensajes_hacienda(clave,codigo,estado,detalle,archivo,hash,xml_original)
    VALUES (@clave,@codigo,@estado,@detalle,@archivo,@hash,@xml)
    ON CONFLICT(hash) DO NOTHING`);
  const mensajeLista=db.prepare(`SELECT m.id,m.clave,m.codigo,m.estado,m.detalle,m.archivo,m.importado_en AS importadoEn,
    EXISTS(SELECT 1 FROM documentos d WHERE d.clave=m.clave AND d.perfil_id=?) AS asociado
    FROM mensajes_hacienda m WHERE EXISTS(SELECT 1 FROM documentos d WHERE d.clave=m.clave AND d.perfil_id=?)
    ORDER BY m.importado_en DESC,m.id DESC LIMIT 500`);
  const historialAuditoria=db.prepare('SELECT id,fecha,perfil_id AS perfilId,accion,detalles FROM auditoria ORDER BY id DESC LIMIT 300');
  const buscarPorClave=db.prepare('SELECT d.perfil_id AS perfilId, p.nombre AS empresa FROM documentos d JOIN perfiles p ON p.id=d.perfil_id WHERE d.clave=?');
  const ultimoBatch=db.prepare('SELECT * FROM lotes_importacion ORDER BY id DESC LIMIT 1');
  const guardarRecalculado = db.prepare(`UPDATE documentos SET tipo_cambio_aplicado=@tipoCambio,
    total_crc=@total, datos_json=@json WHERE id=@id AND moneda_original='USD'`);

  function buscarPerfil(id) {
    const n = Number(id);
    if (!Number.isSafeInteger(n) || n <= 0) throw new Error('Perfil inválido');
    const p = perfilPorId.get(n);
    if (!p) throw new Error('El perfil no existe');
    return p;
  }

  function validarIdsDocumentos(ids) {
    if(!Array.isArray(ids) || ids.length<1 || ids.length>500 ||
       ids.some(id=>!Number.isSafeInteger(id)||id<=0) || new Set(ids).size!==ids.length) {
      throw new Error('Selecciona de 1 a 500 comprobantes sin duplicados');
    }
    return ids;
  }
  function validarDestinoDocumento(doc,destino) {
    if (!destino.cedula) return;
    const ids=[doc.emisor?.identificacion?.numero,doc.receptor?.identificacion?.numero]
      .map(normalizarIdentificacion);
    if (!ids.includes(destino.cedula)) {
      throw new Error(`El comprobante ${doc.consecutivo||doc.clave||''} no corresponde a la cédula de «${destino.nombre}»`);
    }
  }

  function errorBase(error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') throw new Error('Ya existe una empresa con ese nombre');
    throw error;
  }

  function registrar(accion,perfilId,detalles) {
    const texto=JSON.stringify(detalles||{});
    if(texto.length>12000) throw new Error('Evento demasiado largo');
    auditoriaSQL.run(perfilId||null,accion,texto);
  }
  function identidadDocumento(xml,doc) {
    return doc.clave && String(doc.clave).trim() ? `clave:${String(doc.clave).trim()}`
      : `sha256:${crypto.createHash('sha256').update(xml).digest('hex')}`;
  }
  function filaImportacion(xml,doc,perfil) {
    return {perfil_id:perfil.id,identidad:identidadDocumento(xml,doc),clave:doc.clave||null,
      consecutivo:doc.consecutivo||null,version_xml:doc.versionXML||null,tipo:doc.tipoDocumento,
      fecha:doc.fecha||null,emisor:doc.emisor?.nombre||doc.comercio||null,receptor:doc.receptor?.nombre||null,
      moneda_original:doc.monedaOriginal||'CRC',tipo_cambio_aplicado:Number(doc.tipoCambioAplicado)||1,
      total_original:Number(doc.totalOriginal)||0,total_crc:Number(doc.total)||0,
      nombre_archivo:doc.nombreArchivo||'documento.xml',xml_original:xml,datos_json:JSON.stringify(doc)};
  }
  return {
    ruta,
    buscarClaveEnPerfiles(clave){return buscarPorClave.all(String(clave||''));},
    ultimoLote(){return ultimoBatch.get()||null;},
    auditar(accion,perfilId,detalles){return registrar(accion,perfilId,detalles);},
    historialAuditoria(){return historialAuditoria.all().map(r=>({...r,detalles:JSON.parse(r.detalles)}));},
    mensajesHacienda(perfilId){buscarPerfil(perfilId);return mensajeLista.all(perfilId,perfilId).map(r=>({...r,asociado:Boolean(r.asociado)}));},
    registrarMensajeHacienda(m){
      if(!/^\d{50}$/.test(m.clave)||!m.hash) throw new Error('Mensaje Hacienda sin clave válida');
      return db.transaction(()=>{
        const inserted=guardarMensaje.run(m).changes>0;
        if(inserted)registrar('MENSAJE_HACIENDA',null,{clave:m.clave,codigo:m.codigo});
        return inserted;
      })();
    },
    importarLote(items){
      if(!Array.isArray(items)||items.length<1||items.length>10)throw new Error('El lote debe contener de 1 a 10 XML');
      return db.transaction(()=>{
        const id=nuevoLote.run().lastInsertRowid;
        let nuevos=0,duplicados=0;
        const ids=[];
        for(const item of items) {
          const perfil=buscarPerfil(item.perfilId);
          const doc=item.documento;
          if(!doc||typeof item.xml!=='string'||!doc.tipoDocumento)throw new Error('XML no revisado');
          validarDestinoDocumento(doc,perfil);
          const resultado=insertar.run(filaImportacion(item.xml,doc,perfil));
          if(!resultado.changes){duplicados++;continue;}
          const docId=resultado.lastInsertRowid;
          asignarLote.run(id,docId);registrarOrigenLote.run(id,docId,perfil.id);ids.push(Number(docId));nuevos++;
          registrar('IMPORTAR_XML',perfil.id,{documentoId:Number(docId),clave:doc.clave,loteId:Number(id)});
        }
        finalizarLote.run(nuevos,id);
        return {loteId:Number(id),nuevos,duplicados,ids};
      })();
    },
    deshacerUltimoLote(id){
      return db.transaction(()=>{
        const ultimo=ultimoBatch.get();
        if(!ultimo||ultimo.id!==Number(id)||ultimo.deshecho_en)throw new Error('Solo puedes deshacer el último lote activo');
        const filas=docsLote.all(id);
        const originales=new Map(leerOrigenLote.all(id).map(r=>[r.documento_id,r.perfil_id_original]));
        if(filas.some(f=>originales.get(f.id)!==f.perfil_id))throw new Error('Un comprobante del lote fue trasladado a otra empresa; usa Papelera para revisarlo');
        if(filas.length!==ultimo.cantidad)throw new Error('Los comprobantes del lote cambiaron; revísalos en Papelera');
        for(const fila of filas) {
          const perfil=buscarPerfil(fila.perfil_id);
          const original=buscarActivoCompleto.get(fila.id,perfil.id);
          if(!original)throw new Error('Un comprobante del lote ya no está activo');
          agregarAPapelera.run({perfil_id_original:perfil.id,perfil_nombre_original:perfil.nombre,
            documento_id_original:original.id,identidad:original.identidad,clave:original.clave,
            consecutivo:original.consecutivo,nombre_archivo:original.nombre_archivo,
            fecha:original.fecha,datos_json:original.datos_json,fila_json:JSON.stringify(original)});
          if(quitarActivo.run(original.id,perfil.id).changes!==1)throw new Error('Fallo al deshacer');
        }
        deshacerLoteSQL.run(id);
        registrar('DESHACER_IMPORTACION',null,{loteId:id,documentos:filas.length});
        return {deshechos:filas.length,loteId:id};
      })();
    },
    tienePerfilLegado() {
      const legado = buscarLegado.get(LEGACY_PROFILE_NAME);
      return Boolean(legado && legado.id === 1);
    },
    // Solo se ejecuta al arrancar, DESPUÉS de confirmar un respaldo SQLite verificado.
    eliminarPerfilLegado() {
      return db.transaction(() => {
        const legado = buscarLegado.get(LEGACY_PROFILE_NAME);
        if (!legado || legado.id !== 1) return {eliminado:false,documentosEliminados:0};
        const cantidad = contar.get(legado.id).cantidad;
        borrarDocsPerfil.run(legado.id);
        if (borrarPerfil.run(legado.id).changes !== 1) throw new Error('No se pudo eliminar el perfil heredado');
        return {eliminado:true,documentosEliminados:cantidad};
      })();
    },
    tipoCambioFecha(fecha) {return obtenerTasa.get(fecha) || null;},
    tipoCambioResuelto(fechaSolicitada) {return obtenerTasaResuelta.get(fechaSolicitada) || null;},
    guardarTipoCambioResuelto(fechaSolicitada, cotizacion) {
      const {fecha,compra,venta,origen} = cotizacion;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaSolicitada) ||
          !/^\d{4}-\d{2}-\d{2}$/.test(fecha) || fecha>fechaSolicitada ||
          !Number.isFinite(compra) || !Number.isFinite(venta) ||
          compra<=0 || venta<=0 || compra>venta || !origen) {
        throw new Error('Cotización histórica o asociación de fechas inválida');
      }
      db.transaction(() => {
        guardarTasa.run({fecha,compra,venta,origen});
        guardarFechaResuelta.run(fechaSolicitada,fecha);
      })();
    },
    documentosParaRevisionIVA() {return obtenerDocumentosRevisionIVA.all();},
    actualizarImpuestosHistoricos(lista) {
      if (!Array.isArray(lista)) throw new Error('Lista de corrección IVA inválida');
      return db.transaction(() => {
        let actualizados=0;
        for (const fila of lista) {
          if (!Number.isSafeInteger(fila.id) || fila.id<=0 || !fila.documento ||
              !Number.isFinite(fila.documento.total) || !Number.isFinite(fila.documento.tipoCambioAplicado)) {
            throw new Error('Corrección IVA inválida');
          }
          const previo=leerValoresRevisionIVA.get(fila.id);
          if (!previo || Math.abs(previo.total_crc-fila.documento.total)>0.0001 ||
              Math.abs(previo.tipo_cambio_aplicado-fila.documento.tipoCambioAplicado)>0.0000001) {
            throw new Error('La corrección IVA no puede alterar el total ni el tipo de cambio históricos');
          }
          if (guardarRevisionIVA.run(JSON.stringify(fila.documento),fila.id).changes !== 1) {
            throw new Error('No se pudo actualizar el comprobante durante la corrección IVA');
          }
          actualizados++;
        }
        return actualizados;
      })();
    },
    ultimoTipoCambio() {return ultimaTasa.get() || null;},
    guardarTipoCambio(valor) {
      const {fecha,compra,venta,origen}=valor;
      if(!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || !Number.isFinite(compra) || !Number.isFinite(venta) ||
        compra<=0 || venta<=0 || compra>venta || !origen) throw new Error('Cotización inválida');
      guardarTasa.run({fecha,compra,venta,origen});
    },
    documentosUSDParaRevision() {return obtenerUSDParaRevision.all();},
    actualizarRecalculados(lista) {
      if(!Array.isArray(lista)) throw new Error('Lista inválida');
      return db.transaction(()=>{
        let actualizados=0;
        for(const doc of lista) {
          if(!Number.isSafeInteger(doc.id) || !doc.documento || !Number.isFinite(doc.documento.total) ||
             !(doc.documento.tipoCambioAplicado>0)) throw new Error('Documento recalculado inválido');
          const cambios=guardarRecalculado.run({id:doc.id,tipoCambio:doc.documento.tipoCambioAplicado,
            total:doc.documento.total,json:JSON.stringify(doc.documento)}).changes;
          if(cambios!==1) throw new Error('No se pudo actualizar uno de los documentos');
          actualizados++;
        }
        return actualizados;
      })();
    },
    perfiles() {
      return db.prepare(`SELECT p.*, (SELECT COUNT(*) FROM documentos d WHERE d.perfil_id=p.id) AS cantidad
        FROM perfiles p ORDER BY p.nombre COLLATE NOCASE`).all();
    },
    perfil: buscarPerfil,
    crearPerfil(datos) {
      const limpio=validarPerfil(datos);
      try {return db.transaction(()=>{const p=buscarPerfil(crear.run(limpio).lastInsertRowid);
        registrar('CREAR_EMPRESA',p.id,{nombre:p.nombre});return p;})();}catch(error){errorBase(error);}
    },
    actualizarPerfil(id, datos) {
      buscarPerfil(id);
      const limpio = {...validarPerfil(datos), id: Number(id)};
      try {return db.transaction(()=>{actualizar.run(limpio);
        registrar('EDITAR_EMPRESA',id,{nombre:limpio.nombre});return buscarPerfil(id);})();}
      catch (error) {errorBase(error);}
    },
    eliminarPerfil(id, {nombreConfirmacion, modo='eliminar', destinoPerfilId, documentosEsperados, confirmado} = {}) {
      const perfil = buscarPerfil(id);
      if (this.tienePerfilLegado() && perfil.id === 1) throw new Error('El perfil heredado se elimina durante la actualización con un respaldo previo');
      if (confirmado !== true || nombreConfirmacion !== perfil.nombre) {
        throw new Error('Confirma la eliminación escribiendo el nombre exacto de la empresa');
      }
      if (!['mover','eliminar'].includes(modo)) throw new Error('Selecciona cómo tratar los comprobantes');
      const esperado = Number(documentosEsperados);
      if (!Number.isSafeInteger(esperado) || esperado < 0) throw new Error('Debes confirmar el número de documentos');
      return db.transaction(() => {
        const cantidad = contarReferencias.get(perfil.id).cantidad;
        if (cantidad !== esperado) throw new Error('La cantidad de comprobantes cambió. Vuelve a confirmar la operación.');
        if (modo === 'mover') {
          const destino = buscarPerfil(destinoPerfilId);
          if (destino.id === perfil.id || destino.nombre === LEGACY_PROFILE_NAME) throw new Error('Selecciona otra empresa de destino');
          if (contarDuplicadosDestino.get(destino.id,perfil.id).cantidad) {
            throw new Error('Hay comprobantes duplicados en la empresa destino. Resuelve los duplicados antes de moverlos.');
          }
          if (destino.cedula) {
            for (const fila of documentosPerfil.all(perfil.id)) {
              const doc = JSON.parse(fila.datos_json);
              const cedulas = [doc.emisor?.identificacion?.numero,doc.receptor?.identificacion?.numero].map(normalizarIdentificacion);
              if (!cedulas.includes(destino.cedula)) throw new Error('Algunos comprobantes no corresponden a la cédula de la empresa destino');
            }
          }
          transferirADestino.run(destino.id,perfil.id);
        } else {
          borrarDocsPerfil.run(perfil.id);
        }
        if (borrarPerfil.run(perfil.id).changes !== 1) throw new Error('No se pudo eliminar la empresa');
        registrar('ELIMINAR_EMPRESA',perfil.id,{nombre:perfil.nombre,modo,documentos:cantidad});
        return {eliminado:true, documentosAfectados:cantidad, modo};
      })();
    },
    cantidad(perfilId) {buscarPerfil(perfilId); return contar.get(perfilId).cantidad;},
    insertar(xmlOriginal, documento, perfilId) {
      const perfil = buscarPerfil(perfilId);
      // Cédula opcional. Si está configurada, el XML debe corresponder al emisor o al receptor.
      if (perfil.cedula) {
        const cedulas = [documento.emisor?.identificacion?.numero, documento.receptor?.identificacion?.numero]
          .map(normalizarIdentificacion);
        if (!cedulas.includes(perfil.cedula)) {
          throw new Error(`El XML no corresponde a la cédula ${perfil.cedula} del perfil «${perfil.nombre}»`);
        }
      }
      const identidad = documento.clave && String(documento.clave).trim()
        ? `clave:${String(documento.clave).trim()}`
        : `sha256:${crypto.createHash('sha256').update(xmlOriginal).digest('hex')}`;
      const info = {
        perfil_id: perfil.id, identidad,
        clave: documento.clave || null, consecutivo: documento.consecutivo || null,
        version_xml: documento.versionXML || null,
        tipo: documento.tipoDocumento, fecha: documento.fecha || null,
        emisor: documento.emisor?.nombre || documento.comercio || null,
        receptor: documento.receptor?.nombre || null,
        moneda_original: documento.monedaOriginal || 'CRC',
        tipo_cambio_aplicado: Number(documento.tipoCambioAplicado) || 1,
        total_original: Number(documento.totalOriginal) || 0,
        total_crc: Number(documento.total) || 0,
        nombre_archivo: documento.nombreArchivo || 'documento.xml',
        xml_original: xmlOriginal,
        datos_json: JSON.stringify(documento),
      };
      return insertar.run(info).changes > 0;
    },
    listar(perfilId) {
      buscarPerfil(perfilId);
      return listar.all(perfilId).map(row => ({...JSON.parse(row.datos_json), id:row.id, perfilId: row.perfil_id,
        gastoAdministrativo: row.gasto_administrativo === 1,
        montoGastoManual: row.monto_gasto_manual}));
    },
    // Preferencia contable independiente del XML y del cómputo general de IVA.
    marcarGastoAdministrativo(perfilId, documentoId, habilitado, montoManual = null) {
      buscarPerfil(perfilId);
      if (!Number.isSafeInteger(documentoId) || documentoId <= 0 || typeof habilitado !== 'boolean')
        throw new Error('Identificadores o clasificación inválidos');
      const fila = buscarActivoCompleto.get(documentoId, perfilId);
      if (!fila) throw new Error('El documento no pertenece a la empresa seleccionada');
      let importe = null;
      if (habilitado && montoManual !== '' && montoManual !== null && montoManual !== undefined) {
        if (typeof montoManual !== 'number' || !Number.isFinite(montoManual) || montoManual <= 0 || montoManual > 1_000_000_000_000)
          throw new Error('El monto manual debe ser un número positivo y válido en colones');
        importe = Math.round(montoManual * 100000) / 100000;
      }
      return db.transaction(() => {
        const result = editarClasificacionGasto.run(habilitado ? 1 : 0, importe, documentoId, perfilId);
        if (result.changes !== 1) throw new Error('No se pudo actualizar el gasto administrativo');
        registrar('CLASIFICAR_GASTO_ADMINISTRATIVO', perfilId, {
          documentoId, habilitado, montoManual: importe,
          nota: importe !== null ? 'Importe manual solo para reportes; XML original conservado' : null,
        });
        return {documentoId, gastoAdministrativo: habilitado, montoGastoManual: importe};
      })();
    },
    // La eliminación normal siempre es recuperable: mover del historial activo a la papelera.
    enviarPapelera(perfilId, ids) {
      const origen=buscarPerfil(perfilId);
      validarIdsDocumentos(ids);
      return db.transaction(()=>{
        const filas=ids.map(id=>{
          const fila=buscarActivoCompleto.get(id,origen.id);
          if (!fila) throw new Error(`El documento ${id} no está en la empresa «${origen.nombre}». Actualiza el listado.`);
          return fila;
        });
        for (const fila of filas) {
          agregarAPapelera.run({
            perfil_id_original:origen.id, perfil_nombre_original:origen.nombre,
            documento_id_original:fila.id, identidad:fila.identidad, clave:fila.clave,
            consecutivo:fila.consecutivo, nombre_archivo:fila.nombre_archivo,
            fecha:fila.fecha, datos_json:fila.datos_json, fila_json:JSON.stringify(fila)
          });
          if (quitarActivo.run(fila.id,origen.id).changes!==1) throw new Error('No se pudo enviar el comprobante a la papelera');
        }
        registrar('ENVIAR_PAPELERA',origen.id,{cantidad:filas.length,ids});
        return {enviados:filas.length};
      })();
    },
    eliminar(id, perfilId) {return this.enviarPapelera(perfilId,[id]).enviados===1;},
    listarPapelera() {
      return listarPapeleraSQL.all().map(row=>{
        const doc=JSON.parse(row.datos_json);
        return {id:row.id,perfilOriginalId:row.perfil_id_original,
          perfilOriginalNombre:row.perfil_nombre_original,eliminadoEn:row.eliminado_en,
          documentoIdOriginal:row.documento_id_original,clave:row.clave,
          consecutivo:row.consecutivo,nombreArchivo:row.nombre_archivo,
          fecha:row.fecha,tipoDocumento:doc.tipoDocumento,total:doc.total,
          emisor:doc.emisor?.nombre||doc.comercio||'',receptor:doc.receptor?.nombre||''};
      });
    },
    restaurarPapelera(ids,destinoPerfilId) {
      validarIdsDocumentos(ids);
      const destino=buscarPerfil(destinoPerfilId);
      return db.transaction(()=>{
        const filas=ids.map(id=>{
          const fila=obtenerPapelera.get(id);
          if (!fila) throw new Error(`El comprobante ${id} ya no está en la papelera. Actualiza el listado.`);
          const doc=JSON.parse(fila.datos_json);
          validarDestinoDocumento(doc,destino);
          return fila;
        });
        for (const fila of filas) {
          const snapshot=JSON.parse(fila.fila_json);
          const columnas=['identidad','clave','consecutivo','version_xml','tipo','fecha','emisor','receptor',
            'moneda_original','tipo_cambio_aplicado','total_original','total_crc','nombre_archivo',
            'xml_original','datos_json','creado_en','gasto_administrativo','monto_gasto_manual'];
          const datos=Object.fromEntries(columnas.map(c=>[c,snapshot[c]]));
          try {reinsertarActivo.run({...datos,perfil_id:destino.id,
              gasto_administrativo: Number(snapshot.gasto_administrativo)===1?1:0,
              monto_gasto_manual: snapshot.monto_gasto_manual??null});}
          catch(error) {
            if(error.code==='SQLITE_CONSTRAINT_UNIQUE' || /UNIQUE constraint failed/.test(error.message)) throw new Error(`El comprobante ${fila.consecutivo||fila.clave||fila.id} ya existe en «${destino.nombre}». No se restauró ningún documento.`);
            throw error;
          }
          if(quitarPapelera.run(fila.id).changes!==1) throw new Error('No se pudo completar la restauración');
        }
        registrar('RESTAURAR_PAPELERA',destino.id,{cantidad:filas.length,ids});
        return {restaurados:filas.length,destinoPerfilId:destino.id};
      })();
    },
    moverLote(desdeId,ids,destinoId) {
      const origen=buscarPerfil(desdeId);
      const destino=buscarPerfil(destinoId);
      if(origen.id===destino.id) throw new Error('Selecciona una empresa diferente');
      validarIdsDocumentos(ids);
      return db.transaction(()=>{
        const filas=ids.map(id=>{
          const fila=buscarActivoCompleto.get(id,origen.id);
          if(!fila) throw new Error(`El comprobante ${id} ya no está en la empresa actual`);
          validarDestinoDocumento(JSON.parse(fila.datos_json),destino);
          return fila;
        });
        for(const fila of filas) {
          try {
            if(mover.run(destino.id,fila.id).changes!==1) throw new Error('No se pudo trasladar el comprobante');
          } catch(error) {
            if(error.code==='SQLITE_CONSTRAINT_UNIQUE' || /UNIQUE constraint failed/.test(error.message)) throw new Error(`El comprobante ${fila.consecutivo||fila.clave||fila.id} ya existe en la empresa destino. No se movió ninguno.`);
            throw error;
          }
        }
        registrar('MOVER_DOCUMENTOS',destino.id,{desdeId:origen.id,cantidad:filas.length,ids});
        return {movidos:filas.length,destinoPerfilId:destino.id};
      })();
    },
    mover(id, desdeId, destinoId) {return this.moverLote(desdeId,[id],destinoId).movidos===1;},
    respaldo(rutaDestino) {return db.backup(rutaDestino);},
    cerrar() {db.close();},
  };
}
module.exports = {abrirBaseDatos, normalizarIdentificacion, validarPerfil};
