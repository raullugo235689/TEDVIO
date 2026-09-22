import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
test.use({ serviceWorkers: 'block' });
const userId = '11111111-1111-4111-8111-111111111111';
async function fixture(page) {
  const state = { bank: [], inserts: [], patches: [], errors: [], fail: false };
  page.on('pageerror', error => state.errors.push(error.message));
  await page.addInitScript(({ userId }) => localStorage.setItem('sb-bank-fixture-auth-token', JSON.stringify({ access_token: 'synthetic-access-token', refresh_token: 'synthetic-refresh-token', expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, token_type: 'bearer', user: { id: userId, email: 'teacher@example.test', aud: 'authenticated', role: 'authenticated' } })), { userId });
  await page.route('**/config.js*', route => route.fulfill({ contentType: 'application/javascript', body: 'window.TEDVIO_CONFIG={SUPABASE_URL:"https://bank-fixture.supabase.test",SUPABASE_PUBLISHABLE_KEY:"synthetic-publishable-key"};' }));
  await page.route('https://bank-fixture.supabase.test/**', async route => {
    const request = route.request(), url = new URL(request.url()), table = url.pathname.split('/').at(-1);
    let rows = [];
    if (table === 'tedvio_required_legal_documents_v21') rows = [{ document_key: 'terms', version: 'test', required: true, title: 'Prueba', content_html: '<p>Prueba.</p>' }];
    else if (table === 'tedvio_user_consents') rows = [{ document_key: 'terms', document_version: 'test' }];
    else if (table === 'tedvio_onboarding_snapshot_v21') rows = { completed: true, score: 5, dismissed: true };
    else if (table === 'v2_question_bank') {
      if (request.method() === 'POST') {
        const data = request.postDataJSON(); state.inserts.push(data);
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
