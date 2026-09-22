import { test, expect } from '@playwright/test';

test.use({ serviceWorkers: 'block' });
const userId = '11111111-1111-4111-8111-111111111111';
const groupId = '22222222-2222-4222-8222-222222222222';
const group = { id: groupId, teacher_id: userId, name: 'Medicina · 3A', group_name: 'Medicina · 3A', subject: 'Fisiología', university: 'Institución de prueba', term: '2026', students: 28, attendance_rate: 94, grade_avg: 8.6, today_attendance_status: 'closed', last_activity: '2026-09-22T10:00:00Z' };
const allRoutes = ['/', '/agenda', '/groups', '/attendance', '/classroom', '/gradebook', '/students', '/periods', '/prepare', '/bank', '/exams', '/omr', '/reports', '/analytics', '/settings'];

async function fixture(page, empty = false) {
  const state = { errors: [], writes: [] };
  page.on('pageerror', error => state.errors.push(error.message));
  await page.addInitScript(({ userId }) => localStorage.setItem('sb-workspace-fixture-auth-token', JSON.stringify({ access_token: 'synthetic-access-token', refresh_token: 'synthetic-refresh-token', expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, token_type: 'bearer', user: { id: userId, email: 'docente@example.test', aud: 'authenticated', role: 'authenticated' } })), { userId });
  await page.route('**/config.js*', route => route.fulfill({ contentType: 'application/javascript', body: 'window.TEDVIO_CONFIG={SUPABASE_URL:"https://workspace-fixture.supabase.test",SUPABASE_PUBLISHABLE_KEY:"synthetic-publishable-key"};' }));
  await page.route('https://workspace-fixture.supabase.test/**', async route => {
    const request = route.request(), url = new URL(request.url()), table = url.pathname.split('/').at(-1);
    if (['PATCH', 'DELETE', 'PUT'].includes(request.method()) || (request.method() === 'POST' && !url.pathname.includes('/rpc/'))) state.writes.push(table);
    let rows = [];
    if (table === 'tedvio_required_legal_documents_v21') rows = [{ document_key: 'terms', version: 'test', required: true, title: 'Prueba', content_html: '<p>Prueba.</p>' }];
    else if (table === 'tedvio_user_consents') rows = [{ document_key: 'terms', document_version: 'test' }];
    else if (table === 'tedvio_onboarding_snapshot_v21') rows = { completed: true, score: 5, dismissed: true };
    else if (table === 'tedvio_user_profiles') rows = [{ status: 'active', plan: 'free', role: 'teacher' }];
    else if (table === 'tedvio_current_entitlements') rows = { plan: 'free', display_name: 'Free' };
    else if (table === 'v2_teacher_today_dashboard') rows = { groups: empty ? [] : [group, { ...group, id: 'other-group', name: 'Medicina · 3B', group_name: 'Medicina · 3B', subject: 'Anatomía', students: 32 }], groups_count: empty ? 0 : 2, pending_attendance: 0, risk_students: 0, watch_students: 0, priority_students: [] };
    else if (table === 'v2_groups') rows = empty ? [] : [group];
    else if (table === 'v2_group_students') rows = [{ id: 'student-a', teacher_id: userId, group_id: groupId, enrollment: 'A001', full_name: 'Alumna de prueba', active: true }];
    if (request.headers().accept?.includes('vnd.pgrst.object+json') && Array.isArray(rows)) rows = rows[0] ?? null;
    await route.fulfill({ json: rows });
  });
  await page.goto('/teacher#/');
  await expect(page.locator('.dashboard-workspace h1')).toContainText('docente');
  return state;
}

async function noOverflow(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
}

