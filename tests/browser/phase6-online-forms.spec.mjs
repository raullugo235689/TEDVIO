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
    await page.getByLabel('Grupos disponibles para el alumno').fill('3-01, 3-02, 3-03, 3-04, 3-09');
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
    await expect(student.getByRole('button', { name: /Comenzar formulario/ })).toBeDisabled();
    await expect(student.getByRole('combobox', { name: 'Grupo', exact: true }).locator('option')).toHaveCount(6);
    await student.getByRole('combobox', { name: 'Grupo', exact: true }).selectOption('3-09');
    await noOverflow(student);
    await student.screenshot({path:info.outputPath('formulario-alumno-acceso.png'),fullPage:true});
    await student.getByRole('button', { name: /Comenzar formulario/ }).click();
    await expect(student.locator('.respond-form-question')).toHaveCount(1);
    await expect(student.locator('.respond-form-question-top')).toContainText('Pregunta 1 de 3');
    await expect(student.getByRole('button', { name: 'Anterior', exact: true })).toBeDisabled();
    await expect(student.getByRole('button', { name: 'Revisar y enviar', exact: true })).toHaveCount(0);
    const session = await student.evaluate(code => JSON.parse(localStorage.getItem(`tedvio:online-form:${code}:session:v1`)), published.code);
    const state = await fixture.call('v2_online_form_state', { p_token: session.token }, null);
    expect(state.attempt.declared_group).toBe('3-09');
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
    expect(sheet.getCell('L2').value).toBe('3-09');
    expect(sheet.getCell('C2').value).toBe('000123'); expect(sheet.getCell('G2').value).toBe(1); expect(sheet.getCell('H2').value).toBe(3);
    const row = sheet.getRow(2).values;
    expect(row.filter(value => value === 'No asignada')).toHaveLength(5);
    expect(row.filter(value => value === 'Sin responder')).toHaveLength(2);
    expect(errors).toEqual([]); expect(studentErrors).toEqual([]);
  } finally { await studentContext?.close(); await fixture.db.close(); }
});

test('una entrega sin revisión distingue una respuesta pendiente de un guardado con acuse perdido', async ({ page }) => {
  const fixture = await createOnlineFormsTestDatabase();
  try {
    const errors = await routeFixture(page, fixture, false);
    await page.setViewportSize({ width: 390, height: 844 });
    for (const committed of [false, true]) {
      const draft = await fixture.call('v2_online_form_save', { p_form: {
        title: committed ? 'Respuesta guardada sin acuse' : 'Respuesta todavía sin guardar',
        instructions: 'Prueba aislada de recuperación.', max_attempts: 1,
        navigation_mode: 'forward_only', feedback_mode: 'score_only',
        shuffle_questions: false, shuffle_options: false,
        sections: [{ title: 'Pregunta', draw_count: 1, items: [{ bank_id: fixture.bank[0], points: 1 }] }],
      } });
      const form = await fixture.call('v2_online_form_set_status', { p_form_id: draft.id, p_status: 'published' });
      await page.goto(`/teacher#/form/${form.code}`);
      await page.getByLabel('Nombre completo').fill('Alumno de recuperación');
      await page.getByLabel('Matrícula', { exact: true }).fill(committed ? 'ACUSE001' : 'PENDIENTE001');
      await page.getByRole('button', { name: /Comenzar formulario/ }).click();
      await expect(page.locator('.respond-form-question-top')).toContainText('Pregunta 1 de 1');
      const session = await page.evaluate(code => JSON.parse(localStorage.getItem(`tedvio:online-form:${code}:session:v1`)), form.code);
      const state = await fixture.call('v2_online_form_state', { p_token: session.token }, null);
      const item = state.items[0], correct = form.sections[0].items[0].correct_answer;
      await page.route('https://forms-fixture.supabase.test/rest/v1/rpc/v2_online_form_answer', async route => {
        if (committed) await fixture.call('v2_online_form_answer', route.request().postDataJSON(), null);
        await route.abort('failed');
      }, { times: 1 });
      await page.locator(`input[name="question-${item.id}"][value="${correct}"]`).check();
      await expect(page.getByRole('button', { name: 'Reintentar guardado', exact: true })).toBeVisible();
      const pending = await page.evaluate(code => JSON.parse(localStorage.getItem(`tedvio:online-form:${code}:session:v1`)).pending, form.code);
      expect(pending[item.id]).toBe(correct);

      // An owner close finalizes the isolated attempt before the pending client
      // receives a receipt. score_only deliberately returns no question content.
      await fixture.call('v2_online_form_set_status', { p_form_id: form.id, p_status: 'closed' });
      const acceptUnload = dialog => dialog.accept();
      page.on('dialog', acceptUnload);
      await page.reload();
      page.off('dialog', acceptUnload);
      await expect(page.getByRole('heading', { name: 'Tu formulario quedó entregado' })).toBeVisible();
      const warning = page.getByText(/cambio no alcanzó a guardarse antes del cierre/);
      if (committed) await expect(warning).toHaveCount(0);
      else await expect(warning).toBeVisible();
      const delivered = await fixture.call('v2_online_form_state', { p_token: session.token }, null);
      expect(delivered.items).toEqual([]); expect(delivered.show_answers).toBe(false);
      expect(delivered.attempt.status).toBe('submitted'); expect(delivered.attempt.auto_submitted).toBe(true);
      expect(delivered.attempt.score).toBe(committed ? 1 : 0);
      expect(delivered.answers[item.id]).toBe(committed ? correct : undefined);
    }
    expect(errors).toEqual([]);
  } finally { await fixture.db.close(); }
});

