#!/usr/bin/env bash
# Deterministic checks for the baby-tracker workflow. See SKILL.md next to this file.
#
#   bash .claude/skills/workflow/preflight.sh start     before creating a worktree
#   bash .claude/skills/workflow/preflight.sh version   before bumping config.yaml (and again before opening a PR)
#   bash .claude/skills/workflow/preflight.sh deploy    before any deploy
#
# Exit 0 = go. Exit 1 = REFUSED: stop, tell the user why, and do not work around it.
set -u

mode="${1:-}"
fail=0
bad() { echo "REFUSED: $*"; fail=1; }

# The main checkout, wherever this is run from (a worktree's common dir is the main .git).
main_root="$(cd "$(git rev-parse --git-common-dir)/.." && pwd)"
here="$(cd "$(git rev-parse --show-toplevel)" && pwd)"

# Files the Claude harness itself creates in the main checkout; everything else counts as dirty.
dirty_in() {
  git -C "$1" status --porcelain | grep -vE '^\?\? \.claude/(scheduled_tasks\.lock|worktrees/)$' || true
}

version_of() { sed -n 's/^version: *"\{0,1\}\([0-9][0-9.]*\)"\{0,1\}.*/\1/p' | head -1 | tr -d '\r'; }

git -C "$main_root" fetch --quiet --prune origin || { echo "REFUSED: git fetch failed"; exit 1; }
origin_version="$(git -C "$main_root" show origin/main:config.yaml | version_of)"

case "$mode" in
  version)
    echo "origin/main is at version $origin_version"
    echo "A fix bumps the patch ($origin_version -> next patch), a feature the minor. Re-run this right before"
    echo "opening the PR and after every rebase: another PR may have merged and taken the number."
    exit 0
    ;;

  start|deploy)
    [ "$mode" = deploy ] && [ "$here" != "$main_root" ] && \
      bad "deploying from a worktree ($here). Deploy only from the main checkout ($main_root), on main, after the PR is merged."

    branch="$(git -C "$main_root" branch --show-current)"
    [ "$branch" = main ] || bad "the main checkout is on '$branch', not main."

    if [ -n "$(dirty_in "$main_root")" ]; then
      bad "the main checkout is not clean:"; dirty_in "$main_root" | sed 's/^/    /'
    fi

    if [ "$fail" = 0 ]; then
      git -C "$main_root" pull --quiet --ff-only origin main || bad "git pull --ff-only origin main failed (main has diverged?)."
    fi
    local_head="$(git -C "$main_root" rev-parse HEAD)"
    [ "$local_head" = "$(git -C "$main_root" rev-parse origin/main)" ] || bad "main is not at origin/main."
    echo "main is at $(git -C "$main_root" rev-parse --short HEAD), version $(version_of < "$main_root/config.yaml")"

    if [ "$mode" = start ]; then
      # Every other worktree must be closed. List them all so the user can decide; never delete them from here.
      git -C "$main_root" worktree list --porcelain | awk '/^worktree /{print substr($0,10)}' | while read -r wt; do
        # Git Bash prints C:/x here and /c/x elsewhere: compare normalised paths.
        [ "$(cd "$wt" 2>/dev/null && pwd)" = "$main_root" ] && continue
        b="$(git -C "$wt" branch --show-current 2>/dev/null)"
        ahead="$(git -C "$main_root" rev-list --count "origin/main..${b:-HEAD}" 2>/dev/null || echo '?')"
        d="$(dirty_in "$wt" | wc -l | tr -d ' ')"
        echo "OPEN WORKTREE: $wt (branch ${b:-detached}, $ahead commit(s) not on main, $d uncommitted path(s))"
      done > /tmp/baby-tracker-open-worktrees.$$
      if [ -s /tmp/baby-tracker-open-worktrees.$$ ]; then
        bad "other worktrees are still open. Ask the user to close them (merge or drop their work, then 'git worktree remove'); do not start."
        cat /tmp/baby-tracker-open-worktrees.$$ | sed 's/^/    /'
      fi
      rm -f /tmp/baby-tracker-open-worktrees.$$
    fi
    ;;

  *)
    echo "usage: preflight.sh start|version|deploy"; exit 2
    ;;
esac

if [ "$fail" = 0 ]; then
  echo "OK ($mode)"
  exit 0
fi
exit 1
