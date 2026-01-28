const express = require('express');
const mysql = require('mysql2');
const path = require('path');
const app = express();

// Middleware para leer JSON y servir archivos estáticos
app.use(express.json());
app.use(express.static(path.join(__dirname, '/')));

// 1. Configuración del Pool de Conexiones (Optimizado para Hostinger/Railway)
const db = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000
});

// Verificación de conexión a la base de datos
db.getConnection((err, connection) => {
    if (err) {
        console.error('Error conectando a la base de datos:', err.message);
    } else {
        console.log('✅ Conexión a Base de Datos exitosa.');
        connection.release();
    }
});

// 2. Rutas de Navegación (HTML)
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/login.html', (req, res) => res.sendFile(path.join(__dirname, 'login.html')));
app.get('/register.html', (req, res) => res.sendFile(path.join(__dirname, 'register.html')));

// Rutas de Dashboards (Diferenciadas)
app.get('/dashboard-propietario.html', (req, res) => res.sendFile(path.join(__dirname, 'dashboard-propietario.html')));
app.get('/dashboard-conductor.html', (req, res) => res.sendFile(path.join(__dirname, 'dashboard-conductor.html')));

// 3. API - Listado de conductores para el Propietario
app.get('/api/conductores', (req, res) => {
    const query = 'SELECT nombres, apellidos, email, celular, tipo FROM usuarios WHERE tipo = "conductor"';
    db.query(query, (err, results) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, conductores: results });
    });
});

// 4. API - Registro de Usuarios (Propietario o Conductor)
app.post('/register', (req, res) => {
    const { nombre, apellido, celular, email, password, rol } = req.body;
    
    // Validar que el rol sea válido
    const rolValido = rol.toUpperCase(); // 'conductor' o 'propietario'
    const query = 'INSERT INTO usuarios (nombres, apellidos, celular, email, password, tipo) VALUES (?, ?, ?, ?, ?, ?)';

    db.query(query, [nombre, apellido, celular, email, password, rolValido], (err) => {
        if (err) {
            console.error('Error al registrar usuario:', err);
            return res.status(500).json({ success: false, error: 'Este correo ya está registrado o hay un error en los datos.' });
        }
        res.json({ success: true, message: 'Registro exitoso' });
    });
});

// // 5. API - Login (CORREGIDO)
app.post('/login', (req, res) => {
    const { email, password } = req.body;

    // Cambiamos password_hash por password para que coincida con tu INSERT del punto 4
    const query = 'SELECT nombres, apellidos, email, tipo FROM usuarios WHERE email = ? AND password = ?';
    
    db.query(query, [email, password], (err, results) => {
        if (err) {
            console.error("Error en DB:", err.message);
            // Enviamos un mensaje claro en lugar de dejarlo indefinido
            return res.status(500).json({ success: false, message: 'Error interno del servidor' });
        }
        
        if (results.length > 0) {
            const user = results[0];
            res.json({ 
                success: true, 
                user: {
                    nombres: user.nombres,
                    apellidos: user.apellidos,
                    email: user.email,
                    tipo: user.tipo.toUpperCase() // Usamos mayúsculas para evitar fallos de coincidencia
                }
            }); 
        } else {
            // Este mensaje es el que leerá el alert() de tu login.html
            res.json({ success: false, message: 'Correo o contraseña incorrectos' });
        }
    });
});
// ==============================
// 5.1 API NUEVA (Dashboards + Acciones)
// Pegar este bloque antes de: "// 6. Configuración del Servidor"
// ==============================

// Middleware simple: toma el usuario desde headers (porque tú no tienes JWT aún)
// El frontend (JS) envía: X-User-Email y X-User-Tipo
function requireUser(req, res, next) {
  const email = (req.headers["x-user-email"] || "").toString().trim().toLowerCase();
  const tipo = (req.headers["x-user-tipo"] || "").toString().trim().toLowerCase();

  if (!email || !tipo) {
    return res.status(401).json({
      success: false,
      message: "No autenticado. Falta X-User-Email o X-User-Tipo.",
    });
  }

  req.tcAuth = { email, tipo };
  next();
}


// Helpers DB (promisify mysql2 pool)
function q(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.query(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });
}

async function getUsuarioByEmail(email) {
  const rows = await q(
    "SELECT id, nombres, apellidos, email, tipo, nivel_actual, score_reputacion, total_reviews, rating_90d, puntos_carrera FROM usuarios WHERE email = ? LIMIT 1",
    [email]
  );
  return rows[0] || null;
}

