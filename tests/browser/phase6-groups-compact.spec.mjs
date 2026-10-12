import { test, expect } from '@playwright/test';

// Real frontend, synthetic account/data. Never connect these tests to production.
test.use({ serviceWorkers: 'block' });
const userId = '11111111-1111-4111-8111-111111111111';
const universityId = '22222222-2222-4222-8222-222222222222';
const programId = '33333333-3333-4333-8333-333333333333';
const universityName = 'UNIVERSIDAD DE PRUEBA DEL NORTE';
const programName = 'LICENCIATURA EN MEDICINA GENERAL';
const groups = ['ANFITEATRO ANATOMÍA', 'PROPEDÉUTICA BÁSICA', 'SEMINARIO DE INTEGRACIÓN BÁSICO, SOCIAL Y CLÍNICO'].map((subject, i) => ({
  id: `44444444-4444-4444-8444-44444444444${i}`,
  teacher_id: userId, university_id: universityId, program_id: programId,
  name: `1-0${i + 1}`, group_name: `1-0${i + 1}`, subject,
  university: universityName, program: programName, term: '2026-2027',
  students: 40 + i, attendance_rate: 92, grade_avg: null, risk_count: 2,
  watch_count: 0, attendance_sessions_count: 13, today_attendance_status: null,
  last_activity: '2026-10-08T18:00:00Z',
}));

async function fixture(page, { records = groups, dashboard = records } = {}) {
  const state = { errors: [], writes: [] };
  page.on('pageerror', error => state.errors.push(error.message));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(({ userId }) => localStorage.setItem('sb-workspace-fixture-auth-token', JSON.stringify({
    access_token: 'synthetic-access-token', refresh_token: 'synthetic-refresh-token',
    expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, token_type: 'bearer',
    user: { id: userId, email: 'docente@example.test', aud: 'authenticated', role: 'authenticated' },
  })), { userId });
  await page.route('**/config.js*', route => route.fulfill({ contentType: 'application/javascript',
    body: 'window.TEDVIO_CONFIG={SUPABASE_URL:"https://workspace-fixture.supabase.test",SUPABASE_PUBLISHABLE_KEY:"synthetic-publishable-key"};',
  }));
  await page.route('https://workspace-fixture.supabase.test/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const table = url.pathname.split('/').at(-1);
    // Technical diagnostics may be written when cancelling a protected dialog;
    // guard against academic mutations, not permitted error telemetry.
    if ((['PATCH', 'DELETE', 'PUT'].includes(request.method()) || (request.method() === 'POST' && !url.pathname.includes('/rpc/'))) && table !== 'tedvio_client_events') state.writes.push(table);
    let rows = [];
    if (table === 'user') rows = { id: userId, email: 'docente@example.test', aud: 'authenticated', role: 'authenticated', user_metadata: {} };
    else if (table === 'tedvio_required_legal_documents_v21') rows = [{ document_key: 'terms', version: 'test', required: true, title: 'Prueba', content_html: '<p>Prueba.</p>' }];
    else if (table === 'tedvio_user_consents') rows = [{ document_key: 'terms', document_version: 'test' }];
    else if (table === 'tedvio_onboarding_snapshot_v21') rows = { completed: true, score: 5, dismissed: true };
    else if (table === 'tedvio_user_profiles') rows = [{ status: 'active', plan: 'free', role: 'teacher', full_name: 'Docente de prueba' }];
    else if (table === 'profiles') rows = [{ id: userId, display_name: 'Docente de prueba' }];
    else if (table === 'tedvio_current_entitlements') rows = { plan: 'free', display_name: 'Free' };
    else if (table === 'v2_teacher_today_dashboard') rows = { groups: dashboard, groups_count: records.length, pending_attendance: 0, risk_students: 0, watch_students: 0, priority_students: [] };
    else if (table === 'v2_groups') rows = records;
    else if (table === 'v2_universities') rows = [{ id: universityId, teacher_id: userId, name: universityName }];
    else if (table === 'v2_programs') rows = [{ id: programId, teacher_id: userId, university_id: universityId, name: programName }];
    if (request.headers().accept?.includes('vnd.pgrst.object+json') && Array.isArray(rows)) rows = rows[0] ?? null;
    await route.fulfill({ json: rows });
  });
  await page.goto('/teacher#/groups');
  await expect(page.locator('.group-catalog-card')).toHaveCount(records.length);
  return state;
}

