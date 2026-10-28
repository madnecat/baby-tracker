// PreToolUse hook (Bash): makes the workflow skill mandatory for Claude sessions in this repo.
// Exit 2 blocks the command and shows the reason to Claude. See .claude/skills/workflow/SKILL.md.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

let command = '';
try {
  command = JSON.parse(readFileSync(0, 'utf8')).tool_input?.command ?? '';
} catch {
  process.exit(0); // not a Bash call we can read: do not get in the way
}

// Creating a worktree: only from a clean, up-to-date main with no other worktree open.
const startsWork = /\bgit\s+(-C\s+\S+\s+)?worktree\s+add\b/.test(command);
// Anything that touches the Pi or the Home Assistant add-on is a deploy.
const deploys = /PI_SSH|local_apps|\bha\s+(apps|addons|store)\b|connection\.local\.md|local_baby_tracker/.test(command);

const mode = deploys ? 'deploy' : startsWork ? 'start' : null;
if (!mode) process.exit(0);

const r = spawnSync('bash', ['.claude/skills/workflow/preflight.sh', mode], {
  cwd: process.env.CLAUDE_PROJECT_DIR || process.cwd(),
  encoding: 'utf8',
});
if (r.status === 0) process.exit(0);

process.stderr.write(
  `Blocked by the baby-tracker workflow (${mode}). This is mandatory: report it to the user and stop, ` +
    `do not work around it.\n${r.stdout}${r.stderr}`
);
process.exit(2);
