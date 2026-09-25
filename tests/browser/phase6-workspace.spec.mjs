import { test, expect } from '@playwright/test';

test.use({ serviceWorkers: 'block' });
const userId = '11111111-1111-4111-8111-111111111111';
const groupId = '22222222-2222-4222-8222-222222222222';
const group = { id: groupId, teacher_id: userId, name: 'Medicina · 3A', group_name: 'Medicina · 3A', subject: 'Fisiología', university: 'Institución de prueba', term: '2026', students: 28, attendance_rate: 94, grade_avg: 8.6, today_attendance_status: 'closed', last_activity: '2026-09-22T10:00:00Z' };
const allRoutes = ['/', '/agenda', '/groups', '/attendance', '/classroom', '/gradebook', '/students', '/periods', '/prepare', '/bank', '/exams', '/omr', '/reports', '/analytics', '/settings'];

async function fixture(page, empty = false, dashboardGroups = null, workspace = {}) {
  const state = { errors: [], writes: [] };
  let profileName = workspace.profileName || null;
  page.on('pageerror', error => state.errors.push(error.message));
  await page.addInitScript(({ userId }) => localStorage.setItem('sb-workspace-fixture-auth-token', JSON.stringify({ access_token: 'synthetic-access-token', refresh_token: 'synthetic-refresh-token', expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, token_type: 'bearer', user: { id: userId, email: 'docente@example.test', aud: 'authenticated', role: 'authenticated' } })), { userId });
  await page.route('**/config.js*', route => route.fulfill({ contentType: 'application/javascript', body: 'window.TEDVIO_CONFIG={SUPABASE_URL:"https://workspace-fixture.supabase.test",SUPABASE_PUBLISHABLE_KEY:"synthetic-publishable-key"};' }));
  await page.route('https://workspace-fixture.supabase.test/**', async route => {
    const request = route.request(), url = new URL(request.url()), table = url.pathname.split('/').at(-1);
    if (url.pathname.startsWith('/storage/v1/object/public/')) {
      if (url.pathname.endsWith('logo-broken.png')) return route.fulfill({ status: 404, body: 'Not found' });
      return route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64') });
    }
    if (['PATCH', 'DELETE', 'PUT'].includes(request.method()) || (request.method() === 'POST' && !url.pathname.includes('/rpc/'))) state.writes.push(table);
    let rows = [];
    if (table === 'tedvio_required_legal_documents_v21') rows = [{ document_key: 'terms', version: 'test', required: true, title: 'Prueba', content_html: '<p>Prueba.</p>' }];
    else if (table === 'tedvio_user_consents') rows = [{ document_key: 'terms', document_version: 'test' }];
    else if (table === 'tedvio_onboarding_snapshot_v21') rows = { completed: true, score: 5, dismissed: true };
    else if (table === 'tedvio_user_profiles') rows = [{ status: 'active', plan: 'free', role: 'teacher', full_name: 'docente' }];
    else if (table === 'profiles') rows = [{ id: userId, display_name: profileName }];
    else if (table === 'v2_save_teacher_profile_settings') {
      profileName = request.postDataJSON().p_display_name;
      rows = { id: userId, display_name: profileName };
    }
    else if (table === 'user') rows = { id: userId, email: 'docente@example.test', aud: 'authenticated', role: 'authenticated', user_metadata: request.method() === 'PUT' ? request.postDataJSON().data : {} };
    else if (table === 'tedvio_current_entitlements') rows = { plan: 'free', display_name: 'Free' };
    else if (table === 'v2_teacher_today_dashboard') {
      const groups = empty ? [] : dashboardGroups || [group, { ...group, id: 'other-group', name: 'Medicina · 3B', group_name: 'Medicina · 3B', subject: 'Anatomía', students: 32 }];
      rows = { groups, groups_count: groups.length, pending_attendance: 0, risk_students: 0, watch_students: 0, priority_students: [] };
    }
    else if (table === 'v2_groups') {
      rows = empty ? [] : workspace.groups || dashboardGroups || [group];
      const selectedId = url.searchParams.get('id')?.replace(/^eq\./, '');
      if (selectedId) rows = rows.filter(item => item.id === selectedId);
    }
    else if (table === 'v2_universities') rows = workspace.universities || [];
    else if (table === 'v2_programs') rows = workspace.programs || [];
    else if (table === 'tedvio_institution_memberships') rows = workspace.memberships || [];
    else if (table === 'tedvio_institutions') rows = workspace.institutions || [];
    else if (table === 'v2_group_students') rows = [{ id: 'student-a', teacher_id: userId, group_id: groupId, enrollment: 'A001', full_name: 'Alumna de prueba', active: true }];
    if (request.headers().accept?.includes('vnd.pgrst.object+json') && Array.isArray(rows)) rows = rows[0] ?? null;
    await route.fulfill({ json: rows });
  });
  await page.goto('/teacher#/');
  await expect(page.locator('.dashboard-teacher-name')).toHaveText(profileName || 'Docente');
  return state;
}

