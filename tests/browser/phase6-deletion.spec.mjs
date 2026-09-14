import { test, expect } from '@playwright/test';
test.use({ serviceWorkers: 'block' });
const userId = '11111111-1111-4111-8111-111111111111';
const ids = { question: '22222222-2222-4222-8222-222222222222', group: '33333333-3333-4333-8333-333333333333', session: '44444444-4444-4444-8444-444444444444', program: '55555555-5555-4555-8555-555555555555', university: '66666666-6666-4666-8666-666666666666' };
const labels = { question: 'Pregunta de prueba', group: 'Grupo de prueba', session: 'Sesión de prueba', program: 'Programa de prueba', university: 'Institución de prueba' };
async function fixture(page, section = 'bank') {
  const state = { removed: new Set(), writes: [], previews: 0, blockers: [], fail: false, unavailable: false, invalid: false, hold: false, release: null, hierarchy: false, errors: [] };
  page.on('pageerror', error => state.errors.push(error.message));
  await page.addInitScript(({ userId }) => localStorage.setItem('sb-deletion-fixture-auth-token', JSON.stringify({ access_token: 'synthetic-access-token', refresh_token: 'synthetic-refresh-token', expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, token_type: 'bearer', user: { id: userId, email: 'teacher@example.test', aud: 'authenticated', role: 'authenticated' } })), { userId });
  await page.route('**/config.js*', route => route.fulfill({ contentType: 'application/javascript', body: 'window.TEDVIO_CONFIG={SUPABASE_URL:"https://deletion-fixture.supabase.test",SUPABASE_PUBLISHABLE_KEY:"synthetic-publishable-key"};' }));
  await page.route('https://deletion-fixture.supabase.test/**', async route => {
    const request = route.request(), table = new URL(request.url()).pathname.split('/').at(-1);
    const row = kind => state.removed.has(kind) ? [] : [{ id: ids[kind], teacher_id: userId, name: labels[kind], title: labels[kind], created_at: '2026-09-14T08:00:00Z', is_demo: false }];
    let rows = [];
    if (table === 'tedvio_required_legal_documents_v21') rows = [{ document_key: 'terms', version: 'test', required: true, title: 'Prueba', content_html: '<p>Prueba.</p>' }];
    else if (table === 'tedvio_user_consents') rows = [{ document_key: 'terms', document_version: 'test' }];
    else if (table === 'tedvio_onboarding_snapshot_v21') rows = { completed: true, score: 5, dismissed: true };
    else if (table === 'v2_universities') rows = row('university');
    else if (table === 'v2_programs') rows = row('program').map(item => ({ ...item, university_id: ids.university }));
    else if (table === 'v2_groups') rows = row('group').map(item => ({ ...item, program_id: ids.program, subject: 'Materia', group_name: labels.group }));
    else if (table === 'v2_sessions') rows = row('session').map(item => ({ ...item, status: 'draft', code: 'PRUEBA', group_id: ids.group, competitive: false, team_mode: false }));
    else if (table === 'v2_question_bank') rows = row('question').map(item => ({ ...item, prompt: '¿Cuánto es dos más dos?', question_type: 'multiple_choice', options: ['3', '4'], correct_answer: '4', tags: [], favorite: false, archived: false }));
    else if (table === 'v2_academic_delete') {
      const input = request.postDataJSON(), kind = input.p_kind;
      expect(input.p_id).toBe(ids[kind]);
      if (state.unavailable) { await route.fulfill({ status: 404, json: { code: 'PGRST202', message: 'Missing RPC' } }); return; }
      let blockers = state.blockers;
      if (state.hierarchy && kind === 'university' && !state.removed.has('program')) blockers = [{ resource: 'v2_programs', count: 1 }];
      if (state.hierarchy && kind === 'program' && !state.removed.has('group')) blockers = [{ resource: 'v2_groups', count: 1 }];
      if (input.p_expected_version !== null) {
        state.writes.push(input);
        expect(input.p_expected_version).toBe(`version-${kind}`);
        if (state.fail) { await route.fulfill({ status: 409, json: { code: '40001', message: 'El registro cambió. Revisa de nuevo antes de eliminar.' } }); return; }
        if (state.hold) await new Promise(resolve => { state.release = resolve; });
        if (!state.invalid) state.removed.add(kind);
      } else state.previews += 1;
      rows = { id: ids[kind], kind, label: labels[kind], version: `version-${kind}`, can_delete: blockers.length === 0, blockers, question_count: kind === 'session' ? 2 : 0, deleted: input.p_expected_version !== null && !state.invalid };
    }
    expect(request.method()).not.toBe('DELETE');
    if (request.headers().accept?.includes('vnd.pgrst.object+json') && Array.isArray(rows)) rows = rows[0] ?? null;
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(rows) });
  });
  await page.goto(`/teacher#/${section}`);
  await expect(page.getByRole('heading', { name: section === 'bank' ? 'Banco de Reactivos' : section === 'groups' ? 'Centro de grupos' : 'Cockpit docente', exact: true })).toBeVisible();
  return state;
}
const trigger = (page, kind) => page.getByRole('button', { name: `Eliminar ${kind === 'question' ? 'pregunta' : kind === 'group' ? 'grupo' : kind === 'session' ? 'sesión' : kind === 'program' ? 'programa' : 'institución'}: ${labels[kind]}`, exact: true });
const confirm = page => page.getByRole('dialog').getByRole('button', { name: 'Eliminar definitivamente', exact: true });
const typeConfirmation = page => page.getByRole('textbox', { name: 'Escribe ELIMINAR para confirmar' }).fill('ELIMINAR');
async function remove(page, kind) {
  await trigger(page, kind).click(); await typeConfirmation(page); await confirm(page).click();
  await expect(page.getByRole('dialog')).toHaveCount(0); await expect(trigger(page, kind)).toHaveCount(0);
}