for (const width of [320, 390, 768, 1024, 1280, 1440]) {
  test(`Grupos premium: datos completos, botones táctiles y rejilla a ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const state = await fixture(page);
    const first = page.locator('.group-catalog-card').first();
    await expect(first).toContainText(groups[0].subject);
    await expect(first).toContainText(programName);
    await expect(first.locator('.group-catalog-metrics b')).toHaveText(['40', '92%', '—', '2']);
    await expect(first.locator('.group-catalog-context')).toContainText('13 listas históricas');
    await expect(first).toHaveAttribute('data-cover', 'anatomy');
    await first.scrollIntoViewIfNeeded();
    await expect.poll(() => first.locator('.pg-cover-art img').evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
    const dimensions = await first.evaluate(card => ({
      height: card.getBoundingClientRect().height,
      columns: getComputedStyle(card.parentElement).gridTemplateColumns.split(' ').length,
      metrics: [...card.querySelectorAll('.group-catalog-metrics > span')].map(e => e.getBoundingClientRect().top),
      buttons: [...card.querySelectorAll('footer > .button')].map(e => ({ width: e.getBoundingClientRect().width, height: e.getBoundingClientRect().height })),
      pageWidth: document.documentElement.scrollWidth, viewport: innerWidth,
      overflowAudit: document.documentElement.scrollWidth > innerWidth + 1 ? {
        candidates: [...document.querySelectorAll('*')].filter(el => { const box = el.getBoundingClientRect(); return box.right > innerWidth + 1 || box.left < -1; }).slice(0, 20).map(el => {
          const box = el.getBoundingClientRect(); return { tag: el.tagName, className: typeof el.className === 'string' ? el.className.slice(0, 100) : '', left: Math.round(box.left), right: Math.round(box.right), width: Math.round(box.width), scroll: el.scrollWidth };
        }),
        sections: ['html','body','.app-shell','.topbar','.topbar-actions','.mobile-nav','.route-container'].map(sel => { const el = document.querySelector(sel); const b = el?.getBoundingClientRect(); return { sel, left: b && Math.round(b.left), right: b && Math.round(b.right), scroll: el?.scrollWidth, client: el?.clientWidth }; })
      } : null,
    }));
    expect(dimensions.pageWidth, JSON.stringify(dimensions)).toBeLessThanOrEqual(width + 1);
    expect(dimensions.height, JSON.stringify(dimensions)).toBeLessThanOrEqual(380);
    expect(new Set(dimensions.metrics.map(Math.round)).size).toBe(1);
    // Only the two frequent actions are visible; edit/delete are tested in the disclosure.
    expect(dimensions.buttons).toHaveLength(2);
    for (const button of dimensions.buttons) { expect(button.height).toBeGreaterThanOrEqual(44); expect(button.width).toBeGreaterThanOrEqual(44); }
    if (width <= 600) expect(dimensions.columns).toBe(1);
    if (width >= 1024) expect(dimensions.columns).toBeGreaterThanOrEqual(2);
    if (width >= 1280) expect(dimensions.columns).toBe(3);
    await expect(first.getByRole('link', { name: 'Abrir grupo', exact: true })).toHaveAttribute('href', `#/groups/${groups[0].id}`);
    await expect(first.getByRole('link', { name: 'Asistencia', exact: true })).toHaveAttribute('href', `#/attendance/${groups[0].id}`);
    await expect(first.getByRole('button', { name: 'Editar', exact: true })).toHaveCount(0);
    for (const control of await first.locator('footer > .button').all()) await control.click({ trial: true });
    await first.getByRole('button', { name: /^Opciones del grupo/ }).click({ trial: true });
    await page.evaluate(() => window.scrollTo(0, document.querySelector('.group-catalog-card').getBoundingClientRect().top + scrollY - 90));
    await page.screenshot({ path: test.info().outputPath(`groups-premium-${width}.png`) });
    console.log('GROUP_CARD_LAYOUT', width, dimensions);
    expect(state.errors).toEqual([]);
    expect(state.writes).toEqual([]);
  });
}

test('Grupos premium: edición, búsqueda, nombres largos y modo oscuro no pierden datos', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const state = await fixture(page);
  const first = page.locator('.group-catalog-card').first();
  await first.getByRole('button', { name: /^Opciones del grupo/ }).click();
  await first.getByRole('button', { name: 'Editar', exact: true }).click();
  await expect(page.getByLabel('Asignatura', { exact: true })).toHaveValue(groups[0].subject);
  await expect(page.getByLabel('Grado y grupo', { exact: true })).toHaveValue('1-01');
  await page.locator('.group-editor').getByRole('button', { name: 'Cancelar', exact: true }).click();
  await page.locator('.catalog-search input').fill('SEMINARIO');
  await expect(page.locator('.group-catalog-card')).toHaveCount(1);
  await expect(page.locator('.group-catalog-card .eyebrow')).toHaveText(groups[2].subject);
  await expect(page.locator('.group-catalog-card')).toHaveAttribute('data-cover', 'academic');
  await page.getByRole('button', { name: 'Activar modo oscuro', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('.group-catalog-card .group-institution p')).toContainText(universityName);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.locator('.group-catalog-card').scrollIntoViewIfNeeded();
  await page.screenshot({ path: test.info().outputPath('groups-premium-dark.png') });
  expect(state.errors).toEqual([]);
  expect(state.writes).toEqual([]);
});

