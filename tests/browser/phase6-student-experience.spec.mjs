import { test, expect } from '@playwright/test';

// Entire journey is mocked at the HTTP boundary; never creates real sessions or students.
test.use({ serviceWorkers: 'block' });

const origin = 'https://student-v3-fixture.supabase.test';
const ids = {
  session: '11111111-1111-4111-8111-111111111111',
  participant: '22222222-2222-4222-8222-222222222222',
  question: '33333333-3333-4333-8333-333333333333',
  response: '44444444-4444-4444-8444-444444444444',
};
async function fixture(page) {
  const state = { phase: 'lobby', answer: null, joined: 0, fatal: false, errors: [] };
  page.on('pageerror', e => state.errors.push(e.message));
  await page.route('**/config.js*', route => route.fulfill({
    contentType: 'application/javascript',
    body: 'window.TEDVIO_CONFIG={SUPABASE_URL:"' + origin + '",SUPABASE_PUBLISHABLE_KEY:"synthetic-public-key"};',
  }));
  await page.route(origin + '/**', route => {
    const request = route.request();
    const url = new URL(request.url());
    const endpoint = url.pathname.split('/').at(-1);
    const headers = {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, POST, OPTIONS',
      'access-control-allow-headers': 'apikey, authorization, content-type, x-client-info, prefer',
    };
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers, body: '' });
    let rows = [];
    if (endpoint === 'v2_join_session_v3') {
      state.joined++;
      rows = [{
        session_id: ids.session, participant_id: ids.participant,
        display_name: 'María Fernanda', group_name: 'Medicina 3A',
        team_name: null, roster_student_id: null,
      }];
    } else if (endpoint === 'v2_sessions') {
      rows = [{
        id: ids.session, code: 'ABC123', title: 'Sesión anatomoclínica',
        status: state.phase === 'finished' ? 'closed' : state.phase === 'lobby' ? 'draft' : 'live',
        current_question_id: state.phase === 'lobby' || state.phase === 'finished' ? null : ids.question,
        competitive: false, team_mode: false, started_at: new Date().toISOString(),
        closed_at: state.phase === 'finished' ? new Date().toISOString() : null,
      }];
    } else if (endpoint === 'v2_questions') {
      if (url.searchParams.get('select') === 'correct_answer') {
        rows = [{ correct_answer: 'Opción A' }];
      } else {
        rows = [{
          id: ids.question, position: 1, prompt: '¿Cuál es el diagnóstico más probable?',
          question_type: 'multiple_choice',
          options: ['Opción A', 'Opción B', 'Opción C', 'Opción D'],
          media_url: null, media_type: null,
          timer_seconds: 120,
          status: state.phase === 'result' ? 'revealed' : state.phase === 'lobby' ? 'queued' : 'live',
          launched_at: new Date(Date.now() - 5_000).toISOString(), closed_at: null,
        }];
      }
    } else if (endpoint === 'v2_student_answer_result') {
      rows = state.answer ? [{
        answer: state.answer, submitted_at: new Date().toISOString(),
        is_correct: true, points: 100, streak: 1,
      }] : [];
    } else if (endpoint === 'v2_submit_response_v2') {
      const requestBody = request.postDataJSON();
      state.answer = requestBody.p_answer;
      rows = {
        receipt_version: 1, confirmed: true, status: 'recorded',
        request_id: requestBody.p_request_id,
        question_id: requestBody.p_question_id,
        response_id: ids.response,
        submitted_at: new Date().toISOString(),
      };
    } else if (endpoint === 'v2_student_answer_feedback') {
      rows = [{
        explanation: state.fatal ? { invalid_react_child: true } : 'La opción A corresponde a la respuesta de referencia.',
      }];
    } else if (endpoint === 'v2_student_feedback') {
      rows = [{ answered_count: 1, correct_count: 1, total_points: 100, rank: 1 }];
    } else if (endpoint === 'v2_public_question_results') {
      rows = [{ answer: 'Opción A', votes: 1, total: 1 }];
    } else if (endpoint === 'v2_record_session_health') {
      rows = true;
    }
    if (request.headers().accept?.includes('vnd.pgrst.object+json') && Array.isArray(rows)) {
      rows = rows[0] ?? null;
    }
    return route.fulfill({ status: 200, headers, json: rows });
  });
  return state;
}
async function noHorizontalOverflow(page) {
  const size = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth, viewport: window.innerWidth,
  }));
  expect(size.scroll, JSON.stringify(size)).toBeLessThanOrEqual(size.viewport + 1);
}

