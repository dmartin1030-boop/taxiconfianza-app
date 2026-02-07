// ==============================
// tc-propietario-publicar-oferta.js
// ==============================

// Headers de autenticación (igual que mis-vehiculos)
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

// ==============================
// Cargar vehículos en el select
// ==============================
async function cargarVehiculos(){
  if(!requireAuth()) return;

  const select = document.getElementById("vehiculo_id");
  if(!select) return;

  select.innerHTML = `<option value="">Cargando vehículos...</option>`;

  try {
    const res = await fetch("/api/propietario/vehiculos", {
      headers: authHeaders()
    });
    const json = await res.json();

    if(!json.ok){
      select.innerHTML = `<option value="">Error cargando vehículos</option>`;
      return;
    }

    if(!json.data || json.data.length === 0){
      select.innerHTML = `<option value="">No tienes vehículos creados</option>`;
      return;
    }

    select.innerHTML = `<option value="">Selecciona un vehículo</option>`;
    json.data.forEach(v => {
      const opt = document.createElement("option");
      opt.value = v.id;
      opt.textContent = `${v.placa} ${v.modelo || ""}`;
      select.appendChild(opt);
    });

  } catch (err){
    console.error(err);
    select.innerHTML = `<option value="">Error de conexión</option>`;
  }
}

// ==============================
// Al cargar la página
// ==============================
document.addEventListener("DOMContentLoaded", () => {
  cargarVehiculos();
});
