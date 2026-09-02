// Canonical redirect loaded by the legacy beta shell.
(() => {
  const hash = window.location.hash || '';
  if (hash.startsWith('#join')) {
    const query = hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : '';
    const params = new URLSearchParams(query);
    const code = String(params.get('code') || '').trim().toUpperCase();
    const target = code ? `/student-v2/?code=${encodeURIComponent(code)}` : '/student-v2/';
    window.location.replace(target);
    return;
  }
  if (hash.startsWith('#student')) {
    window.location.replace(`/student-v2/${hash}`);
  }
})();
