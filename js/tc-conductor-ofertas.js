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
