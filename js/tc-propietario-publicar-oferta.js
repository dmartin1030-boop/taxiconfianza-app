// tc-propietario-publicar-oferta.js

function authHeaders() {
  const email = localStorage.getItem("user_email") || "";
  const tipo  = localStorage.getItem("user_tipo")  || "";
  return {
    "Content-Type": "application/json",
    "X-User-Email": email,
    "X-User-Tipo":  tipo,
  };
}

function requireAuth() {
  if (!localStorage.getItem("user_email") || !localStorage.getItem("user_tipo")) {
    alert("No hay sesión activa. Inicia sesión nuevamente.");
    return false;
  }
  return true;
}

const $ = (s) => document.querySelector(s);

function val(id)  { return ($(id)?.value ?? "").toString(); }
function numVal(id) { return Number(val(id) || 0); }

function clearForm() {
  const ids = [
    "#vehiculo_id","#titulo","#ciudad","#descripcion","#requisitos",
    "#cuota_diaria","#porcentaje_propietario",
    "#veh_marca","#veh_modelo","#veh_anio","#whatsapp",
    "#turno_inicio","#turno_fin","#zona_operacion",
  ];
  ids.forEach(id => { if ($(id)) $(id).value = ""; });

  if ($("#turno"))              $("#turno").value = "dia";
  if ($("#estado"))             $("#estado").value = "activa";
  if ($("#modalidad"))          $("#modalidad").value = "";
  if ($("#zona_tipo"))          $("#zona_tipo").value = "toda_ciudad";
  if ($("#veh_combustible"))    $("#veh_combustible").value = "";
  if ($("#categoria_licencia")) $("#categoria_licencia").value = "";

  document.querySelectorAll('input[name="incluye"]').forEach(cb => { cb.checked = false; });
  document.getElementById("turnoHorasRow").style.display = "none";
  document.getElementById("zonaTextoRow").style.display  = "none";
}

async function cargarVehiculos() {
  if (!requireAuth()) return;
  const select = $("#vehiculo_id");
  if (!select) return;
  select.innerHTML = `<option value="">Cargando vehículos…</option>`;
  try {
    const res  = await fetch("/api/propietario/vehiculos", { headers: authHeaders() });
    const json = await res.json();
    if (!json.ok) {
      select.innerHTML = `<option value="">${json.error || "Error cargando vehículos"}</option>`;
      return;
    }
    const data = json.data || [];
    if (!data.length) {
      select.innerHTML = `<option value="">No tienes vehículos — agrégalos en Mis Vehículos</option>`;
      return;
    }
    select.innerHTML = `<option value="">Selecciona un vehículo</option>`;
    data.forEach(v => {
      const opt = document.createElement("option");
      opt.value = v.id;
      opt.textContent = `${v.placa}${v.modelo ? " · " + v.modelo : ""}`;
      select.appendChild(opt);
    });
  } catch (e) {
    console.error(e);
    select.innerHTML = `<option value="">Error de conexión</option>`;
  }
}

function money(n) {
  return Number(n || 0).toLocaleString("es-CO");
}

const MODALIDAD_LABEL = {
  taxi_completo: "Taxi completo",
  turno_fijo:    "Turno fijo",
  turno_partido: "Turno partido",
  fin_de_semana: "Fin de semana",
  turno_libre:   "Turno libre",
};

async function cargarMisOfertas() {
  if (!requireAuth()) return;
  const tbody = $("#offersTable");
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="6" class="muted">Cargando…</td></tr>`;
  try {
    const res  = await fetch("/api/propietario/ofertas", { headers: authHeaders() });
    const json = await res.json();
    if (!json.ok) {
      tbody.innerHTML = `<tr><td colspan="6" class="muted">${json.error || "No se pudo cargar"}</td></tr>`;
      return;
    }
    const rows = json.data || [];
    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="6" class="muted">Aún no tienes ofertas</td></tr>`;
      return;
    }

    const qtxt = ($("#q")?.value || "").trim().toLowerCase();
    const filtered = qtxt
      ? rows.filter(o =>
          [o.titulo, o.ciudad, o.requisitos, o.modalidad].join(" ").toLowerCase().includes(qtxt)
        )
      : rows;

    tbody.innerHTML = filtered.map(o => {
      const pago = numVal2(o.cuota_diaria) > 0
        ? `$${money(o.cuota_diaria)}/día`
        : (numVal2(o.porcentaje_propietario) > 0 ? `${o.porcentaje_propietario}% prop.` : "—");

      const veh = [o.veh_marca, o.veh_modelo, o.veh_anio].filter(Boolean).join(" ") || (o.vehiculo_id ? `ID ${o.vehiculo_id}` : "—");
      const mod = MODALIDAD_LABEL[o.modalidad] || (o.modalidad || "—");
      const estadoBadge = { activa: "✅", pausada: "⏸", cerrada: "🔴" }[o.estado] || "";

      return `
        <tr>
          <td>
            <strong>${o.titulo || ""}</strong><br>
            <span class="muted">${mod} · ${o.ciudad || "—"} · ${o.turno || "—"}</span>
          </td>
          <td>${pago}</td>
          <td>${veh}</td>
          <td>${o.zona_operacion || "Toda la ciudad"}</td>
          <td>${estadoBadge} ${o.estado || "—"}</td>
          <td class="right">
            <button class="btn" data-act="del" data-id="${o.id}" type="button">Eliminar</button>
          </td>
        </tr>`;
    }).join("");

    $("#count").textContent = filtered.length;
  } catch (e) {
    console.error(e);
    tbody.innerHTML = `<tr><td colspan="6" class="muted">Error de conexión</td></tr>`;
  }
}

