import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
test.use({ serviceWorkers: 'block' });
const groupId = '22222222-2222-4222-8222-222222222222', examId = '33333333-3333-4333-8333-333333333333', userId = '11111111-1111-4111-8111-111111111111';
async function fixture(page, path = `/omr/${examId}`) {
  const state = {
    fail: false, writes: 0, publications: 0,
    exam: { id: examId, teacher_id: userId, group_id: groupId, period_id: 'p1', title: 'Parcial de prueba', subject: 'Ciencias', question_count: 4, option_count: 4, versions: ['A', 'B'], answer_keys: { A: ['A', 'B', 'C', 'D'], B: ['D', 'C', 'B', 'A'] }, status: 'ready', source_mode: 'bank', version_strategy: 'balanced', max_score: 10, passing_score: 6, exam_date: '2026-09-08', created_at: '2026-09-01T10:00:00Z', updated_at: '2026-09-01T10:00:00Z', question_metadata: {}, grade_item_id: 'item1', instructions: 'Selecciona una sola respuesta por reactivo.' },
    period: { id: 'p1', teacher_id: userId, group_id: groupId, name: 'Primer parcial', status: 'open', starts_on: '2026-09-01', ends_on: '2026-09-30', order_index: 1, course_weight: 100 },
    results: [], scores: [],
  };
  const students = ['a', 'b'].map(id => ({ id, group_id: groupId, teacher_id: userId, full_name: `Alumno ${id.toUpperCase()}`, enrollment: id.toUpperCase(), active: true }));
  await page.addInitScript(({ userId }) => localStorage.setItem('sb-exams-fixture-auth-token', JSON.stringify({ access_token: 'synthetic-access-token', refresh_token: 'synthetic-refresh-token', expires_at: Math.floor(Date.now()/1000)+3600, expires_in: 3600, token_type: 'bearer', user: { id: userId, email: 'teacher@example.test', aud: 'authenticated', role: 'authenticated' } })), { userId });
  await page.route('**/config.js*', route => route.fulfill({ contentType: 'application/javascript', body: 'window.TEDVIO_CONFIG={SUPABASE_URL:"https://exams-fixture.supabase.test",SUPABASE_PUBLISHABLE_KEY:"synthetic-publishable-key"};' }));
  await page.route('https://exams-fixture.supabase.test/**', async route => {
    const request = route.request(), table = new URL(request.url()).pathname.split('/').at(-1);
    let rows = [];
    if (table === 'tedvio_required_legal_documents_v21') rows = [{ document_key: 'terms', version: 'test', required: true, title: 'Prueba', content_html: '<p>Prueba.</p>' }];
    else if (table === 'tedvio_user_consents') rows = [{ document_key: 'terms', document_version: 'test' }];
    else if (table === 'tedvio_onboarding_snapshot_v21') rows = { completed: true, score: 5, dismissed: true };
    else if (table === 'v2_groups') rows = [{ id: groupId, teacher_id: userId, name: 'Grupo de prueba', is_demo: false }];
    else if (table === 'v2_group_students') rows = students;
    else if (table === 'v2_academic_periods') rows = [state.period];
    else if (table === 'v2_paper_exams') rows = [state.exam];
    else if (table === 'v2_paper_exam_questions') rows = state.exam.versions.flatMap(version => Array.from({ length: state.exam.question_count }, (_, i) => ({ id: `${version}-${i}`, exam_id: examId, version, position: i + 1, source_position: i + 1, prompt: `Reactivo de prueba ${i + 1}`, question_type: 'mcq', options: ['Opción uno', 'Opción dos', 'Opción tres', 'Opción cuatro'], correct_answer: ['Opción uno', 'Opción dos', 'Opción tres', 'Opción cuatro'][state.exam.answer_keys[version][i]?.charCodeAt(0) - 65], explanation: 'EXPLICACIÓN SOLO DOCENTE', points: 1 })));
    else if (table === 'v2_paper_exam_results') rows = state.results;
    else if (table === 'v2_grade_categories') rows = [{ id: 'c1', group_id: groupId, name: 'Exámenes', kind: 'omr', weight: 100 }];
    else if (table === 'v2_grade_items') rows = [{ id: 'item1', group_id: groupId, category_id: 'c1', title: state.exam.title, max_score: 10, source_type: 'omr', source_id: examId, period_id: 'p1', item_date: state.exam.exam_date }];
    else if (table === 'v2_grade_scores') rows = state.scores;
    else if (table === 'v2_teacher_academic_period_summary') rows = { ready: false, issues: [] };
    else if (table === 'v2_save_omr_result') {
      state.writes++;
      if (state.fail) { await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Guardado interrumpido de prueba' }) }); return; }
      const input = request.postDataJSON(), correct = input.p_answers.filter((answer, i) => answer === state.exam.answer_keys[input.p_version][i]).length;
      rows = { id: input.p_result_id || 'result1', exam_id: examId, student_id: input.p_student_id, enrollment: input.p_enrollment, student_name: input.p_student_name, version: input.p_version, answers: input.p_answers, correct_count: correct, blank_count: input.p_answers.filter(answer => !answer).length, score: correct / state.exam.question_count * 10, reviewed: input.p_review_confirmed, review_status: input.p_review_confirmed ? 'confirmed' : 'needs_review', scan_quality: input.p_scan_quality, scan_warnings: input.p_scan_warnings, review_note: input.p_review_note, created_at: '2026-09-08T10:00:00Z', updated_at: '2026-09-08T10:00:00Z', reviewed_at: input.p_review_confirmed ? '2026-09-08T10:00:00Z' : null };
      state.results = [...state.results.filter(row => row.id !== rows.id), rows];
    } else if (table === 'v2_gradebook_link_omr') {
      state.publications++;
      state.scores = state.results.filter(row => row.reviewed).map(row => ({ id: `score-${row.id}`, item_id: 'item1', student_id: row.student_id, score: row.score, source_id: row.id, source_type: 'omr' }));
      rows = { item_id: 'item1', linked: state.scores.length };
    }
    if (request.headers().accept?.includes('vnd.pgrst.object+json') && Array.isArray(rows)) rows = rows[0] ?? null;
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(rows) });
  });
  await page.goto(`/teacher#${path}`);
  await expect(page.getByRole('heading', { name: path.includes('gradebook') ? 'Grupo de prueba' : path === '/exams/new' ? 'Construir evaluación' : state.exam.title, exact: true }).first()).toBeVisible();
  return state;
}
const navigate = (page, path) => page.evaluate(path => { window.location.hash = path; }, path);
const answer = (page, number, letter) => page.getByRole('group', { name: `Respuesta ${number}`, exact: true }).getByRole('button', { name: letter, exact: true });
async function capture(page) { await page.getByRole('button', { name: 'Abrir escáner OMR' }).click(); await page.getByRole('button', { name: /Captura manual/ }).click(); await page.getByLabel('Alumno', { exact: true }).selectOption('a'); }

