import { test,expect } from '@playwright/test';
test.use({serviceWorkers:'block'});
const user='11111111-1111-4111-8111-111111111111',group='22222222-2222-4222-8222-222222222222';
async function fixture(page) {
 const records=Array.from({length:3},(_,i)=>({id:`record-${i}`,revision:0,student_id:'pupil-1',session_id:`session-${i}`,full_name:'Alumno de prueba',enrollment:'TEST-001',group_id:group,group_name:'1-01',subject:'Anatomía',attendance_date:`2026-10-0${i+1}`,session_status:i===0?'closed':'open',status:'absent',note:i===0?'Observación original':'',period_closed:i===2,qr_active:false}));
 const state={records,calls:[],receipts:new Map(),failAfterSave:false,conflict:false,errors:[]};
 page.on('pageerror',e=>state.errors.push(e.message));
 await page.addInitScript(({user})=>localStorage.setItem('sb-bulk-fixture-auth-token',JSON.stringify({access_token:'synthetic-access-token',refresh_token:'synthetic-refresh-token',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user:{id:user,email:'teacher@example.test',aud:'authenticated',role:'authenticated'}})),{user});
 await page.route('**/config.js*',route=>route.fulfill({contentType:'application/javascript',body:'window.TEDVIO_CONFIG={SUPABASE_URL:"https://bulk-fixture.supabase.test",SUPABASE_PUBLISHABLE_KEY:"synthetic-publishable-key"};'}));
 await page.route('https://bulk-fixture.supabase.test/**',async route=>{
  const req=route.request(),url=new URL(req.url()),table=url.pathname.split('/').at(-1);let data=[];
  if(table==='user')data={id:user,email:'teacher@example.test',aud:'authenticated',role:'authenticated'};
  else if(table==='tedvio_required_legal_documents_v21')data=[{document_key:'terms',version:'test',required:true,title:'Prueba',content_html:'<p>Prueba</p>'}];
  else if(table==='tedvio_user_consents')data=[{document_key:'terms',document_version:'test'}];
  else if(table==='tedvio_onboarding_snapshot_v21')data={completed:true,dismissed:true,score:5};
  else if(table==='tedvio_user_profiles')data=[{status:'active',plan:'free',role:'teacher',full_name:'Docente de prueba'}];
  else if(table==='profiles')data=[{id:user,display_name:'Docente de prueba'}];
  else if(table==='v2_teacher_today_dashboard')data={groups:[{id:group,group_name:'1-01',subject:'Anatomía'}]};
  else if(table==='v2_preview_attendance_justifications')data={rows:records.filter(r=>r.status===req.postDataJSON().p_status),truncated:false};
  else if(table==='v2_change_attendance_justifications'){
    const input=req.postDataJSON();state.calls.push(input);
    if(state.conflict){await route.fulfill({status:409,json:{code:'PT409',message:'Una falta cambió desde la revisión. Actualiza y confirma de nuevo.'}});return;}
    if(state.receipts.has(input.p_request_id))data=state.receipts.get(input.p_request_id);
    else {
      for(const chosen of input.p_records){const r=records.find(r=>r.id===chosen.id);if(r.period_closed)throw new Error('Selected a closed academic period');r.status=input.p_action==='justify'?'justified':'absent';r.revision++;}
      data={request_id:input.p_request_id,changed:input.p_records.length};state.receipts.set(input.p_request_id,data);
      if(state.failAfterSave){state.failAfterSave=false;await route.fulfill({status:503,json:{message:'Confirmación interrumpida. Reintenta.'}});return;}
    }
  }
  if(req.headers().accept?.includes('vnd.pgrst.object+json')&&Array.isArray(data))data=data[0]??null;
  await route.fulfill({json:data});
 });
 await page.goto(`/teacher#/attendance-justifications?group=${group}`);
 await page.getByRole('button',{name:'Consultar faltas',exact:true}).click();
 await expect(page.getByRole('heading',{name:'3 faltas encontradas'})).toBeVisible();
 return state;
}
for(const width of [390,1280])test(`justificación por lote: confirmación, periodos protegidos y diseño ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:900});const state=await fixture(page);
 await expect(page.getByRole('checkbox',{name:'Seleccionar Alumno de prueba, 2026-10-03, 1-01',exact:true})).toBeDisabled();
 await page.getByRole('checkbox',{name:'Seleccionar todas las elegibles'}).check();
 await page.getByLabel('Motivo de la corrección',{exact:true}).fill('Justificante institucional recibido, folio 123');
 await page.getByRole('button',{name:'Revisar justificación · 2'}).click();const dialog=page.getByRole('dialog');
 await expect(dialog.getByRole('button',{name:'Cancelar',exact:true})).toBeFocused();
 await expect(dialog.getByRole('button',{name:'Confirmar justificación'})).toBeDisabled();
 await dialog.getByRole('button',{name:'Cancelar',exact:true}).click();expect(state.calls).toHaveLength(0);
 await page.getByRole('button',{name:'Revisar justificación · 2'}).click();
 await dialog.getByRole('checkbox').check();await dialog.getByRole('button',{name:'Confirmar justificación'}).click();
 await expect(page.getByRole('status').filter({hasText:'2 ausencias justificadas.'})).toBeVisible();
 expect(state.records[0].note).toBe('Observación original');expect(state.records[0].session_status).toBe('closed');expect(state.records[2].status).toBe('absent');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await page.screenshot({path:test.info().outputPath(`justifications-${width}.png`),fullPage:true});expect(state.errors).toEqual([]);
});
test('un reintento reutiliza el recibo; una revocación deja una operación nueva',async({page})=>{
 const state=await fixture(page);state.failAfterSave=true;
 await page.getByRole('checkbox',{name:'Seleccionar todas las elegibles'}).check();await page.getByLabel('Motivo de la corrección',{exact:true}).fill('Documento revisado');await page.getByRole('button',{name:'Revisar justificación · 2'}).click();
 const dialog=page.getByRole('dialog');await dialog.getByRole('checkbox').check();await dialog.getByRole('button',{name:'Confirmar justificación'}).click();await expect(dialog.getByText('Confirmación interrumpida. Reintenta.')).toBeVisible();
 await dialog.getByRole('button',{name:'Confirmar justificación'}).click();await expect(dialog).toHaveCount(0);expect(state.calls[0].p_request_id).toBe(state.calls[1].p_request_id);
 await page.getByLabel('Consultar',{exact:true}).selectOption('justified');await page.getByRole('button',{name:'Consultar faltas',exact:true}).click();await expect(page.getByRole('heading',{name:'2 justificadas encontradas'})).toBeVisible();
 await page.getByRole('checkbox',{name:'Seleccionar todas las elegibles'}).check();await page.getByLabel('Motivo de la corrección',{exact:true}).fill('Corrección de folio');await page.getByRole('button',{name:'Revisar revocación · 2'}).click();await dialog.getByRole('checkbox').check();await dialog.getByRole('button',{name:'Confirmar revocación'}).click();await expect(dialog).toHaveCount(0);expect(state.receipts.size).toBe(2);
});
test('conflicto conserva la selección y cambiar filtros exige nueva revisión',async({page})=>{
 const state=await fixture(page);state.conflict=true;
 await page.getByRole('checkbox',{name:'Seleccionar todas las elegibles'}).check();await page.getByLabel('Motivo de la corrección',{exact:true}).fill('Documento recibido');await page.getByRole('button',{name:'Revisar justificación · 2'}).click();
 const dialog=page.getByRole('dialog');await dialog.getByRole('checkbox').check();await dialog.getByRole('button',{name:'Confirmar justificación'}).click();await expect(dialog.getByText(/Una falta cambió/)).toBeVisible();expect(state.records.every(r=>r.status==='absent')).toBe(true);
 await dialog.getByRole('button',{name:'Cancelar',exact:true}).click();await page.getByLabel('Alumno o matrícula',{exact:true}).fill('Otro');await expect(page.getByText(/Cambiaste los filtros/)).toBeVisible();await expect(page.getByRole('button',{name:'Revisar justificación · 2'})).toHaveCount(0);
});
