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
    const btns = Array.from(document.querySelectorAll("butto
