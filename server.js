const express = require("express");
const mysql = require("mysql2");
const path = require("path");
const session = require("express-session");
const cookieParser = require("cookie-parser");

const app = express();
// ✅ Railway / proxies: permitir cookies secure detrás de proxy
app.set("trust proxy", 1);

// ==============================
// Logs de errores fatales (Railway)
// ==============================
process.on("unhandledRejection", (err) => console.error("unhandledRejection:", err));
process.on("uncaughtException", (err) => console.error("uncaughtException:", err));

// ==============================
// Middleware
// ==============================
app.use(express.json());
app.use(express.static(path.join(__dirname, "/")));
// Cookies + Sesión
app.use(cookieParser());

app.use(session({
  secret: process.env.SESSION_SECRET || "tc_secret_dev",
  resave: false,
  saveUninitialized: false,
  name: "tc_sid",
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: "auto",   // ✅ detecta https con trust proxy
    maxAge: 1000 * 60 * 60 * 24 * 7 // 7 días
  }
}));


// ==============================
// Healthcheck (Railway)
// ==============================
app.get("/health", (req, res) => res.status(200).send("ok"));

// ==============================
// DB Pool (Hostinger/Railway)
// ==============================
const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD, // puede venir vacío
  database: process.env.DB_NAME,
  port: process.env.DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
});

// Verificación de conexión
db.getConnection((err, connection) => {
  if (err) {
    console.error("Error conectando a la base de datos:", err.message);
  } else {
    console.log("✅ Conexión a Base de Datos exitosa.");
    connection.release();
  }
});

// ==============================
// Helpers DB (promisify mysql2 pool)
// ==============================
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

function tipoLower(t) {
  return String(t || "").trim().toLowerCase();
}

// ==============================
// Auth simple por headers (sin JWT aún)
// Frontend debe enviar:
//   X-User-Email: correo@...
//   X-User-Tipo: propietario | conductor
// ==============================
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

// ==============================
// Ensure perfiles
// ==============================
async function ensurePerfilPropietario(usuarioId) {
  const rows = await q(
    "SELECT id, usuario_id, verificado_legalmente FROM perfiles_propietarios WHERE usuario_id = ? LIMIT 1",
    [usuarioId]
  );
  if (rows[0]) return rows[0];

  await q("INSERT INTO perfiles_propietarios (usuario_id) VALUES (?)", [usuarioId]);
  const rows2 = await q(
    "SELECT id, usuario_id, verificado_legalmente FROM perfiles_propietarios WHERE usuario_id = ? LIMIT 1",
    [usuarioId]
  );
  return rows2[0] || null;
}

async function ensurePerfilConductor(usuarioId) {
  const rows = await q(
    "SELECT id, usuario_id, documento_verificado FROM perfiles_conductores WHERE usuario_id = ? LIMIT 1",
    [usuarioId]
  );
  if (rows[0]) return rows[0];

  await q("INSERT INTO perfiles_conductores (usuario_id) VALUES (?)", [usuarioId]);
  const rows2 = await q(
    "SELECT id, usuario_id, documento_verificado FROM perfiles_conductores WHERE usuario_id = ? LIMIT 1",
    [usuarioId]
  );
  return rows2[0] || null;
}

// ==============================
// Rutas HTML
// ==============================
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "index.html")));
app.get("/login.html", (req, res) => res.sendFile(path.join(__dirname, "login.html")));
app.get("/register.html", (req, res) => res.sendFile(path.join(__dirname, "register.html")));

app.get("/dashboard-propietario.html", (req, res) =>
  res.sendFile(path.join(__dirname, "dashboard-propietario.html"))
);
app.get("/dashboard-conductor.html", (req, res) =>
  res.sendFile(path.join(__dirname, "dashboard-conductor.html"))
);

// ==============================
// API - Listado conductores (para propietario)
// ==============================
app.get("/api/conductores", (req, res) => {
  const query =
    'SELECT nombres, apellidos, email, celular, tipo FROM usuarios WHERE tipo = "conductor"';
  db.query(query, (err, results) => {
    if (err) return res.status(500).json({ success: false, error: err.message });
    res.json({ success: true, conductores: results });
  });
});

