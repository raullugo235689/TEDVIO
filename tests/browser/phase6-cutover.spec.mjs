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
  await expect(page.getByRole('heading', { name: 'Tu clase, sin capas ni parpadeos.' })).toHaveCount(1);
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
