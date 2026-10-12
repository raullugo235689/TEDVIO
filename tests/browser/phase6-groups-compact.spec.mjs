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

async function fixture(page, fixtureGroups = groups) {
  const groups = fixtureGroups;
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
    if (['PATCH', 'DELETE', 'PUT'].includes(request.method()) || (request.method() === 'POST' && !url.pathname.includes('/rpc/'))) state.writes.push(table);
    let rows = [];
    if (table === 'user') rows = { id: userId, email: 'docente@example.test', aud: 'authenticated', role: 'authenticated', user_metadata: {} };
    else if (table === 'tedvio_required_legal_documents_v21') rows = [{ document_key: 'terms', version: 'test', required: true, title: 'Prueba', content_html: '<p>Prueba.</p>' }];
    else if (table === 'tedvio_user_consents') rows = [{ document_key: 'terms', document_version: 'test' }];
    else if (table === 'tedvio_onboarding_snapshot_v21') rows = { completed: true, score: 5, dismissed: true };
    else if (table === 'tedvio_user_profiles') rows = [{ status: 'active', plan: 'free', role: 'teacher', full_name: 'Docente de prueba' }];
    else if (table === 'profiles') rows = [{ id: userId, display_name: 'Docente de prueba' }];
    else if (table === 'tedvio_current_entitlements') rows = { plan: 'free', display_name: 'Free' };
    else if (table === 'v2_teacher_today_dashboard') rows = { groups, groups_count: groups.length, pending_attendance: 0, risk_students: 0, watch_students: 0, priority_students: [] };
    else if (table === 'v2_groups') rows = groups;
    else if (table === 'v2_universities') rows = [{ id: universityId, teacher_id: userId, name: universityName }];
    else if (table === 'v2_programs') rows = [{ id: programId, teacher_id: userId, university_id: universityId, name: programName }];
    if (request.headers().accept?.includes('vnd.pgrst.object+json') && Array.isArray(rows)) rows = rows[0] ?? null;
    await route.fulfill({ json: rows });
  });
  await page.goto('/teacher#/groups');
  await expect(page.locator('.group-catalog-card')).toHaveCount(groups.length);
  return state;
}

for (const width of [320, 390, 768, 1024, 1280, 1440]) {
  test(`Grupos compactos: datos completos, botones táctiles y rejilla a ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const state = await fixture(page);
    const first = page.locator('.group-catalog-card').first();
    await expect(first).toContainText(groups[0].subject);
    await expect(first).toContainText(programName);
    await expect(first.locator('.group-catalog-metrics b')).toHaveText(['40', '92%', '—', '2']);
    await expect(first.locator('.group-catalog-context')).toContainText('13 listas históricas');
    const dimensions = await first.evaluate(card => ({
      height: card.getBoundingClientRect().height,
      columns: getComputedStyle(card.parentElement).gridTemplateColumns.split(' ').length,
      metrics: [...card.querySelectorAll('.group-catalog-metrics > span')].map(e => e.getBoundingClientRect().top),
      buttons: [...card.querySelectorAll('footer > .button')].map(e => ({ width: e.getBoundingClientRect().width, height: e.getBoundingClientRect().height })),
      pageWidth: document.documentElement.scrollWidth, viewport: innerWidth,
    }));
    expect(dimensions.pageWidth, JSON.stringify(dimensions)).toBeLessThanOrEqual(width + 1);
    expect(dimensions.height, JSON.stringify(dimensions)).toBeLessThanOrEqual(380);
    expect(new Set(dimensions.metrics.map(Math.round)).size).toBe(1);
    expect(dimensions.buttons).toHaveLength(2);
    for (const button of dimensions.buttons) { expect(button.height).toBeGreaterThanOrEqual(44); expect(button.width).toBeGreaterThanOrEqual(44); }
    if (width <= 600) expect(dimensions.columns).toBe(1);
    if (width >= 1024) expect(dimensions.columns).toBeGreaterThanOrEqual(2);
    if (width >= 1280) expect(dimensions.columns).toBeGreaterThanOrEqual(3);
    await expect(first.getByRole('link', { name: 'Abrir grupo', exact: true })).toHaveAttribute('href', `#/groups/${groups[0].id}`);
    await expect(first.getByRole('link', { name: 'Asistencia', exact: true })).toHaveAttribute('href', `#/attendance/${groups[0].id}`);
    await first.scrollIntoViewIfNeeded();
    for (const control of await first.locator('footer > .button').all()) {
      await control.click({ trial: true });
    }
    await page.evaluate(() => window.scrollTo(0, document.querySelector('.group-catalog-card').getBoundingClientRect().top + scrollY - 90));
    await page.screenshot({ path: test.info().outputPath(`groups-compact-${width}.png`) });
    console.log('GROUP_CARD_LAYOUT', width, dimensions);
    expect(state.errors).toEqual([]);
    expect(state.writes).toEqual([]);
  });
}

