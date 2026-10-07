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
    else if (table === 'v2_universities') {
      rows = workspace.universities || [];
      const selectedId = url.searchParams.get('id')?.replace(/^eq\./, '');
      if (selectedId) rows = rows.filter(item => item.id === selectedId);
    }
    else if (table === 'v2_group_schedule_slots') rows = (workspace.schedule || []).filter(item => item.active !== false);
    else if (table === 'v2_schedule_exceptions') rows = workspace.exceptions || [];
    else if (table === 'v2_save_schedule' && workspace.saveSchedule) {
      state.writes.push(request.postDataJSON());
      return workspace.saveSchedule(route, request.postDataJSON());
    }
    else if (table === 'v2_programs') rows = workspace.programs || [];
    else if (table === 'tedvio_institution_memberships') rows = workspace.memberships || [];
    else if (table === 'tedvio_institutions') rows = workspace.institutions || [];
    else if (table === 'v2_group_students') rows = workspace.students || [{ id: 'student-a', teacher_id: userId, group_id: groupId, enrollment: 'A001', full_name: 'Alumna de prueba', active: true }];
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
  await expect(page.locator('.user-chip')).toHaveAttribute('aria-label', `Perfil de ${updatedName}`);
  await expect(page.locator('.user-chip > span')).toHaveText('AJ');
  await expect(nameInput).toHaveValue(updatedName);
  await page.goto('/teacher#/');
  await expect(page.locator('.dashboard-teacher-name')).toHaveText(updatedName);
  await page.setViewportSize({ width: 320, height: 800 });
  await noOverflow(page);
  expect(state.errors).toEqual([]);
});