function tipoUpper(t) {
  return String(t || "").trim().toUpperCase();
}
function tipoLower(t) {
  return String(t || "").trim().toLowerCase();
}

async function ensurePerfilPropietario(usuarioId) {
  const rows = await q("SELECT id, usuario_id, verificado_legalmente FROM perfiles_propietarios WHERE usuario_id = ? LIMIT 1", [
    usuarioId,
  ]);
  if (rows[0]) return rows[0];

  // Crear perfil "vacío" si no existe
  await q("INSERT INTO perfiles_propietarios (usuario_id) VALUES (?)", [usuarioId]);
  const rows2 = await q("SELECT id, usuario_id, verificado_legalmente FROM perfiles_propietarios WHERE usuario_id = ? LIMIT 1", [
    usuarioId,
  ]);
  return rows2[0] || null;
}

async function ensurePerfilConductor(usuarioId) {
  const rows = await q("SELECT id, usuario_id, documento_verificado FROM perfiles_conductores WHERE usuario_id = ? LIMIT 1", [
    usuarioId,
  ]);
  if (rows[0]) return rows[0];

  // Crear perfil "vacío" si no existe
  await q("INSERT INTO perfiles_conductores (usuario_id) VALUES (?)", [usuarioId]);
  const rows2 = await q("SELECT id, usuario_id, documento_verificado FROM perfiles_conductores WHERE usuario_id = ? LIMIT 1", [
    usuarioId,
  ]);
  return rows2[0] || null;
}

// ----------------------------------
// API Dashboard PROPIETARIO
// GET /api/dashboard/propietario
// Devuelve: owner + kpis + trabajo + postulaciones
// ----------------------------------
app.get("/api/dashboard/propietario", requireUser, async (req, res) => {
  try {
    const { email, tipo } = req.tcAuth;
    const u = await getUsuarioByEmail(email);
    if (!u) return res.status(404).json({ success: false, message: "Usuario no existe" });

    // Validar rol
    if (tipoLower(u.tipo) !== tipoLower(tipo)) {
      return res.status(403).json({ success: false, message: "Rol no coincide" });
    }
    if (tipoLower(u.tipo) !== "propietario") {
      return res.status(403).json({ success: false, message: "Solo propietario" });
    }

    const perfil = await ensurePerfilPropietario(u.id);
    const propietarioId = perfil?.id;

    // KPIs
    const ofertasActivas = await q(
      "SELECT COUNT(*) AS n FROM ofertas_trabajo WHERE propietario_id = ? AND estado = 'activa'",
      [propietarioId]
    );
    const postulPend = await q(
      `SELECT COUNT(*) AS n
       FROM postulaciones p
       JOIN ofertas_trabajo o ON o.id = p.oferta_id
       WHERE o.propietario_id = ? AND p.estado IN ('pendiente','preseleccionado')`,
      [propietarioId]
    );
    const trabajoActivo = await q("SELECT COUNT(*) AS n FROM asignaciones WHERE propietario_id = ? AND estado = 'activa'", [
      propietarioId,
    ]);

    // Trabajo actual (si existe)
    const trabajoRows = await q(
      `SELECT
          a.id,
          o.descripcion AS oferta_titulo,
          o.ciudad,
          DATE_FORMAT(a.fecha_inicio, '%Y-%m-%d') AS fecha_inicio,
          v.placa,
          u2.nombres AS conductor_nombre
       FROM asignaciones a
       JOIN ofertas_trabajo o ON o.id = a.oferta_id
       JOIN vehiculos v ON v.id = a.vehiculo_id
       JOIN perfiles_conductores pc ON pc.id = a.conductor_id
       JOIN usuarios u2 ON u2.id = pc.usuario_id
       WHERE a.propietario_id = ? AND a.estado = 'activa'
       ORDER BY a.fecha_inicio DESC
       LIMIT 1`,
      [propietarioId]
    );

    // Postulaciones recientes
    const postRows = await q(
      `SELECT
          p.id,
          p.oferta_id,
          p.conductor_id,
          p.estado,
          o.ciudad,
          o.descripcion AS oferta_titulo,
          u2.nombres AS conductor_nombre
       FROM postulaciones p
       JOIN ofertas_trabajo o ON o.id = p.oferta_id
       JOIN perfiles_conductores pc ON pc.id = p.conductor_id
       JOIN usuarios u2 ON u2.id = pc.usuario_id
       WHERE o.propietario_id = ?
       ORDER BY p.fecha_postulacion DESC
       LIMIT 10`,
      [propietarioId]
    );

    res.json({
      success: true,
      owner: {
        id: propietarioId,
        verificado_legalmente: !!perfil?.verificado_legalmente,
      },
      kpis: {
        ofertas_activas: ofertasActivas[0]?.n || 0,
        postulaciones_pendientes: postulPend[0]?.n || 0,
        trabajo_activo: trabajoActivo[0]?.n || 0,
      },
      trabajo: trabajoRows[0] || null,
      postulaciones: postRows || [],
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message || "Error dashboard propietario" });
  }
});

