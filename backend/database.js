'use strict';
const Database = require('better-sqlite3');
const crypto = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs');

const LEGACY_PROFILE_NAME = 'Sin asignar (historial anterior)';

function normalizarIdentificacion(value) {
  return String(value || '').replace(/[^\dA-Za-z]/g, '').toUpperCase();
}

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
  db.pragma('user_version = 5');
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
  const listar = db.prepare('SELECT id, perfil_id, datos_json FROM documentos WHERE perfil_id = ? ORDER BY fecha DESC, id DESC');
  const borrar = db.prepare('DELETE FROM documentos WHERE id = ? AND perfil_id = ?');
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
  const guardarRecalculado = db.prepare(`UPDATE documentos SET tipo_cambio_aplicado=@tipoCambio,
    total_crc=@total, datos_json=@json WHERE id=@id AND moneda_original='USD'`);

  function buscarPerfil(id) {
    const n = Number(id);
    if (!Number.isSafeInteger(n) || n <= 0) throw new Error('Perfil inválido');
    const p = perfilPorId.get(n);
    if (!p) throw new Error('El perfil no existe');
    return p;
  }

  function errorBase(error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') throw new Error('Ya existe una empresa con ese nombre');
    throw error;
  }

  return {
    ruta,
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
      const limpio = validarPerfil(datos);
      try {return buscarPerfil(crear.run(limpio).lastInsertRowid);} catch (error) {errorBase(error);}
    },
    actualizarPerfil(id, datos) {
      buscarPerfil(id);
      const limpio = {...validarPerfil(datos), id: Number(id)};
      try {actualizar.run(limpio); return buscarPerfil(id);} catch (error) {errorBase(error);}
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
      return listar.all(perfilId).map(row => ({...JSON.parse(row.datos_json), id:row.id, perfilId: row.perfil_id}));
    },
    eliminar(id, perfilId) {buscarPerfil(perfilId); return borrar.run(id,perfilId).changes > 0;},
    mover(id, desdeId, destinoId) {
      buscarPerfil(desdeId);
      const destino = buscarPerfil(destinoId);
      const doc = obtenerDocumento.get(id);
      if (!doc || doc.perfil_id !== Number(desdeId)) throw new Error('Comprobante no encontrado en el perfil actual');
      if (doc.perfil_id === destino.id) return false;
      const completo = JSON.parse(db.prepare('SELECT datos_json FROM documentos WHERE id=?').get(id).datos_json);
      if (destino.cedula) {
        const ids = [completo.emisor?.identificacion?.numero, completo.receptor?.identificacion?.numero].map(normalizarIdentificacion);
        if (!ids.includes(destino.cedula)) throw new Error('El comprobante no corresponde a la identificación de la empresa destino');
      }
      try {return mover.run(destino.id,id).changes > 0;} catch(error) {
        if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') throw new Error('Ese comprobante ya existe en la empresa destino');
        throw error;
      }
    },
    respaldo(rutaDestino) {return db.backup(rutaDestino);},
    cerrar() {db.close();},
  };
}
module.exports = {abrirBaseDatos, normalizarIdentificacion, validarPerfil};