test('Mis grupos: orden académico natural, filtros compartidos y búsqueda sin acentos', async ({ page }) => {
  const firstUniversity = 'Universidad Álamo', secondUniversity = 'Universidad de Los Mochis';
  const make = (id, name, subject, university) => ({ ...group, id, name, group_name: name, subject, university });
  const groups = [
    make('z-c', '1-C', 'Anatomía', secondUniversity),
    make('a-ten', '1-10', 'Anatomía', firstUniversity),
    make('unassigned', '10', 'Anatomía', null),
    make('z-pharm', '2-02', 'Farmacología', secondUniversity),
    make('a-prop', '3-08', 'Propedéutica', firstUniversity),
    make('a-two', '1-02', 'Anatomía', firstUniversity),
    make('z-b', '1-B', 'Anatomía', secondUniversity),
  ];
  const state = await fixture(page, false, groups);
  const ids = locator => locator.evaluateAll(cards => cards.map(card => card.dataset.groupId));
  await expect.poll(() => ids(page.locator('.group-card-v2'))).toEqual(['a-two', 'a-ten', 'a-prop', 'z-b']);
  await expect(page.getByText('Mostrando los primeros 4 de 7 grupos.', { exact: false })).toBeVisible();
  await page.getByLabel('Universidad', { exact: true }).selectOption(secondUniversity);
  await page.getByLabel('Materia', { exact: true }).selectOption('Anatomía');
  await expect.poll(() => ids(page.locator('.group-card-v2'))).toEqual(['z-b', 'z-c']);
  await page.getByRole('searchbox', { name: 'Buscar grupos' }).fill('1-c');
  await page.getByRole('link', { name: 'Ver todos', exact: true }).click();
  await expect.poll(() => ids(page.locator('.group-catalog-card'))).toEqual(['z-c']);
  await page.reload();
  await expect(page.getByLabel('Universidad', { exact: true })).toHaveValue(secondUniversity);
  await expect(page.getByLabel('Materia', { exact: true })).toHaveValue('Anatomía');
  await expect(page.getByRole('searchbox', { name: 'Buscar grupos' })).toHaveValue('1-c');
  await page.getByRole('button', { name: 'Limpiar filtros', exact: true }).click();
  await expect.poll(() => ids(page.locator('.group-catalog-card'))).toEqual(['a-two', 'a-ten', 'a-prop', 'z-b', 'z-c', 'z-pharm', 'unassigned']);
  await expect(page.locator('.catalog-university-heading h3')).toHaveText([firstUniversity, secondUniversity, 'Institución sin asignar']);
  await page.getByRole('searchbox', { name: 'Buscar grupos' }).fill('anatomia');
  await expect(page.locator('.group-catalog-card')).toHaveCount(5);
  await page.getByRole('searchbox', { name: 'Buscar grupos' }).fill('grupo inexistente');
  await expect(page.getByRole('heading', { name: 'No encontramos coincidencias' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Crear grupo', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Ver todos los grupos', exact: true }).click();
  await page.getByLabel('Universidad', { exact: true }).selectOption(secondUniversity);
  await page.getByLabel('Materia', { exact: true }).selectOption('Farmacología');
  await page.getByLabel('Universidad', { exact: true }).selectOption(firstUniversity);
  await expect(page.getByLabel('Materia', { exact: true })).toHaveValue('');
  await expect(page.locator('.group-catalog-card')).toHaveCount(3);
  await page.getByRole('button', { name: 'Limpiar filtros', exact: true }).click();
  for (const width of [320, 390, 768, 1440]) { await page.setViewportSize({ width, height: 900 }); await noOverflow(page); }
  await page.screenshot({ path: test.info().outputPath('groups-organized-desktop.png'), fullPage: true });
  await page.getByRole('button', { name: 'Activar modo oscuro' }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await noOverflow(page);
  await page.screenshot({ path: test.info().outputPath('groups-organized-mobile-dark.png'), fullPage: true });
  expect(state.errors).toEqual([]);
  expect(state.writes).toEqual([]);
});

test.describe('agenda por grupo', () => {
  test.use({ timezoneId: 'America/Mazatlan' });

  test('colores e institución se conservan y la clase en curso cambia con la hora local', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-09-25T10:15:00-07:00') });
    const first = { ...group, institution_logo_path: `${userId}/institution-branding/university/logo-a.png` };
    const second = { ...group, id: 'other-group', name: 'Medicina · 3B', group_name: 'Medicina · 3B', subject: 'Anatomía' };
    const schedule = [
      { id: 'monday-a', group_id: groupId, weekday: 1, start_time: '10:00:00', end_time: '11:00:00', active: true, room: 'Aula 1', modality: 'Presencial' },
      { id: 'friday-a', group_id: groupId, weekday: 5, start_time: '10:00:00', end_time: '11:00:00', active: true, room: 'Aula 1', modality: 'Presencial' },
      { id: 'friday-b', group_id: second.id, weekday: 5, start_time: '11:00:00', end_time: '12:00:00', active: true, room: 'Anfiteatro', modality: 'Presencial' },
      { id: 'inactive', group_id: second.id, weekday: 5, start_time: '09:00:00', end_time: '13:00:00', active: false },
    ];
    const state = await fixture(page, false, [first, second], { schedule });
    const color = await page.locator(`.group-card-v2[data-group-id="${groupId}"]`).getAttribute('data-group-color');
    await page.goto('/teacher#/agenda');
    await page.getByRole('button', { name: 'Lista', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Tu semana', exact: true })).toBeVisible();
    const firstSlots = page.locator('.schedule-slot').filter({ hasText: group.name });
    await expect(firstSlots).toHaveCount(2);
    for (const slot of await firstSlots.all()) {
      await expect(slot).toHaveAttribute('data-group-color', color);
      await expect(slot.locator('.group-institution img')).toHaveAttribute('src', /logo-a\.png$/);
    }
    await expect(page.locator('.schedule-slot')).toHaveCount(3);
    await expect(page.locator('.schedule-day.is-today')).toHaveAttribute('aria-label', 'Viernes');
    await expect(page.locator('.schedule-slot.is-current')).toContainText(group.name);
    await expect(page.locator('.agenda-page-focus').first()).toHaveAttribute('data-group-color', color);
    await expect(page.getByRole('navigation', { name: 'Grupos en tu agenda' }).getByRole('link')).toHaveCount(2);
    await noOverflow(page);
    await page.screenshot({ path: test.info().outputPath('agenda-group-colors.png'), fullPage: true });
    await page.clock.fastForward(46 * 60 * 1000);
    await expect(page.locator('.schedule-slot.is-current')).toHaveCount(1);
    await expect(page.locator('.schedule-slot.is-current')).toContainText(second.name);
    await expect(page.locator('.agenda-page-focus').first()).toContainText(second.name);
    await page.getByRole('button', { name: 'Activar modo oscuro' }).click();
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await noOverflow(page);
    }
    await page.screenshot({ path: test.info().outputPath('agenda-group-colors-dark.png'), fullPage: true });
    await page.locator('.schedule-slot.is-current').getByRole('link', { name: 'Asistencia', exact: true }).click();
    await expect(page).toHaveURL(/#\/attendance\/other-group$/);
    expect(state.errors).toEqual([]);
    expect(state.writes).toEqual([]);
  });
});

test.describe('agenda en cuadrícula', () => {
  test.use({ timezoneId: 'America/Mazatlan' });

  test('semana por horas, duración proporcional, detalle y selección de día en celular', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-10-14T10:20:00-07:00') });
    const subjects = ['Farmacología', 'Farmacocinética', 'Anatomía Humana', 'Embriología'];
    const groups = Array.from({ length: 8 }, (_, index) => ({ ...group, id: `timetable-${index}`, name: `Medicina · ${index + 1}A`, group_name: `Medicina · ${index + 1}A`, subject: subjects[index % 4] }));
    const times = [[1,'09:00','10:00'],[2,'07:00','08:00'],[3,'10:00','11:00'],[3,'11:00','12:00'],[1,'12:00','13:00'],[4,'12:00','13:00'],[2,'13:00','14:00'],[4,'13:00','15:00']];
    const schedule = times.map(([weekday,start_time,end_time], index) => ({ id: `slot-${index}`, group_id: groups[index].id, weekday, start_time, end_time, active: true, room: `Aula B-${index + 1}`, modality: 'Presencial' }));
    const state = await fixture(page, false, groups, { schedule });
    await page.goto('/teacher#/agenda');
    await expect(page.getByRole('button', { name: 'Horario', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.timetable-event')).toHaveCount(8);
    await expect(page.locator('.timetable-day')).toHaveCount(5);
    await expect(page.locator('.timetable-event.is-current')).toContainText('Anatomía Humana');
    await expect(page.locator('.timetable-now')).toHaveAttribute('aria-label', 'Hora actual: 10:20');
    const event = index => page.locator(`.timetable-event[data-occurrence^="slot-${index}:"]`);
    const firstColor = await event(0).getAttribute('data-group-color');
    await expect(page.getByRole('navigation', { name: 'Grupos en tu agenda' }).getByRole('link').filter({ hasText: 'Medicina · 1A' })).toHaveAttribute('data-group-color', firstColor);
    // The same time aligns across columns, and two hours occupy twice the timeline.
    expect(await event(4).evaluate(node => node.style.top)).toBe(await event(5).evaluate(node => node.style.top));
    const oneHour = await event(5).evaluate(node => parseFloat(node.style.height));
    const twoHours = await event(7).evaluate(node => parseFloat(node.style.height));
    expect(twoHours + 8).toBe(2 * (oneHour + 8));
    await page.setViewportSize({ width: 1440, height: 1100 });
    await noOverflow(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: test.info().outputPath('agenda-timetable-desktop.png'), fullPage: true });
    await event(5).click();
    let detail = page.getByRole('dialog', { name: 'Farmacocinética', exact: true });
    await expect(detail).toContainText('Medicina · 6A');
    await expect(detail.getByRole('link', { name: 'Asistencia', exact: true })).toHaveAttribute('href', '#/attendance/timetable-5?date=2026-10-15');
    await detail.getByRole('button', { name: 'Editar clase', exact: true }).click();
    const editor = page.getByRole('dialog', { name: 'Editar clase', exact: true });
    await expect(editor.getByLabel('Nueva fecha')).toHaveValue('2026-10-15');
    await expect(editor.getByLabel('Hora de entrada')).toHaveValue('12:00');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.getByRole('button', { name: 'Activar modo oscuro' }).click();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: test.info().outputPath('agenda-timetable-desktop-dark.png'), fullPage: true });
    for (const width of [320, 390, 768, 1440]) { await page.setViewportSize({ width, height: 900 }); await noOverflow(page); }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('group', { name: 'Día del horario', exact: true }).getByRole('button').nth(3).click();
    await expect(page.locator('.timetable-day:visible')).toHaveCount(1);
    await expect(page.locator('.timetable-day:visible time')).toHaveAttribute('datetime', '2026-10-15');
    await expect.poll(() => page.locator('.timetable-scroll').evaluate(node => node.scrollTop)).toBeGreaterThan(400);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: test.info().outputPath('agenda-timetable-mobile-dark.png'), fullPage: true });
    await event(5).click();
    detail = page.getByRole('dialog', { name: 'Farmacocinética', exact: true });
    await expect(detail).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(event(5)).toBeFocused();
    await page.getByRole('button', { name: 'Ver hoy', exact: true }).click();
    await expect(page.locator('.timetable-day time')).toHaveAttribute('datetime', '2026-10-14');
    await expect(page.locator('.timetable-event')).toHaveCount(2);
    await page.getByRole('button', { name: 'Semana siguiente', exact: true }).click();
    await expect(page.locator('.timetable-day.is-selected time')).toHaveAttribute('datetime', '2026-10-19');
    expect(state.errors).toEqual([]); expect(state.writes).toEqual([]);
  });

  test('empalmes visibles, fin de semana y clases suspendidas o movidas conservan su fecha', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-10-12T07:00:00-07:00') });
    const schedule = [
      { id: 'long', group_id: groupId, weekday: 1, start_time: '08:00', end_time: '10:00' },
      { id: 'short', group_id: groupId, weekday: 1, start_time: '08:15', end_time: '08:30' },
      { id: 'cancelled', group_id: groupId, weekday: 6, start_time: '09:00', end_time: '10:00' },
      { id: 'moved', group_id: groupId, weekday: 5, start_time: '09:00', end_time: '10:00' },
    ];
    const exceptions = [
      { slot_id: 'cancelled', original_date: '2026-10-17', status: 'cancelled', note: 'Suspensión por lluvia' },
      { slot_id: 'moved', original_date: '2026-10-16', status: 'moved', class_date: '2026-10-18', start_time: '10:00', end_time: '11:00', room: 'Aula domingo' },
    ];
    const state = await fixture(page, false, [group], { schedule, exceptions });
    await page.goto('/teacher#/agenda');
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(page.locator('.timetable-day')).toHaveCount(7);
    await expect(page.locator('.timetable-event')).toHaveCount(4);
    const long = await page.locator('[data-occurrence^="long:"]').boundingBox();
    const short = await page.locator('[data-occurrence^="short:"]').boundingBox();
    expect(long.x + long.width).toBeLessThanOrEqual(short.x);
    expect(short.height).toBeGreaterThanOrEqual(44);
    await page.locator('[data-occurrence^="cancelled:"]').click();
    let detail = page.getByRole('dialog');
    await expect(detail).toContainText('Clase suspendida');
    await expect(detail).toContainText('Suspensión por lluvia');
    await expect(detail.getByRole('link', { name: 'Asistencia', exact: true })).toHaveCount(0);
    await detail.getByRole('button', { name: 'Restaurar o editar' }).click();
    await expect(page.getByRole('dialog', { name: 'Editar clase' }).getByRole('button', { name: 'Restaurar clase', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await page.locator('[data-occurrence^="moved:"]').click();
    detail = page.getByRole('dialog');
    await expect(detail).toContainText('Reprogramada');
    await expect(detail).toContainText('Aula domingo');
    await expect(detail.getByRole('link', { name: 'Asistencia', exact: true })).toHaveAttribute('href', `#/attendance/${groupId}?date=2026-10-18`);
    await page.keyboard.press('Escape');
    await page.getByLabel('Ir a una fecha').fill('2026-11-02');
    await page.getByRole('button', { name: 'Añadir clase:', exact: false }).first().click();
    await expect(page.getByRole('dialog', { name: 'Programar clase' }).getByLabel('Primera clase')).toHaveValue('2026-11-03');
    await page.keyboard.press('Escape');
    expect(state.errors).toEqual([]); expect(state.writes).toEqual([]);
  });
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
  await page.locator(`.group-card-v2[data-group-id="${groupId}"]`).getByRole('link', { name: 'Abrir grupo' }).click();
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
  const color = await page.locator(`.group-card-v2[data-group-id="${groupId}"]`).getAttribute('data-group-color');
  await page.locator(`.group-card-v2[data-group-id="${groupId}"]`).getByRole('link', { name: 'Abrir grupo' }).click();
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
  await expect(cards.filter({ has: page.locator(`a[href="#/groups/${groupId}"]`) }).locator('.group-institution-mark img')).toHaveAttribute('src', new RegExp(`${institutionA}/logo-a\\.png$`));
  await expect(cards.filter({ has: page.locator(`a[href="#/groups/${'without-linked-institution'}"]`) }).locator('.group-institution-mark img')).toHaveCount(0);
  await expect(cards.filter({ has: page.locator(`a[href="#/groups/${'without-linked-institution'}"]`) }).locator('.group-institution-mark > span')).toHaveText('UC');
  await expect(cards.filter({ has: page.locator(`a[href="#/groups/${'other-institution'}"]`) }).locator('.group-institution-mark img')).toHaveAttribute('src', new RegExp(`${institutionB}/logo-b\\.png$`));
  await cards.filter({ has: page.locator(`a[href="#/groups/${'broken-logo'}"]`) }).scrollIntoViewIfNeeded();
  await expect(cards.filter({ has: page.locator(`a[href="#/groups/${'broken-logo'}"]`) }).locator('.group-institution-mark > span')).toHaveText('ULM');
  await page.getByRole('link', { name: 'Ver todos' }).click();
  const catalogue = page.locator('.group-catalog-card');
  await expect(catalogue).toHaveCount(4);
  await expect(catalogue.filter({ has: page.locator(`a[href="#/groups/${groupId}"]`) }).locator('.group-institution-mark img')).toHaveAttribute('src', new RegExp(`${institutionA}/logo-a\\.png$`));
  await expect(catalogue.filter({ has: page.locator(`a[href="#/groups/${'without-linked-institution'}"]`) }).locator('.group-institution-mark > span')).toHaveText('UC');
  await expect(catalogue.filter({ has: page.locator(`a[href="#/groups/${'other-institution'}"]`) }).locator('.group-institution-mark img')).toHaveAttribute('src', new RegExp(`${institutionB}/logo-b\\.png$`));
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

test('reportes premium: identidad vinculada, búsqueda, documento completo e impresión', async ({ page, browserName }) => {
  const profileName = 'Dr. Raúl Daniel Ascencio Lugo';
  const institutionId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const otherInstitutionId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const universityId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const programId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  const path = `${userId}/institution-branding/${institutionId}/logo-a.png`;
  const branded = { ...group, program_id: programId, institution_id: institutionId, institution_logo_path: path };
  const students = Array.from({ length: 95 }, (_, i) => ({ id: `student-${i}`, teacher_id: userId, group_id: groupId, enrollment: `A${String(i + 1).padStart(3, '0')}`, full_name: `Alumno de prueba ${String(i + 1).padStart(3, '0')}`, active: true }));
  const state = await fixture(page, false, [branded], {
    profileName, groups: [branded], students,
    universities: [{ id: universityId, name: 'Institución de prueba', institution_id: institutionId }],
    programs: [{ id: programId, name: 'Medicina', university_id: universityId }],
    memberships: [{ institution_id: otherInstitutionId }, { institution_id: institutionId }],
    institutions: [
      { id: otherInstitutionId, name: 'Institución de prueba', report_display_name: 'IDENTIDAD INCORRECTA', report_logo_path: `${otherInstitutionId}/wrong-logo.png` },
      { id: institutionId, name: 'Institución de prueba', report_display_name: 'Universidad del grupo', report_logo_path: path },
    ],
  });
  const color = await page.locator(`.group-card-v2[data-group-id="${groupId}"]`).getAttribute('data-group-color');
  await page.goto('/teacher#/reports');
  await expect(page.getByRole('heading', { name: 'Centro de reportes', exact: true })).toBeVisible();
  await expect(page.locator('.report-group-card')).toHaveAttribute('data-group-color', color);
  await expect(page.locator('.report-group-card img')).toHaveAttribute('src', /logo-a\.png$/);
  await expect(page.locator('.reports-teacher')).toHaveText(profileName);
  await expect(page.locator('main')).not.toContainText('FASE 5');
  await page.getByRole('searchbox', { name: 'Buscar grupo o asignatura' }).fill('sin coincidencias');
  await expect(page.getByRole('heading', { name: 'No encontramos ese grupo' })).toBeVisible();
  await page.getByRole('button', { name: 'Mostrar todos' }).click();
  await noOverflow(page);
  await page.screenshot({ path: test.info().outputPath('report-center-premium.png'), fullPage: true });
  await page.locator('.report-group-card').getByRole('link', { name: 'Abrir reportes' }).click();
  await page.getByRole('button', { name: /Lista de alumnos/ }).click();
  await expect(page.locator('.report-paper-context')).toContainText(profileName);
  await expect(page.locator('.report-paper')).toContainText('Universidad del grupo');
  await expect(page.locator('.report-paper')).not.toContainText('IDENTIDAD INCORRECTA');
  await expect(page.locator('.report-paper img')).toHaveAttribute('src', /logo-a\.png$/);
  await expect(page.locator('.report-table tbody tr')).toHaveCount(40);
  await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
  await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
  await expect(page.locator('.report-table tbody tr')).toHaveCount(15);
  await expect(page.locator('.report-table')).toContainText('Alumno de prueba 095');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Exportar CSV', exact: true }).click()]);
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const csv = Buffer.concat(chunks).toString('utf8');
  expect(csv).toContain(profileName);
  expect(csv).toContain('Alumno de prueba 001');
  expect(csv).toContain('Alumno de prueba 095');
  await page.getByRole('button', { name: /Resumen académico/ }).click();
  await expect(page.locator('.report-table tbody tr')).toHaveCount(40);
  await noOverflow(page);
  await page.screenshot({ path: test.info().outputPath('report-document-premium.png'), fullPage: true });
  await page.getByRole('button', { name: 'Activar modo oscuro' }).click();
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await noOverflow(page);
  }
  await page.screenshot({ path: test.info().outputPath('report-document-dark.png'), fullPage: true });
  await page.getByRole('button', { name: /Lista de alumnos/ }).click();
  await page.evaluate(() => {
    const original = window.open.bind(window);
    window.open = (...args) => { const child = original(...args); if (child) child.print = () => {}; return child; };
  });
  const [popup] = await Promise.all([page.waitForEvent('popup'), page.getByRole('button', { name: 'Imprimir / PDF', exact: true }).click()]);
  await expect(popup.locator('tbody tr')).toHaveCount(95);
  await expect(popup.locator('.document-context')).toContainText(profileName);
  await expect(popup.locator('.document-head img')).toHaveAttribute('src', /logo-a\.png$/);
  expect(await popup.evaluate(() => window.opener === null)).toBe(true);
  await expect(page.getByRole('alert')).toHaveCount(0);
  if (browserName === 'chromium') {
    await popup.pdf({ path: test.info().outputPath('report-roster-95.pdf'), preferCSSPageSize: true, printBackground: true });
  }
  await popup.close();
  expect(state.errors).toEqual([]);
  expect(state.writes).toEqual([]);
});

test('reportes: una universidad sin vínculo no hereda logo ni firma de otra institución', async ({ page }) => {
  const state = await fixture(page, false, null, {
    memberships: [{ institution_id: 'another-institution' }],
    institutions: [{ id: 'another-institution', name: group.university, report_display_name: 'Institución ajena', report_logo_path: 'another/logo.png', report_approver_name: 'Firma ajena' }],
  });
  await page.goto(`/teacher#/reports/${groupId}`);
  await expect(page.locator('.report-paper')).toBeVisible();
  await expect(page.locator('.report-paper')).not.toContainText('Institución ajena');
  await expect(page.locator('.report-paper')).not.toContainText('Firma ajena');
  await expect(page.locator('.report-paper img')).toHaveCount(0);
  await page.evaluate(() => { window.open = () => null; });
  await page.getByRole('button', { name: 'Imprimir / PDF', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Permite ventanas emergentes');
  expect(state.errors).toEqual([]);
  expect(state.writes).toEqual([]);
});

test.describe('editor de agenda', () => {
  test.use({ timezoneId: 'America/Mazatlan' });
  const scheduleId = '33333333-3333-4333-8333-333333333333';
  const baseSlot = () => ({ id: scheduleId, group_id: groupId, weekday: 1, start_time: '08:00:00', end_time: '09:00:00', room: 'Aula original', modality: 'Presencial', active: true, starts_on: '2026-10-05', ends_on: '2026-10-26', recurrence: 'weekly', revision: 1 });
  async function clock(page) { await page.clock.install({ time: new Date('2026-10-05T07:30:00-07:00') }); }

  test('crea una serie, mueve solo una fecha, suspende y restaura desde el calendario', async ({ page }) => {
    await clock(page);
    const workspace = { schedule: [], exceptions: [] };
    let step = 0;
    workspace.saveSchedule = async (route, request) => {
      const p = request.p_payload; step++;
      if (step === 1) {
        expect(p.slot_id).toBeNull(); expect(p.class_date).toBe('2026-10-05'); expect(p.end_date).toBe('2026-10-26'); expect(p.recurrence).toBe('weekly');
        workspace.schedule.push(baseSlot());
      } else if (step === 2) {
        expect(p.scope).toBe('one'); expect(p.original_date).toBe('2026-10-12'); expect(p.class_date).toBe('2026-10-13');
        workspace.exceptions = [{ slot_id: scheduleId, original_date: '2026-10-12', status: 'moved', class_date: p.class_date, start_time: p.start_time, end_time: p.end_time, room: p.room, modality: p.modality }]; workspace.schedule[0].revision++;
      } else if (step === 3) {
        expect(p.action).toBe('suspend'); expect(p.scope).toBe('one');
        workspace.exceptions[0] = { ...workspace.exceptions[0], status: 'cancelled', class_date: null, note: p.note }; workspace.schedule[0].revision++;
      } else {
        expect(p.action).toBe('restore'); workspace.exceptions = []; workspace.schedule[0].revision++;
      }
      return route.fulfill({ json: { saved: true, slot_id: scheduleId } });
    };
    const state = await fixture(page, false, [group], workspace);
    await page.goto('/teacher#/agenda');
    await page.getByRole('button', { name: 'Lista', exact: true }).click();
    await page.getByRole('button', { name: 'Programar clase', exact: true }).click();
    const editor = page.getByRole('dialog', { name: 'Programar clase' });
    await editor.getByLabel('Repetir hasta').fill('2026-10-26');
    await editor.getByLabel('Aula o ubicación').fill('Aula original');
    await expect(editor.getByLabel('Primera clase')).toHaveValue('2026-10-05');
    await page.screenshot({ path: test.info().outputPath('agenda-create-editor.png') });
    await editor.getByRole('button', { name: 'Guardar clase', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator('.schedule-slot')).toHaveCount(1);
    await page.getByRole('button', { name: 'Semana siguiente', exact: true }).click();
    await page.locator('.schedule-slot').getByRole('button', { name: 'Editar clase' }).click();
    const edit = page.getByRole('dialog', { name: 'Editar clase' });
    await edit.getByLabel('Nueva fecha').fill('2026-10-13');
    await edit.getByLabel('Hora de entrada').fill('11:00'); await edit.getByLabel('Hora de salida').fill('12:00');
    await edit.getByLabel('Aula o ubicación').fill('Laboratorio de simulación');
    await edit.getByRole('button', { name: 'Guardar clase', exact: true }).click();
    await expect(page.locator('.schedule-slot')).toContainText('Reprogramada');
    await expect(page.locator('.schedule-day')).toHaveAttribute('aria-label', 'Martes');
    await expect(page.locator('.schedule-slot')).toContainText('Laboratorio de simulación');
    await page.locator('.schedule-slot').getByRole('button', { name: 'Editar clase' }).click();
    await edit.getByLabel('¿Qué quieres hacer?').selectOption('suspend');
    await edit.getByLabel('Nota opcional').fill('Suspensión por lluvia');
    await edit.getByRole('button', { name: 'Confirmar suspensión' }).click();
    await expect(page.locator('.schedule-slot')).toContainText('Suspendida');
    await expect(page.locator('.schedule-slot')).toContainText('Suspensión por lluvia');
    await page.locator('.schedule-slot').getByRole('button', { name: 'Restaurar o editar' }).click();
    await edit.getByRole('button', { name: 'Restaurar clase', exact: true }).click();
    await expect(page.locator('.schedule-slot')).not.toContainText('Suspendida');
    await expect(page.locator('.schedule-slot')).toContainText('Aula original');
    await page.getByRole('button', { name: 'Semana siguiente', exact: true }).click();
    await expect(page.locator('.schedule-slot')).toContainText('08:00');
    await expect(page.locator('.schedule-slot').getByRole('link', { name: 'Asistencia', exact: true })).toHaveAttribute('href', new RegExp(`#/attendance/${groupId}\\?date=2026-10-19$`));
    await page.screenshot({ path: test.info().outputPath('agenda-edited-week.png'), fullPage: true });
    await page.locator('.schedule-slot').getByRole('link', { name: 'Modo Clase', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`#/classroom\\?group=${groupId}$`));
    expect(step).toBe(4); expect(state.errors).toEqual([]);
  });

  test('empalmes, pérdida de conexión y reintento conservan borrador sin duplicar', async ({ page, context }) => {
    await clock(page);
    const workspace = { schedule: [baseSlot()], exceptions: [] };
    const calls = [];
    workspace.saveSchedule = async (route, request) => {
      calls.push(request);
      if (calls.length === 1) return route.fulfill({ status: 503, json: { message: 'No se pudo confirmar la respuesta. Reintenta.' } });
      expect(request.p_request_id).toBe(calls[0].p_request_id);
      expect(request.p_payload).toEqual(calls[0].p_payload);
      workspace.schedule.push({ ...baseSlot(), id: 'new-class', recurrence: 'once', ends_on: '2026-10-05', start_time: '08:30:00', end_time: '09:30:00', room: 'Sala guardada' });
      return route.fulfill({ json: { saved: true, slot_id: 'new-class' } });
    };
    const state = await fixture(page, false, [group], workspace);
    await page.goto('/teacher#/agenda');
    await page.getByRole('button', { name: 'Lista', exact: true }).click();
    await page.getByRole('button', { name: 'Programar clase', exact: true }).click();
    const edit = page.getByRole('dialog');
    await edit.getByRole('combobox', { name: /Repetición/ }).selectOption('once');
    await edit.getByLabel('Hora de entrada').fill('08:30'); await edit.getByLabel('Hora de salida').fill('09:30');
    await edit.getByLabel('Aula o ubicación').fill('Sala guardada');
    await expect(edit.getByRole('region', { name: 'Empalmes detectados' })).toContainText('Fisiología');
    await edit.getByRole('button', { name: 'Guardar clase', exact: true }).click();
    expect(calls).toHaveLength(0);
    await edit.getByRole('checkbox').check();
    await context.setOffline(true);
    await edit.getByRole('button', { name: 'Guardar clase', exact: true }).click();
    await expect(edit.getByRole('alert')).toContainText('Sin conexión'); expect(calls).toHaveLength(0);
    await context.setOffline(false);
    await edit.getByRole('button', { name: 'Guardar clase', exact: true }).click();
    await expect(edit.getByRole('alert')).toContainText('Reintenta');
    await expect(edit.getByLabel('Aula o ubicación')).toHaveValue('Sala guardada');
    await page.screenshot({ path: test.info().outputPath('agenda-conflict-editor.png') });
    await edit.getByRole('button', { name: 'Guardar clase', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0); await expect(page.locator('.schedule-slot')).toHaveCount(2);
    expect(calls).toHaveLength(2); expect(state.errors).toEqual([]);
  });

  test('serie futura, borrador al navegar, revisión remota y editor móvil accesible', async ({ page }) => {
    await clock(page);
    const workspace = { schedule: [baseSlot()], exceptions: [] };
    workspace.saveSchedule = async (route, request) => {
      expect(request.p_payload.scope).toBe('future'); expect(request.p_payload.original_date).toBe('2026-10-05'); expect(request.p_payload.revision).toBe(1);
      workspace.schedule[0].revision = 2; workspace.schedule[0].room = 'Cambio desde otro dispositivo';
      return route.fulfill({ status: 409, json: { code: '40001', message: 'El horario cambió en otro dispositivo. Actualiza la agenda y vuelve a abrir la clase.' } });
    };
    const state = await fixture(page, false, [group], workspace);
    await page.goto('/teacher#/agenda');
    await page.getByRole('button', { name: 'Lista', exact: true }).click();
    await page.locator('.schedule-slot').getByRole('button', { name: 'Editar clase' }).click();
    let edit = page.getByRole('dialog');
    await edit.getByLabel('Aplicar a').selectOption('future');
    await edit.getByLabel('Aula o ubicación').fill('Borrador conservado');
    await page.evaluate(() => { window.location.hash = '#/groups'; });
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.goto('/teacher#/agenda');
    await page.getByRole('button', { name: 'Lista', exact: true }).click();
    await page.locator('.schedule-slot').getByRole('button', { name: 'Editar clase' }).click();
    edit = page.getByRole('dialog');
    await expect(edit.getByLabel('Aula o ubicación')).toHaveValue('Borrador conservado');
    await expect(edit.getByLabel('Aplicar a')).toHaveValue('future');
    for (const width of [320, 390, 768, 1440]) { await page.setViewportSize({ width, height: 900 }); const size = await edit.evaluate(e => ({ width: e.scrollWidth, client: e.clientWidth })); expect(size.width).toBeLessThanOrEqual(size.client + 1); }
    await edit.getByRole('button', { name: 'Guardar clase', exact: true }).click();
    await expect(edit.getByRole('alert')).toContainText('otro dispositivo');
    await expect(edit.getByRole('button', { name: 'Guardar clase', exact: true })).toBeDisabled();
    await edit.getByRole('button', { name: 'Descartar borrador y actualizar' }).click();
    await expect(page.locator('.schedule-slot')).toContainText('Cambio desde otro dispositivo');
    await page.getByRole('button', { name: 'Activar modo oscuro' }).click();
    await page.locator('.schedule-slot').getByRole('button', { name: 'Editar clase' }).click();
    await page.screenshot({ path: test.info().outputPath('agenda-editor-dark.png') });
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(state.errors).toEqual([]);
  });
});
