import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createOnlineFormsTestDatabase } from '../../apps/teacher-v2/scripts/online-forms-fixture.mjs';
import ExcelJS from '../../apps/teacher-v2/node_modules/exceljs/excel.js';

test.use({ serviceWorkers: 'block' });
test.setTimeout(90_000);

async function routeFixture(page, fixture, teacher = false) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  if (teacher) await page.addInitScript(({ id }) => localStorage.setItem('sb-forms-fixture-auth-token', JSON.stringify({
    access_token: 'synthetic-teacher-token', refresh_token: 'synthetic-refresh-token',
    expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, token_type: 'bearer',
    user: { id, email: 'docente@example.test', aud: 'authenticated', role: 'authenticated' },
  })), { id: fixture.owner });
  await page.route('**/config.js*', route => route.fulfill({ contentType: 'application/javascript', body: 'window.TEDVIO_CONFIG={SUPABASE_URL:"https://forms-fixture.supabase.test",SUPABASE_PUBLISHABLE_KEY:"synthetic-publishable-key"};' }));
  await page.route('https://forms-fixture.supabase.test/**', async route => {
    const request = route.request(), url = new URL(request.url()), name = url.pathname.split('/').at(-1);
    const authenticated = request.headers().authorization === 'Bearer synthetic-teacher-token';
    let data = [];
    try {
      if (/^v2_online_forms?_/.test(name)) data = await fixture.call(name, request.postDataJSON() || {}, authenticated ? fixture.owner : null);
      else if (name === 'user') data = { id: fixture.owner, email: 'docente@example.test', aud: 'authenticated', role: 'authenticated', user_metadata: {} };
      else if (name === 'tedvio_required_legal_documents_v21') data = [{ document_key: 'terms', version: 'test', required: true, title: 'Prueba' }];
      else if (name === 'tedvio_user_consents') data = [{ document_key: 'terms', document_version: 'test' }];
      else if (name === 'tedvio_onboarding_snapshot_v21') data = { completed: true, score: 5, dismissed: true };
      else if (name === 'tedvio_user_profiles') data = [{ status: 'active', plan: 'free', role: 'teacher', full_name: 'Docente de prueba' }];
      else if (name === 'profiles') data = [{ id: fixture.owner, display_name: 'Docente de prueba' }];
      else if (name === 'tedvio_current_entitlements') data = { plan: 'free', display_name: 'Free' };
      else if (name === 'v2_teacher_today_dashboard') data = { groups: [], groups_count: 0, pending_attendance: 0, risk_students: 0, watch_students: 0, priority_students: [] };
      else if (name === 'v2_question_bank') {
        if (!authenticated) throw new Error('Student attempted to read private bank');
        data = fixture.questions.map(q => ({ ...q, tags: [], favorite: false, folder: '', created_at: '2026-11-24T00:00:00Z', updated_at: '2026-11-24T00:00:00Z' }));
      } else if (name === 'v2_groups') data = authenticated ? [{ id: fixture.group, teacher_id: fixture.owner, name: 'Grupo de prueba', group_name: 'Grupo de prueba', subject: 'Materia' }] : [];
      if (request.headers().accept?.includes('vnd.pgrst.object+json') && Array.isArray(data)) data = data[0] ?? null;
      await route.fulfill({ json: data });
    } catch (error) { await route.fulfill({ status: 400, json: { code: error.code || 'TEST_ERROR', message: error.message } }); }
  });
  return errors;
}
async function noOverflow(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
}

