---
name: workflow
description: Start, finish and ship a change to baby-tracker, in a fixed order with scripted checks. Use before creating a worktree, before choosing a version number, before opening a pull request, and before any deploy. Nothing here is optional or a judgement call.
---

# baby-tracker workflow

The same mistakes kept recurring (a version number below what `main` already had, work started on top
of stale or half-finished worktrees, deploying from a branch), each time caught by the user instead of
by the process. So the order is fixed and the checks are a script, not a memory.

**This is enforced, not advisory.** A `PreToolUse` hook (`.claude/settings.json` -> `.claude/hooks/guard.mjs`)
refuses `git worktree add` until `preflight.sh start` passes, and refuses every command that touches the Pi
or the add-on (`PI_SSH`, `/local_apps`, `ha apps|store`, the connection file) until `preflight.sh deploy`
passes. A GitHub Action (`.github/workflows/version-bump.yml`) fails any PR to `main` whose `config.yaml`
version is not exactly one step above `main`'s. Other people using the open-source repo are not bound by
any of it; for this household's deployment there is no other path.

`preflight.sh` (next to this file) exits non-zero with `REFUSED: ...` when a rule is broken. **A refusal
is final for that step: report it to the user and stop. Do not work around it, do not "just start".**

## 1. Before starting any work

Run from the repository (main checkout or any worktree):

```sh
bash .claude/skills/workflow/preflight.sh start
```

It fetches, requires the main checkout to be on `main` and clean, runs `git pull --ff-only origin main`,
prints the version `main` is on, and **refuses if any other worktree exists**. Open worktrees are listed with
their branch, how many commits they hold that are not on `main`, and how many uncommitted paths they have.

- Refused because of other worktrees: tell the user which ones and what they hold. Never remove one
  yourself; the user decides (merge it, drop it, or finish it first), then re-run.
- Only once it prints `OK (start)`: create the worktree from `origin/main`
  (`git worktree add .claude/worktrees/<name> -b worktree-<name> origin/main`).

Note the version it prints. It is the baseline for this piece of work.

## 2. Choosing the version

The number is never remembered or guessed. Read it from `origin/main`:

```sh
bash .claude/skills/workflow/preflight.sh version
```

A fix bumps the patch, a feature the minor, from **that** number. Run it again **right before opening the PR**
and after **every** rebase: if another PR merged meanwhile, the number moves. After a rebase, a conflict in
`config.yaml` is resolved to "origin/main's version plus one step", then check
`git diff origin/main -- config.yaml` shows that one line and `git grep -n '^<<<<<<<\|^>>>>>>>'` finds nothing
(the file has CRLF endings: a regex that assumes `\n` silently does nothing and commits the markers).

## 3. Finishing: demo, commit, PR, stop

In this order:

1. Tests: `cd web && node --test` (and the server tests if the server changed).
2. **Local demo with fake data**, for anything the user will see. Seed a throw-away household in a
   scratch `DATA_DIR` (outside the repo, never real data, never in tests or fixtures), run the server and
   `vite`, and give the user the URL and a login so they can look before anything is committed. Leave the
   servers running until the user says to stop, then stop them.
3. Commit (including the version bump from step 2) and open the PR against `main`.
4. **Stop.** The user reviews and merges. Do not deploy, do not "prepare" the deploy (no staging on
   the Pi, no `ha` commands), do not ask to deploy before the PR is merged.

## 4. Deploying

Only when the user asks, and only after the PR is merged:

```sh
bash .claude/skills/workflow/preflight.sh deploy
```

This refuses unless it is run from the main checkout, on `main`, clean, and identical to `origin/main`.
**Never deploy from a branch or a worktree**, whatever the state of the code there. Then follow the
`deploy` skill from step 1; its step 0 is this script. The version on the Pi (`ha apps info`) must be exactly
one step below the version in `config.yaml`; if it is not, stop and tell the user before touching anything.