// ----------------------------------
// API PROPIETARIO: vehiculos
// GET /api/propietario/vehiculos
// ----------------------------------
app.get("/api/propietario/vehiculos", requireUser, async (req, res) => {
  try {
    const { email, tipo } = req.tcAuth;
    const u = await getUsuarioByEmail(email);
    if (!u) return res.status(404).json({ success: false, message: "Usuario no existe" });

    if (tipoLower(u.tipo) !== tipoLower(tipo) || tipoLower(u.tipo) !== "propietario") {
      return res.status(403).json({ success: false, message: "Solo propietario" });
    }

    const perfil = await ensurePerfilPropietario(u.id);
    const rows = await q("SELECT id, placa, modelo FROM vehiculos WHERE propietario_id = ? ORDER BY id DESC", [perfil.id]);

    res.json({ success: true, vehiculos: rows || [] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message || "Error vehiculos propietario" });
  }
});

// ----------------------------------
// API PROPIETARIO: crear oferta
// POST /api/propietario/ofertas
// body: { vehiculo_id, ciudad, tipo_acuerdo, cuota_diaria, porcentaje_propietario, descripcion }
// ----------------------------------
app.post("/api/propietario/ofertas", requireUser, async (req, res) => {
  try {
    const { email, tipo } = req.tcAuth;
    const u = await getUsuarioByEmail(email);
    if (!u) return res.status(404).json({ success: false, message: "Usuario no existe" });

    if (tipoLower(u.tipo) !== tipoLower(tipo) || tipoLower(u.tipo) !== "propietario") {
      return res.status(403).json({ success: false, message: "Solo propietario" });
    }

    const perfil = await ensurePerfilPropietario(u.id);

    const { vehiculo_id, ciudad, tipo_acuerdo, cuota_diaria, porcentaje_propietario, descripcion } = req.body || {};

    if (!vehiculo_id || !ciudad || !tipo_acuerdo) {
      return res.status(400).json({ success: false, message: "Faltan campos: vehiculo_id, ciudad, tipo_acuerdo" });
    }

    // validar que el vehiculo es del propietario
    const v = await q("SELECT id FROM vehiculos WHERE id = ? AND propietario_id = ? LIMIT 1", [vehiculo_id, perfil.id]);
    if (!v[0]) return res.status(400).json({ success: false, message: "Vehículo inválido" });

    await q(
      `INSERT INTO ofertas_trabajo
        (propietario_id, vehiculo_id, tipo_acuerdo, cuota_diaria, porcentaje_propietario, ciudad, descripcion, estado, fecha_creacion)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'activa', NOW())`,
      [
        perfil.id,
        vehiculo_id,
        tipo_acuerdo,
        cuota_diaria === "" ? null : cuota_diaria ?? null,
        porcentaje_propietario === "" ? null : porcentaje_propietario ?? null,
        ciudad,
        descripcion ?? null,
      ]
    );

    res.status(201).json({ success: true, message: "Oferta publicada" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message || "Error creando oferta" });
  }
});

// ----------------------------------
// API PROPIETARIO: preseleccionar postulación
// PATCH /api/propietario/postulaciones/:id/preseleccionar
// ----------------------------------
app.patch("/api/propietario/postulaciones/:id/preseleccionar", requireUser, async (req, res) => {
  try {
    const { email, tipo } = req.tcAuth;
    const u = await getUsuarioByEmail(email);
    if (!u) return res.status(404).json({ success: false, message: "Usuario no existe" });

    if (tipoLower(u.tipo) !== tipoLower(tipo) || tipoLower(u.tipo) !== "propietario") {
      return res.status(403).json({ success: false, message: "Solo propietario" });
    }

    const perfil = await ensurePerfilPropietario(u.id);
    const postId = Number(req.params.id);

    // asegurar que la postulación es de una oferta del propietario
    const own = await q(
      `SELECT p.id
       FROM postulaciones p
       JOIN ofertas_trabajo o ON o.id = p.oferta_id
       WHERE p.id = ? AND o.propietario_id = ?
       LIMIT 1`,
      [postId, perfil.id]
    );
    if (!own[0]) return res.status(404).json({ success: false, message: "Postulación no encontrada" });

    await q("UPDATE postulaciones SET estado = 'preseleccionado' WHERE id = ?", [postId]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message || "Error preseleccionando" });
  }
});

