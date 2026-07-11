// js/tc-dashboard-propietario.js
// Versión mejorada — verificación de vehículos + pantalla bienvenida amigable
(function () {
  let currentAsignacionId = null;
  let _tieneVehiculos = false; // track si el propietario tiene vehículos

  function $(id) { return document.getElementById(id); }
  function setText(id, value) { const el = $(id); if (el) el.textContent = value ?? ""; }
  function escapeHtml(s) {
    return String(s ?? "").replace(/[&<>"']/g, (m) =>
      ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;" }[m] || m)
    );
  }
  function chipClass(estado) {
    const e = String(estado || "").toLowerCase();
    if (e === "pendiente")      return "chip warn";
    if (e === "preseleccionado") return "chip";
    if (e === "aceptado")       return "chip ok";
    if (e === "no_seleccionado") return "chip danger";
    return "chip";
  }

  // ── Pantalla de bienvenida para propietarios nuevos ──────────────────────
  function mostrarBienvenida() {
    const grid = document.querySelector(".grid");
    if (!grid) return;

    // Insertar banner de bienvenida antes del grid principal
    const existente = document.getElementById("tc-bienvenida-banner");
    if (existente) return; // ya existe, no duplicar

    const banner = document.createElement("div");
    banner.id = "tc-bienvenida-banner";
    banner.style.cssText = `
      background: linear-gradient(135deg, rgba(212,160,23,0.1) 0%, rgba(29,158,117,0.06) 100%);
      border: 0.5px solid rgba(212,160,23,0.3);
      border-radius: 14px;
      padding: 24px;
      margin-bottom: 16px;
      max-width: var(--max);
      margin-left: auto;
      margin-right: auto;
    `;

    banner.innerHTML = `
      <div style="display:flex; align-items:flex-start; gap:16px; flex-wrap:wrap;">
        <div style="font-size:40px; flex-shrink:0;">🚕</div>
        <div style="flex:1; min-width:0;">
          <div style="font-size:16px; font-weight:700; color:var(--text-primary); margin-bottom:6px;">
            ¡Bienvenido a TaxiConfianza! Estás a 2 pasos de encontrar tu conductor ideal
          </div>
          <p style="font-size:13px; color:var(--text-secondary); line-height:1.65; margin:0 0 16px;">
            Para publicar una oferta de trabajo y conectar con conductores verificados, primero necesitas registrar tu taxi. 
            Es rápido — solo la placa es obligatoria.
          </p>
          <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
            <div style="display:flex; align-items:center; gap:8px; padding:10px 14px; border-radius:10px; background:var(--bg-card); border:0.5px solid var(--border);">
              <div style="width:26px; height:26px; border-radius:50%; background:rgba(212,160,23,0.15); color:var(--gold); display:flex; align-items:center; justify-content:center; font-size:12px; font-weight:700; flex-shrink:0;">1</div>
              <div>
                <div style="font-size:12px; font-weight:600; color:var(--text-primary);">Registra tu taxi</div>
                <div style="font-size:11px; color:var(--text-tertiary);">Placa, marca y modelo</div>
              </div>
            </div>
            <div style="color:var(--text-tertiary); font-size:18px;">→</div>
            <div style="display:flex; align-items:center; gap:8px; padding:10px 14px; border-radius:10px; background:var(--bg-card); border:0.5px solid var(--border);">
              <div style="width:26px; height:26px; border-radius:50%; background:rgba(29,158,117,0.15); color:var(--green); display:flex; align-items:center; justify-content:center; font-size:12px; font-weight:700; flex-shrink:0;">2</div>
              <div>
                <div style="font-size:12px; font-weight:600; color:var(--text-primary);">Publica tu oferta</div>
                <div style="font-size:11px; color:var(--text-tertiary);">Turno, cuota y requisitos</div>
              </div>
            </div>
            <div style="color:var(--text-tertiary); font-size:18px;">→</div>
            <div style="display:flex; align-items:center; gap:8px; padding:10px 14px; border-radius:10px; background:var(--bg-card); border:0.5px solid var(--border);">
              <div style="width:26px; height:26px; border-radius:50%; background:rgba(59,130,246,0.15); color:#60A5FA; display:flex; align-items:center; justify-content:center; font-size:12px; font-weight:700; flex-shrink:0;">3</div>
              <div>
                <div style="font-size:12px; font-weight:600; color:var(--text-primary);">Conecta con conductores</div>
                <div style="font-size:11px; color:var(--text-tertiary);">Revisa postulaciones</div>
              </div>
            </div>
          </div>
          <div style="margin-top:16px; display:flex; gap:10px; flex-wrap:wrap;">
            <a href="/mis-vehiculos.html" style="display:inline-flex; align-items:center; gap:7px; padding:11px 20px; border-radius:10px; background:var(--gold); color:#0f1117; font-size:13px; font-weight:700; text-decoration:none;">
              🚗 Registrar mi taxi ahora
            </a>
            <button type="button" id="btn-cerrar-bienvenida" style="display:inline-flex; align-items:center; gap:7px; padding:11px 16px; border-radius:10px; background:var(--bg-card); border:0.5px solid var(--border); color:var(--text-tertiary); font-size:12px; cursor:pointer; font-family:var(--font-sans);">
              Ya lo haré después
            </button>
          </div>
        </div>
      </div>
    `;

    // Insertar antes del grid
    grid.parentNode.insertBefore(banner, grid);

    // Botón cerrar bienvenida
    document.getElementById("btn-cerrar-bienvenida")?.addEventListener("click", () => {
      banner.style.display = "none";
    });
  }

  // ── Verificar si tiene vehículos antes de abrir el dialog ──────────────
  async function verificarVehiculosYPublicar() {
    try {
      const data = await window.TC.api.request("/api/propietario/vehiculos");
      const vehs = data.data || [];

      if (!vehs.length) {
        // No tiene vehículos — mostrar mensaje amigable
        mostrarAlertaSinVehiculo();
        return;
      }

      _tieneVehiculos = true;
      openOfferDialog();
    } catch (e) {
      console.error("Error verificando vehículos:", e);
      openOfferDialog(); // Si falla, abrimos el dialog igual (el dialog maneja el error)
    }
  }

  function mostrarAlertaSinVehiculo() {
    // Crear modal de alerta amigable
    const overlay = document.createElement("div");
    overlay.id = "tc-alerta-vehiculo";
    overlay.style.cssText = `
      position: fixed; inset: 0; z-index: 2000;
      background: rgba(0,0,0,0.65);
      display: flex; align-items: center; justify-content: center;
      padding: 20px;
    `;

    overlay.innerHTML = `
      <div style="
        background: var(--bg-card-solid);
        border: 0.5px solid rgba(212,160,23,0.3);
        border-radius: 16px;
        padding: 28px;
        max-width: 420px;
        width: 100%;
        text-align: center;
      ">
        <div style="font-size:48px; margin-bottom:14px;">🚗</div>
        <h3 style="font-size:17px; font-weight:700; color:var(--text-primary); margin:0 0 10px;">
          Primero registra tu taxi
        </h3>
        <p style="font-size:13px; color:var(--text-secondary); line-height:1.65; margin:0 0 20px;">
          Para publicar una oferta necesitas tener al menos un vehículo registrado. 
          Es muy rápido — solo necesitas la placa de tu taxi.
        </p>
        <div style="display:flex; flex-direction:column; gap:10px;">
          <a href="/mis-vehiculos.html" style="
            display:flex; align-items:center; justify-content:center; gap:8px;
            padding:13px; border-radius:10px;
            background:var(--gold); color:#0f1117;
            font-size:14px; font-weight:700; text-decoration:none;
          ">
            🚗 Registrar mi taxi ahora
          </a>
          <button id="btn-cerrar-alerta-vehiculo" type="button" style="
            padding:11px; border-radius:10px;
            background:var(--bg-card); border:0.5px solid var(--border);
            color:var(--text-tertiary); font-size:13px;
            cursor:pointer; font-family:var(--font-sans);
          ">
            Cancelar
          </button>
        </div>
        <p style="font-size:11px; color:var(--text-tertiary); margin:14px 0 0; line-height:1.6;">
          💡 Tip: Después de registrar tu taxi vuelve aquí y ya podrás publicar tu oferta en segundos.
        </p>
      </div>
    `;

    document.body.appendChild(overlay);

    // Cerrar al hacer clic en cancelar o fuera del modal
    document.getElementById("btn-cerrar-alerta-vehiculo")?.addEventListener("click", () => overlay.remove());
    overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });
  }

  // ── Cargar mis ofertas ────────────────────────────────────────────────────
  async function loadMisOfertas() {
    const tbody = $("mis-ofertas-table");
    if (!tbody) return;
    try {
      const data = await window.TC.api.request("/api/propietario/ofertas");
      const rows = Array.isArray(data.data) ? data.data : [];
      if (!rows.length) {
        tbody.innerHTML = `
          <tr>
            <td colspan="6" style="text-align:center; padding:20px;">
              <div class="muted">No tienes ofertas publicadas aún.</div>
              <div style="margin-top:8px; font-size:12px; color:var(--text-tertiary);">
                Haz clic en <strong style="color:var(--gold);">+ Nueva oferta</strong> para publicar tu primera oferta.
              </div>
            </td>
          </tr>`;
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

  // ── Refresh dashboard ─────────────────────────────────────────────────────
  async function refreshDashboard() {
    const data = await window.TC.api.request("/api/dashboard/propietario");

    const user = window.TC.session.getUser();
    if (user) setText("owner-name", `${user.nombres || ""} ${user.apellidos || ""}`.trim());

    const verifEl = $("owner-verif");
    if (verifEl) verifEl.textContent = data.owner?.verificado_legalmente ? "Verificado" : "Pendiente";

    setText("kpi-ofertas", data.kpis?.ofertas_activas ?? 0);
    setText("kpi-postulaciones", data.kpis?.postulaciones_pendientes ?? 0);
    setText("kpi-trabajo", data.kpis?.trabajo_activo ?? 0);

    // Nivel y rating en topbar
    setText("owner-level", data.stats?.nivel || "Bronce");
    setText("owner-avg", data.stats?.avg ? Number(data.stats.avg).toFixed(1) : "—");

    // Trabajo actual
    const trabajoContent = $("trabajo-actual-content");
    if (data.trabajo) {
      currentAsignacionId = data.trabajo.id;
      if (trabajoContent) {
        trabajoContent.innerHTML = `
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:10px;">
            <div style="padding:10px; background:var(--bg-card-solid); border-radius:9px; border:0.5px solid var(--border);">
              <div style="font-size:10px; color:var(--text-tertiary); text-transform:uppercase; letter-spacing:0.05em; margin-bottom:4px;">Conductor</div>
              <div style="font-size:13px; font-weight:600; color:var(--text-primary);">${escapeHtml(data.trabajo.conductor_nombre || "—")}</div>
            </div>
            <div style="padding:10px; background:var(--bg-card-solid); border-radius:9px; border:0.5px solid var(--border);">
              <div style="font-size:10px; color:var(--text-tertiary); text-transform:uppercase; letter-spacing:0.05em; margin-bottom:4px;">Vehículo</div>
              <div style="font-size:13px; font-weight:600; color:var(--text-primary);">${escapeHtml(data.trabajo.placa || "—")}</div>
            </div>
            <div style="padding:10px; background:var(--bg-card-solid); border-radius:9px; border:0.5px solid var(--border);">
              <div style="font-size:10px; color:var(--text-tertiary); text-transform:uppercase; letter-spacing:0.05em; margin-bottom:4px;">Ciudad</div>
              <div style="font-size:13px; font-weight:600; color:var(--text-primary);">${escapeHtml(data.trabajo.ciudad || "—")}</div>
            </div>
            <div style="padding:10px; background:var(--bg-card-solid); border-radius:9px; border:0.5px solid var(--border);">
              <div style="font-size:10px; color:var(--text-tertiary); text-transform:uppercase; letter-spacing:0.05em; margin-bottom:4px;">Desde</div>
              <div style="font-size:13px; font-weight:600; color:var(--text-primary);">${escapeHtml(data.trabajo.fecha_inicio || "—")}</div>
            </div>
          </div>
          <button type="button" id="btn-finalizar-trabajo" class="btn danger" style="margin-top:12px; width:100%; justify-content:center; padding:10px;">
            Finalizar asignación
          </button>`;

        document.getElementById("btn-finalizar-trabajo")?.addEventListener("click", async () => {
          if (!confirm("¿Confirmas que deseas finalizar esta asignación?")) return;
          try {
            await window.TC.api.request(`/api/propietario/asignaciones/${currentAsignacionId}/finalizar`, { method: "PATCH" });
            await refreshDashboard();
            await loadMisOfertas();
          } catch (err) { alert("Error: " + err.message); }
        });
      }
    } else {
      currentAsignacionId = null;
      if (trabajoContent) {
        trabajoContent.innerHTML = `<p class="muted" style="margin-top:8px;">No tienes ninguna asignación activa en este momento.</p>`;
      }
    }

    // Postulaciones
    const postList = $("postulaciones-list");
    if (!postList) return;
    const rows = Array.isArray(data.postulaciones) ? data.postulaciones : [];
    if (rows.length === 0) {
      postList.innerHTML = `
        <div class="item">
          <div class="left">
            <span class="muted">No hay postulaciones recientes.</span>
            <span style="font-size:11px; color:var(--text-tertiary); margin-top:3px;">Cuando publiques una oferta, los conductores interesados aparecerán aquí.</span>
          </div>
        </div>`;
      return;
    }
    postList.innerHTML = rows.map((p) => {
      const estado = p.estado || "pendiente";
      const nombre = escapeHtml(`${p.conductor_nombre || ""} ${p.conductor_apellidos || ""}`.trim() || "Conductor");
      const expTag = p.anios_experiencia ? `${p.anios_experiencia} año(s) exp.` : "Sin exp. registrada";
      return `
        <div class="item">
          <div class="left">
            <strong>${nombre}</strong>
            <span class="muted">${escapeHtml(expTag)} · ${escapeHtml(p.oferta_titulo || "Oferta")}</span>
            ${p.mensaje ? `<span class="muted" style="font-style:italic;">"${escapeHtml(String(p.mensaje).slice(0,80))}${p.mensaje.length > 80 ? "…" : ""}"</span>` : ""}
          </div>
          <div class="item-actions">
            <span class="${chipClass(estado)}">${escapeHtml(estado)}</span>
            <button class="btn btn-sm" type="button" data-action="ver-hv" data-id="${p.id}">Ver HV</button>
            <button class="btn btn-sm" type="button" data-action="preseleccionar" data-id="${p.id}">Preseleccionar</button>
            <button class="btn primary btn-sm" type="button" data-action="aceptar" data-id="${p.id}">Aceptar ✓</button>
          </div>
        </div>`;
    }).join("");
  }

  // ── Dialog publicar oferta (lógica original intacta) ─────────────────────
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
    if (tcoGet("tcCiudad")) tcoGet("tcCiudad").value = "";
    document.querySelectorAll('input[name="tcIncluye"]').forEach(cb => { cb.checked = false; });
    if (tcoGet("tcTurnoHorasRow")) tcoGet("tcTurnoHorasRow").style.display = "none";
    if (tcoGet("tcZonaTextoRow"))  tcoGet("tcZonaTextoRow").style.display  = "none";
    if (tcoGet("tcVehInfo")) tcoGet("tcVehInfo").classList.remove("visible");
    const msg = tcoGet("tcOfferMsg"); if (msg) msg.textContent = "";
  }

  function tcoSetVehInfo(id) {
    const v = _tcoVehMap[id];
    const info = tcoGet("tcVehInfo");
    if (!v || !id || !info) { if(info) info.classList.remove("visible"); return; }
    const set = (elId, val) => { const e = tcoGet(elId); if (e) e.textContent = val || "—"; };
    set("tcVi_placa", v.placa); set("tcVi_marca", v.marca);
    set("tcVi_modelo", v.modelo); set("tcVi_anio", v.anio);
    set("tcVi_combustible", COMBUST_LABEL[v.combustible] || v.combustible || "—");
    info.classList.add("visible");
  }

  function setupOfferDialog() {
    tcoGet("tcModalidad")?.addEventListener("change", function () {
      if (tcoGet("tcTurnoHorasRow")) tcoGet("tcTurnoHorasRow").style.display = this.value === "turno_fijo" ? "grid" : "none";
    });
    tcoGet("tcZonaTipo")?.addEventListener("change", function () {
      const row = tcoGet("tcZonaTextoRow");
      if (row) row.style.display = this.value === "especifica" ? "block" : "none";
      if (this.value !== "especifica" && tcoGet("tcZonaTexto")) tcoGet("tcZonaTexto").value = "";
    });
    tcoGet("tcVehiculo")?.addEventListener("change", function () { tcoSetVehInfo(this.value); });
    tcoGet("tcIncluyeNada")?.addEventListener("change", function () {
      if (this.checked) document.querySelectorAll('input[name="tcIncluye"]:not(#tcIncluyeNada)').forEach(cb => { cb.checked = false; });
    });
    document.querySelectorAll('input[name="tcIncluye"]:not(#tcIncluyeNada)').forEach(cb => {
      cb.addEventListener("change", function () { if (this.checked && tcoGet("tcIncluyeNada")) tcoGet("tcIncluyeNada").checked = false; });
    });

    tcoGet("tcSubmitOffer")?.addEventListener("click", async () => {
      const msg = tcoGet("tcOfferMsg");
      if (msg) msg.textContent = "";
      const titulo = tcoVal("tcTitulo").trim();
      const ciudad = tcoVal("tcCiudad");
      const vehiculoId = tcoVal("tcVehiculo");
      const cuota = tcoNum("tcCuota");
      const pct   = tcoNum("tcPorcentaje");
      if (!titulo)     { if(msg) msg.textContent = "⚠️ El título es obligatorio.";           return; }
      if (!ciudad)     { if(msg) msg.textContent = "⚠️ Selecciona una ciudad.";              return; }
      if (!vehiculoId) { if(msg) msg.textContent = "⚠️ Selecciona un vehículo.";            return; }
      if (cuota <= 0 && pct <= 0) { if(msg) msg.textContent = "⚠️ Ingresa la cuota diaria o el % del propietario."; return; }
      const veh = _tcoVehMap[vehiculoId] || {};
      const zonaTipo = tcoVal("tcZonaTipo");
      const zonaText = tcoVal("tcZonaTexto").trim();
      const zona_operacion = zonaTipo === "especifica" && zonaText ? zonaText : "Toda la ciudad";
      const incluye = Array.from(document.querySelectorAll('input[name="tcIncluye"]:checked')).map(cb => cb.value);
      if (msg) msg.textContent = "Publicando…";
      if (tcoGet("tcSubmitOffer")) tcoGet("tcSubmitOffer").disabled = true;
      try {
        await window.TC.api.request("/api/ofertas", {
          method: "POST",
          body: {
            vehiculo_id: vehiculoId, titulo, ciudad,
            turno: tcoVal("tcTurno") || "dia", estado: tcoVal("tcEstado") || "activa",
            modalidad: tcoVal("tcModalidad") || null,
            turno_inicio: tcoVal("tcTurnoInicio") || null, turno_fin: tcoVal("tcTurnoFin") || null,
            zona_operacion, veh_marca: veh.marca || null, veh_modelo: veh.modelo || null,
            veh_anio: veh.anio || null, veh_combustible: veh.combustible || null,
            incluye, exp_minima: tcoNum("tcExpMinima") || null,
            categoria_licencia: tcoVal("tcLicencia") || null,
            whatsapp: tcoVal("tcWhatsApp").trim() || null,
            descripcion: tcoVal("tcDesc").trim() || null,
            requisitos: tcoVal("tcReq").trim() || null,
            cuota_diaria: cuota, porcentaje_propietario: pct,
          },
        });
        tcoGet("tcOfferDialog")?.close();
        await refreshDashboard();
        await loadMisOfertas();
      } catch (e) {
        if (msg) msg.textContent = "❌ " + e.message;
      } finally {
        if (tcoGet("tcSubmitOffer")) tcoGet("tcSubmitOffer").disabled = false;
      }
    });
  }

  async function openOfferDialog() {
    tcoResetDialog();
    const sel = tcoGet("tcVehiculo");
    const msg = tcoGet("tcOfferMsg");
    if (sel) sel.innerHTML = `<option value="">Cargando vehículos…</option>`;
    try {
      const data = await window.TC.api.request("/api/propietario/vehiculos");
      const vehs = data.data || [];
      if (!vehs.length) {
        if (sel) sel.innerHTML = `<option value="">— Sin vehículos registrados —</option>`;
        if (msg) msg.innerHTML = `⚠️ No tienes vehículos. <a href="/mis-vehiculos.html" style="color:var(--gold);font-weight:600;">Registra tu taxi aquí</a> y vuelve a publicar.`;
      } else {
        if (sel) sel.innerHTML = `<option value="">Selecciona un vehículo</option>` +
          vehs.map(v => {
            _tcoVehMap[v.id] = v;
            const label = [v.placa, v.marca, v.modelo, v.anio].filter(Boolean).join(" · ");
            return `<option value="${v.id}">${escapeHtml(label)}</option>`;
          }).join("");
      }
    } catch (e) {
      if (msg) msg.textContent = "No se pudieron cargar los vehículos: " + e.message;
    }
    tcoGet("tcOfferDialog")?.showModal();
  }

  // ── HV conductor ──────────────────────────────────────────────────────────
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
      const relLabel = { familiar:"Familiar", laboral:"Laboral", personal:"Personal" };
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
        ${hvField("Cédula", d.cedula)} ${hvField("Fecha de nacimiento", d.fecha_nacimiento)}
        ${hvField("Teléfono", d.telefono)} ${hvField("Email", d.conductor_email)}
        ${hvField("Dirección", d.direccion)} ${hvField("Barrio", d.barrio)}
        ${hvField("Ciudad de residencia", d.ciudad_residencia)}
        <div class="hv-modal-section" style="margin-top:14px;">EXPERIENCIA</div>
        ${hvField("Años de experiencia", d.anios_experiencia != null ? `${d.anios_experiencia} año(s)` : "")}
        ${hvField("Ciudades trabajadas", d.ciudades_trabajadas)}
        ${hvField("Categoría licencia", d.categoria_licencia)}
        ${hvField("Número de licencia", d.numero_licencia)}
        ${(d.ref1_nombre || d.ref2_nombre) ? `<div class="hv-modal-section" style="margin-top:14px;">REFERENCIAS</div>` : ""}
        ${d.ref1_nombre ? `<div style="border:1px solid rgba(255,255,255,.07);border-radius:10px;padding:10px;margin-bottom:8px;"><div style="font-size:11px;color:var(--muted);font-weight:700;margin-bottom:6px;">REFERENCIA 1</div>${hvField("Nombre",d.ref1_nombre)}${hvField("Teléfono",d.ref1_telefono)}${hvField("Relación",relLabel[d.ref1_relacion]||d.ref1_relacion)}</div>` : ""}
        ${d.ref2_nombre ? `<div style="border:1px solid rgba(255,255,255,.07);border-radius:10px;padding:10px;margin-bottom:8px;"><div style="font-size:11px;color:var(--muted);font-weight:700;margin-bottom:6px;">REFERENCIA 2</div>${hvField("Nombre",d.ref2_nombre)}${hvField("Teléfono",d.ref2_telefono)}${hvField("Relación",relLabel[d.ref2_relacion]||d.ref2_relacion)}</div>` : ""}
        ${d.descripcion_personal ? `<div class="hv-modal-section" style="margin-top:14px;">DESCRIPCIÓN PERSONAL</div><p style="font-style:italic;opacity:.9;line-height:1.6;margin:8px 0 0;">"${escapeHtml(d.descripcion_personal)}"</p>` : ""}
        ${d.mensaje ? `<div class="hv-modal-section" style="margin-top:14px;">MENSAJE DE POSTULACIÓN</div><p style="font-style:italic;opacity:.9;line-height:1.6;margin:8px 0 0;">"${escapeHtml(d.mensaje)}"</p>` : ""}
      `;
    } catch (e) {
      body.innerHTML = `<p class="muted" style="text-align:center; padding:20px;">Error cargando la hoja de vida.</p>`;
    }
  }

  // ── Attachar acciones ─────────────────────────────────────────────────────
  function attachActions() {
    // Postulaciones
    const postList = document.getElementById("postulaciones-list");
    if (postList) {
      postList.addEventListener("click", async (e) => {
        const btn = e.target.closest("button[data-action]");
        if (!btn) return;
        const id = btn.getAttribute("data-id");
        const action = btn.getAttribute("data-action");
        try {
          if (action === "ver-hv") { await openHvModal(id); return; }
          else if (action === "preseleccionar") await window.TC.api.request(`/api/propietario/postulaciones/${id}/preseleccionar`, { method: "PATCH" });
          else if (action === "aceptar") await window.TC.api.request(`/api/propietario/postulaciones/${id}/aceptar`, { method: "POST" });
          await refreshDashboard();
        } catch (err) { alert("Error: " + err.message); }
      });
    }

    // Mis ofertas
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
        } catch (err) { alert("Error: " + err.message); }
      });
    }

    // Botón publicar — ÚNICO punto de entrada, verifica vehículos primero
    document.querySelectorAll("[id^='btn-publicar']").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        verificarVehiculosYPublicar();
      });
    });
  }

  function attachLogout() {
    const btns = Array.from(document.querySelectorAll("button.btn.danger"));
    btns.forEach((b) => {
      if (b.textContent.trim().toLowerCase() === "salir") {
        b.addEventListener("click", () => window.TC.session.logout("index.html"));
      }
    });
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  document.addEventListener("DOMContentLoaded", async () => {
    const u = window.TC.session.requireRole("propietario");
    if (!u) return;

    // Cerrar modal HV
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

      // Verificar si tiene vehículos para mostrar bienvenida
      const vehData = await window.TC.api.request("/api/propietario/vehiculos");
      const vehs = vehData.data || [];
      _tieneVehiculos = vehs.length > 0;

      // Mostrar bienvenida solo si no tiene vehículos ni ofertas
      if (!_tieneVehiculos) {
        mostrarBienvenida();
      }
    } catch (e) {
      console.error(e);
    }
  });

})();
