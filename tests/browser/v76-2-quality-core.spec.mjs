import{test,expect}from'@playwright/test';

async function ready(page){
  await page.goto('/tests/browser/router-harness.html');
  await page.waitForFunction(()=>Boolean(window.__TEDVIO_ROUTER762__));
  await page.waitForFunction(()=>document.querySelector('[data-tv762-route="dashboard"]')?.getAttribute('aria-current')==='page');
}

async function top(page,label,selector){
  await page.getByRole('button',{name:label,exact:true}).click();
  await page.waitForSelector(selector);
  await page.waitForFunction(()=>document.documentElement.dataset.tedvioRouteBusy!=='true');
}

test.beforeEach(async({page})=>ready(page));

test('keeps one shell and never exposes a blank main while navigating',async({page})=>{
  await page.evaluate(()=>{window.__HARNESS__.header=document.querySelector('.tv686-top')});
  await top(page,'Banco','#qs65Root');
  await expect(page.locator('[data-tv762-route="bank"]')).toHaveAttribute('aria-current','page');
  await top(page,'Preparadas','text=Sesiones preparadas');
  await top(page,'Historial','text=HISTORIAL');
  await top(page,'Inicio','#tv686Dashboard .tv70-dashboard');
  const result=await page.evaluate(()=>({
    sameHeader:window.__HARNESS__.header===document.querySelector('.tv686-top'),
    blankFrames:window.__HARNESS__.blankFrames,
    dashboardBaseCalls:window.__HARNESS__.baseCalls.dashboard,
    routeReady:window.__HARNESS__.routeReady
  }));
  expect(result.sameHeader).toBe(true);
  expect(result.blankFrames).toBe(0);
  expect(result.dashboardBaseCalls).toBe(0);
  expect(result.routeReady).toEqual(['bank','quizzes','history','dashboard']);
});

test('suppresses same-route work and restores route scroll on browser history',async({page})=>{
  await top(page,'Banco','#qs65Root');
  await page.evaluate(()=>window.scrollTo(0,620));
  await page.waitForFunction(()=>window.scrollY>500);
  const before=await page.evaluate(()=>window.__HARNESS__.routeReady.length);
  await page.getByRole('button',{name:'Banco',exact:true}).click();
  await page.waitForTimeout(120);
  const after=await page.evaluate(()=>window.__HARNESS__.routeReady.length);
  expect(after).toBe(before);

  await top(page,'Historial','text=HISTORIAL');
  await page.evaluate(()=>window.scrollTo(0,140));
  await page.evaluate(()=>history.back());
  await page.waitForSelector('#qs65Root');
  await page.waitForFunction(()=>document.documentElement.dataset.tedvioRouteBusy!=='true');
  await page.waitForFunction(()=>window.scrollY>500);
  await expect(page.locator('[data-tv762-route="bank"]')).toHaveAttribute('aria-current','page');
});