// ==============================
// API - Registro
// ==============================
app.post("/register", (req, res) => {
  const { nombre, apellido, celular, email, password, rol } = req.body;

  if (!nombre || !apellido || !celular || !email || !password || !rol) {
    return res.status(400).json({ success: false, error: "Faltan campos requeridos." });
  }

  const rolValido = String(rol).trim().toLowerCase(); // conductor | propietario
  if (!["conductor", "propietario"].includes(rolValido)) {
    return res.status(400).json({ success: false, error: "Rol inválido." });
  }

  const query =
    "INSERT INTO usuarios (nombres, apellidos, celular, email, password, tipo) VALUES (?, ?, ?, ?, ?, ?)";

  db.query(query, [nombre, apellido, celular, email, password, rolValido], (err) => {
    if (err) {
      console.error("Error al registrar usuario:", err);
      return res.status(500).json({
        success: false,
        error: "Este correo ya está registrado o hay un error en los datos.",
      });
    }
    res.json({ success: true, message: "Registro exitoso" });
  });
});

// ==============================
// API - Login
// ==============================
app.post("/login", (req, res) => {
  const { email, password } = req.body;

const query = "SELECT id, nombres, apellidos, email, tipo FROM usuarios WHERE email = ? AND password = ?";

  db.query(query, [email, password], (err, results) => {
    if (err) {
      console.error("Error en DB:", err.message);
      return res.status(500).json({ success: false, message: "Error interno del servidor" });
    }

    if (results.length > 0) {
      const user = results[0];
      // ✅ Guardar sesión (para rutas protegidas)
req.session.user = {
  id: user.id,
  email: user.email,
  tipo: String(user.tipo || "").toLowerCase(),
};

      res.json({
        success: true,
        user: {
          nombres: user.nombres,
          apellidos: user.apellidos,
          email: user.email,
          tipo: String(user.tipo || "").toLowerCase(),
        },
      });
    } else {
      res.json({ success: false, message: "Correo o contraseña incorrectos" });
    }
  });
});