test('Student 3.0: ingreso → espera → pregunta → confirmación → resultados → cierre', async ({ page }) => {
  test.setTimeout(120_000);
  const state = await fixture(page);
  await page.goto('/student-v2/?code=ABC123', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Entra a tu sesión' })).toBeVisible();
  await expect(page.locator('.student-v3-entry-card')).toBeVisible();
  await expect(page.getByLabel('Código de clase')).toHaveValue('ABC123');
  await noHorizontalOverflow(page);
  await page.screenshot({ path: test.info().outputPath('student3-ingreso.png'), fullPage: true });

  await page.getByLabel('Nombre', { exact: true }).fill('María Fernanda');
  await page.getByRole('button', { name: 'Entrar a clase' }).dblclick();
  await expect(page.getByRole('heading', { name: 'Estás dentro.' })).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.student-v3-waiting')).toContainText('Sesión anatomoclínica');
  await expect(page.locator('.live-fatal-card')).toHaveCount(0);
  expect(state.joined).toBe(1);
  await page.screenshot({ path: test.info().outputPath('student3-espera.png'), fullPage: true });

  state.phase = 'question';
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: '¿Cuál es el diagnóstico más probable?' })).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.student-v3-question .option')).toHaveCount(4);
  await expect(page.getByRole('progressbar', { name: 'Tiempo disponible' })).toBeVisible();
  await noHorizontalOverflow(page);
  await page.screenshot({ path: test.info().outputPath('student3-pregunta.png'), fullPage: true });

  await page.locator('.student-v3-question .option').first().click();
  await expect(page.getByRole('heading', { name: 'Listo.' })).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.student-v3-confirmed')).toBeVisible();
  expect(state.answer).toBe('Opción A');
  await page.screenshot({ path: test.info().outputPath('student3-confirmacion.png'), fullPage: true });

  state.phase = 'result';
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Correcto' })).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.student-v3-result')).toContainText('Así respondió tu grupo');
  await page.screenshot({ path: test.info().outputPath('student3-resultados.png'), fullPage: true });

  state.phase = 'finished';
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Clase completada' })).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.student-v3-finished')).toContainText('María Fernanda');
  await noHorizontalOverflow(page);
  await page.screenshot({ path: test.info().outputPath('student3-final.png'), fullPage: true });
  const fatal = await page.evaluate(() => localStorage.getItem('tedvio.live.last_fatal_error'));
  expect(fatal).toBeNull();
  expect(state.errors).toEqual([]);
});

test('Student 3.0: recovery gives usable reference and retry without deleting student state', async ({ page }) => {
  test.setTimeout(70_000);
  const state = await fixture(page);
  await page.goto('/student-v2/?code=ABC123', { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Nombre', { exact: true }).fill('María Fernanda');
  await page.getByRole('button', { name: 'Entrar a clase' }).click();
  await expect(page.getByRole('heading', { name: 'Estás dentro.' })).toBeVisible({ timeout: 15_000 });

  state.answer = 'Opción A';
  state.phase = 'result';
  state.fatal = true;
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('.live-fatal-card')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.live-fatal-reference')).toContainText('LIVE-');
  await expect(page.getByText('Información técnica para soporte')).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('student3-recuperacion.png'), fullPage: true });
  await noHorizontalOverflow(page);

  // Recovery automatically retries once after 350 ms. If that succeeds, a
  // manual button must not be required; otherwise the button must stay usable.
  state.fatal = false;
  await page.waitForTimeout(600);
  if (!(await page.getByRole('heading', { name: 'Correcto' }).isVisible())) {
    const retry = page.getByRole('button', { name: 'Reintentar ahora' });
    await expect(retry).toBeEnabled();
    await retry.click();
  }
  await expect(page.getByRole('heading', { name: 'Correcto' })).toBeVisible({ timeout: 15_000 });
});

test('Student 3.0: screens fit a narrow phone without changing answer functionality', async ({ page }) => {
  const state = await fixture(page);
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/student-v2/?code=ABC123', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.student-v3-entry-card')).toBeVisible();
  await noHorizontalOverflow(page);
  await page.getByLabel('Nombre', { exact: true }).fill('María Fernanda');
  await page.getByRole('button', { name: 'Entrar a clase' }).click();
  await expect(page.locator('.student-v3-waiting')).toBeVisible({ timeout: 15_000 });
  await noHorizontalOverflow(page);
  state.phase = 'question';
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('.student-v3-question .option')).toHaveCount(4);
  await noHorizontalOverflow(page);
  const minimumTapHeight = await page.locator('.student-v3-question .option').first().evaluate(node => node.getBoundingClientRect().height);
  expect(minimumTapHeight).toBeGreaterThanOrEqual(44);
  await page.setViewportSize({ width: 390, height: 844 });
  await noHorizontalOverflow(page);
});
