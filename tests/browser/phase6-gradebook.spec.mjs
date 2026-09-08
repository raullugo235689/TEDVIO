import { test, expect } from '@playwright/test';
test.use({ serviceWorkers: 'block' });
const groupId = '22222222-2222-4222-8222-222222222222';
async function fixture(page) {
  const userId = '11111111-1111-4111-8111-111111111111';
  const state = {
    fail: false, writes: 0, categoryWrites: 0, hold: false, release: null,
    categories: [{ id: 'c1', group_id: groupId, name: 'Exámenes', kind: 'manual', weight: 60 }, { id: 'c2', group_id: groupId, name: 'Prácticas', kind: 'manual', weight: 40 }],
    periods: [{ id: 'p1', group_id: groupId, name: 'Primer parcial', status: 'open', starts_on: '2026-09-01', ends_on: '2026-09-30', order_index: 1 }, { id: 'p2', group_id: groupId, name: 'Segundo parcial', status: 'open', starts_on: '2026-10-01', ends_on: '2026-10-31', order_index: 2 }],
    scores: [{ id: 's1', item_id: 'item1', student_id: 'a', score: 7, note: '' }],
  };
  await page.addInitScript(({ userId }) => localStorage.setItem('sb-gradebook-fixture-auth-token', JSON.stringify({ access_token: 'synthetic-access-token', refresh_token: 'synthetic-refresh-token', expires_at: Math.floor(Date.now()/1000)+3600, expires_in: 3600, token_type: 'bearer', user: { id: userId, email: 'teacher@example.test', aud: 'authenticated', role: 'authenticated' } })), { userId });
  await page.route('**/config.js*', route => route.fulfill({ contentType: 'application/javascript', body: 'window.TEDVIO_CONFIG={SUPABASE_URL:"https://gradebook-fixture.supabase.test",SUPABASE_PUBLISHABLE_KEY:"synthetic-publishable-key"};' }));
  await page.route('https://gradebook-fixture.supabase.test/**', async route => {
    const request = route.request(), table = new URL(request.url()).pathname.split('/').at(-1);
    let rows = [];
    if (table === 'tedvio_required_legal_documents_v21') rows = [{ document_key: 'terms', version: 'test', required: true, title: 'Prueba', content_html: '<p>Prueba.</p>' }];
    else if (table === 'tedvio_user_consents') rows = [{ document_key: 'terms', document_version: 'test' }];
    else if (table === 'tedvio_onboarding_snapshot_v21') rows = { completed: true, score: 5, dismissed: true };
    else if (table === 'v2_groups') rows = [{ id: groupId, teacher_id: userId, name: 'Grupo de prueba', is_demo: false }];
    else if (table === 'v2_group_students') rows = ['a', 'b'].map(id => ({ id, group_id: groupId, teacher_id: userId, full_name: `Alumno ${id.toUpperCase()}`, enrollment: id.toUpperCase(), active: true }));
    else if (table === 'v2_academic_periods') rows = state.periods;
    else if (table === 'v2_grade_categories') rows = state.categories;
    else if (table === 'v2_grade_items') rows = [1, 2].map(n => ({ id: `item${n}`, group_id: groupId, category_id: 'c1', title: `Actividad ${n}`, max_score: 10, source_type: 'manual', period_id: `p${n}`, item_date: n === 1 ? '2026-09-08' : '2026-10-08' }));
    else if (table === 'v2_grade_scores') rows = state.scores;
    else if (table === 'v2_teacher_academic_period_summary') rows = { ready: false, issues: [] };
    else if (table === 'v2_gradebook_save_scores') {
      state.writes += 1;
      if (state.fail) { await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Error simulado de guardado' }) }); return; }
      if (state.hold) await new Promise(resolve => { state.release = resolve; });
      const input = request.postDataJSON();
      state.scores = [...state.scores.filter(row => row.item_id !== input.p_item_id), ...input.p_scores.map((row, i) => ({ ...row, id: `saved-${i}`, item_id: input.p_item_id }))];
      rows = { item_id: input.p_item_id, saved: input.p_scores.length, max_score: 10 };
    } else if (table === 'v2_gradebook_save_categories') {
      state.categoryWrites += 1;
      state.categories = request.postDataJSON().p_categories.map((row, i) => ({ ...row, id: row.id || `new-${i}`, group_id: groupId }));
      rows = state.categories;
    }
    if (request.headers().accept?.includes('vnd.pgrst.object+json') && Array.isArray(rows)) rows = rows[0] ?? null;
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(rows) });
  });
  await page.goto(`/teacher#/gradebook/${groupId}?period=p1`);
  await expect(page.getByRole('heading', { name: 'Grupo de prueba' })).toBeVisible();
  return state;
}
const section = (page, name) => page.getByRole('navigation', { name: 'Secciones del Libro' }).getByRole('button', { name, exact: true });
const gradeA = page => page.getByRole('textbox', { name: 'Calificación de Alumno A', exact: true });
const gradeB = page => page.getByRole('textbox', { name: 'Calificación de Alumno B', exact: true });
const period = page => page.locator('.gradebook-context-bar select');
async function openCapture(page) { await section(page, 'Evidencias').click(); await page.getByRole('button', { name: 'Capturar', exact: true }).click(); }

