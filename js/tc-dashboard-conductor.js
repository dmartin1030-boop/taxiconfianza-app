(function () {
  function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value ?? "";
  }

  function attachLogout() {
    const btn = document.querySelector("aside.sidebar button.btn.danger");
    if (btn) btn.addEventListener("click", () => window.TC.session.logout("index.html"));
  }

  async function refresh() {
    const user = window.TC.session.getUser();
    if (user) setText("user-name", `${user.nombres || ""} ${user.apellidos || ""}`.trim());

    const data = await window.TC.api.request("/api/dashboard/conductor");

    setText("nivel", data.stats?.nivel ?? "Plata");
    setText("score", data.stats?.score ?? "0");
    setText("avg", data.stats?.avg ?? "0");
    setText("reviews", data.stats?.reviews ?? "0");
    setText("rating90", data.stats?.rating90 ?? "0");
    setText("jobs", data.stats?.jobs ?? "0");
    setText("points", data.stats?.points ?? "0");
    setText("notif-count", data.stats?.notifCount ?? "0");
  }

  document.addEventListener("DOMContentLoaded", async () => {
    const u = window.TC.session.requireRole("conductor");
    if (!u) return;

    attachLogout();
    try { await refresh(); } catch (e) { console.error(e); }
  });
})();
