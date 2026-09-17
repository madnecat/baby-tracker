#!/usr/bin/env node
/**
 * Bundles render-check.jsx (JSX and React need a transform that bare Node has no opinion about)
 * and runs it. esbuild is already present as a Vite dependency, so this adds nothing to install.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = mkdtempSync(path.join(tmpdir(), 'baby-tracker-render-'));

try {
  // A tiny entry that pulls the shim in before anything else, then the real check.
  const entry = path.join(out, 'entry.jsx');
  writeFileSync(
    entry,
    `import ${JSON.stringify(path.join(here, 'render-check-shim.js'))};\n` +
      `import ${JSON.stringify(path.join(here, 'render-check.jsx'))};\n`
  );

  const bundle = path.join(out, 'bundle.cjs');
  const esbuild = path.join(here, '..', 'node_modules', 'esbuild', 'bin', 'esbuild');
  execFileSync(
    process.execPath,
    [esbuild, entry, '--bundle', '--platform=node', '--format=cjs', '--jsx=automatic', `--outfile=${bundle}`, '--log-level=error'],
    { stdio: ['ignore', 'ignore', 'inherit'] }
  );
  execFileSync(process.execPath, [bundle, ...process.argv.slice(2)], { stdio: 'inherit' });
} finally {
  rmSync(out, { recursive: true, force: true });
}