test('libro conserva captura por actividad y confirma guardado tras fallos y navegación', async ({ page, context }) => {
  const state = await fixture(page); await openCapture(page);
  await gradeA(page).fill('11'); await expect(page.getByText('Debe estar entre 0 y 10.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Guardar captura', exact: true })).toBeDisabled();
  await gradeA(page).fill('8,5'); await gradeA(page).press('Enter'); await expect(gradeB(page)).toBeFocused();
  await gradeB(page).fill('0'); await page.getByLabel('Nota de Alumno A').fill('Práctica revisada');
  await period(page).selectOption('p2'); await openCapture(page); await expect(gradeA(page)).toHaveValue('');
  await period(page).selectOption('p1'); await openCapture(page); await expect(gradeA(page)).toHaveValue('8,5'); await expect(gradeB(page)).toHaveValue('0');
  await page.getByRole('button', { name: 'Cerrar captura', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancelar' }).click(); await expect(gradeA(page)).toHaveValue('8,5');
  await page.getByRole('button', { name: 'Cerrar captura', exact: true }).click(); await page.getByRole('dialog').getByRole('button', { name: 'Conservar y cerrar' }).click();
  await page.getByRole('button', { name: 'Capturar', exact: true }).click(); await expect(gradeA(page)).toHaveValue('8,5');
  await context.setOffline(true); await expect(page.getByRole('button', { name: 'Guardar captura', exact: true })).toBeDisabled();
  await context.setOffline(false); state.fail = true;
  await page.getByRole('button', { name: 'Guardar captura', exact: true }).click(); await expect(page.getByText(/Error simulado de guardado/)).toBeVisible(); await expect(gradeA(page)).toHaveValue('8,5');
  state.fail = false; state.hold = true;
  await page.getByRole('button', { name: 'Guardar captura', exact: true }).click();
  await expect.poll(() => state.writes).toBe(2); await expect(gradeA(page)).toBeDisabled(); await expect(period(page)).toBeDisabled();
  state.release(); await expect(page.getByText('Guardado confirmado', { exact: true })).toBeVisible();
  expect(state.scores.find(row => row.student_id === 'a').score).toBe(8.5); expect(state.scores.find(row => row.student_id === 'b').score).toBe(0);
  await expect(gradeA(page)).toHaveValue('8.5'); await expect(page.getByLabel('Nota de Alumno A')).toHaveValue('Práctica revisada');
});

test('ponderaciones conserva borrador, explica validación y detecta cambios remotos', async ({ page }) => {
  const state = await fixture(page); await section(page, 'Ponderaciones').click();
  const first = page.getByLabel('Peso de categoría 1'), second = page.getByLabel('Peso de categoría 2');
  await first.fill('50'); await expect(page.getByText('Falta distribuir 10.0% para completar 100%.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Guardar ponderaciones', exact: true })).toBeDisabled(); await second.fill('50');
  await section(page, 'Libro').click(); await section(page, 'Ponderaciones').click(); await expect(first).toHaveValue('50');
  await page.getByLabel('Nombre de categoría 2').fill('Exámenes'); await expect(page.getByText('Los nombres de las categorías deben ser diferentes.')).toBeVisible();
  await page.getByLabel('Nombre de categoría 2').fill('Prácticas');
  state.categories[0].name = 'Examen actualizado'; await page.getByRole('button', { name: 'Guardar ponderaciones', exact: true }).click();
  await expect(page.getByText('La información guardada cambió', { exact: true })).toBeVisible(); expect(state.categoryWrites).toBe(0);
  await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click(); await expect(page.getByRole('dialog', { name: '¿Salir con calificaciones pendientes?' })).toBeVisible(); await page.getByRole('dialog').getByRole('button', { name: 'Cancelar' }).click();
  await page.getByRole('button', { name: 'Descartar cambios', exact: true }).click(); await page.getByRole('dialog').getByRole('button', { name: 'Cancelar' }).click(); await expect(first).toHaveValue('50');
  await page.getByRole('button', { name: 'Descartar cambios', exact: true }).click(); await page.getByRole('dialog').getByRole('button', { name: 'Descartar cambios', exact: true }).click(); await expect(first).toHaveValue('60');
  await first.fill('50'); await second.fill('50'); await page.getByRole('button', { name: 'Guardar ponderaciones', exact: true }).click(); await expect(page.getByText('Guardado confirmado', { exact: true })).toBeVisible(); expect(state.categoryWrites).toBe(1);
});

test('un cierre remoto bloquea la escritura y conserva la captura pendiente', async ({ page }) => {
  const state = await fixture(page); await openCapture(page); await gradeA(page).fill('9');
  state.periods[0].status = 'closed'; await page.getByRole('button', { name: 'Guardar captura', exact: true }).click();
  await expect(gradeA(page)).toBeDisabled(); await expect(gradeA(page)).toHaveValue('9'); expect(state.writes).toBe(0);
  expect(await page.evaluate(() => { const event = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented; })).toBe(true);
  await page.getByRole('button', { name: 'Descartar cambios', exact: true }).click(); await page.getByRole('dialog').getByRole('button', { name: 'Descartar cambios', exact: true }).click(); await expect(gradeA(page)).toHaveValue('7');
  expect(await page.evaluate(() => { const event = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented; })).toBe(false);
});
