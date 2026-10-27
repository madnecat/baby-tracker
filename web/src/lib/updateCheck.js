/**
 * An app left open (a pinned tab, a home-screen app that the phone suspended) keeps running the
 * version it loaded, even after an update was deployed. When the person comes back to it, this
 * compares the build it is running with the one the server now serves, and reloads if they differ.
 * A build is identified by the hashed script name in index.html (/assets/index-<hash>.js).
 */

const SCRIPT_RE = /\/assets\/index-[^"']+\.js/;

export function builtScriptOf(html) {
  return html.match(SCRIPT_RE)?.[0] ?? null;
}

export function runningScript() {
  const el = document.querySelector('script[src*="/assets/index-"]');
  return el ? new URL(el.src, location.href).pathname : null;
}

// An open sheet may hold a half-filled form; wait for the next return to the app instead.
const hasOpenForm = () => !!document.querySelector('.sheet-backdrop');

export async function reloadIfOutdated(fetchImpl = fetch) {
  const running = runningScript();
  if (!running || hasOpenForm()) return false;
  try {
    const res = await fetchImpl('/', { cache: 'no-store' });
    if (!res.ok) return false;
    const latest = builtScriptOf(await res.text());
    if (latest && latest !== running) {
      location.reload();
      return true;
    }
  } catch {
    // Offline or the server is restarting: keep what is running.
  }
  return false;
}

export function watchForNewVersion() {
  const check = () => {
    if (document.visibilityState === 'visible') reloadIfOutdated();
  };
  document.addEventListener('visibilitychange', check);
  window.addEventListener('pageshow', (e) => e.persisted && check());
  check();
}
