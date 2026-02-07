// js/tc-session.js
(function () {
  const KEY = "userTaxiConfianza";

  function getUser() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function setUser(user) {
    if (!user) return;
    localStorage.setItem(KEY, JSON.stringify(user));
    if (user.email) localStorage.setItem("user_email", user.email);
    if (user.tipo)  localStorage.setItem("user_tipo", user.tipo);
  }

  function logout(redirect) {
    localStorage.removeItem(KEY);
    localStorage.removeItem("user_email");
    localStorage.removeItem("user_tipo");
    if (redirect) window.location.href = redirect;
  }

  function requireRole(role) {
    const u = getUser();
    if (!u || (role && u.tipo !== role)) {
      alert("Sesión inválida. Inicia sesión nuevamente.");
      logout("index.html");
      return null;
    }
    return u;
  }

  window.TC = window.TC || {};
  window.TC.session = {
    getUser,
    setUser,
    logout,
    requireRole
  };
})();
