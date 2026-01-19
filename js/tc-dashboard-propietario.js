// js/tc-dashboard-propietario.js
(function () {
  let currentAsignacionId = null;

  function $(id) {
    return document.getElementById(id);
  }

  function setText(id, value) {
    const el = $(id);
    if (el) el.textContent = value ?? "";
  }

  function escapeHtml(s) {
    return String(s ?? "").replace(/[&<>"']/g, (m) => {
      return (
        { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[m] || m
      );
    });
  }

  function chipClass(estado) {
    const e = String(estado || "").toLowerCase();
    if (e === "pendiente") return "chip warn";
    if (e === "preseleccionado") return "chip";
    if (e === "aceptado") return "chip ok";
    if (e === "no_seleccionado") return "chip danger";
    return "chip";
  }

  function attachLogout() {
    // En propietario hay botón "Salir" (sidebar mini)
    const btns = Array.from(document.querySelectorAll("button.btn.danger"));
    btns.forEach((b) => {
      if (b.textContent.trim().toLowerCase() === "salir") {
        b.addEventListener("click", () => window.TC.session.logout("index.html"));
      }
    });
  }

  function findPublicarBtn() {
    // En topbar suele estar "Publicar oferta" como botón primary
    const candidates = Array.from(document.querySelectorAll(".top-actions a.btn.primary, .top-actions button.btn.primary"));
    return candidates.find((a) => a.textContent.toLowerCase().includes("publicar"));
  }

  function findFinalizarBtn() {
    // Busca la tarjeta "Trabajo actual" y el botón primary dentro de acciones
    const cards = Array.from(document.querySelectorAll("article.card"));
    const trabajoCard = cards.find((c) => {
      const h = c.querySelector("h3");
      return h && h.textContent.trim().toLowerCase() === "trabajo actual";
    });
    if (!trabajoCard) return null;

    // En tu HTML suelen ser <a class="btn primary" ...>Finalizar</a>
    const btn = trabajoCard.querySelector(".actions a.btn.primary, .actions button.btn.primary");
    return btn || null;
  }

  async function refreshDashboard() {
    const data = await window.TC.api.request("/api/dashboard/propietario");

    // Nombre desde localStorage
    const user = window.TC.session.getUser();
    if (user) setText("owner-name", `${user.nombres || ""} ${user.apellidos || ""}`.trim());

    // Estado verificación
    const verifEl = $("owner-verif");
    if (verifEl) {
      verifEl.textContent = data.owner?.verificado_legalmente ? "Verificado" : "Pendiente";
    }

    // KPIs
    setText("kpi-ofertas", data.kpis?.ofertas_activas ?? 0);
    setText("kpi-postulaciones", data.kpis?.postulaciones_pendientes ?? 0);
    setText("kpi-trabajo", data.kpis?.trabajo_activo ?? 0);

    // Trabajo actual
    if (data.trabajo) {
      currentAsignacionId = data.trabajo.id;
      setText("job-title", data.trabajo.oferta_titulo || "Asignación activa");
      setText("job-driver", data.trabajo.conductor_nombre || "-");
      setText("job-plate", data.trabajo.placa || "-");
      setText("job-start", data.trabajo.fecha_inicio || "-");
      setText("job-city", data.trabajo.ciudad || "-");
    } else {
      currentAsignacionId = null;
      // No tocamos tu texto de "No hay asignación" si existe, solo dejamos sin acción el botón
    }

    // Postulaciones
    const tbody = $("applications-table");
    if (!tbody) return;

    const rows = Array.isArray(data.postulaciones) ? data.postulaciones : [];
    if (rows.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5"><div class="muted">No hay postulaciones recientes.</div></td></tr>`;
      return;
    }

    tbody.innerHTML = rows
      .map((p) => {
        const estado = p.estado || "pendiente";
        return `
          <tr>
            <td>
              <strong>${escapeHtml(p.conductor_nombre || "Conductor")}</strong>
              <div class="muted">ID: ${p.conductor_id}</div>
            </td>
            <td>
              <strong>${escapeHtml(p.oferta_titulo || "Oferta")}</strong>
              <div class="muted">${escapeHtml(p.ciudad || "")} · Oferta #${p.oferta_id}</div>
            </td>
            <td>
              <span class="chip ok">—</span>
            </td>
            <td>
              <span class="${chipClass(estado)}">${escapeHtml(estado)}</span>
            </td>
            <td style="text-align:right">
              <div class="actions">
                <button class="btn" type="button" data-action="preseleccionar" data-id="${p.id}">Preseleccionar</button>
                <button class="btn primary" type="button" data-action="aceptar" data-id="${p.id}">Aceptar</button>
              </div>
            </td>
          </tr>
        `;
      })
      .join("");
  }

  function ensureOfferDialog() {
    let dlg = document.getElementById("tcOfferDialog");
    if (dlg) return dlg;

    dlg = document.createElement("dialog");
    dlg.id = "tcOfferDialog";
    dlg.innerHTML = `
      <form method="dialog" style="min-width:320px; max-width:560px; padding: 6px;">
        <h3 style="margin:0 0 8px;">Publicar oferta</h3>
        <p style="margin:0 0 12px; color:#9ca3af;">Crea una oferta activa para recibir postulaciones.</p>

        <label style="display:block; margin:10px 0 6px; color:#9ca3af;">Vehículo</label>
        <select id="tcVehiculo" required style="width:100%; padding:10px; border-radius:10px;">
          <option value="">Cargando…</option>
        </select>

        <label style="display:block; margin:10px 0 6px; color:#9ca3af;">Ciudad</label>
        <input id="tcCiudad" required placeholder="Bogotá" style="width:100%; padding:10px; border-radius:10px;" />

        <label style="display:block; margin:10px 0 6px; color:#9ca3af;">Tipo de acuerdo</label>
        <select id="tcTipo" required style="width:100%; padding:10px; border-radius:10px;">
          <option value="cuota">Cuota</option>
          <option value="porcentaje">Porcentaje</option>
          <option value="mixto">Mixto</option>
        </select>

        <label style="display:block; margin:10px 0 6px; color:#9ca3af;">Cuota diaria (opcional)</label>
        <input id="tcCuota" type="number" min="0" placeholder="120000" style="width:100%; padding:10px; border-radius:10px;" />

        <label style="display:block; margin:10px 0 6px; color:#9ca3af;">% Propietario (opcional)</label>
        <input id="tcPorcentaje" type="number" min="0" max="100" placeholder="30" style="width:100%; padding:10px; border-radius:10px;" />

        <label style="display:block; margin:10px 0 6px; color:#9ca3af;">Descripción</label>
        <textarea id="tcDesc" rows="3" placeholder="Turno noche, reglas claras…" style="width:100%; padding:10px; border-radius:10px;"></textarea>

        <div style="display:flex; gap:10px; justify-content:flex-end; margin-top:12px;">
          <button class="btn" value="cancel">Cancelar</button>
          <button class="btn primary" id="tcSubmitOffer" value="default">Publicar</button>
        </div>

        <div id="tcOfferMsg" class="muted" style="margin-top:10px;"></div>
      </form>
    `;
    document.body.appendChild(dlg);
    return dlg;
  }

  async function openOfferDialog() {
    const dlg = ensureOfferDialog();
    const msg = dlg.querySelector("#tcOfferMsg");
    msg.textContent = "";

    // cargar vehículos
    try {
      const data = await window.TC.api.request("/api/propietario/vehiculos");
      const sel = dlg.querySelector("#tcVehiculo");
      const vehs = data.vehiculos || [];
      if (vehs.length === 0) {
        sel.innerHTML = `<option value="">No tienes vehículos registrados</option>`;
      } else {
        sel.innerHTML =
          `<option value="">Selecciona…</option>` +
          vehs
            .map((v) => `<option value="${v.id}">${escapeHtml(v.placa)} · ${escapeHtml(v.modelo || "")}</option>`)
            .join("");
      }
    } catch (e) {
      msg.textContent = "❌ No pude cargar vehículos: " + e.message;
    }

    // submit
    const submitBtn = dlg.querySelector("#tcSubmitOffer");
    submitBtn.onclick = async (ev) => {
      ev.preventDefault();
      msg.textContent = "Publicando…";

      try {
        const payload = {
          vehiculo_id: Number(dlg.querySelector("#tcVehiculo").value),
          ciudad: dlg.querySelector("#tcCiudad").value.trim(),
          tipo_acuerdo: dlg.querySelector("#tcTipo").value,
          cuota_diaria: dlg.querySelector("#tcCuota").value ? Number(dlg.querySelector("#tcCuota").value) : null,
          porcentaje_propietario: dlg.querySelector("#tcPorcentaje").value
            ? Number(dlg.querySelector("#tcPorcentaje").value)
            : null,
          descripcion: dlg.querySelector("#tcDesc").value.trim(),
        };

        await window.TC.api.request("/api/propietario/ofertas", { method: "POST", body: payload });
        dlg.close();
        await refreshDashboard();
      } catch (e) {
        msg.textContent = "❌ " + e.message;
      }
    };

    dlg.showModal();
  }

  function attachActions() {
    // Acciones tabla postulaciones
    const tbody = document.getElementById("applications-table");
    if (tbody) {
      tbody.addEventListener("click", async (e) => {
        const btn = e.target.closest("button[data-action]");
        if (!btn) return;

        const id = btn.getAttribute("data-id");
        const action = btn.getAttribute("data-action");

        try {
          if (action === "preseleccionar") {
            await window.TC.api.request(`/api/propietario/postulaciones/${id}/preseleccionar`, { method: "PATCH" });
          } else if (action === "aceptar") {
            await window.TC.api.request(`/api/propietario/postulaciones/${id}/aceptar`, { method: "POST" });
          }
          await refreshDashboard();
        } catch (err) {
          alert("Error: " + err.message);
        }
      });
    }

    // Finalizar trabajo
    const finalizarBtn = findFinalizarBtn();
    if (finalizarBtn) {
      finalizarBtn.addEventListener("click", async (e) => {
        e.preventDefault();
        if (!currentAsignacionId) {
          alert("No hay asignación activa para finalizar.");
          return;
        }
        try {
          await window.TC.api.request(`/api/propietario/asignaciones/${currentAsignacionId}/finalizar`, {
            method: "PATCH",
          });
          await refreshDashboard();
        } catch (err) {
          alert("Error: " + err.message);
        }
      });
    }

    // Publicar oferta
    const publicarBtn = findPublicarBtn();
    if (publicarBtn) {
      publicarBtn.addEventListener("click", (e) => {
        e.preventDefault();
        openOfferDialog();
      });
    }
  }

  document.addEventListener("DOMContentLoaded", async () => {
    const u = window.TC.session.requireRole("propietario");
    if (!u) return;

    attachLogout();
    attachActions();

    try {
      await refreshDashboard();
    } catch (e) {
      console.error(e);
      alert("No se pudo cargar dashboard propietario: " + e.message);
    }
  });
})();