test('impresión separa cuadernillo y clave y conserva centros de burbujas en A4 y Carta', async ({ page }) => {
  await fixture(page, `/exams/${examId}/print?version=all`);
  await expect(page.getByRole('button', { name: 'Imprimir / Guardar PDF' })).toBeEnabled();
  await expect(page.locator('.exam-paper-questions > li')).toHaveCount(8);
  await expect(page.getByText('EXPLICACIÓN SOLO DOCENTE')).toHaveCount(0);
  await expect(page.locator('.exam-answer-key')).toHaveCount(0);
  await page.getByLabel('Documento', { exact: true }).selectOption('key');
  await expect(page.locator('.exam-answer-key > div')).toHaveCount(8);
  await expect(page.locator('.exam-paper-questions')).toHaveCount(0);
  await navigate(page, `/omr/${examId}/sheets?mode=roster&alternate=1`);
  await expect(page.getByRole('button', { name: 'Imprimir / Guardar PDF' })).toBeEnabled();
  await expect(page.locator('.omr-sheet-page')).toHaveCount(2);
  await expect(page.locator('[data-omr-qr]').nth(1)).toHaveAttribute('data-omr-qr', `TEDVIO-OMR|${examId}|B|b|B`);
  await expect(page.locator('[data-omr-qr] img')).toHaveCount(2);
  for (const paper of ['a4', 'letter']) {
    await page.getByLabel('Papel', { exact: true }).selectOption(paper);
    await page.emulateMedia({ media: 'print' });
    const metrics = await page.locator('.omr-sheet-page').first().evaluate(sheet => {
      const box = sheet.getBoundingClientRect(), wrap = sheet.querySelector('.omr-bubble-wrap'), circle = wrap.querySelector('i').getBoundingClientRect();
      return { width: box.width * 25.4 / 96, height: box.height * 25.4 / 96, transform: getComputedStyle(sheet).transform, x: (circle.x + circle.width/2 - box.x)/box.width, y: (circle.y + circle.height/2 - box.y)/box.height, qrLoaded: sheet.querySelector('[data-omr-qr] img').naturalWidth > 0 };
    });
    expect(metrics.transform).toBe('none'); expect(metrics.width).toBeCloseTo(paper === 'a4' ? 210 : 215.9, 1); expect(metrics.height).toBeCloseTo(paper === 'a4' ? 297 : 279.4, 1); expect(metrics.x).toBeCloseTo(.18, 3); expect(metrics.y).toBeCloseTo(.28, 3); expect(metrics.qrLoaded).toBe(true);
    await page.emulateMedia({ media: 'screen' });
  }
});