// =====================================================
// DASHBOARD PROPIETARIO
// =====================================================
app.get("/api/dashboard/propietario", requireUser, async (req, res) => {
  try {
    const { email, tipo } = req.tcAuth;
    const u = await getUsuarioByEmail(email);
    if (!u) return res.status(404).json({ success: false, message: "Usuario no existe" });

    if (tipoLower(u.tipo) !== tipoLower(tipo)) {
      return res.status(403).json({ success: false, message: "Rol no coincide" });
    }
    if (tipoLower(u.tipo) !== "propietario") {
      return res.status(403).json({ success: false, message: "Solo propietario" });
    }

    const perfil = await ensurePerfilPropietario(u.id);
    const propietarioId = perfil?.id;

    const ofertasActivas = await q(
      "SELECT COUNT(*) AS n FROM ofertas_trabajo WHERE propietario_id = ? AND estado = 'activa' AND deleted_at IS NULL",
      [propietarioId]
    );
    const postulPend = await q(
      `SELECT COUNT(*) AS n
       FROM postulaciones p
       JOIN ofertas_trabajo o ON o.id = p.oferta_id
       WHERE o.propietario_id = ? AND o.deleted_at IS NULL AND p.estado IN ('pendiente','preseleccionado')`,
      [propietarioId]
    );
    const trabajoActivo = await q(
      "SELECT COUNT(*) AS n FROM asignaciones WHERE propietario_id = ? AND estado = 'activa'",
      [propietarioId]
    );

    const trabajoRows = await q(
      `SELECT
          a.id,
          o.titulo AS oferta_titulo,
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

    const postRows = await q(
      `SELECT
          p.id,
          p.oferta_id,
          p.conductor_id,
          p.estado,
          o.ciudad,
          o.titulo AS oferta_titulo,
          u2.nombres AS conductor_nombre
       FROM postulaciones p
       JOIN ofertas_trabajo o ON o.id = p.oferta_id
       JOIN perfiles_conductores pc ON pc.id = p.conductor_id
       JOIN usuarios u2 ON u2.id = pc.usuario_id
       WHERE o.propietario_id = ? AND o.deleted_at IS NULL
       ORDER BY p.fecha_postulacion DESC
       LIMIT 10`,
      [propietarioId]
    );

    res.json({
      success: true,
      owner: { id: propietarioId, verificado_legalmente: !!perfil?.verificado_legalmente },
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

// =====================================================
// PROPIETARIO: VEHICULOS (para el select)
// Devuelve { ok:true, data:[...] } para tu HTML
// =====================================================
app.get("/api/propietario/vehiculos", requireUser, async (req, res) => {
  try {
    const { email, tipo } = req.tcAuth;
    const u = await getUsuarioByEmail(email);
    if (!u) return res.status(404).json({ ok: false, error: "Usuario no existe" });

    if (tipoLower(u.tipo) !== tipoLower(tipo) || tipoLower(u.tipo) !== "propietario") {
      return res.status(403).json({ ok: false, error: "Solo propietario" });
    }

    const perfil = await ensurePerfilPropietario(u.id);

    // Ajusta columnas si tu tabla tiene más (marca, etc.)
    const rows = await q(
      "SELECT id, placa, modelo FROM vehiculos WHERE propietario_id = ? ORDER BY id DESC",
      [perfil.id]
    );

    res.json({ ok: true, data: rows || [] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: err.message || "Error vehiculos propietario" });
  }
});

app.post("/api/propietario/vehiculos", requireUser, async (req, res) => {
  try {
    const { email, tipo } = req.tcAuth;
    const u = await getUsuarioByEmail(email);
    if (!u) return res.status(404).json({ ok: false, error: "Usuario no existe" });

    if (String(u.tipo).toLowerCase() !== String(tipo).toLowerCase() || String(u.tipo).toLowerCase() !== "propietario") {
      return res.status(403).json({ ok: false, error: "Solo propietario" });
    }

    const perfil = await ensurePerfilPropietario(u.id);

    const { placa, modelo } = req.body || {};
    if (!placa || !modelo) {
      return res.status(400).json({ ok: false, error: "Faltan campos: placa, modelo" });
    }

    // Normaliza placa
    const placaNorm = String(placa).trim().toUpperCase();
    const modeloNorm = String(modelo).trim();

    // Evitar duplicado de placa para el mismo propietario
    const dup = await q(
      "SELECT id FROM vehiculos WHERE propietario_id = ? AND placa = ? LIMIT 1",
      [perfil.id, placaNorm]
    );
    if (dup[0]) return res.status(409).json({ ok: false, error: "Ya tienes un vehículo con esa placa" });

    const r = await q(
      "INSERT INTO vehiculos (propietario_id, placa, modelo) VALUES (?, ?, ?)",
      [perfil.id, placaNorm, modeloNorm]
    );

    res.status(201).json({ ok: true, id: r.insertId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: err.message || "Error creando vehículo" });
  }
});
app.delete("/api/propietario/vehiculos/:id", requireUser, async (req, res) => {
  try {
    const { email, tipo } = req.tcAuth;
    const u = await getUsuarioByEmail(email);
    if (!u) return res.status(404).json({ ok: false, error: "Usuario no existe" });

    if (String(u.tipo).toLowerCase() !== String(tipo).toLowerCase() || String(u.tipo).toLowerCase() !== "propietario") {
      return res.status(403).json({ ok: false, error: "Solo propietario" });
    }

    const perfil = await ensurePerfilPropietario(u.id);
    const id = Number(req.params.id);

    // Si tienes soft delete en vehiculos (ej deleted_at), lo cambiamos.
    // Si NO tienes, hacemos hard delete:
    const r = await q(
      "DELETE FROM vehiculos WHERE id = ? AND propietario_id = ?",
      [id, perfil.id]
    );

    if (!r || r.affectedRows === 0) return res.status(404).json({ ok: false, error: "Vehículo no encontrado" });

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: err.message || "Error eliminando vehículo" });
  }
});


// =====================================================
// PROPIETARIO: OFERTAS (CRUD básico para tu HTML)
// Tabla: ofertas_trabajo
// =====================================================

// POST /api/ofertas  (crear)
app.post("/api/ofertas", requireUser, async (req, res) => {
  try {
    const { email, tipo } = req.tcAuth;
    const u = await getUsuarioByEmail(email);
    if (!u) return res.status(404).json({ ok: false, error: "Usuario no existe" });

    if (tipoLower(u.tipo) !== tipoLower(tipo) || tipoLower(u.tipo) !== "propietario") {
      return res.status(403).json({ ok: false, error: "Solo propietario" });
    }

    const perfil = await ensurePerfilPropietario(u.id);

    const {
      vehiculo_id,
      titulo,
      descripcion,
      ciudad,
      turno,
      cuota_diaria,
      porcentaje_propietario,
      requisitos,
      estado,
    } = req.body || {};

    if (!vehiculo_id || !titulo || !ciudad) {
      return res.status(400).json({ ok: false, error: "Faltan campos: vehiculo_id, titulo, ciudad" });
    }

    // validar que el vehículo es del propietario
    const v = await q("SELECT id FROM vehiculos WHERE id = ? AND propietario_id = ? LIMIT 1", [
      vehiculo_id,
      perfil.id,
    ]);
    if (!v[0]) return res.status(400).json({ ok: false, error: "Vehículo inválido" });

    const allowedTurno = new Set(["dia", "noche", "mixto"]);
    const t = allowedTurno.has(String(turno || "")) ? String(turno) : "dia";

    const allowedEstado = new Set(["activa", "pausada", "cerrada"]);
    const e = allowedEstado.has(String(estado || "")) ? String(estado) : "activa";

    const cuota = Number(cuota_diaria || 0);
    const pct = Number(porcentaje_propietario || 0);
    if (cuota <= 0 && pct <= 0) {
      return res.status(400).json({ ok: false, error: "Ingresa cuota_diaria o porcentaje_propietario (al menos uno)" });
    }

    await q(
      `INSERT INTO ofertas_trabajo
       (propietario_id, vehiculo_id, titulo, descripcion, ciudad, turno,
        cuota_diaria, porcentaje_propietario, requisitos, estado, fecha_creacion)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        perfil.id,
        vehiculo_id,
        String(titulo).trim(),
        descripcion ? String(descripcion).trim() : null,
        String(ciudad).trim(),
        t,
        cuota > 0 ? cuota : 0,
        pct > 0 ? pct : 0,
        requisitos ? String(requisitos).trim() : null,
        e,
      ]
    );

    res.status(201).json({ ok: true, message: "Oferta publicada" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: err.message || "Error creando oferta" });
  }
});

