// Compatibility bridge for older Student 2.x links.
(() => {
  const params = new URLSearchParams(window.location.search);
  const code = String(params.get('code') || '').trim().toUpperCase();
  document.documentElement.dataset.tedvioSurface = 'student-v2';
  if (code && !window.location.hash) {
    window.location.hash = `#join?code=${encodeURIComponent(code)}`;
  }
})();
