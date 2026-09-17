/**
 * The components call window.matchMedia through useColorScheme, which does not exist under Node.
 * Imported first by the bundle so it runs before any component module does.
 */
globalThis.window = globalThis.window || {
  matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
};
