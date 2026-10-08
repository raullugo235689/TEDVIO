import { test, expect } from '@playwright/test';

// Exercise the authenticated-to-student transition without touching real student data.
test.use({ serviceWorkers: 'block' });

const sessionId = '11111111-1111-4111-8111-111111111111';
const participantId = '22222222-2222-4222-8222-222222222222';
const questionId = '33333333-3333-4333-8333-333333333333';
const origin = 'https://student-join-fixture.supabase.test';

test('Student 2.x: nombre → sesión preparada → regreso en iPhone sin pantalla fatal', async ({ page }) => {
  const pageErrors = [];
  const authorizationHeaders = [];
  let joins = 0;
  page.on('pageerror', error => pageErrors.push(error.message));
  // A teacher login must remain completely separate from public Student 2.x.
  await page.addInitScript(() => {
    localStorage.setItem('sb-student-join-fixture-auth-token', JSON.stringify({
      access_token: 'synthetic-teacher-secret',
      refresh_token: 'synthetic-teacher-refresh',
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      token_type: 'bearer',
      user: { id: '44444444-4444-4444-8444-444444444444', role: 'authenticated' },
    }));
  });

  await page.route('**/config.js*', route => route.fulfill({
    contentType: 'application/javascript',
    body: `window.TEDVIO_CONFIG={SUPABASE_URL:"${origin}",SUPABASE_PUBLISHABLE_KEY:"synthetic-public-key"};`,
  }));
  await page.route(`${origin}/**`, route => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    authorizationHeaders.push(request.headers()['authorization'] || '');
    const headers = {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, POST, OPTIONS',
      'access-control-allow-headers': 'apikey, authorization, content-type, x-client-info, prefer',
    };
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers, body: '' });
    let body = [];
    if (pathname.endsWith('/rpc/v2_join_session_v3')) {
      joins += 1;
      body = [{
        session_id: sessionId, participant_id: participantId,
        display_name: 'Alumno de prueba', team_name: null,
        roster_student_id: null, group_name: 'Grupo de prueba',
      }];
    } else if (pathname.endsWith('/v2_sessions')) {
      body = [{
        id: sessionId, code: 'ABC123', title: 'Sesión de prueba',
        status: 'draft', current_question_id: null,
        competitive: false, team_mode: false, started_at: null, closed_at: null,
      }];
    } else if (pathname.endsWith('/v2_questions')) {
      body = [{
        id: questionId, position: 1, prompt: 'Reactivo de prueba',
        question_type: 'multiple_choice', options: ['Opción A', 'Opción B'],
        timer_seconds: 30, status: 'queued', launched_at: null, closed_at: null,
      }];
    } else if (pathname.endsWith('/rpc/v2_record_session_health')) {
      body = true;
    }
    return route.fulfill({ status: 200, headers, json: body });
  });

  await page.goto('/student-v2/?code=ABC123', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Entra a tu sesión' })).toBeVisible();
  await page.getByLabel('Nombre', { exact: true }).fill('Alumno de prueba');
  await page.getByRole('button', { name: 'Entrar a clase' }).dblclick();
  await expect(page.getByRole('heading', { name: 'Estás dentro.' })).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.live-fatal-card')).toHaveCount(0);
  expect(joins).toBe(1);
  expect(authorizationHeaders.some(header => header.includes('synthetic-teacher-secret'))).toBe(false);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Estás dentro.' })).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.live-fatal-card')).toHaveCount(0);
  const diagnostic = await page.evaluate(() => localStorage.getItem('tedvio.live.last_fatal_error'));
  expect(pageErrors, diagnostic || 'Sin diagnóstico guardado').toEqual([]);
  expect(diagnostic).toBeNull();
});
