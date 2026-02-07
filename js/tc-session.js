console.log("[tc-session] cargando...");
(function () {
  const KEY = "userTaxiConfianza";

  function normalizeRole(role) {
    return String(role || "").trim().toLowerCase();
  }

  function getUser() {
  // 1) Intentar leer el objeto completo guardado en login
  try {
    const raw = localStorage.getItem("userTaxiConfianza");
    if (raw) {
      const u = JSON.parse(raw);
      if (u && (u.email || u.tipo)) {
        console.log("[tc-session] getUser: OK desde userTaxiConfianza", u.email, u.tipo);
        return u;
      }
    }
  } catch (e) {
    console.warn("[tc-session] getUser: JSON inválido en userTaxiConfianza", e);
  }

  // 2) Fallback: leer email/tipo sueltos
  const email = localStorage.getItem("user_email") || "";
  const tipo  = localStorage.getItem("user_tipo") || "";
  if (email || tipo) {
    const u = { email, tipo };
    console.log("[tc-session] getUser: OK desde user_email/user_tipo", email, tipo);
    return u;
  }

  console.log("[tc-session] getUser: NO hay sesión");
  return null;
}

  function requireRole(role, redirect = "login.html") {
    const u = getUser();
    if (!u) {
      window.location.href = redirect;
      return null;
    }
    const expected = normalizeRole(role);
    if (normalizeRole(u.tipo) !== expected) {
      window.location.href = redirect;
      return null;
    }
    return u;
  }

  function logout(redirect = "index.html") {
    localStorage.removeItem(KEY);
    window.location.href = redirect;
  }

  window.TC = window.TC || {};
  window.TC.session = { getUser, requireRole, logout, normalizeRole };
})();