// GET /api/propietario/ofertas (mis ofertas)
app.get("/api/propietario/ofertas", requireUser, async (req, res) => {
  try {
    const { email, tipo } = req.tcAuth;
    const u = await getUsuarioByEmail(email);
    if (!u) return res.status(404).json({ ok: false, error: "Usuario no existe" });

    if (tipoLower(u.tipo) !== tipoLower(tipo) || tipoLower(u.tipo) !== "propietario") {
      return res.status(403).json({ ok: false, error: "Solo propietario" });
    }

    const perfil = await ensurePerfilPropietario(u.id);

    const rows = await q(
      `SELECT
         id, propietario_id, vehiculo_id, titulo, descripcion, ciudad, turno,
         cuota_diaria, porcentaje_propietario, requisitos,
         estado, fecha_creacion, bloqueada, motivo_bloqueo
       FROM ofertas_trabajo
       WHERE propietario_id = ?
         AND deleted_at IS NULL
       ORDER BY fecha_creacion DESC`,
      [perfil.id]
    );

    res.json({ ok: true, data: rows || [] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: err.message || "Error cargando ofertas" });
  }
});

// PATCH /api/ofertas/:id (cambiar estado)
app.patch("/api/ofertas/:id", requireUser, async (req, res) => {
  try {
    const { email, tipo } = req.tcAuth;
    const u = await getUsuarioByEmail(email);
    if (!u) return res.status(404).json({ ok: false, error: "Usuario no existe" });

    if (tipoLower(u.tipo) !== tipoLower(tipo) || tipoLower(u.tipo) !== "propietario") {
      return res.status(403).json({ ok: false, error: "Solo propietario" });
    }

    const perfil = await ensurePerfilPropietario(u.id);
    const ofertaId = Number(req.params.id);
    const estado = String(req.body?.estado || "");

    const allowed = new Set(["activa", "pausada", "cerrada"]);
    if (!allowed.has(estado)) {
      return res.status(400).json({ ok: false, error: "Estado inválido" });
    }

    const r = await q(
      `UPDATE ofertas_trabajo
       SET estado = ?
       WHERE id = ?
         AND propietario_id = ?
         AND deleted_at IS NULL
         AND (bloqueada IS NULL OR bloqueada = 0)`,
      [estado, ofertaId, perfil.id]
    );

    if (!r || r.affectedRows === 0) {
      return res.status(404).json({ ok: false, error: "Oferta no encontrada o bloqueada" });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: err.message || "Error actualizando estado" });
  }
});

