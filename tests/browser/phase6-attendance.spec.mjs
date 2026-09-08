import { test, expect } from '@playwright/test';

// Every API call is intercepted. These tests never use a real account or database.
async function attendanceFixture(page) {
  const userId = '11111111-1111-4111-8111-111111111111';
  const groupId = '22222222-2222-4222-8222-222222222222';
  const students = ['a', 'b'].map((id) => ({ id, group_id: groupId, teacher_id: userId, enrollment: id.toUpperCase(), full_name: `Alumno ${id.toUpperCase()}`, active: true }));
  const sessions = Object.fromEntries(['2026-09-08', '2026-09-09'].map((date) => [date, {
    id: `list-${date}`, group_id: groupId, teacher_id: userId, attendance_date: date,
    status: 'open', late_after_minutes: 10, auto_mark_absent: true, notes: '',
  }]));
  const state = {
    sessions, failWrite: false, writes: 0,
    records: {
      'list-2026-09-08': [{ id: 'record-a', student_id: 'a', status: 'present', note: '', observation: '' }],
      'list-2026-09-09': [{ id: 'record-b', student_id: 'a', status: 'late', note: '', observation: '' }],
    },
  };
  await page.addInitScript(({ userId }) => {
    localStorage.setItem('sb-attendance-fixture-auth-token', JSON.stringify({
      access_token: 'synthetic-access-token', refresh_token: 'synthetic-refresh-token',
      expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, token_type: 'bearer',
      user: { id: userId, email: 'teacher@example.test', aud: 'authenticated', role: 'authenticated' },
    }));
  }, { userId });
  await page.route('**/config.js*', (route) => route.fulfill({ contentType: 'application/javascript', body: 'window.TEDVIO_CONFIG={SUPABASE_URL:"https://attendance-fixture.supabase.test",SUPABASE_PUBLISHABLE_KEY:"synthetic-publishable-key"};' }));
  await page.route('https://attendance-fixture.supabase.test/**', async (route) => {
    const request = route.request(), url = new URL(request.url());
    const table = url.pathname.split('/').at(-1);
    const eq = (key) => (url.searchParams.get(key) || '').replace(/^eq\./, '');
    let rows = [];
    if (table === 'tedvio_required_legal_documents_v21') rows = [{ document_key: 'terms', version: 'test', required: true, title: 'Condiciones de prueba', content_html: '<p>Prueba sintética.</p>' }];
    else if (table === 'tedvio_user_consents') rows = [{ document_key: 'terms', document_version: 'test' }];
    else if (table === 'tedvio_onboarding_snapshot_v21') rows = { completed: true, score: 5, dismissed: true };
    else if (table === 'v2_groups') rows = [{ id: groupId, teacher_id: userId, name: 'Grupo de prueba', subject: 'Materia de prueba' }];
    else if (table === 'v2_group_students') rows = students;
    else if (table === 'v2_attendance_sessions') {
      if (request.method() === 'PATCH') {
        const session = Object.values(sessions).find((item) => item.id === eq('id'));
        Object.assign(session, request.postDataJSON());
      } else rows = sessions[eq('attendance_date')] ? [sessions[eq('attendance_date')]] : [];
    } else if (table === 'v2_attendance_records') {
      if (request.method() === 'POST') {
        state.writes += 1;
        if (state.failWrite) {
          await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Guardado simulado fallido' }) });
          return;
        }
        const input = request.postDataJSON();
        state.records[input[0].attendance_session_id] = input.map((row, i) => ({ ...row, id: `saved-${i}` }));
        rows = input.map((_, i) => ({ id: `saved-${i}` }));
      } else rows = state.records[eq('attendance_session_id')] || [];
    }
    if (request.headers().accept?.includes('vnd.pgrst.object+json') && Array.isArray(rows)) rows = rows[0] ?? null;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rows) });
  });
  await page.goto(`/teacher#/attendance/${groupId}?date=2026-09-08`);
  await expect(page.getByRole('heading', { name: 'Grupo de prueba' })).toBeVisible();
  return state;
}

const statusA = (page, label) => page.getByRole('group', { name: 'Estado de Alumno A' }).getByRole('button', { name: label, exact: true });

test('asistencia conserva la captura al navegar, perder conexión y reintentar un guardado', async ({ page, context }) => {
  const state = await attendanceFixture(page);
  await expect(page.locator('.attendance-work-status')).toContainText('Lista por guardar');
  await statusA(page, 'Falta').click();
  await page.getByLabel('Observación de Alumno A').fill('Avisó al docente');
  const date = page.locator('.attendance-date-controls input');
  await date.fill('2026-09-09');
  await expect(statusA(page, 'Retardo')).toHaveAttribute('aria-pressed', 'true');
  await date.fill('2026-09-08');
  await expect(statusA(page, 'Falta')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('Observación de Alumno A')).toHaveValue('Avisó al docente');

  await context.setOffline(true);
  await expect(page.locator('.attendance-work-status')).toContainText('Sin conexión');
  await expect(page.getByRole('button', { name: 'Guardar', exact: true })).toBeDisabled();
  await date.fill('2026-09-10');
  await expect(page.getByRole('heading', { name: 'Lista no disponible en esta pestaña' })).toBeVisible();
  await page.goBack();
  await expect(page.getByLabel('Observación de Alumno A')).toHaveValue('Avisó al docente');
  await context.setOffline(false);
  await expect(page.getByRole('button', { name: 'Guardar', exact: true })).toBeEnabled();
  state.failWrite = true;
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(page.getByText('Guardado simulado fallido')).toBeVisible();
  await expect(page.getByLabel('Observación de Alumno A')).toHaveValue('Avisó al docente');
  state.failWrite = false;
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(page.locator('.attendance-work-status')).toContainText('Lista guardada');
  expect(state.records['list-2026-09-08'].find((row) => row.student_id === 'a').status).toBe('absent');

  await page.getByRole('button', { name: 'Cerrar lista', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '¿Guardar y cerrar esta lista?' });
  await expect(dialog.getByRole('button', { name: 'Cancelar' })).toBeFocused();
  await dialog.getByRole('button', { name: 'Cancelar' }).click();
  expect(state.sessions['2026-09-08'].status).toBe('open');
  await page.getByRole('button', { name: 'Cerrar lista', exact: true }).click();
  await dialog.getByRole('button', { name: 'Guardar y cerrar' }).click();
  await expect(statusA(page, 'Falta')).toBeDisabled();
  await page.getByRole('button', { name: 'Reabrir lista', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Reabrir lista', exact: true }).click();
  await expect(statusA(page, 'Falta')).toBeEnabled();
  await expect(page.getByLabel('Observación de Alumno A')).toHaveValue('Avisó al docente');
});

test('asistencia detecta cambios remotos y pide confirmar antes de descartar o salir', async ({ page }) => {
  const state = await attendanceFixture(page);
  await statusA(page, 'Falta').click();
  state.records['list-2026-09-08'][0].status = 'justified';
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(page.locator('.attendance-work-status')).toContainText('La lista guardada cambió');
  expect(state.writes).toBe(0);
  await expect(statusA(page, 'Falta')).toHaveAttribute('aria-pressed', 'true');

  await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '¿Salir con asistencia pendiente?' })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancelar' }).click();
  await expect(statusA(page, 'Falta')).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => {
    const event = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented;
  })).toBe(true);
  await page.getByRole('button', { name: 'Descartar cambios', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Descartar cambios', exact: true }).click();
  await expect(statusA(page, 'Justificada')).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => {
    const event = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented;
  })).toBe(false);
});
