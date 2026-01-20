// js/tc-conductor-ofertas.js
(function () {
  function $(id) { return document.getElementById(id); }

  function escapeHtml(s) {
    return String(s ?? "").replace(/[&<>"']/g, (m) => {
      return (
        { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[m] || m
      );
    });
  }

  function setMsg(text) {
    const el = $("msg");
    if (el) el.textContent = text || "";
  }

  function render(offers) {
    const tbody = $("offersTable");
    if (!tbody) return;

    if (!offers || offers.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="muted">No hay ofertas activas en este momento.</td></tr>`;
      return;
    }

    tbody.innerHTML = offers.map(o => {
      const acuerdoParts = [];
      if (o.tipo_acuerdo) acuerdoParts.push(o.tipo_acuerdo);
      if (o.cuota_diaria != null) acuerdoParts.push(`Cuota: ${o.cuota_diaria}`);
      if (o.porcentaje_propietario != null) acuerdoParts.push(`% Prop.: ${o.porcentaje_propietario}`);

      return `
        <tr>
          <td>
            <strong>${escapeHtml(o.descripcion || "Oferta")}</strong>
            <div class="muted">${escapeHtml(o.ciudad || "")} · Oferta #${o.id}</div>
          </td>
          <td>
            ${escapeHtml(acuerdoParts.join(" · ") || "—")}
          </td>
          <td>
            <strong>${escapeHtml(o.placa || "—")}</strong>
            <div class="muted">${escapeHtml(o.modelo || "")}</div>
          </td>
          <td>${escapeHtml(o.fecha_creacion || "—")}</td>
          <td style="text-align:right">
            <button class="btn primary" data-action="postular" data-id="${o.id}">Postular</button>
          </td>
        </tr>
      `;
    }).join("");
  }

  async function loadOffers() {
    setMsg("Cargando ofertas…");
    const city = ($("cityFilter")?.value || "").trim();

    const qs = city ? `?ciudad=${encodeURIComponent(city)}` : "";
    const data = await window.TC.api.request(`/api/conductor/ofertas${qs}`);
    render(data.ofertas || []);
    setMsg("");
  }

  function attachActions() {
    // Logout
    $("btnLogout")?.addEventListener("click", () => window.TC.session.logout("index.html"));

    // Refresh
    $("btnRefresh")?.addEventListener("click", loadOffers);

    // Postular
    $("offersTable")?.addEventListener("click", async (e) => {
      const btn = e.target.closest("button[data-action='postular']");
      if (!btn) return;

      const ofertaId = btn.getAttribute("data-id");
      btn.disabled = true;
      setMsg("Enviando postulación…");

      try {
        const r = await window.TC.api.request(`/api/conductor/ofertas/${ofertaId}/postular`, { method: "POST" });
        setMsg(r.message || "✅ Postulación enviada.");
        await loadOffers();
      } catch (err) {
        setMsg("❌ " + err.message);
      } finally {
        btn.disabled = false;
      }
    });
  }

  document.addEventListener("DOMContentLoaded", async () => {
    const u = window.TC.session.requireRole("conductor");
    if (!u) return;

    $("who").textContent = `${u.nombres || ""} ${u.apellidos || ""}`.trim() || u.email;

    attachActions();
    try {
      await loadOffers();
    } catch (e) {
      console.error(e);
      setMsg("❌ No pude cargar ofertas: " + e.message);
    }
  });
})();
