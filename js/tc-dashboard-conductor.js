(function () {
  let _asignacionActual = null; // guarda datos de la asignación para el modal

  // Convierte cualquier fecha (ISO o YYYY-MM-DD) a DD/MM/YYYY
  function formatFecha(val) {
    if (!val) return "—";
    const d = new Date(val);
    if (isNaN(d.getTime())) return String(val);
    return [
      String(d.getUTCDate()).padStart(2, "0"),
      String(d.getUTCMonth() + 1).padStart(2, "0"),
      d.getUTCFullYear(),
    ].join("/");
  }

  function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value ?? "";
  }

  function setVal(id, value) {
    const el = document.getElementById(id);
    if (el) el.value = value ?? "";
  }

  function getVal(id) {
    const el = document.getElementById(id);
    return el ? el.value : "";
  }

  function attachLogout() {
    const btn = document.querySelector("aside.sidebar button.btn.danger");
    if (btn) btn.addEventListener("click", () => window.TC.session.logout("index.html"));
  }

  async function refresh() {
    const user = window.TC.session.getUser();
    if (user) setText("user-name", `${user.nombres || ""} ${user.apellidos || ""}`.trim());

    const data = await window.TC.api.request("/api/dashboard/conductor");

    setText("nivel", data.stats?.nivel ?? "Plata");
    setText("score", data.stats?.score ?? "0");
    setText("avg", data.stats?.avg ?? "0");
    setText("reviews", data.stats?.reviews ?? "0");
    setText("rating90", data.stats?.rating90 ?? "0");
    setText("jobs", data.stats?.jobs ?? "0");
    setText("points", data.stats?.points ?? "0");
    setText("notif-count", data.stats?.notifCount ?? "0");

    // Cargar asignación activa
    const statusEl = document.getElementById("job-status");
    const chipEl = document.getElementById("job-estado-chip");
    try {
      const asig = await window.TC.api.request("/api/conductor/asignacion-activa");
      const a = asig.data;
      if (a) {
        _asignacionActual = a;
        setText("job-title", a.oferta_titulo || "Asignación activa");
        setText("job-owner", `${a.propietario_nombre || ""} ${a.propietario_apellidos || ""}`.trim() || "—");
        setText("job-placa", a.placa || "—");
        setText("job-start", formatFecha(a.fecha_inicio));
        setText("job-city", a.ciudad || "—");
        if (statusEl) statusEl.textContent = "Tienes una asignación activa.";
        if (chipEl) chipEl.style.display = "";
      } else {
        setText("job-title", "Sin asignación activa");
        setText("job-owner", "—");
        setText("job-placa", "—");
        setText("job-start", "—");
        setText("job-city", "—");
        if (statusEl) statusEl.textContent = "No tienes ninguna asignación activa en este momento.";
        if (chipEl) chipEl.style.display = "none";
      }
    } catch (e) {
      console.error("Error cargando asignación activa:", e);
      setText("job-title", "Error al cargar");
      if (statusEl) statusEl.textContent = "No se pudo cargar la asignación: " + (e.message || "intenta recargar.");
    }
  }

  // ── Hoja de vida ──────────────────────────────────────

  function showHvAlert(msg, isError) {
    const el = document.getElementById("hv-alert");
    if (!el) return;
    el.className = isError ? "alert-err" : "alert-ok";
    el.textContent = msg;
    el.style.display = "block";
    setTimeout(() => { el.style.display = "none"; }, 5000);
  }

  function resizeImage(file, maxPx, quality, cb) {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(maxPx / img.width, maxPx / img.height, 1);
        const canvas = document.createElement("canvas");
        canvas.width  = Math.round(img.width  * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        cb(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  }

  function renderFotoPreview(dataUrl) {
    const wrap = document.getElementById("hv-foto-preview");
    if (!wrap) return;
    wrap.innerHTML = dataUrl
      ? `<img src="${dataUrl}" alt="Foto de perfil">`
      : `<span style="font-size:36px; opacity:.5;">👤</span>`;
  }

  async function loadHV() {
    try {
      const data = await window.TC.api.request("/api/conductor/perfil");
      const p = data.data || {};

      // Datos del usuario (readonly)
      setVal("hv-nombres",  `${p.nombres || ""} ${p.apellidos || ""}`.trim());
      setVal("hv-email",    p.email    || "");
      setVal("hv-telefono", p.telefono || "");

      // Datos editables
      setVal("hv-cedula",           p.cedula            || "");
      setVal("hv-fecha-nacimiento", p.fecha_nacimiento  || "");
      setVal("hv-direccion",        p.direccion         || "");
      setVal("hv-barrio",           p.barrio            || "");
      setVal("hv-ciudad-residencia",p.ciudad_residencia || "");

      setVal("hv-anios-exp",        p.anios_experiencia   ?? "");
      setVal("hv-ciudades-trabajadas", p.ciudades_trabajadas || "");
      setVal("hv-turno-preferido",  p.turno_preferido    || "");
      setVal("hv-categoria-licencia", p.categoria_licencia || "");
      setVal("hv-numero-licencia",  p.numero_licencia    || "");

      setVal("hv-ref1-nombre",   p.ref1_nombre   || "");
      setVal("hv-ref1-telefono", p.ref1_telefono || "");
      setVal("hv-ref1-relacion", p.ref1_relacion || "");
      setVal("hv-ref2-nombre",   p.ref2_nombre   || "");
      setVal("hv-ref2-telefono", p.ref2_telefono || "");
      setVal("hv-ref2-relacion", p.ref2_relacion || "");

      const desc = p.descripcion_personal || "";
      setVal("hv-descripcion", desc);
      setText("hv-desc-count", String(desc.length));

      // Foto
      const fotoInput = document.getElementById("hv-foto-url");
      if (fotoInput) fotoInput.value = p.foto_url || "";
      renderFotoPreview(p.foto_url || "");

    } catch (e) {
      console.error("Error cargando HV:", e);
    }
  }

  async function saveHV() {
    const btn = document.getElementById("btn-guardar-hv");
    if (btn) { btn.disabled = true; btn.textContent = "Guardando..."; }

    try {
      const payload = {
        cedula:             getVal("hv-cedula"),
        fecha_nacimiento:   getVal("hv-fecha-nacimiento"),
        direccion:          getVal("hv-direccion"),
        barrio:             getVal("hv-barrio"),
        ciudad_residencia:  getVal("hv-ciudad-residencia"),
        foto_url:           getVal("hv-foto-url"),
        anios_experiencia:  getVal("hv-anios-exp"),
        ciudades_trabajadas:getVal("hv-ciudades-trabajadas"),
        turno_preferido:    getVal("hv-turno-preferido"),
        categoria_licencia: getVal("hv-categoria-licencia"),
        numero_licencia:    getVal("hv-numero-licencia"),
        ref1_nombre:        getVal("hv-ref1-nombre"),
        ref1_telefono:      getVal("hv-ref1-telefono"),
        ref1_relacion:      getVal("hv-ref1-relacion"),
        ref2_nombre:        getVal("hv-ref2-nombre"),
        ref2_telefono:      getVal("hv-ref2-telefono"),
        ref2_relacion:      getVal("hv-ref2-relacion"),
        descripcion_personal: getVal("hv-descripcion"),
      };

      await window.TC.api.request("/api/conductor/perfil", { method: "PUT", body: payload });
      showHvAlert("✅ Hoja de vida guardada correctamente.", false);
    } catch (e) {
      showHvAlert("Error al guardar: " + (e.message || "intenta de nuevo."), true);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = "💾 Guardar hoja de vida"; }
    }
  }

  function attachHvListeners() {
    // Contador descripción
    const desc = document.getElementById("hv-descripcion");
    if (desc) {
      desc.addEventListener("input", () => setText("hv-desc-count", String(desc.value.length)));
    }

    // Foto
    const fotoInput = document.getElementById("hv-foto-input");
    if (fotoInput) {
      fotoInput.addEventListener("change", (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        resizeImage(file, 200, 0.82, (dataUrl) => {
          document.getElementById("hv-foto-url").value = dataUrl;
          renderFotoPreview(dataUrl);
        });
      });
    }

    // Guardar
    const btnGuardar = document.getElementById("btn-guardar-hv");
    if (btnGuardar) btnGuardar.addEventListener("click", saveHV);
  }

  // Exponer loadHV globalmente para que el inline script lo llame al abrir la sección
  window.TC_loadHV = loadHV;

  // ── Modal detalle asignación ──────────────────────────

  const TURNO_LABEL   = { dia: "Día", noche: "Noche", completo: "Completo", personalizado: "Personalizado" };
  const MODAL_LABEL   = { taxi_completo: "Taxi completo", turno_fijo: "Turno fijo", porcentaje: "Por porcentaje" };
  const INCLUYE_LABEL = { soat: "SOAT", mantenimiento: "Mantenimiento", todo_riesgo: "Todo riesgo", combustible: "Combustible", nada: "Ninguno" };

  function abrirDetalleAsignacion() {
    const a = _asignacionActual;
    const modal = document.getElementById("modal-detalle-trabajo");
    if (!modal) return;
    if (!a) {
      alert("No hay asignación activa para mostrar.");
      return;
    }

    const propietario = `${a.propietario_nombre || ""} ${a.propietario_apellidos || ""}`.trim() || "—";
    const vehiculo = [a.marca, a.modelo, a.anio, a.placa ? `(${a.placa})` : null].filter(Boolean).join(" ") || a.placa || "—";
    const cuota = Number(a.cuota_diaria) > 0
      ? `$${Number(a.cuota_diaria).toLocaleString("es-CO")}/día`
      : "—";
    const porcentaje = Number(a.porcentaje_propietario) > 0
      ? `${Number(a.porcentaje_propietario).toFixed(0)}%`
      : "—";

    setText("det-titulo",      a.oferta_titulo || "—");
    setText("det-ciudad",      a.ciudad        || "—");
    setText("det-turno",       TURNO_LABEL[a.turno] || a.turno || "—");
    setText("det-fecha",       formatFecha(a.fecha_inicio));
    setText("det-zona",        a.zona_operacion || "Toda la ciudad");
    setText("det-propietario", propietario);
    setText("det-propietario-tel", a.propietario_celular ? `Tel: ${a.propietario_celular}` : "");
    setText("det-vehiculo",    vehiculo);
    setText("det-modalidad",   MODAL_LABEL[a.modalidad] || a.modalidad || "—");
    setText("det-cuota",       cuota);
    setText("det-porcentaje",  porcentaje);

    const incluyeEl = document.getElementById("det-incluye");
    const incluyeRow = document.getElementById("det-incluye-row");
    if (incluyeEl) {
      const items = a.incluye ? String(a.incluye).split(",").map(s => s.trim()).filter(Boolean) : [];
      if (items.length) {
        incluyeEl.innerHTML = items.map(k =>
          `<span style="background:rgba(255,255,255,.06); border:1px solid rgba(255,255,255,.1); border-radius:6px; padding:3px 10px; font-size:12px;">${INCLUYE_LABEL[k] || k}</span>`
        ).join("");
        if (incluyeRow) incluyeRow.style.display = "";
      } else {
        if (incluyeRow) incluyeRow.style.display = "none";
      }
    }

    modal.style.display = "block";
    document.body.style.overflow = "hidden";
  }

  function cerrarDetalleAsignacion() {
    const modal = document.getElementById("modal-detalle-trabajo");
    if (modal) modal.style.display = "none";
    document.body.style.overflow = "";
  }

  // ──────────────────────────────────────────────────────

  document.addEventListener("DOMContentLoaded", async () => {
    const u = window.TC.session.requireRole("conductor");
    if (!u) return;

    attachLogout();
    attachHvListeners();

    const btnDetalle = document.getElementById("btn-ver-detalle-trabajo");
    if (btnDetalle) btnDetalle.addEventListener("click", abrirDetalleAsignacion);

    const btnCerrar = document.getElementById("btn-cerrar-detalle-trabajo");
    if (btnCerrar) btnCerrar.addEventListener("click", cerrarDetalleAsignacion);

    const modal = document.getElementById("modal-detalle-trabajo");
    if (modal) modal.addEventListener("click", (e) => { if (e.target === modal) cerrarDetalleAsignacion(); });

    try { await refresh(); } catch (e) { console.error(e); }
  });
})();
