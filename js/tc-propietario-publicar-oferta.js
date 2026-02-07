// tc-propietario-publicar-oferta.js

function authHeaders(){
  const email = localStorage.getItem("user_email") || "";
  const tipo  = localStorage.getItem("user_tipo") || "";
  return {
    "Content-Type": "application/json",
    "X-User-Email": email,
    "X-User-Tipo": tipo
  };
}

function requireAuth(){
  const email = localStorage.getItem("user_email");
  const tipo  = localStorage.getItem("user_tipo");
  if(!email || !tipo){
    alert("No hay sesión activa. Inicia sesión nuevamente.");
    return false;
  }
  return true;
}

const $ = (s) => document.querySelector(s);

function val(id){ return ($(id)?.value ?? "").toString(); }

function clearForm(){
  if($("#vehiculo_id")) $("#vehiculo_id").value = "";
  if($("#titulo")) $("#titulo").value = "";
  if($("#ciudad")) $("#ciudad").value = "";
  if($("#turno")) $("#turno").value = "dia";
  if($("#estado")) $("#estado").value = "activa";
  if($("#descripcion")) $("#descripcion").value = "";
  if($("#cuota_diaria")) $("#cuota_diaria").value = "";
  if($("#porcentaje_propietario")) $("#porcentaje_propietario").value = "";
  if($("#requisitos")) $("#requisitos").value = "";
}

async function cargarVehiculos(){
  if(!requireAuth()) return;

  const select = $("#vehiculo_id");
  if(!select) return;

  select.innerHTML = `<option value="">Cargando vehículos...</option>`;

  try {
    const res = await fetch("/api/propietario/vehiculos", { headers: authHeaders() });
    const json = await res.json();

    if(!json.ok){
      select.innerHTML = `<option value="">${json.error || "Error cargando vehículos"}</option>`;
      return;
    }

    const data = json.data || [];
    if(!data.length){
      select.innerHTML = `<option value="">No tienes vehículos creados</option>`;
      return;
    }

    select.innerHTML = `<option value="">Selecciona un vehículo</option>`;
    data.forEach(v => {
      const opt = document.createElement("option");
      opt.value = v.id;
      opt.textContent = `${v.placa} ${v.modelo || ""}`.trim();
      select.appendChild(opt);
    });
  } catch (e) {
    console.error(e);
    select.innerHTML = `<option value="">Error de conexión</option>`;
  }
}

function money(n){
  const num = Number(n || 0);
  return num.toLocaleString("es-CO");
}

async function cargarMisOfertas(){
  if(!requireAuth()) return;

  const tbody = $("#offersTable");
  if(!tbody) return;

  tbody.innerHTML = `<tr><td colspan="6" class="muted">Cargando…</td></tr>`;

  try {
    const res = await fetch("/api/propietario/ofertas", { headers: authHeaders() });
    const json = await res.json();

    if(!json.ok){
      tbody.innerHTML = `<tr><td colspan="6" class="muted">${json.error || "No se pudo cargar"}</td></tr>`;
      return;
    }

    const rows = json.data || [];
    if(!rows.length){
      tbody.innerHTML = `<tr><td colspan="6" class="muted">Aún no tienes ofertas</td></tr>`;
      return;
    }

    const qtxt = ($("#q")?.value || "").toString().trim().toLowerCase();

    const filtered = qtxt
      ? rows.filter(o => (
          (o.titulo||"").toLowerCase().includes(qtxt) ||
          (o.ciudad||"").toLowerCase().includes(qtxt) ||
          (o.requisitos||"").toLowerCase().includes(qtxt)
        ))
      : rows;

    tbody.innerHTML = filtered.map(o => {
      const pago = Number(o.cuota_diaria||0) > 0
        ? `$ ${money(o.cuota_diaria)} / día`
        : (Number(o.porcentaje_propietario||0) > 0 ? `${o.porcentaje_propietario}% propietario` : "-");

      return `
        <tr>
          <td>
            <strong>${o.titulo || ""}</strong><br>
            <span class="muted">#${o.id}</span>
          </td>
          <td>${pago}</td>
          <td>${o.vehiculo_id ?? "-"}</td>
          <td>${o.ciudad || "-"} / ${o.turno || "-"}</td>
          <td>${o.estado || "-"}</td>
          <td class="right">
            <button class="btn" data-act="del" data-id="${o.id}" type="button">Eliminar</button>
          </td>
        </tr>
      `;
    }).join("");

  } catch (e) {
    console.error(e);
    tbody.innerHTML = `<tr><td colspan="6" class="muted">Error de conexión</td></tr>`;
  }
}

async function publicarOferta(){
  if(!requireAuth()) return;

  const vehiculo_id = val("#vehiculo_id");
  const titulo = val("#titulo").trim();
  const ciudad = val("#ciudad").trim();
  const turno = val("#turno") || "dia";
  const estado = val("#estado") || "activa";
  const descripcion = val("#descripcion").trim();
  const requisitos = val("#requisitos").trim();
  const cuota_diaria = Number(val("#cuota_diaria") || 0);
  const porcentaje_propietario = Number(val("#porcentaje_propietario") || 0);

  if(!vehiculo_id){
    alert("Selecciona un vehículo.");
    return;
  }
  if(!titulo){
    alert("Escribe un título.");
    return;
  }
  if(!ciudad){
    alert("Escribe una ciudad.");
    return;
  }
  if(!(cuota_diaria > 0 || porcentaje_propietario > 0)){
    alert("Debes llenar cuota diaria o % propietario (al menos uno).");
    return;
  }

  try {
    const res = await fetch("/api/ofertas", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        vehiculo_id,
        titulo,
        descripcion,
        ciudad,
        turno,
        cuota_diaria,
        porcentaje_propietario,
        requisitos,
        estado
      })
    });

    const json = await res.json();
    if(!json.ok){
      alert(json.error || "No se pudo publicar");
      return;
    }

    alert("Oferta publicada ✅");
    clearForm();
    await cargarMisOfertas();
  } catch (e) {
    console.error(e);
    alert("Error de conexión");
  }
}

async function eliminarOferta(id){
  if(!requireAuth()) return;
  if(!confirm("¿Eliminar oferta?")) return;

  const res = await fetch(`/api/ofertas/${id}`, { method: "DELETE", headers: authHeaders() });
  const json = await res.json();
  if(!json.ok){
    alert(json.error || "No se pudo eliminar");
    return;
  }
  await cargarMisOfertas();
}

function bindUI(){
  $("#btnCreate")?.addEventListener("click", publicarOferta);
  $("#btnClear")?.addEventListener("click", clearForm);
  $("#btnRefresh")?.addEventListener("click", cargarMisOfertas);
  $("#q")?.addEventListener("input", cargarMisOfertas);

  document.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-act]");
    if(!b) return;
    if(b.dataset.act === "del") eliminarOferta(b.dataset.id);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  bindUI();
  cargarVehiculos();
  cargarMisOfertas();
});
