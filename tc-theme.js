/* =====================================================
   TAXICONFIANZA — js/tc-theme.js
   Sistema de tema claro/oscuro.
   Compatible con el namespace window.TC ya existente
   (window.TC.api, window.TC.session) descrito en CLAUDE.md
   ===================================================== */

(function () {
  "use strict";

  const STORAGE_KEY = "tc_theme"; // "dark" | "light"

  // -----------------------------------------------------
  // 1) Determinar el tema inicial
  //    Prioridad: localStorage > preferencia del usuario en BD > sistema OS > dark (default)
  // -----------------------------------------------------
  function getInitialTheme() {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "dark" || stored === "light") return stored;

    // Si TC.session ya cargó el usuario y trae tema_preferido, úsalo
    try {
      const raw = localStorage.getItem("userTaxiConfianza");
      if (raw) {
        const u = JSON.parse(raw);
        if (u && (u.tema_preferido === "dark" || u.tema_preferido === "light")) {
          return u.tema_preferido;
        }
      }
    } catch (e) {
      /* noop */
    }

    // Preferencia del sistema operativo
    if (window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches) {
      return "light";
    }

    return "dark"; // default de marca TaxiConfianza
  }

  function applyTheme(theme) {
    if (theme === "light") {
      document.body.classList.add("light-mode");
    } else {
      document.body.classList.remove("light-mode");
    }
    updateToggleUI(theme);
  }

  function updateToggleUI(theme) {
    document.querySelectorAll("[data-tc-theme-icon='sun']").forEach((el) => {
      el.classList.toggle("active", theme === "light");
    });
    document.querySelectorAll("[data-tc-theme-icon='moon']").forEach((el) => {
      el.classList.toggle("active", theme === "dark");
    });
  }

  // -----------------------------------------------------
  // 2) Guardar preferencia (localStorage + backend si hay sesión)
  // -----------------------------------------------------
  function persistTheme(theme) {
    localStorage.setItem(STORAGE_KEY, theme);

    // Si el usuario está logueado, intenta guardar también en BD.
    // Usa window.TC.api si existe (ya wrappea fetch + headers de auth).
    if (window.TC && window.TC.api && typeof window.TC.api.post === "function") {
      window.TC.api
        .post("/api/usuario/tema", { tema_preferido: theme })
        .catch(() => {
          /* si falla, no rompe la UI — el localStorage ya quedó guardado */
        });
    }
  }

  // -----------------------------------------------------
  // 3) Toggle público
  // -----------------------------------------------------
  function toggleTheme() {
    const isLight = document.body.classList.contains("light-mode");
    const next = isLight ? "dark" : "light";
    applyTheme(next);
    persistTheme(next);
  }

  // -----------------------------------------------------
  // 4) Init — se aplica el tema lo antes posible para evitar parpadeo
  // -----------------------------------------------------
  applyTheme(getInitialTheme());

  document.addEventListener("DOMContentLoaded", function () {
    document.querySelectorAll("[data-tc-theme-toggle]").forEach((el) => {
      el.addEventListener("click", toggleTheme);
    });
    // Asegura que los iconos reflejen el estado actual al cargar el DOM
    updateToggleUI(document.body.classList.contains("light-mode") ? "light" : "dark");
  });

  // Exponer en el namespace global TC, igual que el resto del proyecto
  window.TC = window.TC || {};
  window.TC.theme = {
    toggle: toggleTheme,
    apply: applyTheme,
    current: function () {
      return document.body.classList.contains("light-mode") ? "light" : "dark";
    },
  };
})();
