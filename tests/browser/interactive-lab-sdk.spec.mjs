import {test,expect} from '@playwright/test';
for(const width of [390,1280]) test(`SDK aislado: canal, CSP y recibo en ${width}px`,async({page,request})=>{
 await page.setViewportSize({width,height:844});await page.goto('/');
 await expect(page.frameLocator('iframe').locator('#state')).toHaveText('Recibo validado');
 const activity=page.frames().find(frame=>frame.url().endsWith('/activity'));
 const probes=await activity.evaluate(()=>window.probes);
 expect(probes.parent).toBe('blocked');expect(probes.storage).toBe('blocked');expect(probes.network).toBe('blocked');
 expect(probes.receipt).toEqual(probes.again);expect(probes.receipt.official_grade).toBe(false);
 const observed=await page.evaluate(()=>window.fixture);
 expect(observed.calls).toBe(1);expect(Object.keys(observed.message).sort()).toEqual(['answers','context','protocol','requestId','type']);
 expect(observed.message.answers).toEqual({q1:'a',q2:4});expect((await (await request.get('/test-count')).json()).forbiddenRequests).toBe(0);
 await page.evaluate(()=>window.labHost.close());
});
