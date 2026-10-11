import { test, expect } from '@playwright/test';

// Exercise the real teacher application with synthetic data only. No production writes.
test.use({ serviceWorkers: 'block' });
const userId = '11111111-1111-4111-8111-111111111111';
const sessionId = '33333333-3333-4333-8333-333333333333';
const firstId = '44444444-4444-4444-8444-444444444444';
const nextId = '55555555-5555-4555-8555-555555555555';
const origin = 'https://workspace-fixture.supabase.test';

async function fixture(page, { poll = false, lobby = false, closed = false } = {}) {
  const now = new Date().toISOString();
  const state = { errors: [], commands: [], reads: 0 };
  const session = {
    id: sessionId, teacher_id: userId, group_id: null, title: 'Clase de prueba · controles visibles',
    code: '654321', status: closed ? 'closed' : lobby ? 'draft' : 'live',
    current_question_id: lobby ? null : firstId, competitive: true, team_mode: false,
    is_demo: false, roster_required: false, created_at: now, started_at: now,
  };
  const question = {
    id: firstId, session_id: sessionId, position: 1,
    prompt: 'Identifica la zona señalada en la imagen de práctica. ' + 'Este enunciado extenso comprueba que los controles no se desplacen al final de la página. '.repeat(5),
    question_type: poll ? 'poll' : 'multiple_choice', options: ['Zona A', 'Zona B', 'Zona C', 'Zona D'],
    correct_answer: poll ? null : 'Zona A', explanation: 'Explicación de prueba. '.repeat(35),
    media_type: 'image', media_url: 'https://classroom-dock-fixture.test/diagram.svg',
    status: lobby ? 'queued' : closed ? 'revealed' : 'live', launched_at: now,
    timer_seconds: 180, closed_at: null, points: 100,
  };
  const next = { ...question, id: nextId, position: 2, prompt: 'Pregunta siguiente de práctica', status: 'queued', media_url: null };
  const participants = Array.from({ length: 50 }, (_, i) => ({
    id: `participant-${i}`, session_id: sessionId, display_name: `Participante de prueba ${i + 1}`,
    team_name: null, matricula: `TEST-${i + 1}`, roster_student_id: null, joined_at: now, last_seen_at: now,
  }));
  const responses = participants.slice(0, 35).map((p, i) => ({
    id: `response-${i}`, question_id: firstId, participant_id: p.id, answer: i % 2 ? 'Zona B' : 'Zona A',
    submitted_at: now, is_correct: poll ? null : i % 2 === 0, points: i % 2 ? 0 : 100, streak: 0,
  }));
  page.on('pageerror', error => state.errors.push(error.message));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(({ userId }) => localStorage.setItem('sb-workspace-fixture-auth-token', JSON.stringify({
    access_token: 'synthetic-access-token', refresh_token: 'synthetic-refresh-token',
    expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, token_type: 'bearer',
    user: { id: userId, email: 'docente@example.test', aud: 'authenticated', role: 'authenticated' },
  })), { userId });
  await page.route('**/config.js*', route => route.fulfill({
    contentType: 'application/javascript',
    body: `window.TEDVIO_CONFIG={SUPABASE_URL:"${origin}",SUPABASE_PUBLISHABLE_KEY:"synthetic-publishable-key"};`,
  }));
  await page.route('https://classroom-dock-fixture.test/**', route => route.fulfill({
    contentType: 'image/svg+xml',
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1000"><rect width="900" height="1000" fill="#edf3ff"/><ellipse cx="450" cy="450" rx="280" ry="350" fill="#c8d6e9"/><text x="350" y="450" font-size="48">Zona A</text></svg>',
  }));
  await page.route(origin + '/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const table = url.pathname.split('/').at(-1);
    let rows = [];
    if (table === 'user') rows = { id: userId, email: 'docente@example.test', aud: 'authenticated', role: 'authenticated', user_metadata: {} };
    else if (table === 'tedvio_required_legal_documents_v21') rows = [{ document_key: 'terms', version: 'test', required: true, title: 'Prueba', content_html: '<p>Prueba.</p>' }];
    else if (table === 'tedvio_user_consents') rows = [{ document_key: 'terms', document_version: 'test' }];
    else if (table === 'tedvio_onboarding_snapshot_v21') rows = { completed: true, score: 5, dismissed: true };
    else if (table === 'tedvio_user_profiles') rows = [{ status: 'active', plan: 'free', role: 'teacher', full_name: 'Docente de prueba' }];
    else if (table === 'profiles') rows = [{ id: userId, display_name: 'Docente de prueba' }];
    else if (table === 'tedvio_current_entitlements') rows = { plan: 'free', display_name: 'Free' };
    else if (table === 'v2_teacher_today_dashboard') rows = { groups: [], groups_count: 0, pending_attendance: 0, risk_students: 0, watch_students: 0, priority_students: [] };
    else if (table === 'v2_sessions') { state.reads++; rows = [session]; }
    else if (table === 'v2_questions') rows = [question, next];
    else if (table === 'v2_participants') rows = participants;
    else if (table === 'v2_responses') rows = responses;
    else if (table === 'v2_public_server_clock') rows = new Date().toISOString();
    else if (table === 'v2_teacher_classroom_command') {
      const command = request.postDataJSON();
      state.commands.push(command);
      if (command.p_action === 'reveal') question.status = 'revealed';
      if (command.p_action === 'close_question') question.status = 'closed';
      if (command.p_action === 'launch') {
        question.status = 'closed'; next.status = 'live'; session.current_question_id = nextId;
      }
      if (command.p_action === 'close_session') session.status = 'closed';
      rows = null;
    }
    if (request.headers().accept?.includes('vnd.pgrst.object+json') && Array.isArray(rows)) rows = rows[0] ?? null;
    await route.fulfill({ json: rows });
  });
  await page.goto(`/teacher#/classroom/${sessionId}`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.classroom31-control')).toBeVisible();
  return state;
}

