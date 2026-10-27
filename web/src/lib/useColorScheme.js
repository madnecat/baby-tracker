import { useEffect, useState } from 'react';

// The account's choice (data-theme on <html>, see theme.js) wins over the device's setting.
function currentlyDark() {
  const chosen = document.documentElement.getAttribute('data-theme');
  if (chosen === 'dark') return true;
  if (chosen === 'light') return false;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
}

export function useColorScheme() {
  const [isDark, setIsDark] = useState(currentlyDark);

  useEffect(() => {
    const update = () => setIsDark(currentlyDark());
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', update);
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    update();
    return () => {
      mq.removeEventListener('change', update);
      observer.disconnect();
    };
  }, []);

  return isDark;
}