test('configuración publicada editable y avance único confirmado persisten con recarga y acuse perdido', async ({ page, browser }, info) => {
  const fixture = await createOnlineFormsTestDatabase();
  let studentContext;
  try {
    const draft = await fixture.call('v2_online_form_save', { p_form: {
      title: 'Configuración revisable', instructions: 'Responde cada pregunta y confirma el avance.',
      max_attempts: 1, time_limit_minutes: 30, navigation_mode: 'free',
      shuffle_questions: false, shuffle_options: false, feedback_mode: 'score_only',
      sections: [{ title: 'Aplicación', draw_count: 3, items: fixture.bank.slice(0, 3).map(bank_id => ({ bank_id, points: 1 })) }],
    } });
    const published = await fixture.call('v2_online_form_set_status', { p_form_id: draft.id, p_status: 'published' });
    const originalItemIds = published.sections.flatMap(section => section.items.map(item => item.id));
    const errors = await routeFixture(page, fixture, true);
    await page.goto(`/teacher#/forms/${published.id}`);
    await page.getByRole('button', { name: 'Editar configuración', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Editar configuración', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Preguntas candidatas', exact: true })).toHaveCount(0);
    await expect(page.getByLabel('Grupo (opcional)', { exact: true })).toHaveCount(0);
    await page.getByLabel('Navegación entre preguntas').selectOption('forward_only');
    await expect(page.getByText(/El alumno no podrá volver a preguntas anteriores/)).toBeVisible();
    await noOverflow(page);
    await page.screenshot({ path: info.outputPath('formulario-configuracion-editable.png'), fullPage: true });
    await page.getByRole('button', { name: 'Guardar configuración', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Actualizar resultados', exact: true })).toBeEnabled();
    const configured = await fixture.call('v2_online_form_detail', { p_form_id: published.id });
    expect(configured.navigation_mode).toBe('forward_only');
    expect(configured.status).toBe('published'); expect(configured.code).toBe(published.code);
    expect(configured.sections.flatMap(section => section.items.map(item => item.id))).toEqual(originalItemIds);
    const link = await page.getByLabel('Enlace para alumnos').inputValue();

    studentContext = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    const student = await studentContext.newPage();
    const studentErrors = await routeFixture(student, fixture, false);
    await student.goto(link);
    await expect(student.getByText('Este formulario es de avance único', { exact: true })).toBeVisible();
    await student.getByLabel('Nombre completo').fill('Alumno avance único');
    await student.getByLabel('Matrícula', { exact: true }).fill('AVANCE001');
    await student.getByRole('button', { name: /Comenzar formulario/ }).click();
    await expect(student.locator('.respond-form-question')).toHaveCount(1);
    await expect(student.locator('.respond-form-question-top')).toContainText('Pregunta 1 de 3');
    await expect(student.getByRole('button', { name: 'Anterior', exact: true })).toHaveCount(0);
    const session = await student.evaluate(code => JSON.parse(localStorage.getItem(`tedvio:online-form:${code}:session:v1`)), published.code);
    const firstState = await fixture.call('v2_online_form_state', { p_token: session.token }, null);
    expect(firstState.items).toHaveLength(1);
    expect(firstState.attempt.navigation_mode).toBe('forward_only');
    expect(firstState.attempt.current_position).toBe(1);
    const first = firstState.items[0];
    const key = (await fixture.call('v2_online_form_results', { p_form_id: published.id })).items;
    const firstAnswer = key.find(item => item.id === first.id).correct_answer;
    await student.locator(`input[name="question-${first.id}"][value="${firstAnswer}"]`).check();
    await expect(student.locator('.respond-form-question-status')).toHaveText('Respuesta guardada');
    await student.getByRole('button', { name: /Siguiente/ }).click();
    await expect(student.getByRole('dialog', { name: '¿Cerrar esta pregunta y avanzar?' })).toBeVisible();
    await student.getByRole('button', { name: 'Seguir en esta pregunta', exact: true }).click();
    await expect(student.locator('.respond-form-question-top')).toContainText('Pregunta 1 de 3');
    expect((await fixture.call('v2_online_form_state', { p_token: session.token }, null)).attempt.current_position).toBe(1);
    await student.getByRole('button', { name: /Siguiente/ }).click();
    await student.getByRole('button', { name: 'Sí, avanzar', exact: true }).click();
    await expect(student.locator('.respond-form-question-top')).toContainText('Pregunta 2 de 3');
    await student.reload();
    await expect(student.locator('.respond-form-question-top')).toContainText('Pregunta 2 de 3');
    await expect(student.locator(`input[name="question-${first.id}"]`)).toHaveCount(0);

    // Policy edits apply to future attempts; an active attempt keeps its contract.
    await page.getByRole('button', { name: 'Editar configuración', exact: true }).click();
    await page.getByLabel('Navegación entre preguntas').selectOption('free');
    await page.getByLabel('Tiempo por intento (minutos)').fill('90');
    await page.getByLabel('Retroalimentación al alumno').selectOption('after_submit');
    await page.getByRole('button', { name: 'Guardar configuración', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Actualizar resultados', exact: true })).toBeEnabled();
    const edited = await fixture.call('v2_online_form_detail', { p_form_id: published.id });
    expect(edited.navigation_mode).toBe('free'); expect(edited.time_limit_minutes).toBe(90);
    expect(edited.feedback_mode).toBe('after_submit'); expect(edited.status).toBe('published');
    expect(edited.code).toBe(published.code);
    expect(edited.sections.flatMap(section => section.items.map(item => item.id))).toEqual(originalItemIds);
    const stillActive = await fixture.call('v2_online_form_state', { p_token: session.token }, null);
    expect(stillActive.attempt.navigation_mode).toBe('forward_only');
    expect(stillActive.attempt.expires_at).toBe(firstState.attempt.expires_at);
    await student.reload();
    await expect(student.locator('.respond-form-question-top')).toContainText('Pregunta 2 de 3');
    await expect(student.getByRole('button', { name: 'Anterior', exact: true })).toHaveCount(0);

    // Commit the advance, then lose only its response. Recovery must read state,
    // rather than issue another advance or silently skip the next question.
    let lostAdvanceCalls = 0;
    let advanceRequestsAfterLoss = 0;
    student.on('request', request => { if (request.url().endsWith('/rpc/v2_online_form_advance')) advanceRequestsAfterLoss += 1; });
    await student.route('https://forms-fixture.supabase.test/rest/v1/rpc/v2_online_form_advance', async route => {
      lostAdvanceCalls += 1;
      await fixture.call('v2_online_form_advance', route.request().postDataJSON(), null);
      await route.abort('failed');
    }, { times: 1 });
    await student.getByRole('button', { name: /Siguiente/ }).click();
    await expect(student.getByRole('dialog', { name: '¿Cerrar esta pregunta y avanzar?' })).toContainText('Esta pregunta quedará sin responder');
    await student.getByRole('button', { name: 'Sí, avanzar', exact: true }).click();
    await expect(student.getByRole('button', { name: 'Consultar estado de mi intento', exact: true })).toBeEnabled();
    await expect(student.getByRole('button', { name: /Siguiente/ })).toBeDisabled();
    expect((await fixture.call('v2_online_form_state', { p_token: session.token }, null)).attempt.current_position).toBe(3);
    await student.getByRole('button', { name: 'Consultar estado de mi intento', exact: true }).click();
    await expect(student.locator('.respond-form-question-top')).toContainText('Pregunta 3 de 3');
    await expect(student.locator('.respond-form-question')).toHaveCount(1);
    expect(lostAdvanceCalls).toBe(1);
    expect(advanceRequestsAfterLoss).toBe(1);
    const recovered = await fixture.call('v2_online_form_state', { p_token: session.token }, null);
    expect(recovered.attempt.current_position).toBe(3); expect(recovered.items).toHaveLength(1);
    const third = recovered.items[0], thirdAnswer = key.find(item => item.id === third.id).correct_answer;
    await student.locator(`input[name="question-${third.id}"][value="${thirdAnswer}"]`).check();
    await expect(student.locator('.respond-form-question-status')).toHaveText('Respuesta guardada');
    await noOverflow(student);
    await student.screenshot({ path: info.outputPath('formulario-avance-unico-recuperado.png'), fullPage: true });
    await student.getByRole('button', { name: 'Confirmar entrega', exact: true }).click();
    await expect(student.getByRole('dialog', { name: '¿Enviar tu formulario?' })).toContainText('1 pregunta quedará sin responder');
    await student.getByRole('button', { name: 'Sí, enviar formulario', exact: true }).click();
    await expect(student.getByRole('heading', { name: 'Tu formulario quedó entregado' })).toBeVisible();
    const delivered = await fixture.call('v2_online_form_state', { p_token: session.token }, null);
    expect(delivered.attempt.status).toBe('submitted'); expect(delivered.attempt.score).toBe(2);
    expect(delivered.attempt.max_score).toBe(3); expect(delivered.show_answers).toBe(false); expect(delivered.feedback).toEqual([]);
    const results = await fixture.call('v2_online_form_results', { p_form_id: published.id });
    expect(results.attempts).toHaveLength(1);
    expect(results.attempts[0].responses).toHaveLength(2);
    expect(results.attempts[0].responses.find(response => response.item_id === first.id).answer).toBe(firstAnswer);
    expect(results.attempts[0].responses.find(response => response.item_id === third.id).answer).toBe(thirdAnswer);

    await page.getByRole('button', { name: 'Cerrar formulario', exact: true }).click();
    await page.getByRole('dialog', { name: '¿Cerrar este formulario?' }).getByRole('button', { name: 'Cerrar formulario', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Actualizar resultados', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Editar configuración', exact: true }).click();
    await page.getByRole('textbox', { name: 'Instrucciones', exact: true }).fill('Configuración guardada después del cierre.');
    await page.getByRole('button', { name: 'Guardar configuración', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Actualizar resultados', exact: true })).toBeEnabled();
    const closed = await fixture.call('v2_online_form_detail', { p_form_id: published.id });
    expect(closed.status).toBe('closed'); expect(closed.code).toBe(published.code);
    expect(closed.instructions).toBe('Configuración guardada después del cierre.');
    expect(closed.sections.flatMap(section => section.items.map(item => item.id))).toEqual(originalItemIds);
    const preserved = (await fixture.call('v2_online_form_results', { p_form_id: published.id })).attempts[0];
    expect(preserved.navigation_mode).toBe('forward_only'); expect(preserved.expires_at).toBe(firstState.attempt.expires_at);
    expect(preserved.score).toBe(2); expect(preserved.responses).toEqual(results.attempts[0].responses);
    expect(errors).toEqual([]); expect(studentErrors).toEqual([]);
  } finally { await studentContext?.close(); await fixture.db.close(); }
});