async function dockVisibleAndClickable(page) {
  const dock = page.locator('.classroom31-toolbar');
  await expect(dock).toBeVisible();
  await expect(dock).toHaveCSS('position', 'fixed');
  const layout = await dock.evaluate(element => {
    const box = element.getBoundingClientRect();
    const nav = document.querySelector('.mobile-nav');
    const navBox = nav && getComputedStyle(nav).display !== 'none' ? nav.getBoundingClientRect() : null;
    const buttons = [...element.querySelectorAll('button, a')].map(button => {
      const r = button.getBoundingClientRect();
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return { text: button.textContent, left: r.left, right: r.right, top: r.top, bottom: r.bottom,
        clickable: !!hit && (hit === button || button.contains(hit)) };
    });
    return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, buttons,
      width: innerWidth, height: innerHeight, navTop: navBox?.top ?? innerHeight,
      contentWidth: document.documentElement.scrollWidth };
  });
  expect(layout.left, JSON.stringify(layout)).toBeGreaterThanOrEqual(0);
  expect(layout.right, JSON.stringify(layout)).toBeLessThanOrEqual(layout.width + 1);
  expect(layout.top, JSON.stringify(layout)).toBeGreaterThanOrEqual(0);
  expect(layout.bottom, JSON.stringify(layout)).toBeLessThanOrEqual(layout.navTop - 1);
  expect(layout.contentWidth, JSON.stringify(layout)).toBeLessThanOrEqual(layout.width + 1);
  for (const button of layout.buttons) {
    expect(button.left, JSON.stringify(button)).toBeGreaterThanOrEqual(layout.left);
    expect(button.right, JSON.stringify(button)).toBeLessThanOrEqual(layout.right);
    expect(button.top, JSON.stringify(button)).toBeGreaterThanOrEqual(layout.top);
    expect(button.bottom, JSON.stringify(button)).toBeLessThanOrEqual(layout.bottom);
    expect(button.clickable, JSON.stringify(button)).toBe(true);
  }
}