test('espacio docente: cinco áreas, rutas anteriores y menú accesible', async ({ page }) => {
  const state = await fixture(page);
  await expect(page.locator('main h1')).toHaveCount(1);
  await page.locator('.workspace-skip-link').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('main')).toBeFocused();
  await expect(page).toHaveURL(/#\/$/);
  const mobile = page.getByRole('navigation', { name: 'Navegación móvil' });
  if (await mobile.isVisible()) {
    const trigger = mobile.getByRole('button', { name: 'Más', exact: true });
    await trigger.click();
    const dialog = page.getByRole('dialog', { name: 'Todas las herramientas' });
    await expect(dialog).toBeVisible();
    for (const path of allRoutes) await expect(dialog.locator(`a[href="#${path}"]`)).toBeVisible();
    await page.keyboard.press('Tab');
    expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBe(true);
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    // Some touch browsers do not focus the tapped button. Keyboard-opened dialogs must restore focus.
    await trigger.focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Escape');
    await expect(trigger).toBeFocused();
    await trigger.click();
    await dialog.getByRole('link', { name: 'Banco de preguntas', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Banco de preguntas', exact: true })).toBeVisible();
    await expect(dialog).toHaveCount(0);
    await expect(mobile.getByRole('link', { name: 'Preparar', exact: true })).toHaveClass(/active/);
  } else {
    await expect(page.locator('.workspace-nav-heading > a')).toHaveCount(5);
    for (const toggle of await page.locator('.nav-expand').all()) {
      if (await toggle.getAttribute('aria-expanded') === 'false') await toggle.click();
    }
    for (const path of allRoutes) await expect(page.locator(`.sidebar-nav a[href="#${path}"]`)).toBeVisible();
    await page.locator('.sidebar-nav').getByRole('link', { name: 'Banco de preguntas', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Banco de preguntas', exact: true })).toBeVisible();
    await expect(page.locator('.sidebar-nav a[href="#/prepare"]')).toHaveClass(/active/);
  }
  await page.goBack();
  await expect(page.locator('.dashboard-workspace h1')).toBeVisible();
  await noOverflow(page);
  expect(state.errors).toEqual([]);
  expect(state.writes).toEqual([]);
});

test('grupo: accesos conservan el contexto y preseleccionan el examen', async ({ page }) => {
  const state = await fixture(page);
  await page.locator('.group-card-v2').first().getByRole('link', { name: 'Abrir grupo' }).click();
  await expect(page.getByRole('heading', { name: group.name, exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
  const workflow = page.getByRole('navigation', { name: 'Trabajar con este grupo' });
  const paths = { 'Iniciar clase': `/classroom?group=${groupId}`, Asistencia: `/attendance/${groupId}`, 'Crear examen': `/exams/new?group=${groupId}`, Calificaciones: `/gradebook/${groupId}`, Reportes: `/reports/${groupId}` };
  for (const [name, path] of Object.entries(paths)) await expect(workflow.getByRole('link', { name, exact: true })).toHaveAttribute('href', `#${path}`);
  await expect(page.getByRole('link', { name: 'Alumna de prueba' })).toHaveAttribute('href', `#/students/${groupId}/student-a`);
  await noOverflow(page);
  await page.screenshot({ path: test.info().outputPath('group-workspace.png'), fullPage: true });
  await workflow.getByRole('link', { name: 'Crear examen', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Construir evaluación', exact: true })).toBeVisible();
  await expect(page.getByLabel('Grupo', { exact: true })).toHaveValue(groupId);
  expect(state.errors).toEqual([]);
  expect(state.writes).toEqual([]);
});

test('Inicio y preparación: móvil estrecho, escritorio, temas y estados vacíos', async ({ page }) => {
  const state = await fixture(page);
  await page.screenshot({ path: test.info().outputPath('dashboard-premium.png'), fullPage: true });
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await noOverflow(page);
  }
  await page.getByRole('button', { name: 'Activar modo oscuro' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('.dashboard-workspace h1')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.screenshot({ path: test.info().outputPath('dashboard-dark.png'), fullPage: true });
  await page.locator('.sidebar-nav').getByRole('link', { name: 'Preguntas y exámenes', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'De la pregunta al resultado.', exact: true })).toBeVisible();
  for (const path of ['/bank', '/exams/new', '/exams', '/omr']) await expect(page.locator(`.prepare-tools a[href="#${path}"]`)).toBeVisible();
  await page.getByRole('button', { name: 'Activar modo claro' }).click();
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await noOverflow(page);
  }
  await page.screenshot({ path: test.info().outputPath('prepare-premium.png'), fullPage: true });
  expect(state.errors).toEqual([]);
  expect(state.writes).toEqual([]);
});

test('Inicio sin datos ofrece un primer paso sin métricas inventadas', async ({ page }) => {
  const state = await fixture(page, true);
  await expect(page.getByText('Aún no hay grupos', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Crear grupo', exact: true })).toBeVisible();
  await expect(page.locator('.group-card-v2')).toHaveCount(0);
  await noOverflow(page);
  expect(state.errors).toEqual([]);
});