test('Grupos compactos: edición, búsqueda, nombres largos y modo oscuro no pierden datos', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const state = await fixture(page);
  const first = page.locator('.group-catalog-card').first();
  await first.getByRole('button', { name: /Opciones del grupo/ }).click();
  await first.getByRole('button', { name: 'Editar', exact: true }).click();
  await expect(page.getByLabel('Asignatura', { exact: true })).toHaveValue(groups[0].subject);
  await expect(page.getByLabel('Grado y grupo', { exact: true })).toHaveValue('1-01');
  await page.locator('.group-editor').getByRole('button', { name: 'Cancelar', exact: true }).click();
  await page.locator('.catalog-search input').fill('SEMINARIO');
  await expect(page.locator('.group-catalog-card')).toHaveCount(1);
  await expect(page.locator('.group-catalog-card .eyebrow')).toHaveText(groups[2].subject);
  await page.getByRole('button', { name: 'Activar modo oscuro', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('.group-catalog-card .group-institution p')).toContainText(universityName);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.locator('.group-catalog-card').scrollIntoViewIfNeeded();
  await page.screenshot({ path: test.info().outputPath('groups-compact-dark.png') });
  expect(state.errors).toEqual([]);
  expect(state.writes).toEqual([]);
});


test('Grupos premium: menú accesible, Escape y clic fuera no modifican datos', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const state = await fixture(page);
  const card = page.locator('.group-catalog-card').first();
  const trigger = card.getByRole('button', { name: /Opciones del grupo/ });
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await expect(card.getByRole('button', { name: 'Editar', exact: true })).toHaveCount(0);
  await trigger.click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await expect(card.getByRole('button', { name: 'Editar', exact: true })).toBeFocused();
  await expect(card.getByRole('button', { name: /Eliminar grupo:/ })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('groups-premium-menu.png') });
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await trigger.click();
  await page.getByRole('heading', { name: 'Mis grupos', exact: true }).click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  expect(state.writes).toEqual([]);
  expect(state.errors).toEqual([]);
});

test('Grupos premium: cero y sin datos son distintos; no inventa actividad', async ({ page }) => {
  const state = await fixture(page, [
    { ...groups[0], attendance_rate: 0, grade_avg: 0, risk_count: 0, students: 0 },
    { ...groups[1], attendance_rate: null, grade_avg: null, today_attendance_status: 'paused' },
    { ...groups[2], attendance_rate: null, grade_avg: null, today_attendance_status: 'closed' },
  ]);
  const cards = page.locator('.group-catalog-card');
  await expect(cards.nth(0).locator('.group-catalog-metrics b')).toHaveText(['0', '0%', '0.0', '0']);
  await expect(cards.nth(0).locator('.group-attendance-badge')).toHaveText('Sin lista hoy');
  await expect(cards.nth(1).locator('.group-attendance-stat b')).toHaveText('—');
  await expect(cards.nth(1).locator('.group-attendance-badge')).toHaveText('Asistencia pausada');
  await expect(cards.nth(2).locator('.group-attendance-badge')).toHaveText('Lista de hoy cerrada');
  expect(state.writes).toEqual([]);
  expect(state.errors).toEqual([]);
});

for (const width of [390, 1280, 1440]) {
  test(`Grupos premium: seis portadas y vista completa a ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    const subjects = ['ANATOMÍA HUMANA', 'FARMACOLOGÍA', 'EMBRIOLOGÍA', 'PROPEDÉUTICA BÁSICA', 'FARMACOCINÉTICA', 'FISIOPATOLOGÍA DEL ADULTO'];
    const covers = ['anatomy', 'pharmacology', 'embryology', 'clinical', 'kinetics', 'physiology'];
    const showcase = subjects.map((subject, i) => ({ ...groups[0], id: `44444444-4444-4444-8444-44444444444${i}`, subject, group_name: `1-0${i + 1}`, name: `1-0${i + 1}`, students: 28 + i * 2, grade_avg: i === 0 ? null : 8.6, attendance_rate: 90 + i, risk_count: i % 2, today_attendance_status: i === 0 ? 'open' : null }));
    const state = await fixture(page, showcase);
    const artwork = await page.request.get('/assets/groups/subject-covers-v1.webp');
    expect(artwork.status()).toBe(200);
    expect((await artwork.body()).length).toBeGreaterThan(1000);
    for (let i = 0; i < showcase.length; i++) {
      const card = page.locator(`[data-group-id="${showcase[i].id}"]`);
      await expect(card).toHaveAttribute('data-cover', covers[i]);
      await expect(card.locator('.group-card-cover')).toHaveCSS('background-image', /subject-covers-v1/);
      await expect(card.locator('footer > a')).toHaveCount(2);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: test.info().outputPath(`groups-premium-overview-${width}.png`), fullPage: true, animations: 'disabled' });
    expect(state.writes).toEqual([]);
    expect(state.errors).toEqual([]);
  });
}