// ----------------------------------
// API PROPIETARIO: aceptar postulación (crea asignación + cierra oferta)
// POST /api/propietario/postulaciones/:id/aceptar
// ----------------------------------
app.post("/api/propietario/postulaciones/:id/aceptar", requireUser, (req, res) => {
  const postId = Number(req.params.id);

  // Usamos conexión directa para transacción (mysql2 pool)
  db.getConnection(async (err, conn) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ success: false, message: "No se pudo obtener conexión" });
    }

    try {
      const { email, tipo } = req.tcAuth;
      const uRows = await new Promise((resolve, reject) => {
        conn.query(
          "SELECT id, email, tipo FROM usuarios WHERE email = ? LIMIT 1",
          [email],
          (e, rows) => (e ? reject(e) : resolve(rows))
        );
      });
      const u = uRows[0];
      if (!u) {
        conn.release();
        return res.status(404).json({ success: false, message: "Usuario no existe" });
      }

      if (tipoLower(u.tipo) !== tipoLower(tipo) || tipoLower(u.tipo) !== "propietario") {
        conn.release();
        return res.status(403).json({ success: false, message: "Solo propietario" });
      }

      // perfil propietario
      const pRows = await new Promise((resolve, reject) => {
        conn.query(
          "SELECT id FROM perfiles_propietarios WHERE usuario_id = ? LIMIT 1",
          [u.id],
          (e, rows) => (e ? reject(e) : resolve(rows))
        );
      });
      let propietarioId = pRows[0]?.id;
      if (!propietarioId) {
        // crear perfil si no existe
        await new Promise((resolve, reject) => {
          conn.query("INSERT INTO perfiles_propietarios (usuario_id) VALUES (?)", [u.id], (e) => (e ? reject(e) : resolve()));
        });
        const pRows2 = await new Promise((resolve, reject) => {
          conn.query(
            "SELECT id FROM perfiles_propietarios WHERE usuario_id = ? LIMIT 1",
            [u.id],
            (e, rows) => (e ? reject(e) : resolve(rows))
          );
        });
        propietarioId = pRows2[0]?.id;
      }

      await new Promise((resolve, reject) => conn.beginTransaction((e) => (e ? reject(e) : resolve())));

      // traer postulación + oferta del propietario (y que oferta esté activa)
      const row = await new Promise((resolve, reject) => {
        conn.query(
          `SELECT p.id AS postulacion_id, p.oferta_id, p.conductor_id, o.vehiculo_id
           FROM postulaciones p
           JOIN ofertas_trabajo o ON o.id = p.oferta_id
           WHERE p.id = ? AND o.propietario_id = ? AND o.estado = 'activa'
           LIMIT 1`,
          [postId, propietarioId],
          (e, rows) => (e ? reject(e) : resolve(rows[0] || null))
        );
      });

      if (!row) {
        await new Promise((resolve) => conn.rollback(() => resolve()));
        conn.release();
        return res.status(404).json({ success: false, message: "Postulación/oferta inválida o no activa" });
      }

      // 1) crear asignación
      const asignacionId = await new Promise((resolve, reject) => {
        conn.query(
          `INSERT INTO asignaciones
           (oferta_id, propietario_id, conductor_id, vehiculo_id, fecha_inicio, estado, notas)
           VALUES (?, ?, ?, ?, NOW(), 'activa', NULL)`,
          [row.oferta_id, propietarioId, row.conductor_id, row.vehiculo_id],
          (e, r) => (e ? reject(e) : resolve(r.insertId))
        );
      });

      // 2) marcar postulación aceptada y otras no seleccionadas
      await new Promise((resolve, reject) => {
        conn.query("UPDATE postulaciones SET estado='aceptado' WHERE id = ?", [postId], (e) => (e ? reject(e) : resolve()));
      });
      await new Promise((resolve, reject) => {
        conn.query(
          `UPDATE postulaciones
           SET estado='no_seleccionado'
           WHERE oferta_id = ? AND id <> ? AND estado IN ('pendiente','preseleccionado')`,
          [row.oferta_id, postId],
          (e) => (e ? reject(e) : resolve())
        );
      });

      // 3) cerrar oferta
      await new Promise((resolve, reject) => {
        conn.query("UPDATE ofertas_trabajo SET estado='cerrada' WHERE id = ?", [row.oferta_id], (e) => (e ? reject(e) : resolve()));
      });

      await new Promise((resolve, reject) => conn.commit((e) => (e ? reject(e) : resolve())));

      conn.release();
      res.json({ success: true, asignacion_id: asignacionId });
    } catch (e) {
      console.error(e);
      try {
        await new Promise((resolve) => conn.rollback(() => resolve()));
      } catch {}
      conn.release();
      res.status(500).json({ success: false, message: e.message || "Error aceptando" });
    }
  });
});

