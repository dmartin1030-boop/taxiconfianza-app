console.log("[tc-session] cargando...");

(function () {
  const KEY = "userTaxiConfianza";

  function normalizeRole(role) {
    return String(role || "").trim().toLowerCase();
  }

  function getUser() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const u = JSON.parse(raw);
        if (u && (u.email || u.tipo)) {
          console.log("[tc-session] getUser: OK desde userTaxiConfianza", u.email, u.tipo);
          return u;
        }
      }
    } catch (e) {
      console.warn("[tc-session] getUser: JSON inválido", e);
    }

    const email = localStorage.getItem("user_email") || "";
    const tipo  = localStorage.getItem("user_tipo") || "";
    if (email || tipo) {
      console.log("[tc-session] getUser: OK desde user_email/user_tipo", email, tipo);
      return { email, tipo };
    }

    console.log("[tc-session] getUser: NO hay sesión");
    return null;
  }
// =====================================
// Asegurar tc_usuario_id (traerlo del backend)
// =====================================
async function ensureUserId() {
  // 1) intenta leer usuario de userTaxiConfianza
  let u = null;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) u = JSON.parse(raw);
  } catch (_) {}

  // 2) o desde user_email
  const email = (u?.email || localStorage.getItem("user_email") || "").toString().trim().toLowerCase();
  if (!email) return;

  // Si ya existe, no hace nada
  const existing = Number(localStorage.getItem("tc_usuario_id"));
  if (Number.isFinite(existing) && existing > 0) return;

  try {
    const resp = await fetch(`/api/session/me?email=${encodeURIComponent(email)}`);
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || !data?.ok) return;

    const id = Number(data.user?.id);
    if (Number.isFinite(id) && id > 0) {
      localStorage.setItem("tc_usuario_id", String(id));
      console.log("[tc-session] tc_usuario_id seteado:", id);
    }
  } catch (e) {
    console.warn("[tc-session] ensureUserId error:", e);
  }
}

// Ejecutar al cargar cualquier página
ensureUserId();

  function requireRole(role) {
    const u = getUser();

    if (!u) {
      alert("Sesión inválida. Inicia sesión nuevamente.");
      return null;
    }

    if (role && normalizeRole(u.tipo) !== normalizeRole(role)) {
      alert("No tienes permisos para entrar aquí.");
      return null;
    }

    return u;
  }

  function logout(redirect = "index.html") {
    localStorage.removeItem(KEY);
    localStorage.removeItem("user_email");
    localStorage.removeItem("user_tipo");
    window.location.href = redirect;
  }

  window.TC = window.TC || {};
  window.TC.session = { getUser, requireRole, logout, normalizeRole };
})();
