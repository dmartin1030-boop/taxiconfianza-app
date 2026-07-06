/* =====================================================
   TAXICONFIANZA — js/tc-proveedores.js
   Lógica del directorio de proveedores para taxistas
   ===================================================== */
(function () {
  "use strict";

  function authHeaders() {
    const email = localStorage.getItem("user_email") || "";
    const tipo  = localStorage.getItem("user_tipo")  || "";
    return { "Content-Type": "application/json", "X-User-Email": email, "X-User-Tipo": tipo };
  }

  const CAT_ICON = {
    taller:      "🔧",
    seguro:      "🛡️",
    combustible: "⛽",
    tecnologia:  "📱",
    credito:     "💳",
    uniforme:    "👔",
    otro:        "📦",
  };

  const CAT_LABEL = {
    taller:      "Taller mecánico",
    seguro:      "Seguros",
    combustible: "Combustible",
    tecnologia:  "Tecnología",
    credito:     "Crédito",
    uniforme:    "Uniformes",
    otro:        "Otro",
  };

  const state = { filtros: { ciudad: "", categoria: "" } };

  // ── Renderizar card ───────────────────────────────
  function renderCard(p) {
    const icon  = CAT_ICON[p.categoria] || "🏪";
    const label = CAT_LABEL[p.categoria] || p.categoria;
    const planBadge = (p.plan === "patrocinado" || p.plan === "destacado")
      ? `<span class="prov-plan-badge ${p.plan}">${p.plan === "destacado" ? "⭐ Destacado" : "Patrocinado"}</span>` : "";

    return `
    <div class="prov-card ${p.plan !== "basico" ? p.plan : ""}" data-id="${p.id}" onclick="window.TC.proveedores.verDetalle(${p.id})">
      ${planBadge}
      <div class="prov-icon">${icon}</div>
      <div class="prov-name">${escHtml(p.nombre)}</div>
      <div class="prov-cat">${label} · <span>${escHtml(p.ciudad||"Colombia")}</span></div>
      <div class="prov-desc">${escHtml(p.descripcion||"")}</div>
      ${p.beneficio_tc ? `<div class="prov-beneficio">🎁 ${escHtml(p.beneficio_tc)}</div>` : ""}
      <div class="prov-footer">
        <span class="ver-detalle">Ver beneficio →</span>
      </div>
    </div>`;
  }

  // ── Cargar proveedores ────────────────────────────
  async function load() {
    const grid    = document.getElementById("prov-grid");
    const loading = document.getElementById("prov-loading");
    const empty   = document.getElementById("prov-empty");
    if (!grid) return;

    if (loading) loading.style.display = "block";
    if (grid)    grid.style.display    = "none";
    if (empty)   empty.style.display   = "none";

    try {
      const params = new URLSearchParams({
        ciudad:    state.filtros.ciudad,
        categoria: state.filtros.categoria,
      });

      const res  = await fetch(`/api/proveedores?${params}`, { headers: authHeaders(), credentials: "include" });
      const json = await res.json();

      if (!json.ok) throw new Error(json.error || "Error cargando proveedores");

      if (loading) loading.style.display = "none";

      if (!json.data || !json.data.length) {
        if (empty) empty.style.display = "block";
        return;
      }

      // Hero destacado
      const destacado = json.data.find(p => p.plan === "destacado" && p.activo);
      const heroEl    = document.getElementById("prov-hero");
      if (destacado && heroEl) {
        heroEl.style.display = "flex";
        document.getElementById("hero-icon").textContent    = CAT_ICON[destacado.categoria] || "🏪";
        document.getElementById("hero-nombre").textContent  = destacado.nombre;
        document.getElementById("hero-desc").textContent    = destacado.descripcion || "";
        document.getElementById("hero-beneficio").textContent = "🎁 " + (destacado.beneficio_tc || "Beneficio exclusivo TC");
        document.getElementById("hero-ver-btn").onclick     = () => verDetalle(destacado.id);
      }

      // Ordenar: destacado → patrocinado → basico
      const ordenPlan = { destacado: 0, patrocinado: 1, basico: 2 };
      const sorted = [...json.data].sort((a, b) => (ordenPlan[a.plan]||2) - (ordenPlan[b.plan]||2));

      grid.innerHTML     = sorted.map(renderCard).join("");
      grid.style.display = "grid";

    } catch (err) {
      console.error("load proveedores:", err);
      if (loading) loading.style.display = "none";
      if (empty) {
        empty.style.display = "block";
        empty.querySelector("p").textContent = "Error cargando proveedores. Intenta de nuevo.";
      }
    }
  }

  // ── Ver detalle en modal ──────────────────────────
  function verDetalle(id) {
    const modal = document.getElementById("prov-modal");
    if (!modal) return;

    // Buscar en los datos cargados desde el DOM (data-id)
    fetch(`/api/proveedores/${id}`, { headers: authHeaders(), credentials: "include" })
      .then(r => r.json())
      .then(json => {
        if (!json.ok || !json.data) return;
        const p = json.data;
        const icon = CAT_ICON[p.categoria] || "🏪";

        document.getElementById("modal-icon").textContent   = icon;
        document.getElementById("modal-nombre").textContent = p.nombre;
        document.getElementById("modal-cat").textContent    = (CAT_LABEL[p.categoria]||p.categoria) + (p.ciudad ? ` · ${p.ciudad}` : "");
        document.getElementById("modal-desc").textContent   = p.descripcion || "Sin descripción disponible.";
        document.getElementById("modal-beneficio").textContent = p.beneficio_tc || "Consulta el beneficio directamente con el proveedor.";

        // Contacto
        const contactoEl = document.getElementById("modal-contacto");
        contactoEl.innerHTML = "";
        if (p.telefono) contactoEl.innerHTML += `<div class="modal-contacto-item">📞 <span>${escHtml(p.telefono)}</span></div>`;
        if (p.website)  contactoEl.innerHTML += `<div class="modal-contacto-item">🌐 <a href="${escHtml(p.website)}" target="_blank" rel="noopener">${escHtml(p.website)}</a></div>`;

        // Botón WhatsApp
        const waWrap = document.getElementById("modal-wa-wrap");
        waWrap.innerHTML = "";
        if (p.whatsapp) {
          const num = p.whatsapp.replace(/\D/g, "");
          const msg = encodeURIComponent(`Hola, te contacto desde TaxiConfianza. Me interesa conocer el beneficio exclusivo de ${p.nombre}.`);
          waWrap.innerHTML = `<a class="wa-btn" href="https://wa.me/57${num}?text=${msg}" target="_blank" rel="noopener">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 2C6.48 2 2 6.48 2 12c0 1.82.49 3.53 1.35 5.02L2 22l5.12-1.34A9.959 9.959 0 0 0 12 22c5.52 0 10-4.48 10-10S17.52 2 12 2zm0 18c-1.72 0-3.33-.46-4.72-1.27l-.34-.2-3.04.8.81-2.96-.22-.36A8 8 0 1 1 12 20z"/></svg>
            Contactar por WhatsApp
          </a>`;
        }

        modal.classList.add("open");
      })
      .catch(err => console.error("verDetalle:", err));
  }

  // ── Formulario anunciante ─────────────────────────
  async function enviarSolicitudAnunciante() {
    const nombre    = document.getElementById("an-nombre")?.value.trim();
    const categoria = document.getElementById("an-categoria")?.value;
    const ciudad    = document.getElementById("an-ciudad")?.value.trim();
    const tel       = document.getElementById("an-tel")?.value.trim();
    const plan      = document.getElementById("an-plan")?.value;
    const msgEl     = document.getElementById("an-msg");
    const btn       = document.getElementById("an-submit");

    if (!nombre || !categoria || !ciudad || !tel) {
      if (msgEl) { msgEl.style.display="block"; msgEl.style.background="rgba(239,68,68,0.1)"; msgEl.style.color="#F87171"; msgEl.style.border="0.5px solid rgba(239,68,68,0.3)"; msgEl.textContent="Por favor completa todos los campos obligatorios."; }
      return;
    }

    if (btn) { btn.disabled=true; btn.textContent="Enviando…"; }

    try {
      const res  = await fetch("/api/proveedores/contacto", {
        method: "POST", credentials: "include",
        headers: authHeaders(),
        body: JSON.stringify({ nombre, categoria, ciudad, telefono: tel, plan }),
      });
      const json = await res.json();

      if (json.ok) {
        if (msgEl) { msgEl.style.display="block"; msgEl.style.background="rgba(29,158,117,0.1)"; msgEl.style.color="#6ee7b7"; msgEl.style.border="0.5px solid rgba(29,158,117,0.3)"; msgEl.textContent="✅ ¡Solicitud enviada! Te contactamos en menos de 24 horas."; }
        if (btn) { btn.disabled=true; btn.textContent="Solicitud enviada ✅"; }
      } else {
        throw new Error(json.error || "Error");
      }
    } catch (err) {
      if (msgEl) { msgEl.style.display="block"; msgEl.style.background="rgba(239,68,68,0.1)"; msgEl.style.color="#F87171"; msgEl.style.border="0.5px solid rgba(239,68,68,0.3)"; msgEl.textContent="Error enviando solicitud. Intenta de nuevo."; }
      if (btn) { btn.disabled=false; btn.textContent="Enviar solicitud →"; }
    }
  }

  function escHtml(str) {
    return String(str||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  }

  // ── Init ──────────────────────────────────────────
  document.addEventListener("DOMContentLoaded", () => {
    const email = localStorage.getItem("user_email");
    const tipo  = localStorage.getItem("user_tipo");
    if (!email || !tipo) { window.location.href = "/login.html"; return; }

    // Filtro ciudad
    document.getElementById("prov-filtro-ciudad")?.addEventListener("change", (e) => {
      state.filtros.ciudad = e.target.value;
      load();
    });

    // Filtro categoría
    document.querySelectorAll(".cat-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".cat-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        state.filtros.categoria = btn.dataset.cat || "";
        load();
      });
    });

    // Cerrar modal proveedor
    document.getElementById("prov-modal-close")?.addEventListener("click", () => document.getElementById("prov-modal").classList.remove("open"));
    document.getElementById("prov-modal-backdrop")?.addEventListener("click", () => document.getElementById("prov-modal").classList.remove("open"));

    // Enviar solicitud anunciante
    document.getElementById("an-submit")?.addEventListener("click", enviarSolicitudAnunciante);

    // Cargar datos
    load();
  });

  window.TC = window.TC || {};
  window.TC.proveedores = { load, verDetalle };

})();
