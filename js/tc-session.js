function getUser() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      const u = JSON.parse(raw);
      if (!u || !u.email || !u.tipo) return null;
      return { ...u, tipo: normalizeRole(u.tipo) };
    } catch {
      return null;
    }
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
