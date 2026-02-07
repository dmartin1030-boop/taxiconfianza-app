(function () {
  function getAuthFromStorage() {
    // 1) intenta con TC.session si existe
    const u = window.TC?.session?.getUser?.();
    if (u && (u.email || u.tipo)) return u;

    // 2) fallback: localStorage (lo que tú guardas en login)
    const email = localStorage.getItem("user_email") || localStorage.getItem("email") || "";
    const tipo  = localStorage.getItem("user_tipo")  || localStorage.getItem("tipo")  || "";

    // 3) fallback extra: userTaxiConfianza (json)
    let obj = null;
    try { obj = JSON.parse(localStorage.getItem("userTaxiConfianza") || "null"); } catch {}

    return {
      email: email || obj?.email || "",
      tipo:  tipo  || obj?.tipo  || ""
    };
  }

  async function request(path, opts = {}) {
    const user = getAuthFromStorage();

    const headers = Object.assign(
      { "Content-Type": "application/json" },
      opts.headers || {},
      (user?.email || user?.tipo) ? { "X-User-Email": user.email, "X-User-Tipo": user.tipo } : {}
    );

    const fetchOpts = Object.assign({}, opts, { headers });

    if (
      fetchOpts.body &&
      typeof fetchOpts.body === "object" &&
      !(fetchOpts.body instanceof FormData)
    ) {
      fetchOpts.body = JSON.stringify(fetchOpts.body);
    }

    const res = await fetch(path, fetchOpts);
    const data = await res.json().catch(() => ({}));

    if (!res.ok || data.success === false || data.ok === false) {
      const msg = data.message || data.error || `Error HTTP ${res.status}`;
      throw new Error(msg);
    }
    return data;
  }

  window.TC = window.TC || {};
  window.TC.api = { request };
})();