async function noOverflow(page) {
  const layout = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    viewport: innerWidth,
    overflow: [...document.querySelectorAll('main *')].filter(element => element.getBoundingClientRect().right > innerWidth + 1).slice(0, 12).map(element => ({ tag: element.tagName, class: element.className, right: element.getBoundingClientRect().right })),
  }));
  expect(layout.width <= layout.viewport + 1, JSON.stringify(layout)).toBe(true);
}

test('perfil docente: nombre profesional completo, título e iniciales se actualizan en todo el espacio', async ({ page }) => {
  const name = 'Dra. María Fernanda de la Cruz Herrera';
  const state = await fixture(page, false, null, { profileName: name });
  await expect(page.locator('.dashboard-teacher-name')).toHaveText(name);
  await expect(page.locator('.user-chip b')).toHaveText(name);
  await expect(page.locator('.user-chip > span')).toHaveText('MF');
  await noOverflow(page);
  await page.screenshot({ path: test.info().outputPath('professional-teacher-name.png'), fullPage: true });
  await page.getByRole('link', { name: `Perfil de ${name}`, exact: true }).click();
  const nameInput = page.getByLabel('Nombre profesional', { exact: false });
  await expect(nameInput).toHaveValue(name);
  const updatedName = 'Dr. Alejandro José del Castillo';
  await nameInput.fill(updatedName);
  await page.getByRole('button', { name: 'Guardar perfil', exact: true }).click();
  await expect(page.getByText('Perfil docente actualizado.', { exact: true })).toBeVisible();
  await expect(page.locator('.user-chip')).toHaveAttribute('aria-label', `Perfil de ${updatedName}`);
  await expect(page.locator('.user-chip > span')).toHaveText('AJ');
  await page.goto('/teacher#/');
  await expect(page.locator('.dashboard-teacher-name')).toHaveText(updatedName);
  await page.setViewportSize({ width: 320, height: 800 });
  await noOverflow(page);
  expect(state.errors).toEqual([]);
});

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
  await expect(page.getByRole('heading', { name: 'Resumen del grupo', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Identidad del grupo' })).toContainText(group.name);
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
  const workflow = page.getByRole('navigation', { name: 'Trabajar con este grupo' });
  const paths = { 'Iniciar clase': `/classroom?group=${groupId}`, 'Crear examen': `/exams/new?group=${groupId}`, 'Analítica': `/analytics/${groupId}`, 'Periodos': `/periods/${groupId}` };
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

test('grupo: identidad y sección se conservan entre pantallas, enlaces directos y temas', async ({ page }) => {
  const branded = { ...group, institution_logo_path: `${userId}/institution-branding/university/logo-a.png` };
  const other = { ...group, id: '33333333-3333-4333-8333-333333333333', group_name: 'Medicina · 3B', name: 'Medicina · 3B', subject: 'Anatomía', university: 'Otra universidad' };
  const state = await fixture(page, false, [branded, other]);
  const color = await page.locator('.group-card-v2').first().getAttribute('data-group-color');
  await page.locator('.group-card-v2').first().getByRole('link', { name: 'Abrir grupo' }).click();
  const identity = page.getByRole('region', { name: 'Identidad del grupo' });
  const navigation = page.getByRole('navigation', { name: 'Secciones del grupo' });
  await expect(identity).toContainText(group.subject);
  await expect(identity.locator('img')).toHaveAttribute('src', /logo-a\.png$/);
  for (const [label, heading, path] of [
    ['Alumnos', 'Alumnos del grupo', `/groups/${groupId}?tab=students`],
    ['Asistencia', 'Asistencia', `/attendance/${groupId}`],
    ['Calificaciones', 'Calificaciones', `/gradebook/${groupId}`],
    ['Reportes', 'Reportes del grupo', `/reports/${groupId}`],
    ['Resumen', 'Resumen del grupo', `/groups/${groupId}`],
  ]) {
    await navigation.getByRole('link', { name: label, exact: true }).click();
    await expect(page.getByRole('heading', { name: heading, exact: true, level: 1 })).toBeVisible();
    expect(new URL(page.url()).hash).toBe(`#${path}`);
    await expect(navigation.locator('[aria-current]')).toHaveText(label);
    await expect(page.locator('.group-workspace')).toHaveAttribute('data-group-color', color);
    await expect(identity).toContainText(group.name);
    await expect(identity.locator('img')).toHaveAttribute('src', /logo-a\.png$/);
    await noOverflow(page);
    if (label === 'Reportes') await page.screenshot({ path: test.info().outputPath('group-reports-navigation.png'), fullPage: true });
  }
  await page.goto(`/teacher#/groups/${groupId}?tab=students`);
  await expect(page.getByRole('heading', { name: 'Lista de alumnos', exact: true })).toBeVisible();
  await expect(navigation.locator('[aria-current]')).toHaveText('Alumnos');
  await navigation.getByRole('link', { name: 'Resumen', exact: true }).click();
  await page.goBack();
  await expect(navigation.locator('[aria-current]')).toHaveText('Alumnos');
  await page.reload();
  await expect(navigation.locator('[aria-current]')).toHaveText('Alumnos');
  await expect(page.getByRole('heading', { name: 'Lista de alumnos', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Activar modo oscuro' }).click();
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await noOverflow(page);
    if (width <= 680) expect(await navigation.evaluate(nav => {
      const bounds = nav.getBoundingClientRect();
      return [...nav.querySelectorAll('a')].every(link => {
        const box = link.getBoundingClientRect();
        return box.left >= bounds.left && box.right <= bounds.right;
      });
    })).toBe(true);
  }
  await page.screenshot({ path: test.info().outputPath('group-students-dark.png'), fullPage: true });
  await identity.getByRole('link', { name: 'Todos los grupos' }).click();
  await expect(page.locator('.group-workspace')).toHaveCount(0);
  await page.goto(`/teacher#/groups/${other.id}`);
  await expect(identity).toContainText(other.group_name);
  await expect(identity).toContainText(other.university);
  await expect(identity.locator('img')).toHaveCount(0);
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

test('logos institucionales: identidad estable, iniciales y archivo faltante', async ({ page }) => {
  const institutionA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const institutionB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const institutionC = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const universityIds = ['33333333-3333-4333-8333-333333333333', '44444444-4444-4444-8444-444444444444', '55555555-5555-4555-8555-555555555555', '66666666-6666-4666-8666-666666666666'];
  const programIds = ['77777777-7777-4777-8777-777777777777', '88888888-8888-4888-8888-888888888888', '99999999-9999-4999-8999-999999999999', 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'];
  const logoPath = (institutionId, file) => `${userId}/institution-branding/${institutionId}/${file}`;
  const university = 'Universidad Compartida';
  const identityGroups = [
    { ...group, program_id: programIds[0], university, institution_id: institutionA, institution_logo_path: logoPath(institutionA, 'logo-a.png') },
    { ...group, id: 'without-linked-institution', name: 'Medicina · 3B', program_id: programIds[1], university, institution_id: null, institution_logo_path: null },
    { ...group, id: 'other-institution', name: 'Medicina · 3C', program_id: programIds[2], university, institution_id: institutionB, institution_logo_path: logoPath(institutionB, 'logo-b.png') },
    { ...group, id: 'broken-logo', name: 'Medicina · 3D', program_id: programIds[3], university: 'ULM', institution_id: institutionC, institution_logo_path: logoPath(institutionC, 'logo-broken.png') },
  ];
  const workspace = {
    universities: universityIds.map((id, index) => ({ id, teacher_id: userId, name: index === 3 ? 'ULM' : university, institution_id: [institutionA, null, institutionB, institutionC][index] })),
    programs: programIds.map((id, index) => ({ id, teacher_id: userId, university_id: universityIds[index], name: `Medicina ${index + 1}` })),
    memberships: [institutionA, institutionB, institutionC].map((institution_id) => ({ institution_id })),
    institutions: [institutionA, institutionB, institutionC].map((id) => ({ id, name: id === institutionC ? 'ULM' : university })),
  };
  const state = await fixture(page, false, identityGroups, workspace);
  const cards = page.locator('.group-card-v2');
  await expect(cards).toHaveCount(4);
  await expect(cards.nth(0).locator('.group-institution-mark img')).toHaveAttribute('src', new RegExp(`${institutionA}/logo-a\\.png$`));
  await expect(cards.nth(1).locator('.group-institution-mark img')).toHaveCount(0);
  await expect(cards.nth(1).locator('.group-institution-mark > span')).toHaveText('UC');
  await expect(cards.nth(2).locator('.group-institution-mark img')).toHaveAttribute('src', new RegExp(`${institutionB}/logo-b\\.png$`));
  await cards.nth(3).scrollIntoViewIfNeeded();
  await expect(cards.nth(3).locator('.group-institution-mark > span')).toHaveText('ULM');
  await page.getByRole('link', { name: 'Ver todos' }).click();
  const catalogue = page.locator('.group-catalog-card');
  await expect(catalogue).toHaveCount(4);
  await expect(catalogue.nth(0).locator('.group-institution-mark img')).toHaveAttribute('src', new RegExp(`${institutionA}/logo-a\\.png$`));
  await expect(catalogue.nth(1).locator('.group-institution-mark > span')).toHaveText('UC');
  await expect(catalogue.nth(2).locator('.group-institution-mark img')).toHaveAttribute('src', new RegExp(`${institutionB}/logo-b\\.png$`));
  await page.getByRole('button', { name: 'Estructura académica' }).click();
  const linkedUniversities = page.locator('.structure-catalog > article').filter({ has: page.locator('.structure-branding-select') });
  await expect(linkedUniversities).toHaveCount(4);
  await expect(linkedUniversities.nth(0).getByRole('combobox', { name: 'Identidad visual' })).toHaveValue(institutionA);
  await expect(linkedUniversities.nth(1).getByRole('combobox', { name: 'Identidad visual' })).toHaveValue('');
  await expect(linkedUniversities.nth(2).getByRole('combobox', { name: 'Identidad visual' })).toHaveValue(institutionB);
  await noOverflow(page);
  expect(state.errors).toEqual([]);
  expect(state.writes).toEqual([]);
});
