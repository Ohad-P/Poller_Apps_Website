(function initializeTheme() {
  const storageKey = 'poller-apps/theme';
  let savedTheme;

  try {
    savedTheme = localStorage.getItem(storageKey);
  } catch {
    // System preference remains a safe fallback when storage is unavailable.
  }

  const theme = savedTheme === 'light' || savedTheme === 'dark'
    ? savedTheme
    : matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';

  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute(
    'content',
    theme === 'dark' ? '#111318' : '#f3f0e8',
  );
}());
