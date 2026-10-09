import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
test.use({ serviceWorkers: 'block' });
const userId = '11111111-1111-4111-8111-111111111111';
async function fixture(page) {
  const state = { bank: [], inserts: [], patches: [], errors: [], mediaUploads: [], fail: false };
  page.on('pageerror', error => state.errors.push(error.message));
  await page.addInitScript(({ userId }) => localStorage.setItem('sb-bank-fixture-auth-token', JSON.stringify({ access_token: 'synthetic-access-token', refresh_token: 'synthetic-refresh-token', expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, token_type: 'bearer', user: { id: userId, email: 'teacher@example.test', aud: 'authenticated', role: 'authenticated' } })), { userId });
  await page.route('**/config.js*', route => route.fulfill({ contentType: 'application/javascript', body: 'window.TEDVIO_CONFIG={SUPABASE_URL:"https://bank-fixture.supabase.test",SUPABASE_PUBLISHABLE_KEY:"synthetic-publishable-key"};' }));
  await page.route('https://bank-fixture.supabase.test/**', async route => {
    const request = route.request(), url = new URL(request.url()), table = url.pathname.split('/').at(-1);
    let rows = [];
    if (url.pathname.includes('/storage/v1/object/tedvio-media-v2/') && request.method() === 'POST') {
      state.mediaUploads.push(url.pathname);
      return route.fulfill({ status: 200, json: { Key: url.pathname } });
    }
    if (url.pathname.includes('/storage/v1/object/public/tedvio-media-v2/')) {
      return route.fulfill({ status: 200, contentType: 'image/png',
        body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64') });
    }
    if (table === 'tedvio_required_legal_documents_v21') rows = [{ document_key: 'terms', version: 'test', required: true, title: 'Prueba', content_html: '<p>Prueba.</p>' }];
    else if (table === 'tedvio_user_consents') rows = [{ document_key: 'terms', document_version: 'test' }];
    else if (table === 'tedvio_onboarding_snapshot_v21') rows = { completed: true, score: 5, dismissed: true };
    else if (table === 'v2_question_bank') {
      if (request.method() === 'POST') {
        const body = request.postDataJSON();
        const data = Array.isArray(body) ? body : [body];
        state.inserts.push(data);
        expect(data.every(row => row.teacher_id === userId && !row.id)).toBe(true);
        if (state.fail) return route.fulfill({ status: 400, json: { message: 'Error de prueba; corrige e intenta de nuevo.' } });
        rows = data.map((row, index) => ({ ...row, id: `bank-${state.bank.length + index}`, created_at: new Date().toISOString() }));
        state.bank.push(...rows);
      } else if (request.method() === 'PATCH') {
        expect(url.searchParams.get('teacher_id')).toBe(`eq.${userId}`);
        expect(url.searchParams.get('id')).toContain('bank-0');
        const patch = request.postDataJSON(); state.patches.push(patch);
        state.bank = state.bank.map(row => ({ ...row, ...patch })); rows = state.bank.map(row => ({ id: row.id }));
      } else rows = state.bank;
    }
    expect(request.method()).not.toBe('DELETE');
    if (request.headers().accept?.includes('vnd.pgrst.object+json') && Array.isArray(rows)) rows = rows[0] ?? null;
    await route.fulfill({ json: rows });
  });
  await page.goto('/teacher#/bank');
  await expect(page.getByRole('heading', { name: 'Banco de preguntas', exact: true })).toBeVisible();
  return state;
}
const csv = 'pregunta,a,b,respuesta\nCapital de Francia,París,Roma,A';

test('banco: corrige, revisa, importa, organiza, respalda y restaura', async ({ page }) => {
  const state = await fixture(page);
  await page.getByRole('button', { name: '＋ Importar preguntas' }).click();
  await page.getByLabel('Preguntas para importar').fill(csv.replace(',A', ',C'));
  await expect(page.getByRole('button', { name: /Importar \d+ al banco/ })).toBeDisabled();
  expect(state.inserts).toHaveLength(0);
  await page.getByLabel('Preguntas para importar').fill(csv);
  await page.locator('.bank-import-preview summary').click();
  await page.getByLabel('Revisar enunciado').fill('¿Capital de Francia?');
  await page.locator('.bank-import-preview').getByLabel('Carpeta', { exact: true }).fill('Unidad 1');
  await page.getByRole('button', { name: 'Importar 1 al banco' }).click();
  await expect(page.locator('.bank-question-card')).toHaveCount(1);
  expect(state.bank[0].correct_answer).toBe('París');
  expect(state.bank[0].prompt).toBe('¿Capital de Francia?');
  expect(state.bank[0].folder).toBe('Unidad 1');
  await page.getByRole('button', { name: 'Seleccionar visibles' }).click();
  await page.getByLabel('Nuevo valor').fill('Unidad 2');
  await page.getByRole('button', { name: 'Aplicar a 1 preguntas' }).click();
  await expect(page.getByText('1 de 1 preguntas actualizadas.', { exact: true })).toBeVisible();
  expect(state.patches[0].folder).toBe('Unidad 2');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Respaldar banco JSON' }).click();
  const download = await downloadPromise;
  const backup = JSON.parse(await fs.readFile(await download.path(), 'utf8'));
  expect(backup.questions[0].teacher_id).toBeUndefined();
  expect(backup.questions[0].correct_answer).toBe('París');
  expect(backup.questions[0].folder).toBe('Unidad 2');
  await page.getByRole('button', { name: 'Seleccionar visibles' }).click();
  await page.getByRole('combobox', { name: 'Cambiar', exact: true }).selectOption('archived');
  await page.getByRole('button', { name: 'Aplicar a 1 preguntas' }).click();
  await expect(page.locator('.bank-question-card')).toHaveCount(0);
  await page.getByLabel('Mostrar archivadas').check();
  await expect(page.locator('.bank-question-card')).toHaveCount(1);
  await page.getByRole('button', { name: 'Seleccionar visibles' }).click();
  await page.getByRole('combobox', { name: 'Cambiar', exact: true }).selectOption('archived');
  await page.getByRole('combobox', { name: 'Acción', exact: true }).selectOption('restore');
  await page.getByRole('button', { name: 'Aplicar a 1 preguntas' }).click();
  await expect.poll(() => state.bank[0].archived).toBe(false);
  await page.getByLabel('Cargar preguntas').setInputFiles({ name: 'respaldo.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
  await expect(page.getByRole('button', { name: 'Importar 0 al banco' })).toBeDisabled();
  await page.screenshot({ path: test.info().outputPath('bank-review.png'), fullPage: true });
  expect(state.errors).toEqual([]);
});

test('banco: fallo al importar conserva el texto y permite reintentar', async ({ page }) => {
  const state = await fixture(page); state.fail = true;
  await page.getByRole('button', { name: '＋ Importar preguntas' }).click();
  await page.getByLabel('Preguntas para importar').fill(csv);
  await page.getByRole('button', { name: 'Importar 1 al banco' }).click();
  await expect(page.getByRole('alert')).toContainText('Error de prueba');
  await expect(page.getByLabel('Preguntas para importar')).toHaveValue(csv);
  expect(state.inserts).toHaveLength(1);
  state.fail = false;
  await page.getByRole('button', { name: 'Importar 1 al banco' }).click();
  await expect(page.locator('.bank-question-card')).toHaveCount(1);
  expect(state.inserts).toHaveLength(2);
});

test('Classroom Visual 5.0: el docente crea etiquetado anatómico sin filtrar claves públicas', async ({ page }) => {
  const imageUrl = 'https://visual-fixture.test/anatomia.svg';
  await page.route('https://visual-fixture.test/**', route => route.fulfill({
    contentType: 'image/svg+xml',
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="440" viewBox="0 0 640 440"><rect width="640" height="440" fill="#eef2f7"/><ellipse cx="320" cy="200" rx="180" ry="135" fill="#d8dfea" stroke="#6b7b90" stroke-width="6"/></svg>',
  }));
  const state = await fixture(page);
  await page.getByRole('button', { name: '＋ Nueva pregunta' }).click();
  await page.getByLabel('Tipo').selectOption('image_labeling');
  await expect(page.getByRole('heading', { name: 'Etiqueta las estructuras de la imagen' })).toBeVisible();
  await page.getByLabel('Enunciado').fill('Identifica las dos estructuras del cráneo');
  await page.getByLabel('URL HTTPS de la imagen').fill(imageUrl);
  await page.getByLabel('Nombre de estructura 1').fill('Hueso frontal');
  await page.getByLabel('Nombre de estructura 2').fill('Hueso temporal');
  await expect(page.locator('.visual5-editor-pin')).toHaveCount(2);
  await expect(page.locator('.visual5-editor-image img')).toBeVisible();
  await page.getByRole('button', { name: 'Seleccionar zona 1' }).click();
  await page.locator('.visual5-editor-image').click({ position: { x: 140, y: 110 } });
  // Clicking arbitrary pixels produces fractional X/Y values. They must remain
  // valid native number inputs; otherwise the browser silently blocks submit.
  const markerInputs = page.locator('.visual5-editor-coordinates input[type="number"]');
  expect(await markerInputs.evaluateAll(nodes => nodes.every(input => input.checkValidity()))).toBe(true);
  expect(await page.locator('.bank-editor').evaluate(form => form.checkValidity())).toBe(true);
  await page.setViewportSize({ width: 768, height: 1024 });
  await expect(page.locator('.visual5-editor-fields')).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('visual5-author-ipad.png'), fullPage: true });
  await page.getByRole('button', { name: 'Crear reactivo' }).click();
  await expect(page.locator('.bank-question-card')).toHaveCount(1);
  const saved = state.inserts.at(-1)?.[0];
  expect(saved.question_type).toBe('ordering');
  expect(saved.visual_layout.kind).toBe('image_labeling');
  expect(saved.visual_layout.targets).toHaveLength(2);
  expect(saved.correct_answer).toEqual(['Hueso frontal', 'Hueso temporal']);
  expect(saved.options).toHaveLength(2);
  expect(saved.options).not.toEqual(saved.correct_answer);
  expect(JSON.stringify(saved.visual_layout)).not.toContain('Hueso');
  await expect(page.locator('.bank-question-card .question-chips')).toContainText('Etiquetado anatómico');
  await page.getByRole('button', { name: 'Respaldar banco JSON' }).click();
  expect(state.errors).toEqual([]);
});

test('Classroom Visual 5.0: subir imagen exige cuenta propietaria y URL pública HTTPS', async ({ page }) => {
  const state=await fixture(page);
  await page.getByRole('button', { name: '＋ Nueva pregunta' }).click();
  await page.getByLabel('Tipo').selectOption('image_labeling');
  const upload=page.getByLabel('Subir imagen anatómica');
  await upload.setInputFiles({
    name:'anatomia.png',mimeType:'image/png',
    buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64'),
  });
  await expect(page.getByLabel('URL HTTPS de la imagen')).toHaveValue(/\/storage\/v1\/object\/public\/tedvio-media-v2\//);
  await expect(page.locator('.visual5-editor-image img')).toBeVisible();
  expect(state.mediaUploads).toHaveLength(1);
  expect(state.mediaUploads[0]).toContain(`/${userId}/visual5/`);
  expect(state.errors).toEqual([]);
});