for (const [width, height] of [[320, 720], [390, 844], [768, 1024], [850, 650], [1024, 768], [1280, 720], [1440, 900]]) {
  test(`Modo Clase: controles dentro de la ventana con imagen larga, ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    const state = await fixture(page);
    await expect(page.locator('.classroom-media')).toBeVisible();
    for (const fraction of [0, .5, 1]) {
      await page.evaluate(f => scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * f), fraction);
      await dockVisibleAndClickable(page);
    }
    expect(state.commands).toEqual([]);
    expect(state.errors).toEqual([]);
    await page.screenshot({ path: test.info().outputPath(`classroom-dock-${width}.png`), fullPage: false });
  });
}

test('Modo Clase: actualizar conserva pregunta y desplazamiento; revelar y avanzar siguen funcionando', async ({ page }) => {
  const state = await fixture(page);
  await page.evaluate(() => scrollTo(0, 500));
  const initialY = await page.evaluate(() => scrollY);
  const reads = state.reads;
  await page.locator('.classroom31-toolbar').getByRole('button', { name: 'Actualizar', exact: true }).click();
  await expect.poll(() => state.reads).toBeGreaterThan(reads);
  expect(Math.abs(await page.evaluate(() => scrollY) - initialY)).toBeLessThanOrEqual(2);
  expect(state.commands).toEqual([]);
  await dockVisibleAndClickable(page);
  await page.locator('.classroom31-toolbar').getByRole('button', { name: 'Mostrar respuesta', exact: true }).click();
  await expect(page.locator('.question-explanation')).toBeVisible();
  expect(state.commands.map(x => x.p_action)).toEqual(['reveal']);
  await dockVisibleAndClickable(page);
  await page.locator('.classroom31-toolbar').getByRole('button', { name: 'Siguiente', exact: false }).click();
  await expect(page.locator('.classroom31-question-stage h2')).toHaveText('Pregunta siguiente de práctica');
  expect(state.commands.map(x => x.p_action)).toEqual(['reveal', 'launch']);
  await dockVisibleAndClickable(page);
  expect(state.errors).toEqual([]);
});

test('Modo Clase: encuesta y modo oscuro conservan controles accesibles', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const state = await fixture(page, { poll: true });
  await page.evaluate(() => document.documentElement.dataset.theme = 'dark');
  await expect(page.locator('.classroom31-toolbar').getByRole('button', { name: 'Mostrar respuesta', exact: true })).toHaveCount(0);
  await dockVisibleAndClickable(page);
  expect(state.commands).toEqual([]);
  expect(state.errors).toEqual([]);
  await page.screenshot({ path: test.info().outputPath('classroom-dock-dark-poll.png'), fullPage: false });
});

test('Modo Clase: el diálogo de cierre queda por encima de la barra; no cierra sin confirmar', async ({ page }) => {
  const state = await fixture(page);
  await page.getByRole('button', { name: 'Finalizar clase', exact: true }).click();
  const confirm = page.getByRole('dialog').getByRole('button', { name: 'Finalizar clase', exact: true });
  await expect(confirm).toBeVisible();
  expect(await confirm.evaluate(button => {
    const r = button.getBoundingClientRect();
    const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return !!hit && (hit === button || button.contains(hit));
  })).toBe(true);
  expect(state.commands).toEqual([]);
  expect(state.errors).toEqual([]);
});

for (const phase of ['lobby', 'closed']) {
  test(`Modo Clase: ${phase} no muestra la barra de una pregunta activa`, async ({ page }) => {
    const state = await fixture(page, { [phase]: true });
    await expect(page.locator('.classroom31-toolbar')).toHaveCount(0);
    await expect(page.locator('.classroom31-hero')).toBeVisible();
    expect(state.commands).toEqual([]);
    expect(state.errors).toEqual([]);
  });
}
