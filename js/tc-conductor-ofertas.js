/* tc-conductor-ofertas.js */
console.log("[tc-conductor-ofertas] cargando...");

(function () {
  // --------- Helpers ----------
  const $ = (sel) => document.querySelector(sel);

  function safeText(v) {
    if (v === null || v === undefined) return "";
    return String(v);
  }

  function norm(v) {
    return safeText(v).trim().toLowerCase();
  }

  function money(v) {
    const n = Number(v);
    if (Number.isFinite(n)) return n.toLocaleString("es-CO");
    return safeText(v) || "—";
  }

  function setChipText(sel, text) {
    const el = $(sel);
    if (el) el.textContent = text;
  }

  
  // --------- State ----------
  let ofertasAll = [];      // lo que viene del backend
  let ofertasView = [];     // lo que se muestra tras filtros
  let currentUser = null;
  // --------- DOM refs (si no existen, no rompe) ----------
  const tbody = () => $("#offersTable");

const inpBuscar     = () => $("#inpBuscar") || $("#q");
const fCiudad       = () => $("#fCiudad") || $("#f-ciudad");
const fTurno        = () => $("#fTurno") || $("#f-turno");
const fCuotaMin     = () => $("#fCuotaMin") || $("#f-min");
const btnActualizar = () => $("#btnActualizar") || $("#btnRefresh");

  let ofertaSeleccionadaId = null;

function openModalPostular(ofertaId) {
  ofertaSeleccionadaId = ofertaId;

  const modal = document.querySelector("#modalPostular");
  const msg = document.querySelector("#mpMensaje");
  const alert = document.querySelector("#mpAlert");
  const counter = document.querySelector("#mpCharCount");

  if (alert) { alert.style.display = "none"; alert.textContent = ""; }
  if (msg) msg.value = "";
  if (counter) counter.textContent = "0";

  if (modal) {
    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
    setTimeout(() => msg && msg.focus(), 50);
  }
}

function closeModalPostular() {
  const modal = document.querySelector("#modalPostular");
  if (modal) {
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
  }
  ofertaSeleccionadaId = null;
}

function showMpAlert(msg) {
  const alert = document.querySelector("#mpAlert");
  if (!alert) return;
  alert.textContent = msg;
  alert.style.display = "block";
}

  // --------- Init ----------
  document.addEventListener("DOMContentLoaded", async () => {
    // 1) validar sesión y rol
    const u = window.TC?.session?.requireRole("conductor");
    if (!u) return;
    currentUser = u;
    
    setChipText("#user-pill", u.email ? u.email : "—");

    // 2) eventos UI
    wireUI();

    // 3) cargar al iniciar
    await cargarOfertas();
  });

  function wireUI() {
    // Buscar
    inpBuscar()?.addEventListener("input", () => {
      aplicarFiltrosYRender();
    });

    // Filtros
    fCiudad()?.addEventListener("input", () => {
      aplicarFiltrosYRender();
    });

    fTurno()?.addEventListener("change", () => {
      aplicarFiltrosYRender();
    });

    fCuotaMin()?.addEventListener("input", () => {
      aplicarFiltrosYRender();
    });

    // Botón actualizar
    btnActualizar()?.addEventListener("click", async () => {
      await cargarOfertas();
    });

  }
  // --------- API ----------
  async function cargarOfertas() {
    const tb = tbody();
    if (!tb) {
      console.warn("[tc-conductor-ofertas] No existe #tblOfertas tbody");
      return;
    }

    tb.innerHTML = `<tr><td colspan="6">Cargando...</td></tr>`;
    setChipText("#count", "0");

    try {
      console.log("[tc-conductor-ofertas] GET /api/conductor/ofertas");

const r = await fetch("/api/conductor/ofertas", {
  headers: {
    "Accept": "application/json",
    // ✅ fallback para tu requireUser si sigue pidiendo headers
    "X-User-Email": (currentUser?.email || "").toString(),
    "X-User-Tipo": (currentUser?.tipo || "conductor").toString(),
  },
  credentials: "include",
});


      console.log("[tc-conductor-ofertas] status", r.status);
      const j = await r.json().catch(() => null);

if (!r.ok) {
  throw new Error((j && (j.message || j.error)) ? (j.message || j.error) : `HTTP ${r.status}`);
}

// ✅ aceptar ambos formatos: {success:true} o {ok:true}
const okFlag = (j?.ok === true) || (j?.success === true);
if (!okFlag) {
  throw new Error(j?.message || j?.error || "Respuesta inválida del servidor");
}

// ✅ aceptar ambos formatos de data: {ofertas:[...]} o {data:[...]}
ofertasAll = Array.isArray(j?.ofertas) ? j.ofertas : (Array.isArray(j?.data) ? j.data : []);
aplicarFiltrosYRender();
    } catch (err) {
      console.error("[tc-conductor-ofertas] Error cargando ofertas:", err);
      tb.innerHTML = `<tr><td colspan="6">Error cargando ofertas</td></tr>`;
    }
  }

  // --------- Filtering + Render ----------
  function aplicarFiltrosYRender() {
    const q = norm(inpBuscar()?.value);
    const ciudad = norm(fCiudad()?.value);
    const turno = norm(fTurno()?.value); // esperado: "", "día", "noche", "mixto" o "todos"
    const cuotaMinRaw = safeText(fCuotaMin()?.value);
    const cuotaMin = cuotaMinRaw === "" ? null : Number(cuotaMinRaw);

    ofertasView = ofertasAll.filter((o) => {
      // Texto
      const hayTexto =
        !q ||
        norm(o.titulo).includes(q) ||
        norm(o.descripcion).includes(q) ||
        norm(o.requisitos).includes(q) ||
        norm(o.ciudad).includes(q);

      if (!hayTexto) return false;

      // Ciudad
      if (ciudad && !norm(o.ciudad).includes(ciudad)) return false;

      // Turno
      if (turno && turno !== "todos" && norm(o.turno) !== turno) return false;

      // Cuota mínima
      if (cuotaMin !== null && Number.isFinite(cuotaMin)) {
        const cd = Number(o.cuota_diaria);
        if (Number.isFinite(cd) && cd < cuotaMin) return false;
      }

      return true;
    });

    setChipText("#count", String(ofertasView.length));
    renderTabla();
  }

  // ── Etiquetas legibles ──
  const MODALIDAD_LABEL = {
    taxi_completo: "Taxi completo",
    turno_fijo:    "Turno fijo",
    turno_partido: "Turno partido",
    fin_de_semana: "Solo fines de semana",
    turno_libre:   "Turno libre",
  };
  const COMBUSTIBLE_LABEL = {
    gasolina:  "Gasolina",
    gas:       "Gas natural (GNV)",
    hibrido:   "Híbrido",
    electrico: "Eléctrico",
  };
  const INCLUYE_LABEL = {
    soat:         "🛡️ SOAT",
    mantenimiento:"🔧 Mantenimiento preventivo",
    todo_riesgo:  "🔒 Seguro todo riesgo",
    nada:         "❌ Nada (conductor corre con todo)",
  };
  const LICENCIA_LABEL = {
    B1: "B1 — hasta 3.5 t",
    B2: "B2 — servicio público",
    B3: "B3 — articulados",
    C1: "C1 — motocicletas",
    C2: "C2 — motos pesadas",
  };

  function renderTabla() {
    const tb = tbody();
    if (!tb) return;

    if (!ofertasView.length) {
      tb.innerHTML = `<tr><td colspan="6">No hay ofertas activas</td></tr>`;
      return;
    }

    tb.innerHTML = ofertasView.map((o) => {
      const propietario = safeText(o.propietario_nombre).trim() || "—";
      const placa       = safeText(o.placa) || "—";
      const marca       = safeText(o.veh_marca);
      const modelo      = safeText(o.veh_modelo);
      const vehiculoStr = [marca, modelo, placa].filter(Boolean).join(" · ") || "—";
      const miEstado    = safeText(o.mi_postulacion_estado);
      const yaPostulado = !!miEstado;

      const btnPostular = yaPostulado
        ? `<button class="btn" disabled style="opacity:.65; cursor:not-allowed; font-size:12px">${miEstado === "pendiente" ? "⏳ Pendiente" : miEstado}</button>`
        : `<button class="btn btn-sm" data-action="postular" data-id="${safeText(o.id)}" style="font-size:12px">Postular</button>`;

      return `
        <tr>
          <td>
            <div style="font-weight:600">${safeText(o.titulo) || "—"}</div>
            <div style="opacity:.75; font-size:.88em; margin-top:2px">${safeText(o.ciudad)}${o.turno ? " · " + o.turno : ""}</div>
          </td>
          <td>
            <div>${o.cuota_diaria > 0 ? "$" + money(o.cuota_diaria) + "/día" : "—"}</div>
            ${o.porcentaje_propietario > 0 ? `<div style="opacity:.75; font-size:.88em">${o.porcentaje_propietario}% prop.</div>` : ""}
          </td>
          <td style="font-size:12px">${vehiculoStr}</td>
          <td style="font-size:12px">${propietario}</td>
          <td style="font-size:12px">${safeText(o.estado) || "—"}</td>
          <td style="text-align:right; white-space:nowrap">
            <button class="btn" data-action="ver" data-id="${safeText(o.id)}" style="font-size:12px; margin-right:6px">Ver</button>
            ${btnPostular}
          </td>
        </tr>
      `;
    }).join("");
  }

  // ── Llenar y abrir el dialog de detalle ──
  function abrirDetalle(ofertaId) {
    const o = ofertasView.find(x => String(x.id) === String(ofertaId));
    if (!o) return;

    // Título y meta
    document.getElementById("dlgTitle").textContent = o.titulo || "Oferta";
    document.getElementById("dlgMeta").textContent =
      [o.ciudad, o.fecha_creacion ? "Publicada " + o.fecha_creacion : ""].filter(Boolean).join(" · ");

    // Pills rápidos
    const pillsEl = document.getElementById("dlgPills");
    const pills = [
      o.ciudad            && { text: "📍 " + o.ciudad },
      o.turno             && { text: "🕐 Turno " + o.turno, hi: false },
      o.modalidad         && { text: MODALIDAD_LABEL[o.modalidad] || o.modalidad, hi: true },
      o.estado            && { text: o.estado, hi: false },
    ].filter(Boolean);
    pillsEl.innerHTML = pills.map(p =>
      `<span class="dlg-pill${p.hi ? " hi" : ""}">${p.text}</span>`
    ).join("");

    // Vehículo
    const vehKV = document.getElementById("dlgVehiculoKV");
    const vehItems = [
      ["Placa",       o.placa || "—"],
      ["Marca",       o.veh_marca || "—"],
      ["Modelo",      o.veh_modelo || "—"],
      ["Año",         o.veh_anio || "—"],
      ["Combustible", COMBUSTIBLE_LABEL[o.veh_combustible] || o.veh_combustible || "—"],
    ];
    if (o.turno_inicio && o.turno_fin) {
      vehItems.push(["Horario turno", o.turno_inicio + " – " + o.turno_fin]);
    }
    vehKV.innerHTML = vehItems.map(([k, v]) =>
      `<dt>${k}</dt><dd>${v}</dd>`
    ).join("");

    // Condiciones económicas
    const econKV = document.getElementById("dlgEconKV");
    const econItems = [];
    if (o.cuota_diaria > 0)           econItems.push(["Cuota diaria", "$" + money(o.cuota_diaria)]);
    if (o.porcentaje_propietario > 0) econItems.push(["% propietario", o.porcentaje_propietario + "%"]);
    econKV.innerHTML = econItems.length
      ? econItems.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("")
      : "<dt>—</dt><dd></dd>";

    // Incluye
    const incluyeEl = document.getElementById("dlgIncluye");
    const incluyeArr = safeText(o.incluye)
      ? safeText(o.incluye).split(",").map(s => s.trim()).filter(Boolean)
      : [];
    incluyeEl.innerHTML = incluyeArr.length
      ? incluyeArr.map(tag =>
          `<span class="incluye-tag${tag === "nada" ? " nada" : ""}">${INCLUYE_LABEL[tag] || tag}</span>`
        ).join("")
      : '<span class="small">No especificado</span>';

    // Descripción
    document.getElementById("dlgDesc").textContent = o.descripcion || "Sin descripción.";

    // Zona
    document.getElementById("dlgZona").textContent = o.zona_operacion || "Toda la ciudad";

    // Requisitos mínimos (kv)
    const reqKV = document.getElementById("dlgReqKV");
    const reqItems = [];
    if (o.exp_minima)         reqItems.push(["Experiencia mínima", o.exp_minima + " año(s)"]);
    if (o.categoria_licencia) reqItems.push(["Licencia", LICENCIA_LABEL[o.categoria_licencia] || o.categoria_licencia]);
    reqKV.innerHTML = reqItems.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("");

    // Requisitos texto
    document.getElementById("dlgReq").textContent = o.requisitos || "";

    // WhatsApp
    const waWrap = document.getElementById("dlgContactoWrap");
    const waLink = document.getElementById("dlgWaLink");
    const waNum  = document.getElementById("dlgWaNum");
    if (o.whatsapp) {
      const num = safeText(o.whatsapp).replace(/\D/g, "");
      waLink.href = `https://wa.me/57${num}`;
      waNum.textContent = o.whatsapp;
      waWrap.style.display = "block";
    } else {
      waWrap.style.display = "none";
    }

    // Botón postular
    const miEstado = safeText(o.mi_postulacion_estado);
    document.getElementById("dlgPostularWrap").style.display = miEstado ? "none" : "block";
    document.getElementById("dlgYaPostulado").style.display  = miEstado ? "block" : "none";
    if (miEstado) document.getElementById("dlgEstadoPostulacion").textContent = miEstado;

    // Guardar id para el botón postular dentro del dialog
    document.getElementById("btnDlgPostular").dataset.id = o.id;

    document.getElementById("offerDialog").showModal();
  }
  document.addEventListener("click", async (e) => {
    const el = e.target.closest("[data-action]");
    if (!el) return;

    const action = el.getAttribute("data-action");

    if (action === "ver") {
      abrirDetalle(el.getAttribute("data-id"));
      return;
    }

    if (action === "postular") {
      const ofertaId = Number(el.getAttribute("data-id"));
      if (!Number.isFinite(ofertaId) || ofertaId <= 0) return;
      openModalPostular(ofertaId);
      return;
    }

    if (el.id === "mpClose" || el.id === "mpCancel" || el.dataset.close === "1") {
      closeModalPostular();
      return;
    }
  });

  // Contador de caracteres del textarea de postulación
  document.addEventListener("input", (e) => {
    if (e.target.id !== "mpMensaje") return;
    const counter = document.querySelector("#mpCharCount");
    if (counter) counter.textContent = e.target.value.length;
  });

  // Botón "Postular" dentro del dialog de detalle
  document.addEventListener("click", (e) => {
    if (e.target.id !== "btnDlgPostular") return;
    const id = Number(e.target.dataset.id);
    document.getElementById("offerDialog").close();
    openModalPostular(id);
  });
document.addEventListener("click", async (e) => {
  const t = e.target;

  if (t?.id === "mpClose" || t?.id === "mpCancel" || t?.dataset?.close === "1") {
    closeModalPostular();
    return;
  }

  if (t?.id === "mpSubmit") {
    try {
      if (!ofertaSeleccionadaId) return showMpAlert("No hay oferta seleccionada.");

      // conductor_id: debe existir del login
      const u = (window.getUser && window.getUser()) || null;
      const conductorId = Number(localStorage.getItem("tc_usuario_id") || u?.id);
      if (!Number.isFinite(conductorId) || conductorId <= 0) {
        return showMpAlert("No se detectó el usuario. Inicia sesión nuevamente.");
      }

      const mensaje = (document.querySelector("#mpMensaje")?.value || "").trim();

      if (!mensaje) return showMpAlert("Escribe por qué quieres este trabajo.");

      t.disabled = true;
      t.textContent = "Enviando...";

      const resp = await fetch(`/api/conductor/ofertas/${ofertaSeleccionadaId}/postular`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ conductor_id: conductorId, mensaje })
      });

      const data = await resp.json().catch(() => ({}));

      if (!resp.ok) {
        showMpAlert(data?.error || "No se pudo postular.");
        return;
      }

      closeModalPostular();

      // Mostrar confirmación simple
      const confirm = document.createElement("div");
      confirm.textContent = "✅ ¡Postulación enviada! El propietario te contactará pronto.";
      Object.assign(confirm.style, {
        position: "fixed", bottom: "24px", left: "50%", transform: "translateX(-50%)",
        background: "#1a7a4a", color: "#fff", padding: "14px 24px",
        borderRadius: "10px", fontWeight: "600", fontSize: "15px",
        zIndex: "9999", boxShadow: "0 4px 16px rgba(0,0,0,.25)"
      });
      document.body.appendChild(confirm);
      setTimeout(() => confirm.remove(), 4000);

      if (typeof cargarOfertas === "function") {
        await cargarOfertas();
      } else {
        location.reload();
      }

    } catch (err) {
      console.error(err);
      showMpAlert("Error inesperado al postular.");
    } finally {
      const btn = document.querySelector("#mpSubmit");
      if (btn) {
        btn.disabled = false;
        btn.textContent = "Enviar postulación";
      }
    }
  }
});  
})();