test('banco: cancelar no borra; confirmación escrita elimina y actualiza la selección', async ({ page }) => {
  const state = await fixture(page);
  await page.locator('.bank-question-card input[type=checkbox]').check();
  await trigger(page, 'question').click();
  await expect(confirm(page)).toBeDisabled();
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Cancelar' })).toBeFocused();
  await expect(page.getByRole('textbox', { name: 'Escribe ELIMINAR para confirmar' })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('delete-dialog.png'), animations: 'disabled' });
  expect(await page.getByRole('dialog').evaluate(dialog => { const rect = dialog.getBoundingClientRect(); return rect.left >= 0 && rect.right <= innerWidth; })).toBe(true);
  await page.getByRole('dialog').getByRole('button', { name: 'Cancelar' }).click();
  await expect(trigger(page, 'question')).toBeFocused(); expect(state.writes).toHaveLength(0);
  await remove(page, 'question');
  expect(state.writes).toHaveLength(1);
  await expect(page.getByText('Pregunta eliminada del banco.', { exact: true })).toBeVisible();
  await expect(page.getByText('Tu banco está vacío', { exact: true })).toBeVisible();
  expect(state.errors).toEqual([]);
});

test('grupos y estructura: explica bloqueos y permite limpiar grupo, programa e institución vacíos', async ({ page }) => {
  const state = await fixture(page, 'groups'); state.hierarchy = true;
  await page.getByRole('button', { name: 'Estructura académica', exact: true }).click();
  await trigger(page, 'university').click(); await expect(page.getByText('Programas académicos: 1')).toBeVisible();
  await expect(confirm(page)).toBeDisabled(); await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await remove(page, 'group'); await remove(page, 'program'); await remove(page, 'university');
  expect(state.writes.map(item => item.p_kind)).toEqual(['group', 'program', 'university']);
});

test('sesiones: bloquea vivo e historial; explica el alcance de una sesión sin participación', async ({ page }) => {
  const state = await fixture(page, 'classroom'); state.blockers = [{ resource: 'live_session', count: 1 }];
  await trigger(page, 'session').click(); await expect(page.getByText(/La sesión está en vivo:/)).toBeVisible();
  await expect(confirm(page)).toBeDisabled();
  state.blockers = [{ resource: 'v2_participants', count: 3 }];
  await page.getByRole('button', { name: 'Volver a revisar' }).click(); await expect(page.getByText('Participantes: 3')).toBeVisible();
  state.blockers = []; await page.getByRole('button', { name: 'Volver a revisar' }).click();
  await expect(page.getByText(/Se quitarán también 2 preguntas.*El banco original se conserva/)).toBeVisible();
  await typeConfirmation(page); await confirm(page).click();
  await expect(trigger(page, 'session')).toHaveCount(0); expect(state.writes).toHaveLength(1);
});

test('sin conexión no hay borrado diferido; fallo obliga a revisar y doble clic no duplica', async ({ page, context }) => {
  const state = await fixture(page);
  await trigger(page, 'question').click(); await typeConfirmation(page);
  await context.setOffline(true); await expect(confirm(page)).toBeDisabled(); expect(state.writes).toHaveLength(0);
  await context.setOffline(false); await expect(confirm(page)).toBeEnabled(); state.fail = true;
  await confirm(page).click(); await expect(page.getByText(/El registro cambió/)).toBeVisible();
  await expect(confirm(page)).toBeDisabled(); expect(state.removed.size).toBe(0);
  state.fail = false; await page.getByRole('button', { name: 'Volver a revisar' }).click(); await typeConfirmation(page);
  state.hold = true; await confirm(page).evaluate(button => { button.click(); button.click(); });
  await expect.poll(() => state.writes.length).toBe(2);
  await expect(page.getByRole('button', { name: 'Procesando…', exact: true })).toBeDisabled();
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Cancelar' })).toBeDisabled();
  state.release(); await expect(trigger(page, 'question')).toHaveCount(0);
});

test('pregunta usada ofrece archivar y una actualización pendiente no simula éxito', async ({ page }) => {
  const state = await fixture(page); state.blockers = [{ resource: 'v2_paper_exam_questions', count: 2 }];
  await trigger(page, 'question').click(); await expect(page.getByText(/Puedes usar «Archivar»/)).toBeVisible();
  await expect(confirm(page)).toBeDisabled(); expect(state.writes).toHaveLength(0);
  state.unavailable = true; await page.getByRole('button', { name: 'Volver a revisar' }).click();
  await expect(page.getByText(/Falta aplicar la actualización de base de datos/)).toBeVisible();
  await expect(confirm(page)).toBeDisabled(); expect(state.removed.size).toBe(0);
});

test('respuesta de servidor sin confirmación de borrado no retira el registro', async ({ page }) => {
  const state = await fixture(page); state.invalid = true;
  await trigger(page, 'question').click(); await typeConfirmation(page); await confirm(page).click();
  await expect(page.getByText(/El servidor no confirmó la operación/)).toBeVisible();
  await expect(confirm(page)).toBeDisabled(); expect(state.removed.size).toBe(0);
  await page.getByRole('dialog').getByRole('button', { name: 'Cancelar' }).click();
  await expect(trigger(page, 'question')).toBeVisible();
});
