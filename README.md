# Baby Tracker

Private baby-care event tracker with WHO growth charts, built to run as a
local **Home Assistant add-on**.

Live at `https://baby.candelaresi.fr` (household-only, behind login).

## What it does

- Log feedings (bottle), diapers, sleep, medications, outings, temperature,
  and contractions, with a running timer for in-progress events
- Growth tracking (weight, height, head circumference) plotted against WHO
  percentile curves
- Milestones tracking
- History and frequency charts to spot patterns over time
- Two parent accounts (configurable usernames/passwords via add-on options)
- An MCP server endpoint (`/mcp`, bearer-token auth) so tools like Claude can
  query and log events directly

## Stack

- **Server**: Node.js (Express, better-sqlite3, MCP SDK) — `server/`
- **Web**: React + Vite + Recharts — `web/`
- **Packaging**: Docker image built and run by Home Assistant Supervisor as a
  local add-on (see `config.yaml`, `Dockerfile`)

## Running locally

```sh
cd server
PORT=8099 PARENT1_USERNAME=thomas PARENT1_PASSWORD=testpass123 PARENT1_DISPLAY_NAME=Thomas \
PARENT2_USERNAME=wife PARENT2_PASSWORD=testpass456 PARENT2_DISPLAY_NAME=Wife \
node src/index.js
```

```sh
cd web
npm run dev
```

## Deploying

There is no CI/CD — this repo is pushed to GitHub for backup/history only.
Deploys to the live Home Assistant Pi are manual (build, sync over SSH,
reload the add-on). See `.claude/skills/deploy/SKILL.md` for the full
procedure and gotchas.
