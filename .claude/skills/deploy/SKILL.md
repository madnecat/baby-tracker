---
name: deploy
description: Build, test, and deploy the baby-tracker app to its live Home Assistant add-on on the household Pi. Use whenever code in this repo changed and needs to go live on baby.candelaresi.fr.
---

# Deploying baby-tracker

This app runs as a **local Home Assistant add-on** (`local_baby_tracker`) on the
household's Home Assistant Pi, exposed publicly at
`https://baby.candelaresi.fr` via a Cloudflare Tunnel that already runs on the
same Pi (add-on `9074a9fa_cloudflared`). There is no CI/CD — every deploy is a
manual push-and-rebuild from this dev machine.

## Connection details

Real host/port/key live in `connection.local.md` next to this file
(gitignored — not in the repo, dev-machine only). Read it once and set:

```sh
PI_SSH="ssh -i <key> -p <port> -o BatchMode=yes root@<host>"
```

substituting the values from that file. Every command below uses `$PI_SSH`.

- Add-on files live at `/addons/baby-tracker/` on the Pi (Supervisor
  auto-detects local add-ons there — no git repo involved)
- Supervisor CLI is `ha` (aliases: `apps`/`addons` are interchangeable):
  `ha store reload`, `ha apps update local_baby_tracker`, `ha apps logs local_baby_tracker`,
  `ha apps info local_baby_tracker`

## Standard deploy sequence

1. **Bump the version** in `config.yaml` (semver patch/minor bump — Supervisor
   uses this to decide `update` vs `rebuild`, and it's the only changelog we have).
2. **Build the frontend**: `cd web && npm run build` — do this even for
   backend-only changes if you're unsure; it's cheap and confirms nothing broke.
3. **Test locally first** (see Testing below) — don't skip this for anything
   touching the server, the DB schema, or MCP tools.
4. **Sync files to the Pi** (excludes dev artifacts, `.dockerignore` at repo
   root also governs what actually enters the Docker build):
   ```sh
   tar --exclude='node_modules' --exclude='dist' --exclude='data-dev' -C /c/Users/tom_t -cf - baby-tracker | \
     $PI_SSH "tar -xf - -C /addons/baby-tracker --strip-components=1"
   ```
5. **Reload + update**:
   ```sh
   $PI_SSH "ha store reload && ha apps update local_baby_tracker"
   ```
   (`ha apps rebuild` only works when the version is unchanged; if you forgot
   to bump `config.yaml` you'll get "Local and store versions differ, use
   Update instead of Rebuild" — bump it and re-sync.)
6. **Verify**: check logs, then hit the live API.
   ```sh
   $PI_SSH "ha apps logs local_baby_tracker" | tail -10
   curl -sS --max-time 15 https://baby.candelaresi.fr/api/auth/session -w "\nHTTP %{http_code}\n"
   ```
   A `401 {"error":"Not authenticated"}` means the server is up and routing
   correctly (that endpoint is supposed to reject you without a session).

   Also check the MCP endpoint specifically — it's a separate subsystem (its
   own auth path, beta SDK) and the check above doesn't exercise it at all:
   ```sh
   curl -sS -X POST https://baby.candelaresi.fr/mcp \
     -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" \
     -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' \
     --max-time 15 -w "\nHTTP %{http_code}\n"
   ```
   Expect `401 {"error":"invalid_token","error_description":"Missing Authorization header"}`
   — that confirms the route is mounted and the bearer-auth middleware is
   live. If you have a valid token handy (ask the user — don't create one
   without asking, it's tied to their account), repeat with
   `-H "Authorization: Bearer <token>"` and confirm `tools/list` actually
   returns the full tool set (currently 17 tools — see `server/src/mcp.js`)
   rather than just checking the 401 case. (Count the tools in
   `server/src/mcp.js` yourself rather than trusting a remembered number here
   — it grows over time and this doc won't always be updated in lockstep.)

## Testing locally before every non-trivial deploy

Run the server directly (not Docker — same Node version issues would show up
in curl regardless):

```sh
cd server && rm -rf data-dev && \
PORT=8099 PARENT1_USERNAME=thomas PARENT1_PASSWORD=testpass123 PARENT1_DISPLAY_NAME=Thomas \
PARENT2_USERNAME=wife PARENT2_PASSWORD=testpass456 PARENT2_DISPLAY_NAME=Wife \
node src/index.js
```
(run in background, then curl against `http://localhost:8099`). Log in via
`/api/auth/login`, exercise whatever endpoints changed, and for MCP changes
create a token via `POST /api/tokens` (session-authed) and call `/mcp` with it
directly — see `server/src/mcp.js` for the tool list. Clean up with
`rm -rf server/data-dev` when done. There is no browser available in this
environment to click through the UI — a clean build + a full curl pass through
the changed endpoints is the verification bar, not "looks right."

## Database migrations

`server/schema.sql` runs `CREATE TABLE IF NOT EXISTS` on every boot — fine for
brand-new tables (just add them there). It is **not** enough for changing an
existing table's shape on the Pi's already-provisioned database (e.g. widening
the `events.type` CHECK constraint) — SQLite can't `ALTER` a CHECK constraint,
so that needs a real migration. Add a new versioned step to
`server/src/migrations.js` (`MIGRATIONS` array, bump the version number) — it's
guarded by `PRAGMA user_version` so each step runs exactly once ever, including
on the live Pi database the first time the new code boots. Always test a
migration against a *simulated pre-migration* database locally before
deploying (recreate the old schema by hand, run `runMigrations()`, confirm
existing rows survive) — this has caught real bugs before.

## Known gotchas

- **Cloudflared routing is NOT controlled by this add-on's config.** The
  tunnel (`9074a9fa_cloudflared`) is in Cloudflare's "Remote Management" mode —
  its `additional_hosts` option is silently ignored (log line confirms:
  *"All app configuration options except tunnel_token will be ignored"*).
  Public hostnames are added via the Cloudflare Zero Trust dashboard →
  Tunnels & Mesh → (tunnel name) → Published application routes, pointing at
  `http://local-baby-tracker:8099` (that's the add-on's internal Docker
  hostname — HA Supervisor's convention is `local-<slug-with-dashes>`).
- **Never edit that Cloudflared add-on's options as a partial patch.** The
  Supervisor options API replaces the whole options object, not a merge — a
  call that only sends `additional_hosts` wipes `tunnel_token` and drops the
  tunnel. Always fetch current options first and resend everything.
- **The MCP SDK packages are pinned at a beta version**
  (`@modelcontextprotocol/{server,express,node}` at `2.0.0-beta.5` in
  `server/package.json`). Before bumping them, re-verify the API against the
  official repo's `examples/bearer-auth/server.ts` and
  `examples/guides/serving/express.examples.ts` — it's pre-1.0 and has already
  restructured package names once (older docs/blog posts reference a
  different split than what's on npm now).
- **ChatGPT is intentionally not supported** for the MCP connector — it
  requires full OAuth 2.1 + Dynamic Client Registration (bearer tokens
  rejected outright); Claude's custom connectors accept a simple bearer token
  configured as a request header, which is what `server/src/mcp.js` implements.
  This was a deliberate scope decision, not an oversight — don't build OAuth
  for this unless explicitly asked again.
- Two Home Assistant users exist for this app: `thomas` and `maman` (Maman's
  account is the one usually used for testing MCP tokens — check
  `ha apps logs` or ask before assuming which token belongs to whom).