function numVal2(v) { return Number(v || 0); }

async function publicarOferta() {
  if (!requireAuth()) return;

  const vehiculo_id = val("#vehiculo_id");
  const titulo      = val("#titulo").trim();
  const ciudad      = val("#ciudad").trim();

  if (!vehiculo_id) { alert("Selecciona un vehículo."); return; }
  if (!titulo)      { alert("Escribe un título."); return; }
  if (!ciudad)      { alert("Escribe la ciudad."); return; }

  const cuota = numVal("#cuota_diaria");
  const pct   = numVal("#porcentaje_propietario");
  if (cuota <= 0 && pct <= 0) {
    alert("Debes ingresar la cuota diaria o el % del propietario (al menos uno).");
    return;
  }

  // Zona de operación
  const zonaTipo = val("#zona_tipo");
  const zona_operacion = zonaTipo === "especifica"
    ? val("#zona_operacion").trim() || "Toda la ciudad"
    : "Toda la ciudad";

  // Incluye checkboxes
  const incluye = Array.from(
    document.querySelectorAll('input[name="incluye"]:checked')
  ).map(cb => cb.value);

  const body = {
    vehiculo_id,
    titulo,
    ciudad,
    turno:                  val("#turno") || "dia",
    estado:                 val("#estado") || "activa",
    modalidad:              val("#modalidad") || null,
    turno_inicio:           val("#turno_inicio") || null,
    turno_fin:              val("#turno_fin")    || null,
    zona_operacion,
    veh_marca:              val("#veh_marca").trim()  || null,
    veh_modelo:             val("#veh_modelo").trim() || null,
    veh_anio:               numVal("#veh_anio") || null,
    veh_combustible:        val("#veh_combustible") || null,
    incluye,
    exp_minima:             numVal("#exp_minima") || null,
    categoria_licencia:     val("#categoria_licencia") || null,
    whatsapp:               val("#whatsapp").trim() || null,
    descripcion:            val("#descripcion").trim() || null,
    requisitos:             val("#requisitos").trim()  || null,
    cuota_diaria:           cuota,
    porcentaje_propietario: pct,
  };

  try {
    const res  = await fetch("/api/ofertas", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!json.ok) { alert(json.error || "No se pudo publicar"); return; }
    alert("¡Oferta publicada! ✅");
    clearForm();
    await cargarMisOfertas();
  } catch (e) {
    console.error(e);
    alert("Error de conexión");
  }
}

async function eliminarOferta(id) {
  if (!requireAuth()) return;
  if (!confirm("¿Eliminar esta oferta?")) return;
  try {
    const res  = await fetch(`/api/ofertas/${id}`, { method: "DELETE", headers: authHeaders() });
    const json = await res.json();
    if (!json.ok) { alert(json.error || "No se pudo eliminar"); return; }
    await cargarMisOfertas();
  } catch (e) {
    console.error(e);
    alert("Error de conexión");
  }
}

function bindUI() {
  $("#btnCreate")?.addEventListener("click", publicarOferta);
  $("#btnClear")?.addEventListener("click", clearForm);
  $("#btnRefresh")?.addEventListener("click", cargarMisOfertas);
  $("#q")?.addEventListener("input", cargarMisOfertas);

  document.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-act]");
    if (!b) return;
    if (b.dataset.act === "del") eliminarOferta(b.dataset.id);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  bindUI();
  cargarVehiculos();
  cargarMisOfertas();
});