test('Grupos premium: menú con teclado, Escape, clic exterior y eliminación protegida', async ({ page }) => {
  const state = await fixture(page);
  const first = page.locator('.group-catalog-card').first();
  const options = first.getByRole('button', { name: /^Opciones del grupo/ });
  await options.focus(); await page.keyboard.press('ArrowDown');
  await expect(first.getByRole('button', { name: 'Editar', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(first.getByRole('button', { name: /^Eliminar grupo:/ })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(options).toHaveAttribute('aria-expanded', 'false');
  await expect(options).toBeFocused();
  await options.click();
  await first.getByRole('button', { name: /^Eliminar grupo:/ }).click();
  await expect(page.getByRole('dialog', { name: 'Eliminar grupo', exact: true })).toBeVisible();
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Cancelar', exact: true })).toBeFocused();
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Eliminar definitivamente', exact: true })).toBeDisabled();
  // Escape dismisses only the dialog; the menu/trigger remains mounted for focus restoration.
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(first.getByRole('button', { name: /^Eliminar grupo:/ })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(options).toBeFocused();
  await options.click();
  await page.getByRole('heading', { name: 'Mis grupos', exact: true }).click();
  await expect(options).toHaveAttribute('aria-expanded', 'false');
  expect(state.errors).toEqual([]); expect(state.writes).toEqual([]);
});

test('Grupos premium: filtros reales, orden, lista y datos no disponibles', async ({ page }) => {
  const dashboard = [
    { ...groups[0], today_attendance_status: null, risk_count: 2, attendance_rate: 0, grade_avg: 0 },
    { ...groups[1], today_attendance_status: 'closed', risk_count: 0, attendance_rate: 85 },
  ];
  const state = await fixture(page, { dashboard });
  const cards = page.locator('.group-catalog-card');
  await expect(cards.first().locator('.group-catalog-metrics b')).toHaveText(['40', '0%', '0.0', '2']);
  await expect(cards.last().locator('.group-catalog-metrics b')).toHaveText(['—', '—', '—', '—']);
  await expect(cards.last().locator('.status-pill')).toHaveText('Sin resumen');
  await page.getByRole('button', { name: /^Con lista hoy/ }).click();
  await expect(cards).toHaveCount(1); await expect(cards).toHaveAttribute('data-group-id', groups[1].id);
  await page.getByRole('button', { name: /^Sin lista hoy/ }).click();
  await expect(cards).toHaveCount(1); await expect(cards).toHaveAttribute('data-group-id', groups[0].id);
  await page.getByRole('button', { name: /^Con alertas/ }).click();
  await expect(cards).toHaveCount(1); await expect(cards).toHaveAttribute('data-group-id', groups[0].id);
  await page.getByRole('button', { name: 'Limpiar filtros', exact: true }).click();
  await page.getByLabel('Ordenar grupos', { exact: true }).selectOption('attendance');
  await expect(cards.first()).toHaveAttribute('data-group-id', groups[1].id);
  await expect(cards.last()).toHaveAttribute('data-group-id', groups[2].id);
  await page.getByLabel('Ordenar grupos', { exact: true }).selectOption('academic');
  await expect(cards.first()).toHaveAttribute('data-group-id', groups[0].id);
  await page.getByRole('button', { name: 'Vista de lista', exact: true }).click();
  await expect(page.locator('.pg-catalog')).toHaveAttribute('data-view', 'list');
  for (const width of [320, 390, 768, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await cards.first().getByRole('link', { name: 'Abrir grupo', exact: true }).click({ trial: true });
  }
  await page.screenshot({ path: test.info().outputPath('groups-premium-list.png'), fullPage: true });
  await page.getByRole('button', { name: 'Vista de tarjetas', exact: true }).click();
  await expect(page.locator('.pg-catalog')).toHaveAttribute('data-view', 'grid');
  expect(state.errors).toEqual([]); expect(state.writes).toEqual([]);
});

test('Grupos premium: seis portadas locales y nombres completos en la vista general', async ({ page }) => {
  const records = ['Anatomía humana', 'Farmacología', 'Embriología', 'Propedéutica básica', 'Farmacocinética', 'Fisiopatología del adulto'].map((subject, i) => ({ ...groups[0], id: `44444444-4444-4444-8444-44444444444${i}`, subject, name: `1-0${i + 1}`, group_name: `1-0${i + 1}` }));
  await page.setViewportSize({ width: 1440, height: 1000 });
  const state = await fixture(page, { records });
  for (const cover of ['anatomy', 'pharmacology', 'embryology', 'clinical', 'kinetics', 'physiology']) await expect(page.locator(`[data-cover="${cover}"]`)).toHaveCount(1);
  for (const image of await page.locator('.pg-cover-art img').all()) {
    await image.scrollIntoViewIfNeeded();
    await expect.poll(() => image.evaluate(node => node.complete && node.naturalWidth > 0)).toBe(true);
    expect(new URL(await image.getAttribute('src'), page.url()).origin).toBe(new URL(page.url()).origin);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: test.info().outputPath('groups-premium-overview.png'), fullPage: true });
  expect(state.errors).toEqual([]); expect(state.writes).toEqual([]);
});
