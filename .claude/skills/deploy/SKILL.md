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
4. **Sync files to the Pi.** Stage a clean copy, then swap it in — do NOT
   extract over the live directory:
   ```sh
   $PI_SSH "rm -rf /addons/baby-tracker.new && mkdir -p /addons/baby-tracker.new"
   cd /c/Users/tom_t/baby-tracker && tar --exclude='node_modules' --exclude='dist' --exclude='data-dev'      -cf - Dockerfile config.yaml .dockerignore README.md server web |      $PI_SSH "tar -xf - -C /addons/baby-tracker.new"
   $PI_SSH "rm -rf /addons/baby-tracker.old &&      mv /addons/baby-tracker /addons/baby-tracker.old &&      mv /addons/baby-tracker.new /addons/baby-tracker &&      rm -rf /addons/baby-tracker.old"
   ```
   Two things this fixes, both learned the hard way:

   - **`tar -x` never deletes.** Extracting over the live directory only ever
     adds, so anything sent once stays for ever. The Pi had accumulated a stale
     git worktree from August, a full `.git` history, `scheduled_tasks.lock`,
     and `.claude/skills/deploy/connection.local.md` — this skill's own
     dev-machine-only connection file, sitting in production. Staging and
     swapping makes the live directory exactly what was sent, nothing more.
   - **Send only what the image needs.** The explicit list above replaces
     "everything except a few excludes", so `.claude/` and `.git` never travel
     again. `.dockerignore` still governs the Docker build context, but keeping
     junk off the Pi in the first place is the better guarantee.

   The database is NOT in `/addons` — it lives in `/data`, a Supervisor-managed
   volume — so swapping the source directory cannot touch anyone's data.
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

## Rolling back

Before any risky deploy, take a partial backup of just this add-on (config +
`/data`, i.e. every household DB):
`$PI_SSH "ha apps stop local_baby_tracker && ha backups new --app local_baby_tracker --name 'baby-tracker pre-<version>'; ha apps start local_baby_tracker"`.

- **Code only** (data is fine, new version misbehaves): check out the previous
  commit, set `config.yaml`'s version to a *new* higher number (Supervisor
  only updates when the version changes), sync + update as usual. An option
  that's no longer in the schema (e.g. `households` when rolling back past
  0.10.0) doesn't block startup — Supervisor drops unknown options with a
  warning (`supervisor/apps/options.py`, "does not exist in the schema").
- **Data too**: `$PI_SSH "ha backups list"`, then
  `$PI_SSH "ha backups restore <slug> --app local_baby_tracker --homeassistant=false"` —
  restores that add-on's config and `/data` only, leaving the rest of Home
  Assistant untouched. Anything logged in the app after the backup is lost.

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

For anything touching auth, sessions, or the per-household data path, also
provision a second household (`DB_PATH=.../data-dev/baby-tracker.db node
scripts/create-household.js household-2 someone:pw:Name`) and confirm its
session/token can't see or modify household-1's child/events/growth/
milestones — this is the property the whole multi-household design exists to
guarantee, so don't skip it.

## Multi-household architecture

Each household is a **fully independent SQLite file** — no shared "core"
database, no `household_id` column anywhere. See `server/src/households.js`:

- Files live at `${DATA_DIR}/households/<slug>/data.db` (`DATA_DIR` defaults
  to the directory of `DB_PATH`, i.e. `/data` on the Pi).
- Login (`username`+`password`, no household selector) works by scanning
  every household's `users` table for a match — so **usernames must stay
  unique across all households**. `scripts/create-household.js` enforces this
  itself when provisioning a new one; there's no enforcement at the DB level
  since each file's UNIQUE constraint only covers its own users.
- The very first deploy of this version auto-migrates the old single-file
  database into `households/household-1/data.db` — a plain file move
  (`fs.renameSync`, plus its `-wal`/`-shm` siblings), not a row-level
  migration, since the pre-multi-household database was already shaped
  exactly like one household. This runs once, guarded by "does
  `households/household-1/` already exist" — safe to leave in the codebase
  permanently. It also copies (never moves) the original aside first, as
  `<name>.backup-pre-multihousehold`, purely as a zero-trust safety net.

