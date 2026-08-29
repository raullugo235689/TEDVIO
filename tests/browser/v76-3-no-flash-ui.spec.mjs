import{test,expect}from'@playwright/test';

async function ready(page){
  await page.goto('/tests/browser/visual-stability-harness.html');
  await page.waitForFunction(()=>Boolean(window.__TEDVIO_ROUTER763__&&window.__TEDVIO_VISUAL763__));
  await page.waitForFunction(()=>document.querySelector('[data-tv763-route="dashboard"]')?.getAttribute('aria-current')==='page');
  await page.evaluate(()=>{window.__HARNESS__.header=document.querySelector('.tv686-top')});
}

const geometry=page=>page.evaluate(()=>{const h=document.querySelector('.tv686-top'),bar=document.querySelector('.b-top-actions'),r=h.getBoundingClientRect();return{width:r.width,height:r.height,scrollWidth:bar.scrollWidth}});

async function expectStableGeometry(before,after){
  expect(Math.abs(after.width-before.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(after.height-before.height)).toBeLessThanOrEqual(1);
  expect(Math.abs(after.scrollWidth-before.scrollWidth)).toBeLessThanOrEqual(1);
}

test.beforeEach(async({page})=>ready(page));

test('keeps the persistent shell and removes the animated route flash',async({page})=>{
  await page.getByRole('button',{name:'Banco'}).click();
  await expect(page.locator('#qs65Root')).toBeVisible();
  expect(await page.evaluate(()=>document.querySelector('.tv686-top')===window.__HARNESS__.header)).toBe(true);
  expect(await page.locator('#tv762RouteBar').count()).toBe(0);
  expect(await page.locator('#tv763SurfaceHold').count()).toBe(0);
  await page.getByRole('button',{name:'Preparadas'}).click();
  await expect(page.getByRole('heading',{name:'Sesiones preparadas'})).toBeVisible();
  await page.getByRole('button',{name:'Historial'}).click();
  await expect(page.locator('.tv686-main .route-view span').filter({hasText:/^HISTORIAL$/})).toBeVisible();
  await page.waitForFunction(()=>window.__TEDVIO_ROUTER763__?.current==='history'&&!window.__TEDVIO_ROUTER763__?.pending);
  await page.getByRole('button',{name:'Inicio'}).click();
  await expect(page.locator('#tv686Dashboard .tv70-dashboard')).toBeVisible();
  await page.waitForFunction(()=>window.__TEDVIO_ROUTER763__?.current==='dashboard'&&!window.__TEDVIO_ROUTER763__?.pending);
  expect(await page.evaluate(()=>document.querySelector('.tv686-top')===window.__HARNESS__.header)).toBe(true);
});

test('opens the first lazy Groups surface without exposing base and premium repaint stages',async({page})=>{
  const before=await geometry(page);
  await page.locator('#tvLazyGroups').click();
  await expect(page.locator('#tv763SurfaceHold')).toBeVisible();
  expect(await page.evaluate(()=>document.elementFromPoint(innerWidth/2,innerHeight/2)?.closest?.('#tv763SurfaceHold')?.id)).toBe('tv763SurfaceHold');
  await expect(page.locator('#gaOverlay[data-ga-premium="1"] .ga-premium-body')).toBeVisible();
  await expect(page.locator('#tv763SurfaceHold')).toHaveCount(0);
  const after=await geometry(page);
  await expectStableGeometry(before,after);
  const diagnostic=await page.evaluate(()=>({
    sameHeader:document.querySelector('.tv686-top')===window.__HARNESS__.header,
    original:window.__HARNESS__.lazyOriginalCalls,
    legacyClicks:window.__HARNESS__.legacyClicks,
    baseCalls:window.__HARNESS__.groupBaseCalls,
    blank:window.__HARNESS__.blankSurfaceFrames,
    hidden:[...document.querySelectorAll('#tedvioGroupsBtn,#pmAcademia,#tv66AssignmentsBtn,#tedvioPaperBtn,#tv67HelpBtn,#tv68OnboardingBtn,#tvAdminBtn')].every(x=>getComputedStyle(x).display==='none')
  }));
  expect(diagnostic).toEqual({sameHeader:true,original:0,legacyClicks:0,baseCalls:1,blank:0,hidden:true});
});

test('holds the group workspace until the final 360 center is ready',async({page})=>{
  await page.evaluate(async()=>{await window.__TEDVIO_PROGRESSIVE_BOOT68__.ensure('groups');for(let i=0;i<4;i++)await new Promise(r=>requestAnimationFrame(r))});
  const promise=page.evaluate(()=>window.gaOpenGroup('g1'));
  await expect(page.locator('#tv763SurfaceHold')).toBeVisible();
  await page.waitForTimeout(70);
  expect(await page.evaluate(()=>document.elementFromPoint(innerWidth/2,innerHeight/2)?.closest?.('#tv763SurfaceHold')?.id)).toBe('tv763SurfaceHold');
  await promise;
  await expect(page.locator('#gaOverlay .ga360-top')).toBeVisible();
  await expect(page.locator('#gaOverlay .ga360-body')).toContainText('Centro final');
  await expect(page.locator('#tv763SurfaceHold')).toHaveCount(0);
  expect(await page.evaluate(()=>window.__HARNESS__.blankSurfaceFrames)).toBe(0);
});

test('keeps lazy top actions at full size and restores them after feature readiness',async({page})=>{
  const before=await geometry(page);
  await page.locator('#tvLazyOmr').click();
  await expect(page.locator('#tvLazyOmr')).toHaveAttribute('aria-busy','true');
  expect(await page.locator('#tvLazyOmr').evaluate(el=>getComputedStyle(el).opacity)).toBe('1');
  await expect(page.getByRole('heading',{name:'Exámenes en papel'})).toBeVisible();
  await expect(page.locator('#tvLazyOmr')).not.toBeDisabled();
  await expect(page.locator('#tvLazyOmr')).not.toHaveAttribute('aria-busy','true');
  const after=await geometry(page);
  await expectStableGeometry(before,after);
});

test('covers the delayed session shell replacement instead of flashing the document',async({page})=>{
  await page.evaluate(()=>window.startSessionTransition());
  await page.waitForTimeout(220);
  await expect(page.locator('#tv763SurfaceHold')).toBeVisible();
  expect(await page.evaluate(()=>document.elementFromPoint(innerWidth/2,innerHeight/2)?.closest?.('#tv763SurfaceHold')?.id)).toBe('tv763SurfaceHold');
  await expect(page.locator('.tv686-session-shell')).toBeVisible();
  await expect(page.locator('#tv763SurfaceHold')).toHaveCount(0);
  expect(await page.evaluate(()=>window.__HARNESS__.blankSurfaceFrames)).toBe(0);
});
