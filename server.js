require('dotenv').config();
const express = require("express");
const mysql = require("mysql2");
const path = require("path");
const session = require("express-session");
const cookieParser = require("cookie-parser");
const bcrypt = require("bcrypt");
const nodemailer = require("nodemailer");
const crypto = require("crypto");

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


app.get("/api/debug/session", (req, res) => {
  res.json({
    ok: true,
    hasSession: !!req.session,
    sessionId: req.sessionID || null,
    user: req.session?.user || null,
  });
});

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
// Migraciones automáticas
// Agrega columnas nuevas a ofertas_trabajo sin romper datos existentes
// ==============================
async function runMigrations() {
  const cols = [
    "ALTER TABLE ofertas_trabajo ADD COLUMN IF NOT EXISTS modalidad VARCHAR(30) DEFAULT NULL",
    "ALTER TABLE ofertas_trabajo ADD COLUMN IF NOT EXISTS turno_inicio VARCHAR(5) DEFAULT NULL",
    "ALTER TABLE ofertas_trabajo ADD COLUMN IF NOT EXISTS turno_fin VARCHAR(5) DEFAULT NULL",
    "ALTER TABLE ofertas_trabajo ADD COLUMN IF NOT EXISTS zona_operacion VARCHAR(200) DEFAULT NULL",
    "ALTER TABLE ofertas_trabajo ADD COLUMN IF NOT EXISTS veh_marca VARCHAR(80) DEFAULT NULL",
    "ALTER TABLE ofertas_trabajo ADD COLUMN IF NOT EXISTS veh_modelo VARCHAR(80) DEFAULT NULL",
    "ALTER TABLE ofertas_trabajo ADD COLUMN IF NOT EXISTS veh_anio SMALLINT DEFAULT NULL",
    "ALTER TABLE ofertas_trabajo ADD COLUMN IF NOT EXISTS veh_combustible VARCHAR(20) DEFAULT NULL",
    "ALTER TABLE ofertas_trabajo ADD COLUMN IF NOT EXISTS incluye VARCHAR(200) DEFAULT NULL",
    "ALTER TABLE ofertas_trabajo ADD COLUMN IF NOT EXISTS exp_minima TINYINT UNSIGNED DEFAULT NULL",
    "ALTER TABLE ofertas_trabajo ADD COLUMN IF NOT EXISTS categoria_licencia VARCHAR(10) DEFAULT NULL",
    "ALTER TABLE ofertas_trabajo ADD COLUMN IF NOT EXISTS whatsapp VARCHAR(20) DEFAULT NULL",
    "ALTER TABLE ofertas_trabajo ADD COLUMN IF NOT EXISTS bloqueada TINYINT(1) NOT NULL DEFAULT 0",
    "ALTER TABLE ofertas_trabajo ADD COLUMN IF NOT EXISTS motivo_bloqueo VARCHAR(500) DEFAULT NULL",
    // Campos extendidos de vehículo en la tabla vehiculos
    "ALTER TABLE vehiculos ADD COLUMN IF NOT EXISTS marca VARCHAR(80) DEFAULT NULL",
    "ALTER TABLE vehiculos ADD COLUMN IF NOT EXISTS anio SMALLINT DEFAULT NULL",
    "ALTER TABLE vehiculos ADD COLUMN IF NOT EXISTS combustible VARCHAR(20) DEFAULT NULL",
    // Hoja de vida conductor — perfiles_conductores
    "ALTER TABLE perfiles_conductores ADD COLUMN IF NOT EXISTS cedula VARCHAR(20) DEFAULT NULL",
    "ALTER TABLE perfiles_conductores ADD COLUMN IF NOT EXISTS fecha_nacimiento DATE DEFAULT NULL",
    "ALTER TABLE perfiles_conductores ADD COLUMN IF NOT EXISTS direccion VARCHAR(200) DEFAULT NULL",
    "ALTER TABLE perfiles_conductores ADD COLUMN IF NOT EXISTS barrio VARCHAR(100) DEFAULT NULL",
    "ALTER TABLE perfiles_conductores ADD COLUMN IF NOT EXISTS ciudad_residencia VARCHAR(100) DEFAULT NULL",
    "ALTER TABLE perfiles_conductores ADD COLUMN IF NOT EXISTS foto_url MEDIUMTEXT",
    "ALTER TABLE perfiles_conductores ADD COLUMN IF NOT EXISTS anios_experiencia TINYINT UNSIGNED DEFAULT NULL",
    "ALTER TABLE perfiles_conductores ADD COLUMN IF NOT EXISTS ciudades_trabajadas VARCHAR(300) DEFAULT NULL",
    "ALTER TABLE perfiles_conductores ADD COLUMN IF NOT EXISTS turno_preferido VARCHAR(10) DEFAULT NULL",
    "ALTER TABLE perfiles_conductores ADD COLUMN IF NOT EXISTS categoria_licencia VARCHAR(10) DEFAULT NULL",
    "ALTER TABLE perfiles_conductores ADD COLUMN IF NOT EXISTS numero_licencia VARCHAR(30) DEFAULT NULL",
    "ALTER TABLE perfiles_conductores ADD COLUMN IF NOT EXISTS ref1_nombre VARCHAR(100) DEFAULT NULL",
    "ALTER TABLE perfiles_conductores ADD COLUMN IF NOT EXISTS ref1_telefono VARCHAR(20) DEFAULT NULL",
    "ALTER TABLE perfiles_conductores ADD COLUMN IF NOT EXISTS ref1_relacion VARCHAR(20) DEFAULT NULL",
    "ALTER TABLE perfiles_conductores ADD COLUMN IF NOT EXISTS ref2_nombre VARCHAR(100) DEFAULT NULL",
    "ALTER TABLE perfiles_conductores ADD COLUMN IF NOT EXISTS ref2_telefono VARCHAR(20) DEFAULT NULL",
    "ALTER TABLE perfiles_conductores ADD COLUMN IF NOT EXISTS ref2_relacion VARCHAR(20) DEFAULT NULL",
    "ALTER TABLE perfiles_conductores ADD COLUMN IF NOT EXISTS descripcion_personal VARCHAR(300) DEFAULT NULL",
    // Tabla para tokens de restablecimiento de contraseña
    `CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id INT AUTO_INCREMENT PRIMARY KEY,
      usuario_id INT NOT NULL,
      token VARCHAR(64) NOT NULL UNIQUE,
      expires_at DATETIME NOT NULL,
      used_at DATETIME DEFAULT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_token (token),
      INDEX idx_usuario (usuario_id)
    )`,
    // ── El Gremio ──────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS gremio_posts (
      id          INT AUTO_INCREMENT PRIMARY KEY,
      usuario_id  INT NOT NULL,
      tipo        ENUM('alerta','normativa','tip','encuesta','general') NOT NULL DEFAULT 'general',
      contenido   TEXT NOT NULL,
      ciudad      VARCHAR(100) DEFAULT NULL,
      likes_count INT NOT NULL DEFAULT 0,
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
      deleted_at  DATETIME DEFAULT NULL,
      INDEX idx_gp_usuario (usuario_id),
      INDEX idx_gp_ciudad  (ciudad),
      INDEX idx_gp_tipo    (tipo)
    )`,
    `CREATE TABLE IF NOT EXISTS gremio_likes (
      id         INT AUTO_INCREMENT PRIMARY KEY,
      post_id    INT NOT NULL,
      usuario_id INT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_like (post_id, usuario_id)
    )`,
    `CREATE TABLE IF NOT EXISTS gremio_comentarios (
      id         INT AUTO_INCREMENT PRIMARY KEY,
      post_id    INT NOT NULL,
      usuario_id INT NOT NULL,
      contenido  VARCHAR(500) NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_gc_post (post_id)
    )`,
    `CREATE TABLE IF NOT EXISTS gremio_alertas (
      id          INT AUTO_INCREMENT PRIMARY KEY,
      titulo      VARCHAR(200) NOT NULL,
      descripcion VARCHAR(500) DEFAULT NULL,
      ciudad      VARCHAR(100) DEFAULT NULL,
      tipo        ENUM('trafico','seguridad','normativa','evento','otro') NOT NULL DEFAULT 'otro',
      activa      TINYINT(1) NOT NULL DEFAULT 1,
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    // ── Toggle tema claro/oscuro ────────────────────────
    "ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS tema_preferido VARCHAR(10) NOT NULL DEFAULT 'dark'",
    `CREATE TABLE IF NOT EXISTS proveedores (
      id           INT AUTO_INCREMENT PRIMARY KEY,
      nombre       VARCHAR(200) NOT NULL,
      categoria    ENUM('taller','seguro','combustible','tecnologia','credito','uniforme','otro') NOT NULL DEFAULT 'otro',
      descripcion  TEXT DEFAULT NULL,
      ciudad       VARCHAR(100) DEFAULT NULL,
      telefono     VARCHAR(30) DEFAULT NULL,
      whatsapp     VARCHAR(30) DEFAULT NULL,
      website      VARCHAR(200) DEFAULT NULL,
      beneficio_tc VARCHAR(300) DEFAULT NULL,
      plan         ENUM('basico','patrocinado','destacado') NOT NULL DEFAULT 'basico',
      activo       TINYINT(1) NOT NULL DEFAULT 1,
      destacado    TINYINT(1) NOT NULL DEFAULT 0,
      created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_prov_cat    (categoria),
      INDEX idx_prov_ciudad (ciudad),
      INDEX idx_prov_plan   (plan)
    )`,
    `CREATE TABLE IF NOT EXISTS proveedores_contacto (
      id         INT AUTO_INCREMENT PRIMARY KEY,
      nombre     VARCHAR(200) NOT NULL,
      categoria  VARCHAR(50) DEFAULT NULL,
      ciudad     VARCHAR(100) DEFAULT NULL,
      telefono   VARCHAR(30) DEFAULT NULL,
      plan       VARCHAR(30) DEFAULT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
  ];
  for (const sql of cols) {
    try {
      await new Promise((res, rej) =>
        db.query(sql, (err) => (err ? rej(err) : res()))
      );
    } catch (e) {
      // Ignorar si la columna ya existe (MySQL < 8 no soporta IF NOT EXISTS)
      if (!String(e.message).includes("Duplicate column")) {
        console.warn("[migration] warn:", e.message);
      }
    }
  }
  console.log("✅ Migraciones ofertas_trabajo aplicadas.");
}
runMigrations();

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
  // ✅ 1) Primero: aceptar sesión (express-session)
  if (req.session?.user?.email && req.session?.user?.tipo) {
    req.tcAuth = {
      email: String(req.session.user.email).trim().toLowerCase(),
      tipo: String(req.session.user.tipo).trim().toLowerCase(),
    };
    return next();
  }

  // ✅ 2) Si no hay sesión, usar headers (modo antiguo)
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
app.post("/register", async (req, res) => {
  const { nombre, apellido, celular, email, password, rol } = req.body;

  if (!nombre || !apellido || !celular || !email || !password || !rol) {
    return res.status(400).json({ success: false, error: "Faltan campos requeridos." });
  }

  const rolValido = String(rol).trim().toLowerCase(); // conductor | propietario
  if (!["conductor", "propietario"].includes(rolValido)) {
    return res.status(400).json({ success: false, error: "Rol inválido." });
  }

  let hashedPassword;
  try {
    hashedPassword = await bcrypt.hash(password, 12);
    console.log(`[REGISTER] Hash generado para ${email}: starts_with=${hashedPassword.slice(0,7)} length=${hashedPassword.length}`);
  } catch (err) {
    console.error("Error al hashear contraseña:", err);
    return res.status(500).json({ success: false, error: "Error interno del servidor." });
  }

  const query =
    "INSERT INTO usuarios (nombres, apellidos, celular, email, password, tipo) VALUES (?, ?, ?, ?, ?, ?)";

  db.query(query, [nombre, apellido, celular, email, hashedPassword, rolValido], (err, result) => {
    if (err) {
      console.error("Error al registrar usuario:", err);
      return res.status(500).json({
        success: false,
        error: "Este correo ya está registrado o hay un error en los datos.",
      });
    }
    console.log(`[REGISTER] Usuario insertado id=${result.insertId} email=${email}`);

    // Verificar qué quedó guardado realmente en la DB
    db.query("SELECT id, email, LENGTH(password) as pwd_len, LEFT(password, 7) as pwd_prefix FROM usuarios WHERE id = ?", [result.insertId], (err2, rows) => {
      if (err2) {
        console.error("[REGISTER] No se pudo verificar el hash guardado:", err2.message);
      } else if (rows.length) {
        const r = rows[0];
        console.log(`[REGISTER] Verificación DB → id=${r.id} email=${r.email} pwd_len=${r.pwd_len} pwd_prefix=${r.pwd_prefix}`);
        if (r.pwd_len !== 60) {
          console.error(`[REGISTER] ⚠️  Hash truncado en DB: se guardaron ${r.pwd_len} chars en lugar de 60. Amplía la columna password a VARCHAR(60) o más.`);
        }
      }
    });

    res.json({ success: true, message: "Registro exitoso" });
  });
});

// ==============================
// API - Login
// ==============================
app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  const query = "SELECT id, nombres, apellidos, email, tipo, password FROM usuarios WHERE email = ?";

  db.query(query, [email], async (err, results) => {
    if (err) {
      console.error("Error en DB:", err.message);
      return res.status(500).json({ success: false, message: "Error interno del servidor" });
    }

    if (results.length === 0) {
      return res.json({ success: false, message: "Correo o contraseña incorrectos" });
    }

    const user = results[0];

    // Diagnóstico: tipo y valor del hash recuperado de la DB
    const rawPwd = user.password;
    const pwdType = Buffer.isBuffer(rawPwd) ? "Buffer" : typeof rawPwd;
    const pwdString = Buffer.isBuffer(rawPwd) ? rawPwd.toString("utf8") : String(rawPwd ?? "");
    console.log(`[LOGIN] email=${email} pwd_type=${pwdType} pwd_len=${pwdString.length} pwd_prefix=${pwdString.slice(0,7)}`);

    if (!pwdString.startsWith("$2b$") && !pwdString.startsWith("$2a$")) {
      console.error(`[LOGIN] ⚠️  El hash en DB no parece bcrypt (prefix="${pwdString.slice(0,7)}"). Posiblemente la contraseña está en texto plano o truncada.`);
    }

    let passwordMatch = false;
    try {
      passwordMatch = await bcrypt.compare(password, pwdString);
    } catch (err) {
      console.error("[LOGIN] Error al verificar contraseña:", err);
      return res.status(500).json({ success: false, message: "Error interno del servidor" });
    }

    console.log(`[LOGIN] bcrypt.compare resultado=${passwordMatch} para ${email}`);

    if (!passwordMatch) {
      return res.json({ success: false, message: "Correo o contraseña incorrectos" });
    }

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
       JOIN vehiculos v ON v.id = o.vehiculo_id
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
          p.mensaje,
          p.estado,
          o.ciudad,
          o.titulo AS oferta_titulo,
          u2.nombres AS conductor_nombre,
          u2.apellidos AS conductor_apellidos,
          pc.anios_experiencia,
          pc.ciudad_residencia,
          pc.categoria_licencia,
          pc.turno_preferido,
          pc.descripcion_personal
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

    const rows = await q(
      "SELECT id, placa, marca, modelo, anio, combustible FROM vehiculos WHERE propietario_id = ? ORDER BY id DESC",
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

    const { placa, modelo, marca, anio, combustible } = req.body || {};
    if (!placa) {
      return res.status(400).json({ ok: false, error: "La placa es obligatoria" });
    }

    const placaNorm = String(placa).trim().toUpperCase();
    const COMBUSTIBLE_OK = new Set(["gasolina", "gas", "hibrido", "electrico"]);
    const combustNorm = COMBUSTIBLE_OK.has(String(combustible || "")) ? String(combustible) : null;

    // Evitar duplicado de placa para el mismo propietario
    const dup = await q(
      "SELECT id FROM vehiculos WHERE propietario_id = ? AND placa = ? LIMIT 1",
      [perfil.id, placaNorm]
    );
    if (dup[0]) return res.status(409).json({ ok: false, error: "Ya tienes un vehículo con esa placa" });

    const r = await q(
      "INSERT INTO vehiculos (propietario_id, placa, marca, modelo, anio, combustible) VALUES (?, ?, ?, ?, ?, ?)",
      [
        perfil.id,
        placaNorm,
        marca ? String(marca).trim() : null,
        modelo ? String(modelo).trim() : null,
        anio ? Number(anio) : null,
        combustNorm,
      ]
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
      // nuevos campos
      modalidad,
      turno_inicio,
      turno_fin,
      zona_operacion,
      veh_marca,
      veh_modelo,
      veh_anio,
      veh_combustible,
      incluye,        // array o string CSV
      exp_minima,
      categoria_licencia,
      whatsapp,
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

    // Validación de documentos será automática via API RUNT en Fase 2


    const allowedTurno = new Set(["dia", "noche", "mixto"]);
    const t = allowedTurno.has(String(turno || "")) ? String(turno) : "dia";

    const allowedEstado = new Set(["activa", "pausada", "cerrada"]);
    const e = allowedEstado.has(String(estado || "")) ? String(estado) : "activa";

    const allowedModalidad = new Set(["taxi_completo","turno_fijo","turno_partido","fin_de_semana","turno_libre"]);
    const mod = allowedModalidad.has(String(modalidad || "")) ? String(modalidad) : null;

    const allowedCombustible = new Set(["gasolina","gas","hibrido"]);
    const combustible = allowedCombustible.has(String(veh_combustible || "")) ? String(veh_combustible) : null;

    const cuota = Number(cuota_diaria || 0);
    const pct = Number(porcentaje_propietario || 0);
    if (cuota <= 0 && pct <= 0) {
      return res.status(400).json({ ok: false, error: "Ingresa cuota_diaria o porcentaje_propietario (al menos uno)" });
    }

    // Normalizar incluye a CSV limpio
    let incluyeStr = null;
    if (Array.isArray(incluye) && incluye.length) {
      const allowed = new Set(["soat","mantenimiento","todo_riesgo","nada"]);
      incluyeStr = incluye.filter(x => allowed.has(String(x))).join(",") || null;
    } else if (typeof incluye === "string" && incluye.trim()) {
      incluyeStr = incluye.trim();
    }

    await q(
      `INSERT INTO ofertas_trabajo
       (propietario_id, vehiculo_id, titulo, descripcion, ciudad, turno,
        cuota_diaria, porcentaje_propietario, requisitos, estado, fecha_creacion,
        modalidad, turno_inicio, turno_fin, zona_operacion,
        veh_marca, veh_modelo, veh_anio, veh_combustible,
        incluye, exp_minima, categoria_licencia, whatsapp)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(),
               ?, ?, ?, ?,
               ?, ?, ?, ?,
               ?, ?, ?, ?)`,
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
        mod,
        turno_inicio ? String(turno_inicio).trim() : null,
        turno_fin    ? String(turno_fin).trim()    : null,
        zona_operacion ? String(zona_operacion).trim() : null,
        veh_marca  ? String(veh_marca).trim()  : null,
        veh_modelo ? String(veh_modelo).trim() : null,
        veh_anio   ? Number(veh_anio)          : null,
        combustible,
        incluyeStr,
        exp_minima   ? Number(exp_minima)          : null,
        categoria_licencia ? String(categoria_licencia).trim().toUpperCase() : null,
        whatsapp   ? String(whatsapp).trim()   : null,
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
         estado, fecha_creacion, bloqueada, motivo_bloqueo,
         modalidad, turno_inicio, turno_fin, zona_operacion,
         veh_marca, veh_modelo, veh_anio, veh_combustible,
         incluye, exp_minima, categoria_licencia, whatsapp
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
         (oferta_id, propietario_id, conductor_id, fecha_inicio, estado, notas)
         VALUES (?, ?, ?, NOW(), 'activa', NULL)`,
        [picked.oferta_id, propietarioId, picked.conductor_id]
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

// GET /api/conductor/asignacion-activa — asignación activa del conductor autenticado
app.get("/api/conductor/asignacion-activa", requireUser, async (req, res) => {
  try {
    const { email, tipo } = req.tcAuth;
    const u = await getUsuarioByEmail(email);
    if (!u) return res.status(404).json({ ok: false, error: "Usuario no existe" });
    if (tipoLower(u.tipo) !== "conductor") return res.status(403).json({ ok: false, error: "Solo conductor" });

    const perfil = await ensurePerfilConductor(u.id);

    const rows = await q(
      `SELECT
         a.id,
         DATE_FORMAT(a.fecha_inicio, '%Y-%m-%d') AS fecha_inicio,
         a.estado,
         o.titulo AS oferta_titulo,
         o.ciudad,
         o.turno,
         o.modalidad,
         o.cuota_diaria,
         o.porcentaje_propietario,
         o.incluye,
         o.zona_operacion,
         v.placa,
         v.marca,
         v.modelo,
         v.anio,
         u2.nombres AS propietario_nombre,
         u2.apellidos AS propietario_apellidos,
         u2.celular AS propietario_celular
       FROM asignaciones a
       JOIN ofertas_trabajo o ON o.id = a.oferta_id
       LEFT JOIN vehiculos v ON v.id = o.vehiculo_id
       JOIN perfiles_propietarios pp ON pp.id = a.propietario_id
       JOIN usuarios u2 ON u2.id = pp.usuario_id
       WHERE a.conductor_id = ? AND a.estado = 'activa'
       ORDER BY a.fecha_inicio DESC
       LIMIT 1`,
      [perfil.id]
    );

    res.json({ ok: true, data: rows[0] || null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: err.message });
  }
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

    const perfil = await ensurePerfilConductor(u.id);

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

    // Trabajos finalizados desde asignaciones
    let jobs = 0;
    try {
      const jRows = await q(
        `SELECT COUNT(*) AS total FROM asignaciones
         WHERE conductor_id = ? AND estado = 'finalizada'`,
        [perfil.id]
      );
      jobs = jRows[0]?.total || 0;
    } catch {
      jobs = 0;
    }

    const points = u.puntos_carrera ?? 0;

    res.json({
      success: true,
      stats: {
        nivel: u.nivel_actual || "Plata",
        score: u.score_reputacion ?? 0,
        avg: u.score_reputacion ?? 0,
        reviews: u.total_reviews ?? 0,
        rating90: u.rating_90d ?? 0,
        jobs,
        points,
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
        o.modalidad,
        o.turno_inicio,
        o.turno_fin,
        o.zona_operacion,
        o.cuota_diaria,
        o.porcentaje_propietario,
        o.incluye,
        o.veh_marca,
        o.veh_modelo,
        o.veh_anio,
        o.veh_combustible,
        o.exp_minima,
        o.categoria_licencia,
        o.whatsapp,
        o.requisitos,
        o.estado,
        DATE_FORMAT(o.fecha_creacion, '%Y-%m-%d') AS fecha_creacion,
        v.placa,
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
// =====================================================
// CONDUCTOR: Hoja de vida (perfil completo)
// =====================================================

// GET /api/conductor/perfil
app.get("/api/conductor/perfil", requireUser, async (req, res) => {
  try {
    const { email, tipo } = req.tcAuth;
    const u = await getUsuarioByEmail(email);
    if (!u) return res.status(404).json({ ok: false, error: "Usuario no existe" });
    if (tipoLower(u.tipo) !== "conductor") return res.status(403).json({ ok: false, error: "Solo conductor" });

    const perfil = await ensurePerfilConductor(u.id);

    const rows = await q(
      `SELECT pc.*, u.nombres, u.apellidos, u.email, u.telefono
       FROM perfiles_conductores pc
       JOIN usuarios u ON u.id = pc.usuario_id
       WHERE pc.id = ? LIMIT 1`,
      [perfil.id]
    );

    res.json({ ok: true, data: rows[0] || {} });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// PUT /api/conductor/perfil
app.put("/api/conductor/perfil", requireUser, async (req, res) => {
  try {
    const { email, tipo } = req.tcAuth;
    const u = await getUsuarioByEmail(email);
    if (!u) return res.status(404).json({ ok: false, error: "Usuario no existe" });
    if (tipoLower(u.tipo) !== "conductor") return res.status(403).json({ ok: false, error: "Solo conductor" });

    const perfil = await ensurePerfilConductor(u.id);

    const {
      cedula, fecha_nacimiento, direccion, barrio, ciudad_residencia, foto_url,
      anios_experiencia, ciudades_trabajadas, turno_preferido, categoria_licencia, numero_licencia,
      ref1_nombre, ref1_telefono, ref1_relacion,
      ref2_nombre, ref2_telefono, ref2_relacion,
      descripcion_personal,
    } = req.body || {};

    const allowedTurno = new Set(["dia", "noche", "mixto"]);
    const turno = allowedTurno.has(String(turno_preferido || "")) ? String(turno_preferido) : null;

    const allowedLic = new Set(["B1", "B2", "C1", "C2"]);
    const licCat = allowedLic.has(String(categoria_licencia || "")) ? String(categoria_licencia) : null;

    const allowedRel = new Set(["familiar", "laboral", "personal"]);
    const str = (v) => (v || "").toString().trim() || null;

    await q(
      `UPDATE perfiles_conductores SET
        cedula             = ?,
        fecha_nacimiento   = ?,
        direccion          = ?,
        barrio             = ?,
        ciudad_residencia  = ?,
        foto_url           = ?,
        anios_experiencia  = ?,
        ciudades_trabajadas= ?,
        turno_preferido    = ?,
        categoria_licencia = ?,
        numero_licencia    = ?,
        ref1_nombre        = ?,
        ref1_telefono      = ?,
        ref1_relacion      = ?,
        ref2_nombre        = ?,
        ref2_telefono      = ?,
        ref2_relacion      = ?,
        descripcion_personal = ?
       WHERE id = ?`,
      [
        str(cedula),
        fecha_nacimiento || null,
        str(direccion),
        str(barrio),
        str(ciudad_residencia),
        foto_url || null,
        Number(anios_experiencia) > 0 ? Number(anios_experiencia) : null,
        str(ciudades_trabajadas),
        turno,
        licCat,
        str(numero_licencia),
        str(ref1_nombre),
        str(ref1_telefono),
        allowedRel.has(String(ref1_relacion || "")) ? String(ref1_relacion) : null,
        str(ref2_nombre),
        str(ref2_telefono),
        allowedRel.has(String(ref2_relacion || "")) ? String(ref2_relacion) : null,
        str(descripcion_personal)?.slice(0, 300) || null,
        perfil.id,
      ]
    );

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/propietario/postulaciones/:id/conductor  — HV completa para propietario
app.get("/api/propietario/postulaciones/:id/conductor", requireUser, async (req, res) => {
  try {
    const { email, tipo } = req.tcAuth;
    const u = await getUsuarioByEmail(email);
    if (!u) return res.status(404).json({ ok: false, error: "Usuario no existe" });
    if (tipoLower(u.tipo) !== "propietario") return res.status(403).json({ ok: false, error: "Solo propietario" });

    const perfil = await ensurePerfilPropietario(u.id);
    const postId = Number(req.params.id);

    const rows = await q(
      `SELECT
          p.id AS postulacion_id, p.mensaje, p.estado,
          DATE_FORMAT(p.fecha_postulacion, '%Y-%m-%d') AS fecha_postulacion,
          u2.nombres, u2.apellidos, u2.email AS conductor_email, u2.telefono,
          pc.cedula, pc.fecha_nacimiento, pc.direccion, pc.barrio, pc.ciudad_residencia,
          pc.foto_url, pc.anios_experiencia, pc.ciudades_trabajadas,
          pc.turno_preferido, pc.categoria_licencia, pc.numero_licencia,
          pc.ref1_nombre, pc.ref1_telefono, pc.ref1_relacion,
          pc.ref2_nombre, pc.ref2_telefono, pc.ref2_relacion,
          pc.descripcion_personal
       FROM postulaciones p
       JOIN ofertas_trabajo o ON o.id = p.oferta_id
       JOIN perfiles_conductores pc ON pc.id = p.conductor_id
       JOIN usuarios u2 ON u2.id = pc.usuario_id
       WHERE p.id = ? AND o.propietario_id = ? AND o.deleted_at IS NULL
       LIMIT 1`,
      [postId, perfil.id]
    );

    if (!rows[0]) return res.status(404).json({ ok: false, error: "Postulación no encontrada" });

    res.json({ ok: true, data: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==============================
// TaxiBot — Chat con Claude + notificaciones Telegram
// ==============================
const Anthropic = require("@anthropic-ai/sdk");
const https = require("https");

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const TAXIBOT_SYSTEM = `Eres TaxiBot, el asistente de TaxiConfianza, plataforma colombiana que conecta conductores y propietarios de taxi. La plataforma está en fase beta. Responde en español, sé amigable y conciso. Si el usuario reporta errores graves indícale que su reporte fue enviado a soporte.`;

const SUPPORT_KEYWORDS = ["error", "problema", "falla", "soporte"];

function sendTelegram(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;
  const body = JSON.stringify({ chat_id: chatId, text });
  const options = {
    hostname: "api.telegram.org",
    path: `/bot${token}/sendMessage`,
    method: "POST",
    headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
  };
  const req = https.request(options);
  req.on("error", (e) => console.error("Telegram error:", e.message));
  req.write(body);
  req.end();
}

app.post("/api/chat", async (req, res) => {
  const { message, history = [] } = req.body;
  if (!message || typeof message !== "string") {
    return res.status(400).json({ ok: false, error: "Mensaje requerido" });
  }

  // Detectar palabras clave de soporte
  const lower = message.toLowerCase();
  const needsSupport = SUPPORT_KEYWORDS.some((kw) => lower.includes(kw));
  if (needsSupport) {
    sendTelegram(`🚨 *Reporte TaxiBot*\nUsuario: ${message}`);
  }

  try {
    // Construir historial de mensajes (máx 10 turnos)
    const messages = [];
    const recentHistory = history.slice(-10);
    for (const turn of recentHistory) {
      if (turn.role && turn.content) {
        messages.push({ role: turn.role, content: turn.content });
      }
    }
    messages.push({ role: "user", content: message });

    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 512,
      system: TAXIBOT_SYSTEM,
      messages,
    });

    const reply = response.content.find((b) => b.type === "text")?.text || "Lo siento, no pude generar una respuesta.";
    res.json({ ok: true, reply });
  } catch (err) {
    console.error("TaxiBot error:", err.message);
    res.status(500).json({ ok: false, error: "Error al contactar TaxiBot" });
  }
});

// ==============================
// Email transporter (Titan Email / SMTP)
// ==============================
const mailer = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: 465,
  secure: true,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// ==============================
// Auth - Ruta HTML reset-password
// ==============================
app.get("/reset-password.html", (req, res) =>
  res.sendFile(path.join(__dirname, "reset-password.html"))
);

// ==============================
// API - Solicitar restablecimiento de contraseña
// POST /api/auth/forgot-password
// Body: { email }
// ==============================
app.post("/api/auth/forgot-password", async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  if (!email) {
    return res.status(400).json({ success: false, message: "El email es requerido." });
  }

  try {
    const rows = await q(
      "SELECT id, nombres FROM usuarios WHERE email = ? LIMIT 1",
      [email]
    );

    // Respuesta genérica para no revelar si el email existe
    if (!rows[0]) {
      return res.json({ success: true, message: "Si el correo existe, recibirás un email con instrucciones." });
    }

    const usuario = rows[0];

    // Invalidar tokens previos no usados del mismo usuario
    await q(
      "UPDATE password_reset_tokens SET used_at = NOW() WHERE usuario_id = ? AND used_at IS NULL",
      [usuario.id]
    );

    // Generar token único
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hora

    await q(
      "INSERT INTO password_reset_tokens (usuario_id, token, expires_at) VALUES (?, ?, ?)",
      [usuario.id, token, expiresAt]
    );

    const resetLink = `https://taxiconfianza.com/reset-password.html?token=${token}`;
    const nombreUsuario = usuario.nombres || "Usuario";

    const htmlEmail = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Restablecer contraseña</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f4;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f4;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.1);max-width:600px;width:100%;">
          <!-- Header -->
          <tr>
            <td style="background-color:#f5c518;padding:30px 40px;text-align:center;">
              <h1 style="margin:0;color:#1a1a1a;font-size:28px;font-weight:900;letter-spacing:-0.5px;">
                🚖 TaxiConfianza
              </h1>
              <p style="margin:6px 0 0;color:#1a1a1a;font-size:13px;font-weight:600;letter-spacing:1px;text-transform:uppercase;">
                La plataforma del gremio taxi colombiano
              </p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:40px 40px 30px;">
              <h2 style="margin:0 0 16px;color:#1a1a1a;font-size:22px;">Restablecer contraseña</h2>
              <p style="margin:0 0 12px;color:#444;font-size:15px;line-height:1.6;">
                Hola <strong>${nombreUsuario}</strong>,
              </p>
              <p style="margin:0 0 24px;color:#444;font-size:15px;line-height:1.6;">
                Recibimos una solicitud para restablecer la contraseña de tu cuenta en TaxiConfianza.
                Haz clic en el botón de abajo para crear una nueva contraseña.
              </p>
              <!-- Button -->
              <table cellpadding="0" cellspacing="0" style="margin:0 auto 24px;">
                <tr>
                  <td style="background-color:#f5c518;border-radius:6px;text-align:center;">
                    <a href="${resetLink}"
                       style="display:inline-block;padding:14px 36px;color:#1a1a1a;font-size:16px;font-weight:700;text-decoration:none;border-radius:6px;">
                      Restablecer mi contraseña
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 8px;color:#666;font-size:13px;line-height:1.6;">
                Este enlace es válido por <strong>1 hora</strong>. Si no solicitaste este cambio,
                puedes ignorar este correo — tu contraseña no será modificada.
              </p>
              <p style="margin:0 0 24px;color:#666;font-size:12px;line-height:1.6;word-break:break-all;">
                O copia este enlace en tu navegador:<br/>
                <a href="${resetLink}" style="color:#b8960a;">${resetLink}</a>
              </p>
            </td>
          </tr>
          <!-- Divider -->
          <tr>
            <td style="padding:0 40px;"><hr style="border:none;border-top:1px solid #eee;margin:0;" /></td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:24px 40px;text-align:center;">
              <p style="margin:0;color:#999;font-size:12px;line-height:1.6;">
                TaxiConfianza · Bogotá, Colombia<br/>
                <a href="https://taxiconfianza.com" style="color:#b8960a;text-decoration:none;">taxiconfianza.com</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    await mailer.sendMail({
      from: `"TaxiConfianza" <${process.env.SMTP_USER}>`,
      to: email,
      subject: "Restablecer contraseña — TaxiConfianza",
      html: htmlEmail,
    });

    console.log(`[FORGOT-PWD] Token generado para usuario ${usuario.id}, email=${email}`);
    res.json({ success: true, message: "Si el correo existe, recibirás un email con instrucciones." });
  } catch (err) {
    console.error("[FORGOT-PWD] Error:", err);
    res.status(500).json({ success: false, message: "Error interno. Intenta de nuevo más tarde." });
  }
});

// ==============================
// API - Restablecer contraseña con token
// POST /api/auth/reset-password
// Body: { token, password }
// ==============================
app.post("/api/auth/reset-password", async (req, res) => {
  const token = String(req.body.token || "").trim();
  const newPassword = String(req.body.password || "");

  if (!token || !newPassword) {
    return res.status(400).json({ success: false, message: "Token y contraseña son requeridos." });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ success: false, message: "La contraseña debe tener al menos 6 caracteres." });
  }

  try {
    const rows = await q(
      `SELECT prt.id, prt.usuario_id, prt.expires_at, prt.used_at
       FROM password_reset_tokens prt
       WHERE prt.token = ? LIMIT 1`,
      [token]
    );

    if (!rows[0]) {
      return res.status(400).json({ success: false, message: "El enlace no es válido o ya fue usado." });
    }

    const record = rows[0];

    if (record.used_at) {
      return res.status(400).json({ success: false, message: "Este enlace ya fue usado. Solicita uno nuevo." });
    }

    if (new Date(record.expires_at) < new Date()) {
      return res.status(400).json({ success: false, message: "El enlace ha expirado. Solicita uno nuevo." });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);

    await q("UPDATE usuarios SET password = ? WHERE id = ?", [hashedPassword, record.usuario_id]);
    await q("UPDATE password_reset_tokens SET used_at = NOW() WHERE id = ?", [record.id]);

    console.log(`[RESET-PWD] Contraseña actualizada para usuario ${record.usuario_id}`);
    res.json({ success: true, message: "Contraseña actualizada correctamente. Ya puedes iniciar sesión." });
  } catch (err) {
    console.error("[RESET-PWD] Error:", err);
    res.status(500).json({ success: false, message: "Error interno. Intenta de nuevo más tarde." });
  }
});


// ==============================
// API — PROVEEDORES
// ==============================

// GET /api/proveedores?ciudad=&categoria=
app.get("/api/proveedores", requireUser, async (req, res) => {
  try {
    const ciudad    = (req.query.ciudad    || "").trim();
    const categoria = (req.query.categoria || "").trim();
    let where = "WHERE activo = 1";
    const params = [];
    if (ciudad)    { where += " AND ciudad = ?";    params.push(ciudad); }
    if (categoria) { where += " AND categoria = ?"; params.push(categoria); }
    const rows = await q(
      `SELECT id, nombre, categoria, descripcion, ciudad, telefono, whatsapp, website, beneficio_tc, plan, destacado FROM proveedores ${where} ORDER BY destacado DESC, plan DESC, created_at DESC`,
      params
    );
    res.json({ ok: true, data: rows || [] });
  } catch (err) {
    console.error("GET /api/proveedores", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/proveedores/:id
app.get("/api/proveedores/:id", requireUser, async (req, res) => {
  try {
    const id   = Number(req.params.id);
    const rows = await q(
      "SELECT id, nombre, categoria, descripcion, ciudad, telefono, whatsapp, website, beneficio_tc, plan FROM proveedores WHERE id = ? AND activo = 1 LIMIT 1",
      [id]
    );
    if (!rows[0]) return res.status(404).json({ ok: false, error: "Proveedor no encontrado" });
    res.json({ ok: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/proveedores/contacto (solicitud anunciante)
app.post("/api/proveedores/contacto", requireUser, async (req, res) => {
  try {
    const nombre    = String(req.body?.nombre    || "").trim();
    const categoria = String(req.body?.categoria || "").trim();
    const ciudad    = String(req.body?.ciudad    || "").trim();
    const telefono  = String(req.body?.telefono  || "").trim();
    const plan      = String(req.body?.plan      || "basico").trim();
    if (!nombre || !telefono) return res.status(400).json({ ok: false, error: "Nombre y teléfono son obligatorios" });
    await q(
      "INSERT INTO proveedores_contacto (nombre, categoria, ciudad, telefono, plan) VALUES (?, ?, ?, ?, ?)",
      [nombre, categoria, ciudad, telefono, plan]
    );
    res.status(201).json({ ok: true, message: "Solicitud recibida. Te contactamos pronto." });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});
// ==============================
// API — EL GREMIO
// ==============================

// GET /api/gremio/posts?ciudad=&tipo=&page=
app.get("/api/gremio/posts", requireUser, async (req, res) => {
  try {
    const ciudad = (req.query.ciudad || "").trim();
    const tipo   = (req.query.tipo   || "").trim();
    const page   = Math.max(1, parseInt(req.query.page) || 1);
    const limit  = 20;
    const offset = (page - 1) * limit;

    let where = "WHERE p.deleted_at IS NULL";
    const params = [];

    if (ciudad) { where += " AND p.ciudad = ?"; params.push(ciudad); }
    if (tipo && ["alerta","normativa","tip","encuesta","general"].includes(tipo)) {
      where += " AND p.tipo = ?"; params.push(tipo);
    }

    const u = await getUsuarioByEmail(req.tcAuth.email);

    const rows = await q(
      `SELECT
        p.id, p.tipo, p.contenido, p.ciudad, p.likes_count, p.created_at,
        u.nombres, u.apellidos, u.tipo AS usuario_tipo, u.nivel_actual,
        (SELECT COUNT(*) FROM gremio_likes gl WHERE gl.post_id = p.id AND gl.usuario_id = ?) AS yo_di_like,
        (SELECT COUNT(*) FROM gremio_comentarios gc WHERE gc.post_id = p.id) AS comentarios_count
       FROM gremio_posts p
       JOIN usuarios u ON u.id = p.usuario_id
       ${where}
       ORDER BY p.created_at DESC
       LIMIT ? OFFSET ?`,
      [u?.id || 0, ...params, limit, offset]
    );

    const total = await q(
      `SELECT COUNT(*) AS n FROM gremio_posts p ${where}`,
      params
    );

    res.json({ ok: true, data: rows || [], page, total: total[0]?.n || 0, has_more: (page * limit) < (total[0]?.n || 0) });
  } catch (err) {
    console.error("GET /api/gremio/posts", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/gremio/posts
app.post("/api/gremio/posts", requireUser, async (req, res) => {
  try {
    const u = await getUsuarioByEmail(req.tcAuth.email);
    if (!u) return res.status(404).json({ ok: false, error: "Usuario no existe" });

    const contenido = String(req.body?.contenido || "").trim();
    const tipo      = String(req.body?.tipo || "general").trim();
    const ciudad    = String(req.body?.ciudad || "").trim() || null;

    if (!contenido || contenido.length < 5) return res.status(400).json({ ok: false, error: "El contenido debe tener al menos 5 caracteres" });
    if (contenido.length > 500) return res.status(400).json({ ok: false, error: "El contenido no puede superar 500 caracteres" });

    const tiposValidos = ["alerta","normativa","tip","encuesta","general"];
    if (!tiposValidos.includes(tipo)) return res.status(400).json({ ok: false, error: "Tipo de post inválido" });

    const r = await q(
      "INSERT INTO gremio_posts (usuario_id, tipo, contenido, ciudad) VALUES (?, ?, ?, ?)",
      [u.id, tipo, contenido, ciudad]
    );
    res.status(201).json({ ok: true, id: r.insertId });
  } catch (err) {
    console.error("POST /api/gremio/posts", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// DELETE /api/gremio/posts/:id (soft delete, solo el autor)
app.delete("/api/gremio/posts/:id", requireUser, async (req, res) => {
  try {
    const u = await getUsuarioByEmail(req.tcAuth.email);
    if (!u) return res.status(404).json({ ok: false, error: "Usuario no existe" });
    const postId = Number(req.params.id);
    const r = await q(
      "UPDATE gremio_posts SET deleted_at = NOW() WHERE id = ? AND usuario_id = ? AND deleted_at IS NULL",
      [postId, u.id]
    );
    if (!r?.affectedRows) return res.status(404).json({ ok: false, error: "Post no encontrado o no tienes permiso" });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/gremio/posts/:id/like (toggle)
app.post("/api/gremio/posts/:id/like", requireUser, async (req, res) => {
  try {
    const u = await getUsuarioByEmail(req.tcAuth.email);
    if (!u) return res.status(404).json({ ok: false, error: "Usuario no existe" });
    const postId = Number(req.params.id);
    const ya = await q("SELECT id FROM gremio_likes WHERE post_id = ? AND usuario_id = ? LIMIT 1", [postId, u.id]);
    if (ya[0]) {
      await q("DELETE FROM gremio_likes WHERE post_id = ? AND usuario_id = ?", [postId, u.id]);
      await q("UPDATE gremio_posts SET likes_count = GREATEST(0, likes_count - 1) WHERE id = ?", [postId]);
      res.json({ ok: true, action: "unlike" });
    } else {
      await q("INSERT INTO gremio_likes (post_id, usuario_id) VALUES (?, ?)", [postId, u.id]);
      await q("UPDATE gremio_posts SET likes_count = likes_count + 1 WHERE id = ?", [postId]);
      res.json({ ok: true, action: "like" });
    }
  } catch (err) {
    console.error("POST /api/gremio/posts/:id/like", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/gremio/posts/:id/comentarios
app.get("/api/gremio/posts/:id/comentarios", requireUser, async (req, res) => {
  try {
    const postId = Number(req.params.id);
    const rows = await q(
      `SELECT gc.id, gc.contenido, gc.created_at,
              u.nombres, u.apellidos, u.tipo AS usuario_tipo, u.nivel_actual
       FROM gremio_comentarios gc
       JOIN usuarios u ON u.id = gc.usuario_id
       WHERE gc.post_id = ?
       ORDER BY gc.created_at ASC LIMIT 50`,
      [postId]
    );
    res.json({ ok: true, data: rows || [] });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/gremio/posts/:id/comentarios
app.post("/api/gremio/posts/:id/comentarios", requireUser, async (req, res) => {
  try {
    const u = await getUsuarioByEmail(req.tcAuth.email);
    if (!u) return res.status(404).json({ ok: false, error: "Usuario no existe" });
    const postId    = Number(req.params.id);
    const contenido = String(req.body?.contenido || "").trim();
    if (!contenido || contenido.length < 2) return res.status(400).json({ ok: false, error: "El comentario es muy corto" });
    if (contenido.length > 500) return res.status(400).json({ ok: false, error: "Comentario demasiado largo (máx 500 caracteres)" });
    const r = await q(
      "INSERT INTO gremio_comentarios (post_id, usuario_id, contenido) VALUES (?, ?, ?)",
      [postId, u.id, contenido]
    );
    res.status(201).json({ ok: true, id: r.insertId });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/gremio/alertas?ciudad=
app.get("/api/gremio/alertas", requireUser, async (req, res) => {
  try {
    const ciudad = (req.query.ciudad || "").trim();
    let where = "WHERE activa = 1";
    const params = [];
    if (ciudad) { where += " AND (ciudad = ? OR ciudad IS NULL)"; params.push(ciudad); }
    const rows = await q(
      `SELECT id, titulo, descripcion, ciudad, tipo, created_at
       FROM gremio_alertas ${where}
       ORDER BY created_at DESC LIMIT 10`,
      params
    );
    res.json({ ok: true, data: rows || [] });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/gremio/alertas (solo admin)
app.post("/api/gremio/alertas", requireUser, async (req, res) => {
  try {
    const u = await getUsuarioByEmail(req.tcAuth.email);
    if (!u) return res.status(404).json({ ok: false, error: "Usuario no existe" });
    if (tipoLower(u.tipo) !== "admin") return res.status(403).json({ ok: false, error: "Solo administradores pueden crear alertas" });
    const titulo      = String(req.body?.titulo || "").trim();
    const descripcion = String(req.body?.descripcion || "").trim() || null;
    const ciudad      = String(req.body?.ciudad || "").trim() || null;
    const tipo        = String(req.body?.tipo || "otro").trim();
    if (!titulo) return res.status(400).json({ ok: false, error: "El título es requerido" });
    const tiposValidos = ["trafico","seguridad","normativa","evento","otro"];
    const tipoFinal = tiposValidos.includes(tipo) ? tipo : "otro";
    const r = await q(
      "INSERT INTO gremio_alertas (titulo, descripcion, ciudad, tipo) VALUES (?, ?, ?, ?)",
      [titulo, descripcion, ciudad, tipoFinal]
    );
    res.status(201).json({ ok: true, id: r.insertId });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// PATCH /api/usuario/tema (guardar preferencia tema claro/oscuro)
app.patch("/api/usuario/tema", requireUser, async (req, res) => {
  try {
    const tema = String(req.body?.tema_preferido || "").trim().toLowerCase();
    if (!["dark","light"].includes(tema)) return res.status(400).json({ ok: false, error: "tema_preferido debe ser 'dark' o 'light'" });
    const u = await getUsuarioByEmail(req.tcAuth.email);
    if (!u) return res.status(404).json({ ok: false, error: "Usuario no existe" });
    await q("UPDATE usuarios SET tema_preferido = ? WHERE id = ?", [tema, u.id]);
    res.json({ ok: true, tema_preferido: tema });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==============================
// Server listen
// ==============================
const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Servidor TaxiConfianza corriendo en puerto ${PORT}`);
});
