(function () {
  async function request(path, opts = {}) {
    const user = window.TC?.session?.getUser?.();

    const headers = Object.assign(
      { "Content-Type": "application/json" },
      opts.headers || {},
      user ? { "X-User-Email": user.email, "X-User-Tipo": user.tipo } : {}
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

    if (!res.ok || data.success === false) {
      const msg = data.message || data.error || `Error HTTP ${res.status}`;
      throw new Error(msg);
    }
    return data;
  }

  window.TC = window.TC || {};
  window.TC.api = { request };
})();
