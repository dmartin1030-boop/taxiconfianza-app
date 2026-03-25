# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Run the server
npm start          # node server.js on port 3000

# Install dependencies
npm install
```

No build step, test suite, or linter is configured.

## Architecture

**TaxiConfianza** is a platform connecting taxi drivers (*conductores*) with vehicle owners (*propietarios*). It is a full-stack monolith: a single Express server (`server.js`) serving both the REST API and static HTML/JS/CSS files.

### Backend (`server.js`)

- **Database:** MySQL via `mysql2` with connection pooling. All queries go through the `q(sql, params)` async helper.
- **Auth:** Hybrid — checks `req.session.user` (express-session with 7-day cookie) first, then falls back to `X-User-Email` / `X-User-Tipo` request headers. The `requireUser` middleware enforces auth.
- **Roles:** `propietario` (owner) and `conductor` (driver). Most endpoints check `req.user.tipo` before executing.
- **Soft deletes:** Records use a `deleted_at` column; hard deletes are avoided.
- **Transactions:** Accepting a conductor application (`POST /api/propietario/postulaciones/:id/aceptar`) uses `connection.beginTransaction()` for atomicity.

Key DB helpers defined near the top of `server.js`:
- `q(sql, params)` — promisified query
- `getUsuarioByEmail(email)`
- `ensurePerfilPropietario(usuarioId)` / `ensurePerfilConductor(usuarioId)` — auto-create profile rows if missing

### Frontend (`js/`)

Vanilla JavaScript with no framework. Modules use IIFEs and a shared global namespace:
- `window.TC.api` (`js/tc-api.js`) — wraps all fetch calls, adds auth headers from localStorage, normalizes `{success}` / `{ok}` response shapes.
- `window.TC.session` (`js/tc-session.js`) — reads/writes `localStorage` (`userTaxiConfianza` key), guards pages by role (`requireRole`), provides `logout` and `ensureUserId`.

Each page has its own controller script (e.g., `tc-conductor-ofertas.js`, `tc-dashboard-propietario.js`). Scripts are loaded at the bottom of the corresponding HTML file.

### Data model (core tables)

| Table | Purpose |
|---|---|
| `usuarios` | Accounts (email, password plaintext, tipo) |
| `perfiles_propietario` / `perfiles_conductor` | Role-specific profile data |
| `vehiculos` | Owner's vehicles |
| `ofertas_trabajo` | Job postings (estado: activa/pausada/cerrada) |
| `postulaciones` | Conductor applications to offers |
| `asignaciones` | Active work assignments (fecha_inicio/fin) |

### Deployment

Configured for **Railway** (trust proxy enabled, keepalive MySQL options, unhandledRejection/uncaughtException handlers). Environment is loaded from `.env` via `dotenv`.

Required env vars: `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `SESSION_SECRET`, `PORT`.