test('revisión conserva respuestas, bloquea dudas y permite recuperar un fallo de guardado', async ({ page, context }) => {
  const state = await fixture(page); await capture(page);
  await answer(page, 1, 'A').click(); await answer(page, 2, 'B').click();
  await expect(page.getByRole('button', { name: 'Confirmar y calificar' })).toBeDisabled();
  await page.getByLabel('Nota de revisión').fill('Revisar hoja original');
  await page.getByRole('button', { name: 'Cerrar escáner' }).click(); await page.getByRole('dialog').getByRole('button', { name: 'Conservar y cerrar' }).click();
  await page.getByRole('button', { name: 'Abrir escáner OMR' }).click(); await expect(answer(page, 1, 'A')).toHaveAttribute('aria-pressed', 'true'); await expect(page.getByLabel('Nota de revisión')).toHaveValue('Revisar hoja original');
  await answer(page, 3, 'C').click(); await answer(page, 4, 'En blanco').click();
  await context.setOffline(true); await expect(page.getByRole('button', { name: 'Confirmar y calificar' })).toBeDisabled(); await context.setOffline(false);
  state.fail = true; await page.getByRole('button', { name: 'Confirmar y calificar' }).click(); await page.getByRole('dialog').getByRole('button', { name: 'Confirmar resultado', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Guardado interrumpido de prueba'); expect(state.writes).toBe(1);
  state.fail = false; await page.getByRole('dialog').getByRole('button', { name: 'Confirmar resultado', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Abrir escáner OMR' })).toBeVisible(); expect(state.results[0].answers).toEqual(['A', 'B', 'C', null]); expect(state.results[0].reviewed).toBe(true); expect(state.results[0].review_note).toBe('Revisar hoja original');
});

test('cierre remoto conserva revisión y evita la escritura', async ({ page }) => {
  const state = await fixture(page); await capture(page); await answer(page, 1, 'A').click(); state.period.status = 'closed';
  await page.getByRole('button', { name: 'Guardar pendiente', exact: true }).click(); await page.getByRole('dialog').getByRole('button', { name: 'Guardar pendiente', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('La evaluación o el resultado cambiaron'); expect(state.writes).toBe(0);
  await page.getByRole('dialog').getByRole('button', { name: 'Cancelar' }).click(); await expect(answer(page, 1, 'A')).toBeDisabled(); await expect(answer(page, 1, 'A')).toHaveAttribute('aria-pressed', 'true');
});

test('publicación comprueba notas y exige revisar cambios ocurridos antes de confirmar', async ({ page }) => {
  const state = await fixture(page);
  state.results = [{ id: 'r1', exam_id: examId, student_id: 'a', version: 'A', score: 8, correct_count: 3, blank_count: 0, reviewed: true, review_status: 'confirmed', reviewed_at: '2026-09-08T10:00:00Z', updated_at: '2026-09-08T10:00:00Z', created_at: '2026-09-08T10:00:00Z' }];
  state.scores = [{ id: 's1', item_id: 'item1', student_id: 'a', score: 5, source_id: 'r1', source_type: 'omr' }];
  await navigate(page, `/gradebook/${groupId}?period=p1`);
  await page.getByRole('navigation', { name: 'Secciones del Libro' }).getByRole('button', { name: 'Evidencias', exact: true }).click();
  await expect(page.getByText('Cambios pendientes', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Revisar publicación', exact: true }).click(); state.results[0].score = 9;
  await page.getByRole('dialog').getByRole('button', { name: 'Publicar y verificar' }).click(); await expect(page.getByRole('dialog')).toContainText('Los resultados cambiaron'); expect(state.publications).toBe(0);
  await page.getByRole('dialog').getByRole('button', { name: 'Publicar y verificar' }).click();
  await expect(page.getByText('Actualizado', { exact: true })).toBeVisible(); expect(state.publications).toBe(1); expect(state.scores[0].score).toBe(9);
});

test('borrador de examen conserva instrucciones al navegar y protege la salida', async ({ page }) => {
  await fixture(page, '/exams/new'); await page.getByLabel('Título', { exact: true }).fill('Nuevo parcial'); await page.getByLabel('Instrucciones', { exact: true }).fill('Lee con atención.');
  await page.getByRole('button', { name: 'Conservar y volver' }).click(); await navigate(page, '/exams/new');
  await expect(page.getByLabel('Título', { exact: true })).toHaveValue('Nuevo parcial'); await expect(page.getByLabel('Instrucciones', { exact: true })).toHaveValue('Lee con atención.');
  await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click(); await expect(page.getByRole('dialog', { name: '¿Salir con trabajo pendiente?' })).toBeVisible(); await page.getByRole('dialog').getByRole('button', { name: 'Cancelar' }).click();
});

test('lector óptico distingue marcas, dobles y blancos en hojas sintéticas A4 y Carta', async ({ page }) => {
  await fixture(page);
  // Execute the actual optical engine with synthetic pixels; QR decoding is outside this test.
  const source = stripTypeScriptTypes(readFileSync(new URL('../../apps/teacher-v2/src/core/omr-engine.ts', import.meta.url), 'utf8'));
  await page.route('**/omr-engine-fixture.js', route => route.fulfill({ contentType: 'application/javascript', body: source }));
  const results = await page.evaluate(async () => {
    const { analyzeOmrFile, omrLayout } = await import('/omr-engine-fixture.js'); window.jsQR = () => null;
    const output = [];
    for (const [widthMm, heightMm] of [[210, 297], [215.9, 279.4]]) {
      const canvas = document.createElement('canvas'); canvas.width = Math.round(widthMm * 4); canvas.height = Math.round(heightMm * 4); const ctx = canvas.getContext('2d'); const w = canvas.width, h = canvas.height;
      ctx.fillStyle = 'white'; ctx.fillRect(0, 0, w, h); ctx.fillStyle = 'black';
      for (const [x, y] of [[.055, .045], [.945, .045], [.945, .955], [.055, .955]]) ctx.fillRect(x*w-14, y*h-14, 28, 28);
      const expected = [];
      omrLayout(60, 5).forEach((row, index) => {
        const selected = index % 5; expected.push(index === 3 || index === 4 ? null : 'ABCDE'[selected]);
        row.answerXs.forEach((x, option) => { ctx.beginPath(); ctx.arc(x*w, row.y*h, 8.4, 0, Math.PI*2); ctx.strokeStyle = 'black'; ctx.lineWidth = 1.4; ctx.stroke(); if (index !== 3 && (option === selected || (index === 4 && option === 0))) { ctx.fillStyle = 'black'; ctx.fill(); } });
      });
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png')); const result = await analyzeOmrFile(new File([blob], 'synthetic.png', { type: 'image/png' }), 60, 5);
      output.push({ answers: result.answers, expected, blank: result.quality[3].status, double: result.quality[4].status });
    }
    return output;
  });
  for (const result of results) { expect(result.answers).toEqual(result.expected); expect(result.blank).toBe('blank'); expect(result.double).toBe('ambiguous'); }
});
