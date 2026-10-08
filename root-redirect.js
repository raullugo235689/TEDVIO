// Forward legacy invitation links before the teacher app handles navigation.
// Hosted as a separate file because the production CSP disallows inline scripts.
(() => {
  const { search, hash } = window.location;
  const query = new URLSearchParams(search);
  const legacyStudentRoute = /^#(?:join|student)(?:[/?]|$)/i.test(hash);
  const fragmentQuery = hash.includes('?')
    ? new URLSearchParams(hash.slice(hash.indexOf('?') + 1))
    : new URLSearchParams();
  const code = String(query.get('code') || fragmentQuery.get('code') || '')
    .trim().toUpperCase();

  if (legacyStudentRoute || code) {
    const target = code
      ? `/student-v2/?code=${encodeURIComponent(code)}`
      : '/student-v2/';
    window.location.replace(target);
    return;
  }

  // Keep deep links and auth fragments instead of silently dropping them.
  window.location.replace(`/teacher${search}${hash}`);
})();