test('docente crea y publica; alumno responde y reanuda; resultados y XLSX coinciden con PostgreSQL', async ({ page, browser }, info) => {
  const fixture = await createOnlineFormsTestDatabase();
  let studentContext;
  try {
    const errors = await routeFixture(page, fixture, true);
    await page.goto('/teacher#/forms/new');
    await expect(page.getByLabel('Título', { exact: true })).toBeVisible();
    await page.getByLabel('Título', { exact: true }).fill('Unidad 1 · Examen de prueba');
    await page.getByLabel('Instrucciones', { exact: true }).fill('Responde con base en el manual.');
    await page.getByRole('button', { name: 'Seleccionar 8 filtradas', exact: true }).click();
    await page.getByRole('radio', { name: /Cuotas por tema/ }).check();
    await page.getByLabel('Preguntas por alumno del tema Tema A').fill('2');
    await page.getByLabel('Preguntas por alumno del tema Tema B').fill('1');
    await expect(page.getByLabel('Retroalimentación al alumno')).toHaveValue('score_only');
    await noOverflow(page);
    await page.screenshot({ path: info.outputPath('formulario-editor.png'), fullPage: true });
    await expect(page.getByRole('button', { name: 'Guardar borrador', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Guardar borrador', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Publicar formulario', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Publicar formulario', exact: true }).click();
    await page.getByRole('button', { name: 'Publicar y obtener enlace', exact: true }).click();
    await expect(page.getByLabel('Enlace para alumnos')).toBeVisible();
    const published = (await fixture.call('v2_online_forms_list'))[0];
    expect(published.status).toBe('published'); expect(published.question_count).toBe(3); expect(published.pool_count).toBe(8);
    const link = await page.getByLabel('Enlace para alumnos').inputValue();
    expect(link).toContain(`/teacher#/form/${published.code}`);
    studentContext = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    const student = await studentContext.newPage();
    const studentErrors = await routeFixture(student, fixture, false);
    await student.goto(link);
    await student.getByLabel('Nombre completo').fill('Alumna de prueba');
    await student.getByLabel('Matrícula', { exact: true }).fill('000123');
    await student.getByRole('button', { name: /Comenzar formulario/ }).click();
    await expect(student.locator('.respond-form-question')).toHaveCount(1);
    await expect(student.locator('.respond-form-question-top')).toContainText('Pregunta 1 de 3');
    await expect(student.getByRole('button', { name: 'Anterior', exact: true })).toBeDisabled();
    await expect(student.getByRole('button', { name: 'Revisar y enviar', exact: true })).toHaveCount(0);
    const session = await student.evaluate(code => JSON.parse(localStorage.getItem(`tedvio:online-form:${code}:session:v1`)), published.code);
    const state = await fixture.call('v2_online_form_state', { p_token: session.token }, null);
    expect(new Set(state.items.map(item => item.id)).size).toBe(3);
    expect(state.items.filter(item => item.topic === 'Tema A')).toHaveLength(2);
    expect(state.items.filter(item => item.topic === 'Tema B')).toHaveLength(1);
    expect(JSON.stringify(state)).not.toContain('correct_answer');
    const key = (await fixture.call('v2_online_form_results', { p_form_id: published.id })).items;
    const first = state.items[0], correct = key.find(item => item.id === first.id).correct_answer;
    await student.locator(`input[name="question-${first.id}"][value="${correct}"]`).check();
    await expect(student.locator('.respond-form-save-state')).toContainText('Respuestas guardadas');
    await student.getByRole('button', { name: 'Siguiente', exact: false }).click();
    await expect(student.locator('.respond-form-question-top')).toContainText('Pregunta 2 de 3');
    await expect(student.locator('.respond-form-question')).toHaveCount(1);
    await expect(student.locator(`input[name="question-${first.id}"]`)).toHaveCount(0);
    await student.reload();
    await expect(student.locator('.respond-form-question-top')).toContainText('Pregunta 2 de 3');
    await expect(student.locator('.respond-form-question')).toHaveCount(1);
    await student.getByRole('button', { name: 'Anterior', exact: true }).click();
    expect((await fixture.call('v2_online_form_state', { p_token: session.token }, null)).items.map(item => item.id)).toEqual(state.items.map(item => item.id));
    await expect(student.locator(`input[name="question-${first.id}"]:checked`)).toHaveValue(correct);
    await noOverflow(student);
    await student.screenshot({ path: info.outputPath('formulario-alumno-movil.png'), fullPage: true });
    await student.getByRole('button', { name: 'Siguiente', exact: false }).click();
    await student.getByRole('button', { name: 'Siguiente', exact: false }).click();
    await expect(student.locator('.respond-form-question-top')).toContainText('Pregunta 3 de 3');
    await expect(student.locator('.respond-form-question')).toHaveCount(1);
    await student.getByRole('button', { name: 'Revisar y enviar', exact: true }).click();
    await expect(student.getByRole('dialog')).toContainText('2 preguntas quedarán sin responder');
    await student.getByRole('button', { name: 'Sí, enviar formulario', exact: true }).click();
    await expect(student.getByRole('heading', { name: 'Tu formulario quedó entregado' })).toBeVisible();
    await expect(student.locator('.respond-form-feedback')).toHaveCount(0);
    const completedState = await fixture.call('v2_online_form_state', { p_token: session.token }, null);
    expect(completedState.show_answers).toBe(false); expect(completedState.feedback).toEqual([]);
    expect(JSON.stringify(completedState)).not.toContain('correct_answer');
    const results = await fixture.call('v2_online_form_results', { p_form_id: published.id });
    expect(results.attempts).toHaveLength(1); expect(results.attempts[0].score).toBe(1); expect(results.attempts[0].max_score).toBe(3);
    await page.getByRole('button', { name: 'Actualizar resultados', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Descargar Excel', exact: true })).toBeEnabled();
    await expect(page.getByText('Alumna de prueba', { exact: true })).toBeVisible();
    await noOverflow(page);
    await page.screenshot({ path: info.outputPath('formulario-resultados.png'), fullPage: true });
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Descargar Excel', exact: true }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.xlsx$/);
    const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(await readFile(await download.path()));
    const sheet = workbook.getWorksheet('Respuestas');
    expect(sheet.getCell('C2').value).toBe('000123'); expect(sheet.getCell('G2').value).toBe(1); expect(sheet.getCell('H2').value).toBe(3);
    const row = sheet.getRow(2).values;
    expect(row.filter(value => value === 'No asignada')).toHaveLength(5);
    expect(row.filter(value => value === 'Sin responder')).toHaveLength(2);
    expect(errors).toEqual([]); expect(studentErrors).toEqual([]);
  } finally { await studentContext?.close(); await fixture.db.close(); }
});