**Provisioning a new household** (e.g. onboarding another family) — **not**
via `docker exec`: confirmed on the real Pi that the `core_ssh` add-on this
skill SSHes through has neither a `docker` binary nor the Docker socket, so
there is no way to get a shell inside the baby-tracker container from here
(and no `ha` CLI subcommand for it either — checked `ha apps --help` and
`ha --help` in full, nothing fits). Two options that actually work:

1. **Config-driven via the `households` list (recommended, no shell access
   needed)**: add an entry (slug + parent1, optionally parent2) to the
   **households** list in the Home Assistant UI (Settings → Add-ons → Baby
   Tracker → Configuration), save, then `$PI_SSH "ha apps restart local_baby_tracker"`.
   `bootstrapListedHouseholds()` in `server/src/bootstrap.js` handles any
   number of entries; there's no need to add `household3_*`-style fields.
   Rules (see `syncConfigListHousehold()` in `server/src/households.js`):
   - A household created from the list gets a `config-list-household.json`
     marker in its folder, recording which user id is parent1/parent2. Entries
     can only ever touch households carrying that marker — a slug matching
     household-1, household2, or anything made by `create-household.js` is
     refused and logged, never reconciled.
   - On later boots: a changed username is renamed in its own slot; a parent
     filled in later gets an account created. Passwords and display names in
     the config are only used at account creation (parents change their own
     password in the app's Settings).
   - Removing an entry does **not** delete or disable the household — its
     parents can still log in (a warning is logged at boot). Its slug is then
     flagged in the marker: re-adding it only works with its previous
     usernames, so a removed family's slug can't be reused for a different
     family (that would rename their accounts). Use a new slug instead.
   - Each entry is independent: a bad one (empty/invalid/duplicate slug,
     username already used elsewhere) is ignored and logged — mostly as
     `Skipping "households" entry ...`, while a failed rename/creation on an
     existing list household logs `Could not rename/create ...`. Check
     `ha apps logs local_baby_tracker` after the restart.
   - No account is created or renamed (list, household2, or
     `create-household.js`) while any household's database can't be opened,
     since username uniqueness couldn't be checked. A household that fails to
     open or migrate at boot is left out (its parents can't log in) until the
     add-on restarts; the others keep working.

   The older fixed `household2_slug` + `household2_parent{1,2}_*` options
   still work exactly as before — keep those fields as they are for the
   household already created through them; don't move it into the list (its
   slug would be refused, since it has no list marker).
2. **`scripts/create-household.js` directly**, if shell access inside the
   container is ever available by some other means (e.g. a differently
   configured SSH add-on with host/Docker access) — same idempotent
   `provisionHousehold()` logic either way, just invoked differently.

Restarting the add-on **is** required for the config-driven path (options are
only read at boot); it is not required for direct script invocation.

## Database migrations

`server/schema.sql` runs `CREATE TABLE IF NOT EXISTS` on every boot for
*every* household database — fine for brand-new tables (just add them there).
It is **not** enough for changing an existing table's shape on an
already-provisioned database (e.g. widening the `events.type` CHECK
constraint) — SQLite can't `ALTER` a CHECK constraint, so that needs a real
migration. Add a new versioned step to `server/src/migrations.js`
(`MIGRATIONS` array, bump the version number) — `runMigrations(db)` is guarded
by that household's own `PRAGMA user_version`, and `index.js` runs it against
every household database on boot, so each step still runs exactly once per
household, including on the live Pi database the first time the new code
boots. Always test a migration against a *simulated pre-migration* database
locally before deploying (recreate the old schema by hand, run
`runMigrations(db)`, confirm existing rows survive) — this has caught real
bugs before.

## Never deploy a config.yaml older than the Pi's

Check what the Pi actually runs *before* syncing:

```sh
$PI_SSH "head -2 /addons/baby-tracker/config.yaml; ha apps info local_baby_tracker | grep -E '^version'"
```

If the Pi's version is ahead of, or equal to, the repo's, stop and find out why
rather than syncing over it. This has already gone wrong once: work committed
only on a worktree branch was deployed, the branch was later deleted, and the Pi
held the only copy — which a deploy from `main` then overwrote. It was recovered
from an unreachable commit (`git fsck --unreachable`) and from the Claude
session transcripts under `~/.claude/projects/`, but that was luck, not process.

The rule that prevents it: **deploy only from `main`, and merge before you
deploy.** If `ha apps info` reports a version `main` has never produced, the Pi
is ahead of the repo and something is unmerged.

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
