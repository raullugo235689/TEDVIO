import { test, expect } from '@playwright/test';

const legacyAsset = /(?:teacher-core-v68-6|teacher-router-v76-2|teacher-command-center-v70|teacher-periods-v76)\.(?:js|css)/;

test('la ruta canónica carga TEDVIO 2.0 sin capas heredadas', async ({ page }) => {
  const legacyRequests = [];
  page.on('request', (request) => {
    if (legacyAsset.test(request.url())) legacyRequests.push(request.url());
  });

  await page.goto('/teacher', { waitUntil: 'networkidle' });

  await expect(page).toHaveTitle(/TEDVIO · Docente/);
  await expect(page.locator('.login-page')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Bienvenido de nuevo' })).toBeVisible();
  await expect(page.locator('.login-story h1')).toHaveCount(1);
  await expect(page.locator('.login-story h1')).toHaveText('Todo tu trabajo docente, en un solo lugar.');
  await expect(page.locator('.login-story')).not.toContainText('migración');
  await expect(page.locator('.login-story')).not.toContainText('reconstrucción');
  await expect(page.locator('#root')).not.toBeEmpty();
  expect(legacyRequests).toEqual([]);
});

test('el alias de construcción conserva la misma aplicación', async ({ page }) => {
  await page.goto('/teacher-v2/', { waitUntil: 'networkidle' });
  await expect(page.locator('.login-page')).toBeVisible();
  await expect(page.locator('a.login-brand')).toHaveAttribute('href', '/teacher');
  await expect(page.locator('a.legacy-link')).toHaveAttribute('href', '/teacher-legacy');
});

test('el rollback abre la versión anterior de forma separada', async ({ page }) => {
  await page.goto('/teacher-legacy', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveTitle('TEDVIO · Docente');
  await expect(page.locator('script[src*="teacher-core-v68-6.js"]')).toHaveCount(1);
  await expect(page.locator('script[src*="teacher-router-v76-2.js"]')).toHaveCount(1);
});

test('la PWA instala la ruta canónica', async ({ request }) => {
  const response = await request.get('/manifest.webmanifest');
  expect(response.ok()).toBeTruthy();
  const manifest = await response.json();
  expect(manifest.id).toBe('/teacher');
  expect(manifest.start_url).toBe('/teacher');
});

test('el shell no queda en blanco durante el arranque móvil', async ({ page }) => {
  await page.goto('/teacher', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('body')).toBeVisible();
  await expect.poll(async () => page.locator('#root').evaluate((node) => node.childElementCount)).toBeGreaterThan(0);
  const rect = await page.locator('.login-card').boundingBox();
  expect(rect).not.toBeNull();
  expect(rect.width).toBeGreaterThan(250);
});

test('Student 2.x carga su cliente local y permite preparar el acceso', async ({ page }) => {
  const failedRequests = [];
  const pageErrors = [];
  page.on('requestfailed', (request) => failedRequests.push(request.url()));
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto('/student-v2/', { waitUntil: 'networkidle' });

  await expect(page).toHaveTitle('Clase en vivo · TEDVIO');
  await expect(page.locator('html')).toHaveAttribute('data-tedvio-surface', 'student-v2-react');
  await expect(page.getByRole('heading', { name: 'Entra a tu sesión' })).toBeVisible();
  await expect(page.getByLabel('Código de clase')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Entrar a clase' })).toBeDisabled();
  await expect(page.locator('#studentApp')).not.toBeEmpty();
  expect(failedRequests).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test('Projection 2.x carga su cliente local sin dejar una pantalla vacía', async ({ page }) => {
  const failedRequests = [];
  const pageErrors = [];
  page.on('requestfailed', (request) => failedRequests.push(request.url()));
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto('/projection-v2/', { waitUntil: 'networkidle' });

  await expect(page).toHaveTitle('TEDVIO · Projection 2.x');
  await expect(page.locator('html')).toHaveAttribute('data-tedvio-surface', 'projection-v2');
  await expect(page.getByRole('heading', { name: 'Pantalla de proyección' })).toBeVisible();
  await expect(page.getByPlaceholder('000000')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Abrir proyección' })).toBeDisabled();
  await expect(page.locator('#projectionApp')).not.toBeEmpty();
  expect(failedRequests).toEqual([]);
  expect(pageErrors).toEqual([]);
});