// DELETE /api/ofertas/:id (soft delete)
app.delete("/api/ofertas/:id", requireUser, async (req, res) => {
  try {
    const { email, tipo } = req.tcAuth;
    const u = await getUsuarioByEmail(email);
    if (!u) return res.status(404).json({ ok: false, error: "Usuario no existe" });

    if (tipoLower(u.tipo) !== tipoLower(tipo) || tipoLower(u.tipo) !== "propietario") {
      return res.status(403).json({ ok: false, error: "Solo propietario" });
    }

    const perfil = await ensurePerfilPropietario(u.id);
    const ofertaId = Number(req.params.id);

    const r = await q(
      `UPDATE ofertas_trabajo
       SET deleted_at = NOW()
       WHERE id = ?
         AND propietario_id = ?
         AND deleted_at IS NULL`,
      [ofertaId, perfil.id]
    );

    if (!r || r.affectedRows === 0) {
      return res.status(404).json({ ok: false, error: "Oferta no encontrada" });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: err.message || "Error eliminando oferta" });
  }
});

// =====================================================
// PROPIETARIO: Postulaciones (tus endpoints ya estaban bien)
// =====================================================
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

    const own = await q(
      `SELECT p.id
       FROM postulaciones p
       JOIN ofertas_trabajo o ON o.id = p.oferta_id
       WHERE p.id = ? AND o.propietario_id = ? AND o.deleted_at IS NULL
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

// Aceptar postulación (transacción) — se mantiene tu lógica
app.post("/api/propietario/postulaciones/:id/aceptar", requireUser, (req, res) => {
  const postId = Number(req.params.id);

  db.getConnection(async (err, conn) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ success: false, message: "No se pudo obtener conexión" });
    }

    const qConn = (sql, params = []) =>
      new Promise((resolve, reject) => conn.query(sql, params, (e, rows) => (e ? reject(e) : resolve(rows))));

    try {
      const { email, tipo } = req.tcAuth;

      const uRows = await qConn("SELECT id, email, tipo FROM usuarios WHERE email = ? LIMIT 1", [email]);
      const u = uRows[0];
      if (!u) {
        conn.release();
        return res.status(404).json({ success: false, message: "Usuario no existe" });
      }

      if (tipoLower(u.tipo) !== tipoLower(tipo) || tipoLower(u.tipo) !== "propietario") {
        conn.release();
        return res.status(403).json({ success: false, message: "Solo propietario" });
      }

      let pRows = await qConn("SELECT id FROM perfiles_propietarios WHERE usuario_id = ? LIMIT 1", [u.id]);
      let propietarioId = pRows[0]?.id;
      if (!propietarioId) {
        await qConn("INSERT INTO perfiles_propietarios (usuario_id) VALUES (?)", [u.id]);
        pRows = await qConn("SELECT id FROM perfiles_propietarios WHERE usuario_id = ? LIMIT 1", [u.id]);
        propietarioId = pRows[0]?.id;
      }

      await new Promise((resolve, reject) => conn.beginTransaction((e) => (e ? reject(e) : resolve())));

      const row = await qConn(
        `SELECT p.id AS postulacion_id, p.oferta_id, p.conductor_id, o.vehiculo_id
         FROM postulaciones p
         JOIN ofertas_trabajo o ON o.id = p.oferta_id
         WHERE p.id = ? AND o.propietario_id = ? AND o.estado = 'activa' AND o.deleted_at IS NULL
         LIMIT 1`,
        [postId, propietarioId]
      );
      const picked = row[0];
      if (!picked) {
        await new Promise((resolve) => conn.rollback(() => resolve()));
        conn.release();
        return res.status(404).json({ success: false, message: "Postulación/oferta inválida o no activa" });
      }

      const ins = await qConn(
        `INSERT INTO asignaciones
         (oferta_id, propietario_id, conductor_id, vehiculo_id, fecha_inicio, estado, notas)
         VALUES (?, ?, ?, ?, NOW(), 'activa', NULL)`,
        [picked.oferta_id, propietarioId, picked.conductor_id, picked.vehiculo_id]
      );
      const asignacionId = ins.insertId;

      await qConn("UPDATE postulaciones SET estado='aceptado' WHERE id = ?", [postId]);
      await qConn(
        `UPDATE postulaciones
         SET estado='no_seleccionado'
         WHERE oferta_id = ? AND id <> ? AND estado IN ('pendiente','preseleccionado')`,
        [picked.oferta_id, postId]
      );

      await qConn("UPDATE ofertas_trabajo SET estado='cerrada' WHERE id = ?", [picked.oferta_id]);

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

// Finalizar asignación
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

    if (!r || r.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "No se pudo finalizar (no existe o no está activa)" });
    }

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message || "Error finalizando" });
  }
});
// =====================================================
// DASHBOARD CONDUCTOR + OFERTAS
// =====================================================
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

    let notifCount = 0;
    try {
      const n = await q(
        "SELECT COUNT(*) AS n FROM notificaciones WHERE usuario_id = ? AND (leida = 0 OR leida IS NULL)",
        [u.id]
      );
      notifCount = n[0]?.n || 0;
    } catch {
      notifCount = 0;
    }

    res.json({
      success: true,
      stats: {
        nivel: u.nivel_actual || "Plata",
        score: u.score_reputacion ?? 0,
        avg: u.score_reputacion ?? 0,
        reviews: u.total_reviews ?? 0,
        rating90: u.rating_90d ?? 0,
        jobs: 0,
        points: u.puntos_carrera ?? 0,
        notifCount,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message || "Error dashboard conductor" });
  }
});
// =====================================================
// CONDUCTOR: OFERTAS ACTIVAS (para tc-conductor-ofertas.js)
// Respuesta: { ok:true, data:[...] }
// NOTA: lo dejo SIN requireUser para que no falle por headers.
// =====================================================
app.get("/api/ofertas/activas", async (req, res) => {
  try {
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
        o.estado,
        v.placa AS vehiculo,
        up.nombres AS propietario_nombres,
        up.apellidos AS propietario_apellidos
      FROM ofertas_trabajo o
      LEFT JOIN vehiculos v ON v.id = o.vehiculo_id
      LEFT JOIN perfiles_propietarios pp ON pp.id = o.propietario_id
      LEFT JOIN usuarios up ON up.id = pp.usuario_id
      WHERE o.estado = 'activa'
        AND (o.bloqueada IS NULL OR o.bloqueada = 0)
        AND o.deleted_at IS NULL
      ORDER BY o.fecha_creacion DESC
      LIMIT 200
      `
    );

    res.json({ ok: true, data: rows || [] });
  } catch (err) {
    console.error("GET /api/ofertas/activas", err);
    res.status(500).json({ ok: false, message: err.message || "Error listando ofertas" });
  }
});
// GET /api/conductor/ofertas?ciudad=&turno=&q=
app.get("/api/conductor/ofertas", requireUser, async (req, res) => {
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

    const ciudad = (req.query.ciudad || "").toString().trim();
    const turno = (req.query.turno || "").toString().trim();
    const qtxt = (req.query.q || "").toString().trim();

    const params = [conductorId];
    let where = `
      WHERE o.estado = 'activa'
        AND (o.bloqueada IS NULL OR o.bloqueada = 0)
        AND (o.deleted_at IS NULL)
    `;

    if (ciudad) {
      where += ` AND o.ciudad = ?`;
      params.push(ciudad);
    }
    if (turno) {
      where += ` AND o.turno = ?`;
      params.push(turno);
    }

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

// POST /api/conductor/ofertas/:id/postular
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

    const oferta = await q(
      "SELECT id FROM ofertas_trabajo WHERE id = ? AND estado = 'activa' AND deleted_at IS NULL AND (bloqueada IS NULL OR bloqueada = 0) LIMIT 1",
      [ofertaId]
    );
    if (!oferta[0]) return res.status(404).json({ success: false, message: "Oferta no existe o no está activa" });

    const ya = await q("SELECT id FROM postulaciones WHERE oferta_id = ? AND conductor_id = ? LIMIT 1", [
      ofertaId,
      conductorId,
    ]);
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
// =====================================
// SESION: devolver usuario actual con ID
// GET /api/session/me?email=...
// =====================================
app.get("/api/session/me", (req, res) => {
  const email = (req.query.email || "").toString().trim().toLowerCase();
  if (!email) return res.status(400).json({ ok: false, error: "Falta email" });

  const q = `
    SELECT id, email, tipo, nombres, apellidos
    FROM usuarios
    WHERE LOWER(email) = ?
    LIMIT 1
  `;

  db.query(q, [email], (err, rows) => {
    if (err) return res.status(500).json({ ok: false, error: "DB", detail: err.message });
    if (!rows || rows.length === 0) return res.status(404).json({ ok: false, error: "Usuario no encontrado" });

    return res.json({ ok: true, user: rows[0] });
  });
});
// ==============================
// Server listen
// ==============================
const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Servidor TaxiConfianza corriendo en puerto ${PORT}`);
});
