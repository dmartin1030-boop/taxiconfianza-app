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

  // --------- DOM refs (si no existen, no rompe) ----------
  const tbody = () => $("#offersTable");

  const inpBuscar   = () => $("#inpBuscar");
  const fCiudad     = () => $("#fCiudad");
  const fTurno      = () => $("#fTurno");
  const fCuotaMin   = () => $("#fCuotaMin");
  const btnActualizar = () => $("#btnActualizar");

  // --------- Init ----------
  document.addEventListener("DOMContentLoaded", async () => {
    // 1) validar sesión y rol
    const u = window.TC?.session?.requireRole("conductor");
    if (!u) return;

    setChipText("#chipUsuario", u.email ? u.email : "—");

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

    // Delegación de eventos para botones dentro de la tabla
    document.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-action]");
      if (!btn) return;

      const action = btn.getAttribute("data-action");
      const id = btn.getAttribute("data-id");

      if (action === "postular") {
        // Placeholder: luego conectamos a /api/postulaciones
        console.log("[tc-conductor-ofertas] postular a oferta", id);
        alert("Función Postular: pendiente de conectar (ya está el botón listo).");
      }
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
    setChipText("#chipEncontradas", "0");

    try {
      console.log("[tc-conductor-ofertas] GET /api/ofertas/activas");
      const r = await fetch("/api/ofertas/activas", {
        headers: { "Accept": "application/json" },
      });

      console.log("[tc-conductor-ofertas] status", r.status);
      const j = await r.json().catch(() => null);

      if (!r.ok) {
        throw new Error((j && j.message) ? j.message : `HTTP ${r.status}`);
      }

      if (!j || j.ok !== true) {
        throw new Error((j && j.message) ? j.message : "Respuesta inválida del servidor");
      }

      ofertasAll = Array.isArray(j.data) ? j.data : [];
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

    setChipText("#chipEncontradas", String(ofertasView.length));
    renderTabla();
  }

  function renderTabla() {
    const tb = tbody();
    if (!tb) return;

    if (!ofertasView.length) {
      tb.innerHTML = `<tr><td colspan="6">No hay ofertas activas</td></tr>`;
      return;
    }

    tb.innerHTML = ofertasView
      .map((o) => {
        const propietario = `${safeText(o.propietario_nombres) || "—"} ${safeText(o.propietario_apellidos)}`.trim();
        const vehiculo = safeText(o.vehiculo) || "—";
        const estado = safeText(o.estado) || "—";

        return `
          <tr>
            <td>
              <div style="font-weight:600">${safeText(o.titulo) || "—"}</div>
              <div style="opacity:.85; font-size:.9em">${safeText(o.ciudad) ? safeText(o.ciudad) : ""}</div>
            </td>
            <td>
              <div>${safeText(o.turno) || "—"}</div>
              <div style="opacity:.85; font-size:.9em">Cuota: ${money(o.cuota_diaria)}</div>
            </td>
            <td>${vehiculo}</td>
            <td>${propietario}</td>
            <td>${estado}</td>
            <td>
              <button class="btn btn-sm" data-action="postular" data-id="${safeText(o.id)}">
                Postular
              </button>
            </td>
          </tr>
        `;
      })
      .join("");
  }
})();
