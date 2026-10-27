/**
 * The colour theme: 'light', 'dark', or null to follow the device. The choice lives on the account
 * (so it follows the person to every device) and is also kept on this device, so the page can be
 * painted in the right theme before the session answers and on the login screen. Storage can be
 * blocked (private mode), so every access is guarded.
 */

export const THEME_STORAGE_KEY = 'baby-tracker.theme';
export const THEMES = ['light', 'dark'];

export const isTheme = (value) => THEMES.includes(value);

export function loadTheme(storage = globalThis.localStorage) {
  try {
    const saved = storage?.getItem(THEME_STORAGE_KEY);
    return isTheme(saved) ? saved : null;
  } catch {
    return null;
  }
}

function saveTheme(theme, storage = globalThis.localStorage) {
  try {
    if (isTheme(theme)) storage?.setItem(THEME_STORAGE_KEY, theme);
    else storage?.removeItem(THEME_STORAGE_KEY);
  } catch {
    // The choice then only lasts for this visit (the account still remembers it).
  }
}

const THEME_COLOR = { light: '#f9f9f7', dark: '#0d0d0d' };

/** Shows `theme` now (null = the device's setting) and remembers it on this device. */
export function applyTheme(theme, root = globalThis.document?.documentElement) {
  const chosen = isTheme(theme) ? theme : null;
  saveTheme(chosen);
  if (!root) return;
  if (chosen) root.setAttribute('data-theme', chosen);
  else root.removeAttribute('data-theme');
  // The browser bar follows the chosen theme too, not only the device's.
  const doc = root.ownerDocument;
  doc.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
    if (!m.hasAttribute('data-default')) m.setAttribute('data-default', m.getAttribute('content'));
    m.setAttribute('content', chosen ? THEME_COLOR[chosen] : m.getAttribute('data-default'));
  });
}
