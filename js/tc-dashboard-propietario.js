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

  async function loadMisOfertas() {
    const tbody = $("mis-ofertas-table");
    if (!tbody) return;
    try {
      const data = await window.TC.api.request("/api/propietario/ofertas");
      const rows = Array.isArray(data.data) ? data.data : [];
      if (!rows.length) {
        tbody.innerHTML = `<tr><td colspan="6"><div class="muted">No tienes ofertas publicadas aún.</div></td></tr>`;
        return;
      }
      tbody.innerHTML = rows.map((o) => {
        const pago = Number(o.cuota_diaria) > 0
          ? `$${Number(o.cuota_diaria).toLocaleString("es-CO")}/día`
          : (Number(o.porcentaje_propietario) > 0 ? `${o.porcentaje_propietario}% prop.` : "—");
        const estadoChip = o.estado === "activa" ? "chip ok" : o.estado === "pausada" ? "chip warn" : "chip danger";
        return `
          <tr>
            <td><strong>${escapeHtml(o.titulo || "")}</strong></td>
            <td>${escapeHtml(o.ciudad || "—")}</td>
            <td>${escapeHtml(o.turno || "—")}</td>
            <td>${pago}</td>
            <td><span class="${estadoChip}">${escapeHtml(o.estado || "—")}</span></td>
            <td style="text-align:right">
              <div class="actions">
                <button class="btn" type="button" data-oferta-action="${o.estado === "activa" ? "pausar" : "activar"}" data-id="${o.id}">
                  ${o.estado === "activa" ? "Pausar" : "Activar"}
                </button>
                <button class="btn danger" type="button" data-oferta-action="eliminar" data-id="${o.id}">Eliminar</button>
              </div>
            </td>
          </tr>`;
      }).join("");
    } catch (e) {
      const tbody2 = $("mis-ofertas-table");
      if (tbody2) tbody2.innerHTML = `<tr><td colspan="6"><div class="muted">Error cargando ofertas: ${escapeHtml(e.message)}</div></td></tr>`;
    }
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
        const nombre = escapeHtml(`${p.conductor_nombre || ""} ${p.conductor_apellidos || ""}`.trim() || "Conductor");
        const expTag = p.anios_experiencia ? `${p.anios_experiencia} año(s) exp.` : "Sin exp. registrada";
        const licTag = p.categoria_licencia ? ` · Lic. ${escapeHtml(p.categoria_licencia)}` : "";
        const turnoTag = p.turno_preferido ? ` · Turno ${escapeHtml(p.turno_preferido)}` : "";
        return `
          <tr>
            <td>
              <strong>${nombre}</strong>
              <div class="muted">${escapeHtml(expTag)}${licTag}${turnoTag}</div>
              ${p.mensaje ? `<div class="muted" style="margin-top:3px; font-style:italic;">"${escapeHtml(String(p.mensaje).slice(0, 80))}${p.mensaje.length > 80 ? "…" : ""}"</div>` : ""}
            </td>
            <td>
              <strong>${escapeHtml(p.oferta_titulo || "Oferta")}</strong>
              <div class="muted">${escapeHtml(p.ciudad || "")} · Oferta #${p.oferta_id}</div>
            </td>
            <td>
              <span class="chip ok">${p.anios_experiencia ? `${p.anios_experiencia} años` : "—"}</span>
            </td>
            <td>
              <span class="${chipClass(estado)}">${escapeHtml(estado)}</span>
            </td>
            <td style="text-align:right">
              <div class="actions">
                <button class="btn" type="button" data-action="ver-hv" data-id="${p.id}">Ver HV</button>
                <button class="btn" type="button" data-action="preseleccionar" data-id="${p.id}">Preseleccionar</button>
                <button class="btn primary" type="button" data-action="aceptar" data-id="${p.id}">Aceptar</button>
              </div>
            </td>
          </tr>
        `;
      })
      .join("");
  }

  // Mapa de vehículos cargados para auto-rellenar el panel de info
  const _tcoVehMap = {};

  const COMBUST_LABEL = { gasolina:"Gasolina", gas:"Gas natural (GNV)", hibrido:"Híbrido", electrico:"Eléctrico" };

  function tcoGet(id) { return document.getElementById(id); }
  function tcoVal(id) { const e = tcoGet(id); return e ? e.value : ""; }
  function tcoNum(id) { return Number(tcoVal(id) || 0); }

  function tcoResetDialog() {
    ["tcTitulo","tcCuota","tcPorcentaje","tcDesc","tcReq","tcWhatsApp","tcTurnoInicio","tcTurnoFin","tcZonaTexto"]
      .forEach(id => { const e = tcoGet(id); if (e) e.value = ""; });
    const defaults = { tcEstado:"activa", tcTurno:"dia", tcModalidad:"", tcZonaTipo:"toda_ciudad", tcLicencia:"", tcExpMinima:"" };
    Object.entries(defaults).forEach(([id, val]) => { const e = tcoGet(id); if (e) e.value = val; });
    tcoGet("tcCiudad").value = "";
    document.querySelectorAll('input[name="tcIncluye"]').forEach(cb => { cb.checked = false; });
    tcoGet("tcTurnoHorasRow").style.display = "none";
    tcoGet("tcZonaTextoRow").style.display  = "none";
    tcoGet("tcVehInfo").classList.remove("visible");
    const msg = tcoGet("tcOfferMsg"); if (msg) msg.textContent = "";
  }

  function tcoSetVehInfo(id) {
    const v    = _tcoVehMap[id];
    const info = tcoGet("tcVehInfo");
    if (!v || !id) { info.classList.remove("visible"); return; }
    const set = (elId, val) => { const e = tcoGet(elId); if (e) e.textContent = val || "—"; };
    set("tcVi_placa",      v.placa);
    set("tcVi_marca",      v.marca);
    set("tcVi_modelo",     v.modelo);
    set("tcVi_anio",       v.anio);
    set("tcVi_combustible", COMBUST_LABEL[v.combustible] || v.combustible || "—");
    info.classList.add("visible");
  }

  function setupOfferDialog() {
    // Modalidad → mostrar/ocultar horas de turno
    tcoGet("tcModalidad")?.addEventListener("change", function () {
      tcoGet("tcTurnoHorasRow").style.display = this.value === "turno_fijo" ? "grid" : "none";
    });

    // Zona → mostrar/ocultar campo específico
    tcoGet("tcZonaTipo")?.addEventListener("change", function () {
      const row = tcoGet("tcZonaTextoRow");
      row.style.display = this.value === "especifica" ? "block" : "none";
      if (this.value !== "especifica") tcoGet("tcZonaTexto").value = "";
    });

    // Vehículo → auto-rellenar info
    tcoGet("tcVehiculo")?.addEventListener("change", function () {
      tcoSetVehInfo(this.value);
    });

    // "Nada" es excluyente
    tcoGet("tcIncluyeNada")?.addEventListener("change", function () {
      if (this.checked)
        document.querySelectorAll('input[name="tcIncluye"]:not(#tcIncluyeNada)').forEach(cb => { cb.checked = false; });
    });
    document.querySelectorAll('input[name="tcIncluye"]:not(#tcIncluyeNada)').forEach(cb => {
      cb.addEventListener("change", function () {
        if (this.checked) tcoGet("tcIncluyeNada").checked = false;
      });
    });

    // Submit
    tcoGet("tcSubmitOffer")?.addEventListener("click", async () => {
      const msg = tcoGet("tcOfferMsg");
      msg.textContent = "";

      const titulo     = tcoVal("tcTitulo").trim();
      const ciudad     = tcoVal("tcCiudad");
      const vehiculoId = tcoVal("tcVehiculo");
      const cuota      = tcoNum("tcCuota");
      const pct        = tcoNum("tcPorcentaje");

      if (!titulo)     { msg.textContent = "⚠️ El título es obligatorio.";           return; }
      if (!ciudad)     { msg.textContent = "⚠️ Selecciona una ciudad.";              return; }
      if (!vehiculoId) { msg.textContent = "⚠️ Selecciona un vehículo.";            return; }
      if (cuota <= 0 && pct <= 0) {
        msg.textContent = "⚠️ Ingresa la cuota diaria o el % del propietario.";
        return;
      }

      const veh         = _tcoVehMap[vehiculoId] || {};
      const zonaTipo    = tcoVal("tcZonaTipo");
      const zonaText    = tcoVal("tcZonaTexto").trim();
      const zona_operacion = zonaTipo === "especifica" && zonaText ? zonaText : "Toda la ciudad";
      const incluye     = Array.from(document.querySelectorAll('input[name="tcIncluye"]:checked')).map(cb => cb.value);

      msg.textContent = "Publicando…";
      tcoGet("tcSubmitOffer").disabled = true;

      try {
        await window.TC.api.request("/api/ofertas", {
          method: "POST",
          body: {
            vehiculo_id:            vehiculoId,
            titulo,
            ciudad,
            turno:                  tcoVal("tcTurno") || "dia",
            estado:                 tcoVal("tcEstado") || "activa",
            modalidad:              tcoVal("tcModalidad") || null,
            turno_inicio:           tcoVal("tcTurnoInicio") || null,
            turno_fin:              tcoVal("tcTurnoFin")    || null,
            zona_operacion,
            veh_marca:              veh.marca  || null,
            veh_modelo:             veh.modelo || null,
            veh_anio:               veh.anio   || null,
            veh_combustible:        veh.combustible || null,
            incluye,
            exp_minima:             tcoNum("tcExpMinima") || null,
            categoria_licencia:     tcoVal("tcLicencia") || null,
            whatsapp:               tcoVal("tcWhatsApp").trim() || null,
            descripcion:            tcoVal("tcDesc").trim() || null,
            requisitos:             tcoVal("tcReq").trim()  || null,
            cuota_diaria:           cuota,
            porcentaje_propietario: pct,
          },
        });
        tcoGet("tcOfferDialog").close();
        await refreshDashboard();
        await loadMisOfertas();
      } catch (e) {
        msg.textContent = "❌ " + e.message;
      } finally {
        tcoGet("tcSubmitOffer").disabled = false;
      }
    });
  }

  async function openOfferDialog() {
    tcoResetDialog();

    // Cargar vehículos
    const sel = tcoGet("tcVehiculo");
    const msg = tcoGet("tcOfferMsg");
    sel.innerHTML = `<option value="">Cargando vehículos…</option>`;

    try {
      const data = await window.TC.api.request("/api/propietario/vehiculos");
      const vehs = data.data || [];
      if (!vehs.length) {
        sel.innerHTML = `<option value="">No tienes vehículos — <a href="mis-vehiculos.html">agrégalos aquí</a></option>`;
      } else {
        sel.innerHTML = `<option value="">Selecciona un vehículo</option>` +
          vehs.map(v => {
            _tcoVehMap[v.id] = v;
            const label = [v.placa, v.marca, v.modelo, v.anio].filter(Boolean).join(" · ");
            return `<option value="${v.id}">${escapeHtml(label)}</option>`;
          }).join("");
      }
    } catch (e) {
      if (msg) msg.textContent = "No se pudieron cargar los vehículos: " + e.message;
    }

    tcoGet("tcOfferDialog").showModal();
  }

  function hvField(label, value) {
    if (!value) return "";
    return `<div class="hv-modal-field"><span class="hv-modal-label">${label}</span><span>${escapeHtml(String(value))}</span></div>`;
  }

  async function openHvModal(postulacionId) {
    const modal = document.getElementById("modalHvConductor");
    const body  = document.getElementById("hvModalBody");
    if (!modal || !body) return;

    body.innerHTML = `<p class="muted" style="text-align:center; padding:20px;">Cargando hoja de vida...</p>`;
    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");

    try {
      const resp = await window.TC.api.request(`/api/propietario/postulaciones/${postulacionId}/conductor`);
      const d = resp.data || {};

      const nombre = escapeHtml(`${d.nombres || ""} ${d.apellidos || ""}`.trim() || "Conductor");
      const fotoHtml = d.foto_url
        ? `<img src="${d.foto_url}" alt="Foto" style="width:90px;height:90px;border-radius:50%;object-fit:cover;border:2px solid rgba(255,255,255,.15);">`
        : `<div style="width:90px;height:90px;border-radius:50%;background:rgba(255,255,255,.06);border:2px solid rgba(255,255,255,.1);display:grid;place-items:center;font-size:36px;">👤</div>`;

      const relLabel = { familiar: "Familiar", laboral: "Laboral", personal: "Personal" };

      body.innerHTML = `
        <div style="display:flex; align-items:center; gap:16px; margin-bottom:18px;">
          ${fotoHtml}
          <div>
            <div style="font-size:18px; font-weight:700;">${nombre}</div>
            ${d.ciudad_residencia ? `<div class="muted">${escapeHtml(d.ciudad_residencia)}</div>` : ""}
            ${d.turno_preferido ? `<span class="chip" style="margin-top:4px;">Turno ${escapeHtml(d.turno_preferido)}</span>` : ""}
          </div>
        </div>

        <div class="hv-modal-section">DATOS PERSONALES</div>
        ${hvField("Cédula", d.cedula)}
        ${hvField("Fecha de nacimiento", d.fecha_nacimiento)}
        ${hvField("Teléfono", d.telefono)}
        ${hvField("Email", d.conductor_email)}
        ${hvField("Dirección", d.direccion)}
        ${hvField("Barrio", d.barrio)}
        ${hvField("Ciudad de residencia", d.ciudad_residencia)}

        <div class="hv-modal-section" style="margin-top:14px;">EXPERIENCIA</div>
        ${hvField("Años de experiencia", d.anios_experiencia != null ? `${d.anios_experiencia} año(s)` : "")}
        ${hvField("Ciudades trabajadas", d.ciudades_trabajadas)}
        ${hvField("Categoría licencia", d.categoria_licencia)}
        ${hvField("Número de licencia", d.numero_licencia)}

        ${(d.ref1_nombre || d.ref2_nombre) ? `<div class="hv-modal-section" style="margin-top:14px;">REFERENCIAS</div>` : ""}
        ${d.ref1_nombre ? `
          <div style="border:1px solid rgba(255,255,255,.07); border-radius:10px; padding:10px; margin-bottom:8px;">
            <div style="font-size:11px; color:var(--muted); font-weight:700; margin-bottom:6px;">REFERENCIA 1</div>
            ${hvField("Nombre", d.ref1_nombre)}
            ${hvField("Teléfono", d.ref1_telefono)}
            ${hvField("Relación", relLabel[d.ref1_relacion] || d.ref1_relacion)}
          </div>` : ""}
        ${d.ref2_nombre ? `
          <div style="border:1px solid rgba(255,255,255,.07); border-radius:10px; padding:10px; margin-bottom:8px;">
            <div style="font-size:11px; color:var(--muted); font-weight:700; margin-bottom:6px;">REFERENCIA 2</div>
            ${hvField("Nombre", d.ref2_nombre)}
            ${hvField("Teléfono", d.ref2_telefono)}
            ${hvField("Relación", relLabel[d.ref2_relacion] || d.ref2_relacion)}
          </div>` : ""}

        ${d.descripcion_personal ? `
          <div class="hv-modal-section" style="margin-top:14px;">DESCRIPCIÓN PERSONAL</div>
          <p style="font-style:italic; opacity:.9; line-height:1.6; margin:8px 0 0;">"${escapeHtml(d.descripcion_personal)}"</p>
        ` : ""}

        ${d.mensaje ? `
          <div class="hv-modal-section" style="margin-top:14px;">MENSAJE DE POSTULACIÓN</div>
          <p style="font-style:italic; opacity:.9; line-height:1.6; margin:8px 0 0;">"${escapeHtml(d.mensaje)}"</p>
        ` : ""}
      `;
    } catch (e) {
      body.innerHTML = `<p class="muted" style="text-align:center; padding:20px;">Error cargando la hoja de vida.</p>`;
    }
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
          if (action === "ver-hv") {
            await openHvModal(id);
            return;
          } else if (action === "preseleccionar") {
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

    // Acciones tabla "Mis ofertas"
    const misOfertasTable = document.getElementById("mis-ofertas-table");
    if (misOfertasTable) {
      misOfertasTable.addEventListener("click", async (e) => {
        const btn = e.target.closest("button[data-oferta-action]");
        if (!btn) return;
        const id = btn.getAttribute("data-id");
        const action = btn.getAttribute("data-oferta-action");
        try {
          if (action === "eliminar") {
            if (!confirm("¿Eliminar esta oferta?")) return;
            await window.TC.api.request(`/api/ofertas/${id}`, { method: "DELETE" });
          } else {
            const nuevoEstado = action === "pausar" ? "pausada" : "activa";
            await window.TC.api.request(`/api/ofertas/${id}`, { method: "PATCH", body: { estado: nuevoEstado } });
          }
          await loadMisOfertas();
          await refreshDashboard();
        } catch (err) {
          alert("Error: " + err.message);
        }
      });
    }
  }

  document.addEventListener("DOMContentLoaded", async () => {
    const u = window.TC.session.requireRole("propietario");
    if (!u) return;

    // Cerrar modal HV conductor
    document.addEventListener("click", (e) => {
      if (e.target.id === "hvModalClose" || e.target.dataset.closeHv === "1") {
        const modal = document.getElementById("modalHvConductor");
        if (modal) { modal.classList.remove("is-open"); modal.setAttribute("aria-hidden", "true"); }
      }
    });

    attachLogout();
    setupOfferDialog();
    attachActions();

    try {
      await Promise.all([refreshDashboard(), loadMisOfertas()]);
    } catch (e) {
      console.error(e);
      alert("No se pudo cargar dashboard propietario: " + e.message);
    }
  });
})();
