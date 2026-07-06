/* =====================================================
   TAXICONFIANZA — js/tc-gremio.js
   Lógica del feed "El Gremio"
   Compatible con window.TC.api y window.TC.session
   ===================================================== */
(function () {
  "use strict";

  // ── Helpers de auth ──────────────────────────────────
  function authHeaders() {
    const email = localStorage.getItem("user_email") || "";
    const tipo  = localStorage.getItem("user_tipo")  || "";
    return {
      "Content-Type": "application/json",
      "X-User-Email": email,
      "X-User-Tipo":  tipo,
    };
  }

  function getUser() {
    try { return JSON.parse(localStorage.getItem("userTaxiConfianza") || "{}"); }
    catch { return {}; }
  }

  // ── Estado del feed ───────────────────────────────────
  const state = {
    posts:   [],
    page:    1,
    hasMore: false,
    loading: false,
    filtros: { ciudad: "", tipo: "" },
  };

  // ── Colores por tipo de post ──────────────────────────
  const TIPO_META = {
    alerta:    { label: "🚨 Alerta tráfico", color: "rgba(239,68,68,0.12)",   border: "rgba(239,68,68,0.3)",   text: "#F87171" },
    normativa: { label: "📋 Normativa RUNT", color: "rgba(59,130,246,0.1)",   border: "rgba(59,130,246,0.3)",  text: "#60A5FA" },
    tip:       { label: "💡 Tip conductor",  color: "rgba(29,158,117,0.1)",   border: "rgba(29,158,117,0.3)",  text: "#6ee7b7" },
    encuesta:  { label: "📊 Encuesta",       color: "rgba(212,160,23,0.1)",   border: "rgba(212,160,23,0.3)",  text: "#D4A017" },
    general:   { label: "💬 General",        color: "rgba(255,255,255,0.03)", border: "rgba(255,255,255,0.08)", text: "var(--text-secondary)" },
  };

  const ALERTA_META = {
    trafico:   { icon: "🚗", color: "#F87171" },
    seguridad: { icon: "🚨", color: "#fcd34d" },
    normativa: { icon: "📋", color: "#60A5FA" },
    evento:    { icon: "📅", color: "#c4b5fd" },
    otro:      { icon: "🔔", color: "#6ee7b7" },
  };

  // ── Formateo de tiempo relativo ───────────────────────
  function timeAgo(dateStr) {
    const diff = Math.floor((Date.now() - new Date(dateStr)) / 1000);
    if (diff < 60)     return "Hace un momento";
    if (diff < 3600)   return `Hace ${Math.floor(diff/60)} min`;
    if (diff < 86400)  return `Hace ${Math.floor(diff/3600)}h`;
    if (diff < 604800) return `Hace ${Math.floor(diff/86400)}d`;
    return new Date(dateStr).toLocaleDateString("es-CO", { day:"2-digit", month:"short" });
  }

  // ── Renderizar un post ────────────────────────────────
  function renderPost(p) {
    const meta   = TIPO_META[p.tipo] || TIPO_META.general;
    const nombre = `${p.nombres || ""} ${p.apellidos || ""}`.trim() || "Usuario";
    const initials = nombre.split(" ").map(n => n[0]).join("").slice(0,2).toUpperCase();
    const liked  = p.yo_di_like > 0;

    return `
    <article class="gremio-post" data-id="${p.id}" style="
      border:0.5px solid ${meta.border};
      background:${meta.color};
      border-radius:12px; padding:14px; margin-bottom:10px;
    ">
      <div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:10px;">
        <div style="width:36px;height:36px;border-radius:50%;background:rgba(212,160,23,0.15);
          display:flex;align-items:center;justify-content:center;font-size:12px;
          font-weight:700;color:var(--gold);flex-shrink:0;">${initials}</div>
        <div style="flex:1;min-width:0;">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <span style="font-size:13px;font-weight:600;color:var(--text-primary);">${nombre}</span>
            <span style="font-size:10px;color:var(--text-tertiary);background:var(--bg-card-solid);
              padding:1px 7px;border-radius:999px;border:0.5px solid var(--border);">${p.nivel_actual||"Bronce"}</span>
            <span style="font-size:10px;font-weight:600;color:${meta.text};
              background:${meta.color};border:0.5px solid ${meta.border};
              padding:2px 8px;border-radius:999px;">${meta.label}</span>
            ${p.ciudad ? `<span style="font-size:10px;color:var(--text-tertiary);">📍 ${p.ciudad}</span>` : ""}
          </div>
          <div style="font-size:11px;color:var(--text-tertiary);margin-top:2px;">${timeAgo(p.created_at)}</div>
        </div>
      </div>
      <p style="font-size:13px;color:var(--text-primary);line-height:1.65;margin:0 0 12px;white-space:pre-wrap;">${escHtml(p.contenido)}</p>
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
        <button class="gremio-like-btn" data-post-id="${p.id}" style="
          display:inline-flex;align-items:center;gap:5px;
          background:${liked ? "rgba(212,160,23,0.15)" : "var(--bg-card)"};
          border:0.5px solid ${liked ? "rgba(212,160,23,0.4)" : "var(--border)"};
          color:${liked ? "var(--gold)" : "var(--text-tertiary)"};
          padding:5px 11px;border-radius:999px;cursor:pointer;font-size:12px;
          font-family:var(--font-sans);transition:all 0.15s;
        ">
          ${liked ? "❤️" : "🤍"} <span class="like-count-${p.id}">${p.likes_count||0}</span>
        </button>
        <button class="gremio-comment-toggle" data-post-id="${p.id}" style="
          display:inline-flex;align-items:center;gap:5px;
          background:var(--bg-card);border:0.5px solid var(--border);
          color:var(--text-tertiary);padding:5px 11px;border-radius:999px;
          cursor:pointer;font-size:12px;font-family:var(--font-sans);
        ">💬 ${p.comentarios_count||0}</button>
      </div>
      <!-- Sección comentarios (oculta por defecto) -->
      <div class="gremio-comments-section" data-post-id="${p.id}" style="display:none;margin-top:12px;">
        <div class="comments-list-${p.id}" style="display:flex;flex-direction:column;gap:8px;margin-bottom:10px;"></div>
        <div style="display:flex;gap:8px;">
          <input class="gremio-comment-input" data-post-id="${p.id}"
            placeholder="Escribe un comentario…"
            maxlength="500"
            style="flex:1;background:var(--bg-card-solid);border:0.5px solid var(--border);
              border-radius:9px;padding:8px 12px;color:var(--text-primary);
              font-size:12px;font-family:var(--font-sans);outline:none;"
          />
          <button class="gremio-comment-send" data-post-id="${p.id}" style="
            background:var(--gold);border:none;color:#0f1117;
            padding:8px 14px;border-radius:9px;cursor:pointer;
            font-size:12px;font-weight:700;font-family:var(--font-sans);
          ">→</button>
        </div>
      </div>
    </article>`;
  }

  function escHtml(str) {
    return String(str)
      .replace(/&/g,"&amp;").replace(/</g,"&lt;")
      .replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  }

  // ── Renderizar alerta del sidebar ─────────────────────
  function renderAlerta(a) {
    const m = ALERTA_META[a.tipo] || ALERTA_META.otro;
    return `
    <div style="display:flex;gap:9px;align-items:flex-start;padding:10px;
      border:0.5px solid var(--border);border-radius:9px;
      background:var(--bg-card-solid);margin-bottom:7px;">
      <span style="font-size:18px;flex-shrink:0;">${m.icon}</span>
      <div>
        <div style="font-size:12px;font-weight:600;color:${m.color};margin-bottom:2px;">${escHtml(a.titulo)}</div>
        ${a.descripcion ? `<div style="font-size:11px;color:var(--text-tertiary);line-height:1.5;">${escHtml(a.descripcion)}</div>` : ""}
        ${a.ciudad ? `<div style="font-size:10px;color:var(--text-tertiary);margin-top:3px;">📍 ${a.ciudad}</div>` : ""}
      </div>
    </div>`;
  }

  // ── Cargar posts del feed ─────────────────────────────
  async function loadPosts(append = false) {
    if (state.loading) return;
    state.loading = true;

    const el = document.getElementById("gremio-feed");
    const loadBtn = document.getElementById("gremio-load-more");

    if (!append) {
      if (el) el.innerHTML = `<div style="text-align:center;padding:30px;color:var(--text-tertiary);font-size:13px;">Cargando feed…</div>`;
      state.page = 1;
    }

    try {
      const params = new URLSearchParams({
        page:   state.page,
        ciudad: state.filtros.ciudad,
        tipo:   state.filtros.tipo,
      });

      const res  = await fetch(`/api/gremio/posts?${params}`, { headers: authHeaders(), credentials: "include" });
      const json = await res.json();

      if (!json.ok) throw new Error(json.error || "Error cargando posts");

      state.posts   = append ? [...state.posts, ...json.data] : json.data;
      state.hasMore = json.has_more;

      if (!append && el) el.innerHTML = "";

      if (el) {
        if (!json.data.length && !append) {
          el.innerHTML = `
            <div style="text-align:center;padding:40px;color:var(--text-tertiary);">
              <div style="font-size:32px;margin-bottom:10px;">🌐</div>
              <div style="font-size:13px;">Aún no hay posts en el Gremio.<br>¡Sé el primero en publicar!</div>
            </div>`;
        } else {
          json.data.forEach(p => { el.insertAdjacentHTML("beforeend", renderPost(p)); });
        }
      }

      if (loadBtn) {
        loadBtn.style.display = state.hasMore ? "flex" : "none";
      }

    } catch (err) {
      console.error("loadPosts:", err);
      if (el && !append) el.innerHTML = `<div style="text-align:center;padding:30px;color:#F87171;font-size:13px;">Error cargando el feed. Intenta de nuevo.</div>`;
    } finally {
      state.loading = false;
    }
  }

  // ── Cargar alertas sidebar ────────────────────────────
  async function loadAlertas() {
    const el = document.getElementById("gremio-alertas");
    if (!el) return;

    try {
      const ciudad = state.filtros.ciudad;
      const res    = await fetch(`/api/gremio/alertas${ciudad ? `?ciudad=${encodeURIComponent(ciudad)}` : ""}`,
        { headers: authHeaders(), credentials: "include" });
      const json = await res.json();

      if (!json.ok || !json.data.length) {
        el.innerHTML = `<div style="font-size:12px;color:var(--text-tertiary);padding:10px;">Sin alertas activas ahora.</div>`;
        return;
      }
      el.innerHTML = json.data.map(renderAlerta).join("");
    } catch (err) {
      console.error("loadAlertas:", err);
    }
  }

  // ── Crear post ────────────────────────────────────────
  async function crearPost() {
    const textarea = document.getElementById("gremio-nuevo-post");
    const tipoSel  = document.getElementById("gremio-nuevo-tipo");
    const ciudadSel= document.getElementById("gremio-nuevo-ciudad");
    const btn      = document.getElementById("gremio-publicar-btn");
    const msgEl    = document.getElementById("gremio-post-msg");

    if (!textarea) return;

    const contenido = textarea.value.trim();
    const tipo      = tipoSel?.value || "general";
    const ciudad    = ciudadSel?.value || "";

    if (!contenido || contenido.length < 5) {
      if (msgEl) { msgEl.textContent = "El post debe tener al menos 5 caracteres."; msgEl.style.color = "#F87171"; }
      return;
    }

    if (btn) { btn.disabled = true; btn.textContent = "Publicando…"; }
    if (msgEl) msgEl.textContent = "";

    try {
      const res  = await fetch("/api/gremio/posts", {
        method: "POST", credentials: "include",
        headers: authHeaders(),
        body: JSON.stringify({ contenido, tipo, ciudad }),
      });
      const json = await res.json();

      if (!json.ok) throw new Error(json.error || "Error publicando");

      textarea.value = "";
      if (msgEl) { msgEl.textContent = "¡Publicado! ✅"; msgEl.style.color = "#6ee7b7"; setTimeout(() => { if(msgEl) msgEl.textContent=""; }, 2500); }
      await loadPosts(false);

    } catch (err) {
      if (msgEl) { msgEl.textContent = err.message; msgEl.style.color = "#F87171"; }
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = "Publicar"; }
    }
  }

  // ── Toggle like ───────────────────────────────────────
  async function toggleLike(postId) {
    try {
      const res  = await fetch(`/api/gremio/posts/${postId}/like`, {
        method: "POST", credentials: "include", headers: authHeaders(),
      });
      const json = await res.json();
      if (!json.ok) return;

      // Actualizar UI sin recargar todo el feed
      const btn   = document.querySelector(`.gremio-like-btn[data-post-id="${postId}"]`);
      const count = document.querySelector(`.like-count-${postId}`);
      if (!btn || !count) return;

      const liked = json.action === "like";
      const n     = Math.max(0, parseInt(count.textContent||0) + (liked ? 1 : -1));
      count.textContent = n;
      btn.innerHTML = `${liked?"❤️":"🤍"} <span class="like-count-${postId}">${n}</span>`;
      btn.style.color  = liked ? "var(--gold)" : "var(--text-tertiary)";
      btn.style.borderColor = liked ? "rgba(212,160,23,0.4)" : "var(--border)";
      btn.style.background  = liked ? "rgba(212,160,23,0.15)" : "var(--bg-card)";
    } catch (err) {
      console.error("toggleLike:", err);
    }
  }

  // ── Cargar comentarios de un post ─────────────────────
  async function loadComentarios(postId) {
    const el = document.querySelector(`.comments-list-${postId}`);
    if (!el) return;
    el.innerHTML = `<div style="color:var(--text-tertiary);font-size:12px;">Cargando…</div>`;

    try {
      const res  = await fetch(`/api/gremio/posts/${postId}/comentarios`, { headers: authHeaders(), credentials: "include" });
      const json = await res.json();

      if (!json.ok || !json.data.length) {
        el.innerHTML = `<div style="color:var(--text-tertiary);font-size:12px;padding:4px 0;">Sin comentarios aún. ¡Sé el primero!</div>`;
        return;
      }
      el.innerHTML = json.data.map(c => {
        const nombre = `${c.nombres||""} ${c.apellidos||""}`.trim() || "Usuario";
        const initials = nombre.split(" ").map(n=>n[0]).join("").slice(0,2).toUpperCase();
        return `
        <div style="display:flex;gap:8px;align-items:flex-start;">
          <div style="width:28px;height:28px;border-radius:50%;background:rgba(212,160,23,0.12);
            display:flex;align-items:center;justify-content:center;font-size:10px;
            font-weight:700;color:var(--gold);flex-shrink:0;">${initials}</div>
          <div style="flex:1;background:var(--bg-card-solid);border:0.5px solid var(--border);
            border-radius:9px;padding:8px 10px;">
            <div style="display:flex;gap:8px;align-items:baseline;margin-bottom:3px;">
              <span style="font-size:11px;font-weight:600;color:var(--text-primary);">${escHtml(nombre)}</span>
              <span style="font-size:10px;color:var(--text-tertiary);">${timeAgo(c.created_at)}</span>
            </div>
            <div style="font-size:12px;color:var(--text-secondary);line-height:1.5;">${escHtml(c.contenido)}</div>
          </div>
        </div>`;
      }).join("");
    } catch (err) {
      el.innerHTML = `<div style="color:#F87171;font-size:12px;">Error cargando comentarios.</div>`;
    }
  }

  // ── Enviar comentario ─────────────────────────────────
  async function enviarComentario(postId) {
    const input = document.querySelector(`.gremio-comment-input[data-post-id="${postId}"]`);
    if (!input) return;
    const contenido = input.value.trim();
    if (!contenido) return;

    input.value    = "";
    input.disabled = true;

    try {
      const res  = await fetch(`/api/gremio/posts/${postId}/comentarios`, {
        method: "POST", credentials: "include",
        headers: authHeaders(),
        body: JSON.stringify({ contenido }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      await loadComentarios(postId);
    } catch (err) {
      console.error("enviarComentario:", err);
    } finally {
      input.disabled = false;
      input.focus();
    }
  }

  // ── Actualizar contador de caracteres ─────────────────
  function updateCharCount() {
    const textarea = document.getElementById("gremio-nuevo-post");
    const counter  = document.getElementById("gremio-char-count");
    if (!textarea || !counter) return;
    const n = textarea.value.length;
    counter.textContent = n + "/500";
    counter.style.color = n > 450 ? "#F87171" : "var(--text-tertiary)";
  }

  // ── Eventos delegados (click en el feed) ─────────────
  document.addEventListener("click", async (e) => {
    // Like
    const likeBtn = e.target.closest(".gremio-like-btn");
    if (likeBtn) { await toggleLike(likeBtn.dataset.postId); return; }

    // Toggle comentarios
    const commentToggle = e.target.closest(".gremio-comment-toggle");
    if (commentToggle) {
      const postId = commentToggle.dataset.postId;
      const section = document.querySelector(`.gremio-comments-section[data-post-id="${postId}"]`);
      if (!section) return;
      const open = section.style.display === "none";
      section.style.display = open ? "block" : "none";
      if (open) await loadComentarios(postId);
      return;
    }

    // Enviar comentario
    const sendBtn = e.target.closest(".gremio-comment-send");
    if (sendBtn) { await enviarComentario(sendBtn.dataset.postId); return; }
  });

  // Enter en input de comentario
  document.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      const input = e.target.closest(".gremio-comment-input");
      if (input) { e.preventDefault(); enviarComentario(input.dataset.postId); }
    }
  });

  // ── Init ──────────────────────────────────────────────
  document.addEventListener("DOMContentLoaded", () => {
    // Verificar sesión
    const email = localStorage.getItem("user_email");
    const tipo  = localStorage.getItem("user_tipo");
    if (!email || !tipo) { window.location.href = "/login.html"; return; }

    // Botón publicar
    document.getElementById("gremio-publicar-btn")?.addEventListener("click", crearPost);

    // Contador de caracteres
    document.getElementById("gremio-nuevo-post")?.addEventListener("input", updateCharCount);

    // Ctrl+Enter para publicar
    document.getElementById("gremio-nuevo-post")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && e.ctrlKey) crearPost();
    });

    // Filtro ciudad
    document.getElementById("gremio-filtro-ciudad")?.addEventListener("change", (e) => {
      state.filtros.ciudad = e.target.value;
      loadPosts(false);
      loadAlertas();
    });

    // Filtro tipo
    document.querySelectorAll(".gremio-filtro-tipo").forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".gremio-filtro-tipo").forEach(b => {
          b.style.background    = "var(--bg-card)";
          b.style.borderColor   = "var(--border)";
          b.style.color         = "var(--text-tertiary)";
        });
        const tipo = btn.dataset.tipo;
        state.filtros.tipo = (state.filtros.tipo === tipo) ? "" : tipo;
        if (state.filtros.tipo) {
          const meta = TIPO_META[tipo];
          btn.style.background  = meta?.color  || "var(--bg-card)";
          btn.style.borderColor = meta?.border || "var(--border)";
          btn.style.color       = meta?.text   || "var(--text-primary)";
        }
        loadPosts(false);
      });
    });

    // Cargar más
    document.getElementById("gremio-load-more")?.addEventListener("click", () => {
      state.page++;
      loadPosts(true);
    });

    // Sidebar menú móvil
    const sidebar = document.getElementById("gremio-sidebar");
    const overlay = document.getElementById("gremio-overlay");
    document.getElementById("gremio-btn-menu")?.addEventListener("click", () => {
      sidebar?.classList.add("open"); overlay?.classList.add("show");
    });
    overlay?.addEventListener("click", () => {
      sidebar?.classList.remove("open"); overlay?.classList.remove("show");
    });

    // Logout
    document.getElementById("gremio-logout")?.addEventListener("click", () => {
      localStorage.clear();
      fetch("/logout", { method: "POST", credentials: "include" }).finally(() => {
        window.location.href = "/login.html";
      });
    });

    // Cargar datos iniciales
    loadPosts(false);
    loadAlertas();

    // Nombre de usuario en sidebar
    const user = getUser();
    const nameEl = document.getElementById("gremio-user-name");
    if (nameEl && user.nombres) nameEl.textContent = user.nombres;
    const rolEl = document.getElementById("gremio-user-rol");
    if (rolEl && user.tipo) rolEl.textContent = user.tipo === "propietario" ? "Propietario" : "Conductor";
  });

  // Exponer en namespace global TC
  window.TC = window.TC || {};
  window.TC.gremio = { loadPosts, loadAlertas, crearPost };

})();
