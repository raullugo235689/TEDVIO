import { test, expect } from '@playwright/test';

const EMAIL = process.env.TEDVIO_E2E_EMAIL || '';
const PASSWORD = process.env.TEDVIO_E2E_PASSWORD || '';

async function acceptLegalGateIfNeeded(page) {
  const gate = page.locator('.legal-gate-card');
  if (!await gate.isVisible().catch(() => false)) return;
  const checkboxes = gate.locator('input[type="checkbox"]');
  const count = await checkboxes.count();
  for (let index = 0; index < count; index += 1) {
    await checkboxes.nth(index).check();
  }
  await gate.getByRole('button', { name: /Aceptar .* documento/ }).click();
  await expect(page.locator('.app-shell')).toBeVisible();
}

async function signIn(page) {
  await page.goto('/teacher', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.login-page')).toBeVisible();
  await page.getByLabel('Correo').fill(EMAIL);
  await page.getByLabel('Contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Entrar a TEDVIO' }).click();
  await Promise.race([
    page.locator('.app-shell').waitFor({ state: 'visible', timeout: 20_000 }),
    page.locator('.legal-gate-card').waitFor({ state: 'visible', timeout: 20_000 }),
  ]);
  await acceptLegalGateIfNeeded(page);
  await expect(page.locator('.app-shell')).toBeVisible();
}

async function closeOnboardingIfOpen(page) {
  const dialog = page.locator('.onboarding-dialog');
  if (!await dialog.isVisible().catch(() => false)) return;
  await dialog.getByRole('button', { name: 'Cerrar guía' }).click();
  await expect(dialog).toBeHidden();
}

test.describe('TEDVIO authenticated launch smoke', () => {
  test.skip(!EMAIL || !PASSWORD, 'Configura TEDVIO_E2E_EMAIL y TEDVIO_E2E_PASSWORD con una cuenta sintética.');

  test('sesión, onboarding, demo y módulos críticos permanecen operables', async ({ page }, testInfo) => {
    const pageErrors = [];
    const consoleErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });

    await signIn(page);
    await expect(page.locator('.topbar')).toBeVisible();
    await expect(page.locator('.onboarding-launcher')).toBeVisible();

    const launcher = page.locator('.onboarding-launcher');
    await launcher.click();
    const onboarding = page.locator('.onboarding-dialog');
    await expect(onboarding).toBeVisible();
    await expect(onboarding.locator('.onboarding-checklist article')).toHaveCount(5);

    if (testInfo.project.name === 'chromium-desktop') {
      const create = onboarding.getByRole('button', { name: 'Crear demostración' });
      const reset = onboarding.getByRole('button', { name: 'Reiniciar demo' });
      if (await create.isVisible().catch(() => false)) await create.click();
      else if (await reset.isVisible().catch(() => false)) await reset.click();
      await expect(page).toHaveURL(/#\/classroom\//);
      await expect(page.locator('.route-container')).not.toBeEmpty();

      await page.getByRole('link', { name: /Salud/ }).click();
      await expect(page.getByRole('button', { name: 'Comprobar sesión' })).toBeVisible();
      await page.getByRole('button', { name: 'Comprobar sesión' }).click();
      await expect(page.locator('.session-check-grid article')).toHaveCount(14, { timeout: 60_000 });
      await expect(page.getByText('TEDVIO está listo para recibir alumnos')).toBeVisible({ timeout: 60_000 });
      await expect(page.getByText(/sala temporal eliminada/)).toBeVisible();
    } else {
      await closeOnboardingIfOpen(page);
    }

    const routes = [
      ['groups', 'Grupos'],
      ['attendance', 'Asistencia'],
      ['classroom', 'Modo Clase'],
      ['bank', 'Banco'],
      ['exams', 'Evaluaciones'],
      ['omr', 'OMR'],
      ['gradebook', 'Calificaciones'],
      ['students', 'Alumno 360°'],
      ['analytics', 'Analítica'],
      ['periods', 'Periodos'],
      ['reports', 'Reportes'],
      ['settings', 'Configuración'],
      ['support', 'Soporte'],
    ];

    for (const [route, title] of routes) {
      await page.goto(`/teacher#/${route}`, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('.app-shell')).toBeVisible();
      await expect(page.locator('.topbar-title h1')).toContainText(title);
      await expect(page.locator('.route-container')).not.toBeEmpty();
      await expect(page.locator('.fatal-screen')).toHaveCount(0);
      await closeOnboardingIfOpen(page);
    }

    await page.goBack();
    await expect(page.locator('.app-shell')).toBeVisible();
    await page.goForward();
    await expect(page.locator('.app-shell')).toBeVisible();

    expect(pageErrors, `Errores de página: ${pageErrors.join(' | ')}`).toEqual([]);
    expect(consoleErrors, `Errores de consola: ${consoleErrors.join(' | ')}`).toEqual([]);
  });
});
