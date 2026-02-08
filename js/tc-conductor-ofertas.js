// js/tc-conductor-ofertas.js
(function () {
  const state = {
    offers: [],
    filtered: [],
    selected: null,
  };

  function $(id) { return document.getElementById(id); }

  function escapeHtml(s) {
    return String(s ?? "").replace(/[&<>"']/g, (m) => (
      { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[m] || m
    ));
  }

  function setMsg(t) { if ($("msg")) $("msg").textContent = t || ""; }

  function money(n) {
    const x = Number(n);
    if (!Number.isFinite(x)) return "—";
    return x.toLocaleString("es-CO");
  }

  function getAcuerdo(o) {
    const cuota = Number(o.cuota_diaria || 0);
    const porc = Number(o.porcentaje_propietario || 0);
    if (cuota > 0 && porc > 0) return "mixto";
    if (cuota > 0) return "cuota";
    if (porc > 0) return "porcentaje";
    return "";
  }

  function estadoChip(estado) {
    const e = String(estado || "").toLowerCase();
    if (!e) return `<span class="chip info">Disponible</span>`;
    if (e === "pendiente") return `<span class="chip warn">pendiente</span>`;
    if (e === "preseleccionado") return `<span class="chip info">preseleccionado</span>`;
    if (e === "aceptado") return `<span class="chip ok">aceptado</span>`;
    if (e === "no_seleccionado") return `<span class="chip">no seleccionado</span>`;
    return `<span class="chip">${escapeHtml(e)}</span>`;
  }

  function applyClientFilters() {
    const acuerdo = ($("f-acuerdo")?.value || "").trim();
    const min = Number($("f-min")?.value || "");
    const max = Number($("f-max")?.value || "");
    const order = ($("f-order")?.value || "recent").trim();

    let rows = [...state.offers];

    // acuerdo (cuota/porcentaje/mixto)
    if (acuerdo) rows = rows.filter(o => getAcuerdo(o) === acuerdo);

    // min/max cuota
    if (Number.isFinite(min)) rows = rows.filter(o => Number(o.cuota_diaria || 0) >= min);
    if (Number.isFinite(max)) rows = rows.filter(o => Number(o.cuota_diaria || 0) <= max);

    // ordenar
    if (order === "cuota_desc") {
      rows.sort((a,b) => Number(b.cuota_diaria || 0) - Number(a.cuota_diaria || 0));
    } else if (order === "porc_desc") {
      rows.sort((a,b) => Number(b.porcentaje_propietario || 0) - Number(a.porcentaje_propietario || 0));
    } else {
      // recent: el backend ya lo manda reciente, pero mantenemos
      rows.sort((a,b) => String(b.fecha_creacion || "").localeCompare(String(a.fecha_creacion || "")));
    }

    state.filtered = rows;
  }

  function render() {
    const tbody = $("offersTable");
    if (!tbody) return;

    const rows = state.filtered || [];
    $("count").textContent = rows.length;

    if (rows.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="muted">No hay ofertas con estos filtros.</td></tr>`;
      return;
    }

    tbody.innerHTML = rows.map(o => {
      const titulo = o.titulo || o.descripcion || "Oferta";
      const turno = o.turno ? `<span class="chip info">${escapeHtml(o.turno)}</span>` : "";
      const acuerdo = getAcuerdo(o);
      const acuerdoTxt =
        acuerdo === "cuota" ? `Cuota: ${money(o.cuota_diaria)}` :
        acuerdo === "porcentaje" ? `% Prop.: ${escapeHtml(o.porcentaje_propietario)}` :
        acuerdo === "mixto" ? `Cuota: ${money(o.cuota_diaria)} · % Prop.: ${escapeHtml(o.porcentaje_propietario)}` :
        "—";

      const propietario = o.propietario_nombre || "—";
      const veh = `${o.placa || "—"} ${o.modelo ? "· " + o.modelo : ""}`;
      const miEstado = o.mi_postulacion_estado || "";

      const disabled = miEstado && miEstado !== "" ? "disabled" : "";
      const postTxt = miEstado ? "Postulado" : "Postular";

      return `
        <tr>
          <td>
            <strong>${escapeHtml(titulo)}</strong>
            <div class="muted">${escapeHtml(o.ciudad || "")} ${turno ? "· " + turno : ""}</div>
            <div class="small">Creada: ${escapeHtml(o.fecha_creacion || "—")}</div>
          </td>

          <td>
            <div class="small">${escapeHtml(acuerdoTxt)}</div>
            <div class="small muted">Acuerdo: ${escapeHtml(acuerdo || "—")}</div>
          </td>

          <td><div class="small"><strong>${escapeHtml(veh)}</strong></div></td>

          <td><div class="small">${escapeHtml(propietario)}</div></td>

          <td>${estadoChip(miEstado)}</td>

          <td class="right">
            <div style="display:flex; gap:8px; justify-content:flex-end; flex-wrap:wrap">
              <button class="btn" type="button" data-action="ver" data-id="${o.id}">Ver</button>
              <button class="btn primary" type="button" data-action="postular" data-id="${o.id}" ${disabled}>${postTxt}</button>
            </div>
          </td>
        </tr>
      `;
    }).join("");
  }

  async function loadOffers() {
    setMsg("Cargando…");

    const ciudad = ($("f-ciudad")?.value || "").trim();
    const turno = ($("f-turno")?.value || "").trim();
    const q = ($("q")?.value || "").trim();

    const params = new URLSearchParams();
    if (ciudad) params.set("ciudad", ciudad);
    if (turno) params.set("turno", turno);
    if (q) params.set("q", q);

    const qs = params.toString() ? `?${params.toString()}` : "";

    const data = await window.TC.api.request(`/api/conductor/ofertas${qs}`);
    state.offers = data.ofertas || [];

    applyClientFilters();
    render();
    setMsg("");
  }

  function openDialog(offer) {
    state.selected = offer;

    $("dlgTitle").textContent = offer.titulo || offer.descripcion || "Oferta";
    $("dlgMeta").textContent =
      `${offer.ciudad || ""}` +
      (offer.turno ? ` · Turno: ${offer.turno}` : "") +
      (offer.fecha_creacion ? ` · Creada: ${offer.fecha_creacion}` : "");

    $("dlgDesc").textContent = offer.descripcion || "—";
    $("dlgReq").textContent = offer.requisitos || "—";

    $("applyMsg").value = "";
    $("applyCv").value = "";

    const miEstado = offer.mi_postulacion_estado || "";
    if (miEstado) {
      $("dlgStatus").textContent = `Ya tienes una postulación en estado: ${miEstado}`;
      $("btnApply").classList.add("disabled");
    } else {
      $("dlgStatus").textContent = "";
      $("btnApply").classList.remove("disabled");
    }

    $("offerDialog").showModal();
  }

  async function postular(offerId) {
    const offer = state.offers.find(x => String(x.id) === String(offerId));
    if (!offer) return;

    // si ya postuló, no hacemos nada
    if (offer.mi_postulacion_estado) {
      alert("Ya estás postulado a esta oferta.");
      return;
    }

    const mensaje = ($("applyMsg")?.value || "").trim();
    const cv_url = ($("applyCv")?.value || "").trim();

    setMsg("Enviando postulación…");

    const r = await window.TC.api.request(`/api/conductor/ofertas/${offerId}/postular`, {
      method: "POST",
      body: { mensaje, cv_url }
    });

    setMsg(r.message || "✅ Postulación enviada.");

    // recargar ofertas para ver el estado reflejado
    await loadOffers();

    // cerrar modal si estaba abierto
    try { $("offerDialog").close(); } catch {}
  }

  function attachUI() {
    // sesión
    const u = window.TC.session.getUser();
    $("user-pill").textContent = u?.email || "—";
    $("who").textContent = (u?.nombres ? `${u.nombres} ${u.apellidos || ""}`.trim() : (u?.email || "—"));

    // logout
    $("btnLogout")?.addEventListener("click", () => window.TC.session.logout("index.html"));

    // mobile menu
    const btnOpenMenu = $("btnOpenMenu");
    const sidebar = $("sidebar");
    const overlay = $("overlay");
    btnOpenMenu?.addEventListener("click", () => {
      sidebar.classList.add("open");
      overlay.classList.add("open");
    });
    overlay?.addEventListener("click", () => {
      sidebar.classList.remove("open");
      overlay.classList.remove("open");
    });

    // filtros
    $("btnRefresh")?.addEventListener("click", loadOffers);
    $("btnApplyFilters")?.addEventListener("click", () => { applyClientFilters(); render(); });
    $("btnClear")?.addEventListener("click", () => {
      $("f-ciudad").value = "";
      $("f-turno").value = "";
      $("f-acuerdo").value = "";
      $("f-min").value = "";
      $("f-max").value = "";
      $("f-order").value = "recent";
      $("q").value = "";
      loadOffers();
    });

    // enter en search
    $("q")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        loadOffers();
      }
    });

    // tabla acciones
    $("offersTable")?.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-action]");
      if (!btn) return;
      const action = btn.getAttribute("data-action");
      const id = btn.getAttribute("data-id");

      if (action === "ver") {
        const offer = state.offers.find(x => String(x.id) === String(id));
        if (offer) openDialog(offer);
      }
      if (action === "postular") {
        // abre modal directo, para que pueda poner mensaje/cv
        const offer = state.offers.find(x => String(x.id) === String(id));
        if (offer) openDialog(offer);
      }
    });

    // botón postular dentro del modal
    $("btnApply")?.addEventListener("click", () => {
      if (!state.selected) return;
      postular(state.selected.id);
    });
  }

  document.addEventListener("DOMContentLoaded", async () => {
  const u = window.TC.session.requireRole("conductor");
  if (!u) return;
  };

  attachUI();

  // ✅ Al entrar: dejar filtros vacíos para mostrar TODO
  if ($("f-ciudad")) $("f-ciudad").value = "";
  if ($("f-turno")) $("f-turno").value = "";
  if ($("f-acuerdo")) $("f-acuerdo").value = "";
  if ($("f-min")) $("f-min").value = "";
  if ($("f-max")) $("f-max").value = "999999";
  if ($("f-order")) $("f-order").value = "recent";
  if ($("q")) $("q").value = "";

  try {
    await loadOffers();
  } catch (err) {
    console.error(err);
    setMsg("❌ Error cargando ofertas: " + err.message);
  };