// ----------------------------------
// API PROPIETARIO: finalizar asignación
// PATCH /api/propietario/asignaciones/:id/finalizar
// ----------------------------------
app.patch("/api/propietario/asignaciones/:id/finalizar", requireUser, async (req, res) => {
  try {
    const { email, tipo } = req.tcAuth;
    const u = await getUsuarioByEmail(email);
    if (!u) return res.status(404).json({ success: false, message: "Usuario no existe" });

    if (tipoLower(u.tipo) !== tipoLower(tipo) || tipoLower(u.tipo) !== "propietario") {
      return res.status(403).json({ success: false, message: "Solo propietario" });
    }

    const perfil = await ensurePerfilPropietario(u.id);
    const asignacionId = Number(req.params.id);

    const r = await q(
      `UPDATE asignaciones
       SET estado = 'finalizada', fecha_fin = NOW()
       WHERE id = ? AND propietario_id = ? AND estado = 'activa'`,
      [asignacionId, perfil.id]
    );

    // mysql2 devuelve OkPacket, no rows
    if (!r || r.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "No se pudo finalizar (no existe o no está activa)" });
    }

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message || "Error finalizando" });
  }
});

// ----------------------------------
// API Dashboard CONDUCTOR
// GET /api/dashboard/conductor
// Devuelve stats para llenar tu dashboard actual
// ----------------------------------
app.get("/api/dashboard/conductor", requireUser, async (req, res) => {
  try {
    const { email, tipo } = req.tcAuth;
    const u = await getUsuarioByEmail(email);
    if (!u) return res.status(404).json({ success: false, message: "Usuario no existe" });

    if (tipoLower(u.tipo) !== tipoLower(tipo)) {
      return res.status(403).json({ success: false, message: "Rol no coincide" });
    }
    if (tipoLower(u.tipo) !== "conductor") {
      return res.status(403).json({ success: false, message: "Solo conductor" });
    }

    await ensurePerfilConductor(u.id);

    // Notificaciones no leídas (si tu tabla tiene "leida")
    let notifCount = 0;
    try {
      const n = await q("SELECT COUNT(*) AS n FROM notificaciones WHERE usuario_id = ? AND (leida = 0 OR leida IS NULL)", [
        u.id,
      ]);
      notifCount = n[0]?.n || 0;
    } catch {
      notifCount = 0;
    }

    res.json({
      success: true,
      stats: {
        nivel: u.nivel_actual || "Plata",
        score: u.score_reputacion ?? 0,
        avg: u.score_reputacion ?? 0, // si luego calculas promedio real, lo cambias aquí
        reviews: u.total_reviews ?? 0,
        rating90: u.rating_90d ?? 0,
        jobs: 0, // si luego quieres, se saca de asignaciones finalizadas
        points: u.puntos_carrera ?? 0,
        notifCount,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message || "Error dashboard conductor" });
  }
});
// ==============================
// API CONDUCTOR: Ofertas (con detalle + estado de mi postulación)
// ==============================

// GET /api/conductor/ofertas?ciudad=Bogotá&turno=noche&q=...
app.get("/api/conductor/ofertas", requireUser, async (req, res) => {
  try {
    const { email, tipo } = req.tcAuth;

    const u = await getUsuarioByEmail(email);
    if (!u) return res.status(404).json({ success: false, message: "Usuario no existe" });

    if (tipoLower(u.tipo) !== tipoLower(tipo) || tipoLower(u.tipo) !== "conductor") {
      return res.status(403).json({ success: false, message: "Solo conductor" });
    }

    // Perfil conductor
    const perfil = await ensurePerfilConductor(u.id);
    const conductorId = perfil?.id;
    if (!conductorId) return res.status(400).json({ success: false, message: "Perfil conductor no existe" });

    const ciudad = (req.query.ciudad || "").toString().trim();
    const turno = (req.query.turno || "").toString().trim();
    const qtxt = (req.query.q || "").toString().trim();

    const params = [conductorId];
    let where = `
      WHERE o.estado = 'activa'
        AND (o.bloqueada IS NULL OR o.bloqueada = 0)
        AND (o.deleted_at IS NULL)
    `;

    if (ciudad) { where += ` AND o.ciudad = ?`; params.push(ciudad); }
    if (turno) { where += ` AND o.turno = ?`; params.push(turno); }

    if (qtxt) {
      where += ` AND (o.titulo LIKE ? OR o.descripcion LIKE ? OR o.requisitos LIKE ?)`;
      const like = `%${qtxt}%`;
      params.push(like, like, like);
    }

    const rows = await q(
      `
      SELECT
        o.id,
        o.titulo,
        o.descripcion,
        o.ciudad,
        o.turno,
        o.cuota_diaria,
        o.porcentaje_propietario,
        o.requisitos,
        DATE_FORMAT(o.fecha_creacion, '%Y-%m-%d') AS fecha_creacion,
        v.placa,
        v.modelo,
        CONCAT(up.nombres, ' ', up.apellidos) AS propietario_nombre,
        p.estado AS mi_postulacion_estado,
        DATE_FORMAT(p.fecha_postulacion, '%Y-%m-%d') AS mi_fecha_postulacion
      FROM ofertas_trabajo o
      LEFT JOIN vehiculos v ON v.id = o.vehiculo_id
      LEFT JOIN perfiles_propietarios pp ON pp.id = o.propietario_id
      LEFT JOIN usuarios up ON up.id = pp.usuario_id
      LEFT JOIN postulaciones p ON p.oferta_id = o.id AND p.conductor_id = ?
      ${where}
      ORDER BY o.fecha_creacion DESC
      LIMIT 100
      `,
      params
    );

    res.json({ success: true, ofertas: rows || [] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message || "Error listando ofertas" });
  }
});

// POST /api/conductor/ofertas/:id/postular  body: {mensaje, cv_url}
app.post("/api/conductor/ofertas/:id/postular", requireUser, async (req, res) => {
  try {
    const { email, tipo } = req.tcAuth;

    const u = await getUsuarioByEmail(email);
    if (!u) return res.status(404).json({ success: false, message: "Usuario no existe" });

    if (tipoLower(u.tipo) !== tipoLower(tipo) || tipoLower(u.tipo) !== "conductor") {
      return res.status(403).json({ success: false, message: "Solo conductor" });
    }

    const perfil = await ensurePerfilConductor(u.id);
    const conductorId = perfil?.id;
    if (!conductorId) return res.status(400).json({ success: false, message: "Perfil conductor no existe" });

    const ofertaId = Number(req.params.id);
    if (!ofertaId) return res.status(400).json({ success: false, message: "Oferta inválida" });

    const mensaje = (req.body?.mensaje || "").toString().trim() || null;
    const cv_url = (req.body?.cv_url || "").toString().trim() || null;

    // validar oferta activa (si no tienes bloqueada/deleted_at, te lo ajusto)
    const oferta = await q(
      "SELECT id FROM ofertas_trabajo WHERE id = ? AND estado = 'activa' LIMIT 1",
      [ofertaId]
    );
    if (!oferta[0]) return res.status(404).json({ success: false, message: "Oferta no existe o no está activa" });

    // evitar doble postulación
    const ya = await q(
      "SELECT id FROM postulaciones WHERE oferta_id = ? AND conductor_id = ? LIMIT 1",
      [ofertaId, conductorId]
    );
    if (ya[0]) return res.json({ success: true, message: "Ya estabas postulado a esta oferta." });

    await q(
      "INSERT INTO postulaciones (oferta_id, conductor_id, mensaje, cv_url, estado, fecha_postulacion) VALUES (?, ?, ?, ?, 'pendiente', NOW())",
      [ofertaId, conductorId, mensaje, cv_url]
    );

    res.json({ success: true, message: "✅ Postulación enviada." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message || "Error postulando" });
  }
});

// 6. Configuración del Servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor TaxiConfianza corriendo en puerto ${PORT}`);
});
