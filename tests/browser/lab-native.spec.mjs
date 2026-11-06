import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
const fixture=JSON.parse(readFileSync(new URL('../../.lab-test-local/fixture.json',import.meta.url),'utf8'));
if(!/^http:\/\/(127\.0\.0\.1|localhost):54321\/?$/.test(fixture.api))throw new Error('Isolated API only');
async function configure(page,session){
 await page.route('**/config.js*',route=>route.fulfill({contentType:'text/javascript',body:`window.TEDVIO_CONFIG=${JSON.stringify({SUPABASE_URL:fixture.api,SUPABASE_PUBLISHABLE_KEY:fixture.anon})};`}));
 if(session)await page.addInitScript(({session,api})=>{const key=`sb-${new URL(api).hostname.split('.')[0]}-auth-token`;localStorage.setItem(key,JSON.stringify(session));},{session,api:fixture.api});
 // No auth/REST/RPC result is mocked. All Lab calls use actual local PostgREST.
}
async function rpc(request,name,args,session){
 return request.post(`${fixture.api}/rest/v1/rpc/${name}`,{headers:{apikey:fixture.anon,Authorization:`Bearer ${session?.access_token||fixture.anon}`},data:args});
}
test('native complete: teacher creates and assigns; learner submits; PostgreSQL persists; teacher reviews and exports',async({page,browser,request},info)=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await configure(page,fixture.teacher.session);
 await page.goto('/teacher#/interactive-lab/new');
 const title=`Actividad nativa ${info.project.name}`;
 await page.getByLabel('Título',{exact:true}).fill(title);await page.getByLabel('Materia',{exact:true}).fill('Práctica de cálculo');
 await page.getByLabel('Instrucciones',{exact:true}).fill('Ejercicio sintético. Selecciona A y calcula 2 + 2.');
 await page.getByLabel('Enunciado 1',{exact:true}).fill('Selecciona A');
 for(const label of ['A','B','C','D'])await page.getByLabel(`Opción ${label}`,{exact:true}).fill(label);
 await page.getByRole('button',{name:'Añadir pregunta',exact:true}).click();
 const second=page.getByRole('group',{name:'Pregunta 2',exact:true});await second.getByLabel('Tipo',{exact:true}).selectOption('numeric');
 await page.getByLabel('Enunciado 2',{exact:true}).fill('Calcula 2 + 2');await second.getByLabel('Respuesta correcta',{exact:true}).fill('4');
 await page.getByRole('button',{name:'Guardar actividad',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Interactive Lab',exact:true})).toBeVisible();
 const card=page.locator('.lab-card').filter({has:page.getByRole('heading',{name:title,exact:true})});
 await card.getByRole('button',{name:'Publicar actividad',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Publicar versión',exact:true}).click();
 await card.getByRole('button',{name:'Asignar actividad',exact:true}).click();
 await page.getByRole('dialog').getByRole('checkbox').first().check();
 // Permit beginning now despite timezone and minute rounding.
 await page.getByLabel('Apertura (hora local)').fill(new Date(Date.now()-3600000-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16));
 await page.getByRole('dialog').getByRole('button',{name:'Crear asignación',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Seguimiento de alumnos',exact:true})).toBeVisible();
 const assignmentId=page.url().split('/assignments/')[1];expect(assignmentId).toMatch(/^[a-f0-9-]{36}$/);
 await page.getByRole('button',{name:'Publicar asignación',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Confirmar cambio',exact:true}).click();
 const studentRow=page.getByRole('row').filter({hasText:'TEST-001'});
 await studentRow.getByRole('button',{name:'Entregar acceso',exact:true}).click();await page.getByRole('dialog').getByRole('checkbox').check();
 await page.getByRole('dialog').getByRole('button',{name:'Generar código personal',exact:true}).click();
 const token=await page.getByLabel('Código personal',{exact:true}).inputValue();expect(token).toMatch(/^[a-f0-9]{64}$/);
 await page.getByRole('dialog').getByRole('button',{name:'Listo',exact:true}).click();
 const studentContext=await browser.newContext();const student=await studentContext.newPage();await configure(student);
 await student.goto('http://127.0.0.1:4174/teacher#/lab-access');await student.getByLabel('Código de acceso',{exact:true}).fill(token);
 await student.getByRole('button',{name:'Verificar acceso',exact:true}).click();await expect(student.getByRole('heading',{name:title,exact:true})).toBeVisible();
 const before=await(await rpc(request,'v2_lab_results',{p_assignment_id:assignmentId},fixture.teacher.session)).json();expect(before.summary).toEqual({assigned:2,started:0,finished:0});
 await student.getByRole('button',{name:'Iniciar actividad',exact:true}).click();await student.getByRole('radio',{name:'A',exact:true}).check();await student.getByLabel('Tu respuesta',{exact:true}).fill('4');
 // Simulate a lost response AFTER PostgreSQL commits, not a fake receipt.
 let lost=false;const submissions=[];
 await student.route('**/rest/v1/rpc/v2_lab_submit',async route=>{submissions.push(route.request().postDataJSON());if(!lost){lost=true;const actual=await route.fetch();expect(actual.ok()).toBeTruthy();await route.abort('failed');}else await route.continue();});
 await student.getByRole('button',{name:'Finalizar y enviar',exact:true}).click();await student.getByRole('dialog').getByRole('button',{name:'Confirmar entrega',exact:true}).click();
 await expect(student.getByRole('dialog').getByRole('button',{name:'Confirmar entrega',exact:true})).toBeEnabled();
 await expect(student.getByRole('heading',{name:'Entrega confirmada',exact:true})).toHaveCount(0);
 await student.getByRole('dialog').getByRole('button',{name:'Confirmar entrega',exact:true}).click();
 await expect(student.getByRole('heading',{name:'Entrega confirmada',exact:true})).toBeVisible();
 expect(submissions.length).toBe(2);expect(submissions[0].p_request_id).toBe(submissions[1].p_request_id);
 await expect(student.getByText('Tu docente aún no ha habilitado su consulta',{exact:true})).toBeVisible();
 const receipt=await(await rpc(request,'v2_lab_receipt',{p_token:token,p_attempt_id:submissions[0].p_attempt_id})).json();expect(receipt.status).toBe('verified');expect(receipt.receipt_id).toBe(submissions[0].p_request_id);
 await page.reload();await expect(page.getByRole('row').filter({hasText:'TEST-001'})).toContainText('100.00');
 const persisted=await(await rpc(request,'v2_lab_results',{p_assignment_id:assignmentId},fixture.teacher.session)).json();
 expect(persisted.summary).toEqual({assigned:2,started:1,finished:1});expect(persisted.rows.find(r=>r.enrollment==='TEST-001').attempts).toBe(1);
 await page.getByRole('row').filter({hasText:'TEST-001'}).getByRole('button',{name:'Ver respuestas',exact:true}).click();await expect(page.getByRole('dialog').getByText('Correcta',{exact:true})).toHaveCount(2);await page.getByRole('dialog').getByRole('button',{name:'Listo',exact:true}).click();
 const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Exportar toda la asignación',exact:true}).click();const download=await downloadPromise;
 const csv=readFileSync(await download.path(),'utf8');expect(csv).toContain('TEST-001');expect(csv).toContain('TEST-002');expect(csv).toContain('100');expect(csv).toContain('Sin iniciar');
 const denyAnon=await rpc(request,'v2_lab_results',{p_assignment_id:assignmentId});expect(denyAnon.ok()).toBeFalsy();
 const denyOther=await rpc(request,'v2_lab_results',{p_assignment_id:assignmentId},fixture.other.session);expect(denyOther.ok()).toBeFalsy();
 // Enable score through the native teacher screen; student must explicitly refresh.
 await page.getByRole('button',{name:'Mostrar puntuación al alumno',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Confirmar cambio',exact:true}).click();
 await student.getByRole('button',{name:'Consultar resultado actualizado',exact:true}).click();await expect(student.getByText('100 / 100',{exact:true})).toBeVisible();
 for(const width of [320,390,768,1280]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBeTruthy();await page.screenshot({path:info.outputPath(`lab-results-${width}.png`),fullPage:true});}
 await student.setViewportSize({width:390,height:844});await student.screenshot({path:info.outputPath('lab-student-receipt-390.png'),fullPage:true});
 const storage=await student.evaluate(()=>JSON.stringify({...localStorage,...sessionStorage}));expect(storage).not.toContain(token);expect(student.url()).not.toContain(token);
 await page.goto('/teacher#/interactive-lab');await expect(page.getByRole('heading',{name:'Interactive Lab',exact:true})).toBeVisible();await page.screenshot({path:info.outputPath('lab-library.png'),fullPage:true});
 expect(errors).toEqual([]);await studentContext.close();
});
