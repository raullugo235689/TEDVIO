import { test, expect, devices } from '@playwright/test';
test.use({ serviceWorkers: 'block' });
const uid='11111111-1111-4111-8111-111111111111';
const gids=['22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444','55555555-5555-4555-8555-555555555555'];
function state(){return {challenge:null,challengeCalls:0,challengeTTL:60000,rotations:0,failChallenge:false,event:null,creates:[],registrations:[],failCreate:false,closed:false,records:[],groups:gids.map((id,i)=>({id,name:`Grupo ${i+1}`,group_name:`Grupo ${i+1}`,subject:`Materia ${i+1}`,university:i<2?'Universidad Autónoma de Sinaloa':'Universidad de Los Mochis',teacher_id:uid,students:2})),students:gids.flatMap((id,i)=>[1,2].map(n=>({id:`student-${i}-${n}`,group_id:id,teacher_id:uid,enrollment:`00${n}`,full_name:`Alumno ${i+1}-${n}`,active:true}))) };}
function summary(s){return {event:s.event,server_now:new Date().toISOString(),groups:s.groups.filter(g=>s.event?.group_ids.includes(g.id)).map(g=>({group_id:g.id,name:g.name,subject:g.subject,university:g.university,session_id:`session-${g.id}`,session_status:s.closed?'closed':'open',total:2,registered:s.registrations.filter(r=>r.group_id===g.id).length,...Object.fromEntries(['present','late','absent','justified'].map(status=>[status,s.records.filter(r=>r.attendance_session_id===`session-${g.id}`&&r.status===status).length]))})),recent:s.registrations.slice().reverse().map(r=>({full_name:r.full_name,group_name:s.groups.find(g=>g.id===r.group_id).name,registered_at:r.registered_at}))};}
async function fixture(page,s,teacher=true){
 if(teacher) await page.addInitScript(({uid})=>localStorage.setItem('sb-joint-fixture-auth-token',JSON.stringify({access_token:'synthetic-access-token',refresh_token:'synthetic-refresh-token',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user:{id:uid,email:'teacher@example.test',aud:'authenticated',role:'authenticated'}})),{uid});
 await page.route('**/config.js*',r=>r.fulfill({contentType:'application/javascript',body:'window.TEDVIO_CONFIG={SUPABASE_URL:"https://joint-fixture.supabase.test",SUPABASE_PUBLISHABLE_KEY:"synthetic-publishable-key"};'}));
 await page.route('https://joint-fixture.supabase.test/**',async route=>{
  const req=route.request(),url=new URL(req.url()),table=url.pathname.split('/').at(-1),eq=key=>(url.searchParams.get(key)||'').replace(/^eq\./,'');let data=[];
  if(table==='tedvio_required_legal_documents_v21') data=[{document_key:'terms',version:'test',required:true,title:'Prueba',content_html:'<p>Prueba.</p>'}];
  else if(table==='tedvio_user_consents') data=[{document_key:'terms',document_version:'test'}];
  else if(table==='tedvio_onboarding_snapshot_v21') data={completed:true,score:5,dismissed:true};
  else if(table==='v2_teacher_today_dashboard') data={groups:s.groups};
  else if(table==='v2_groups') data=eq('id')?s.groups.filter(g=>g.id===eq('id')):s.groups;
  else if(table==='v2_group_students') data=s.students.filter(st=>!eq('group_id')||st.group_id===eq('group_id'));
  else if(table==='v2_attendance_events') data=s.event?[s.event]:[];
  else if(table==='v2_create_attendance_event'){
   const {p_request_id:id,p_payload:p}=req.postDataJSON();s.creates.push({id,p});
   if(!s.event)s.event={id,...p,token:'a'.repeat(32),created_at:new Date().toISOString(),expires_at:new Date(Date.now()+p.duration_minutes*60000).toISOString(),closed_at:null,status:'open'};
   if(s.failCreate){s.failCreate=false;await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'Respuesta no confirmada. Reintenta.'})});return;}data=s.event.id;
  }else if(table==='v2_attendance_event_summary') data=s.event?summary(s):null;
  else if(table==='v2_enable_attendance_rotation'){s.event.verification_mode='rotating';data=s.event.id;}
  else if(table==='v2_attendance_event_challenge'){
   s.challengeCalls++;
   if(s.failChallenge){await route.fulfill({status:503,json:{message:'No se pudo renovar.'}});return;}
   if(s.closed||Date.parse(s.event.expires_at)<=Date.now()) data={available:false,server_now:new Date().toISOString()};
   else{if(!s.challenge||Date.parse(s.challenge.expires_at)<=Date.now()){s.rotations++;s.challenge={available:true,qr_proof:s.rotations.toString(16).padStart(32,'0'),code:String(122+s.rotations).padStart(6,'0'),expires_at:new Date(Math.min(Date.now()+s.challengeTTL,Date.parse(s.event.expires_at))).toISOString()};}data={...s.challenge,server_now:new Date().toISOString()};}
  }
  else if(table==='v2_attendance_event_meta') data=!s.event||s.closed||Date.parse(s.event.expires_at)<=Date.now()?{ok:false,message:'El registro terminó. Consulta a tu docente.'}:{ok:true,...s.event,server_now:new Date().toISOString(),groups:s.groups.filter(g=>s.event.group_ids.includes(g.id))};
  else if(table==='v2_attendance_event_checkin'||table==='v2_attendance_event_checkin_secure'){
   const p=req.postDataJSON(),st=s.students.find(st=>st.group_id===p.p_group_id&&st.enrollment===p.p_enrollment);
   if(s.closed||Date.parse(s.event.expires_at)<=Date.now()) data={ok:false,message:'El registro terminó.'};
   else if(s.event.verification_mode==='rotating'&&(!s.challenge||Date.parse(s.challenge.expires_at)<=Date.now()||![s.challenge.code,s.challenge.qr_proof].includes(p.p_proof)))data={ok:false,error_code:'code_expired',message:'El QR o código ya no es válido. Escribe el código que tu docente muestra ahora.'};
   else if(!st)data={ok:false,message:'La matrícula no está registrada en el grupo seleccionado.'};
   else{if(!s.registrations.some(r=>r.id===st.id)){s.registrations.push({...st,registered_at:new Date().toISOString()});s.records.push({id:`record-${st.id}`,attendance_session_id:`session-${st.group_id}`,student_id:st.id,teacher_id:uid,status:'present',observation:'Registro por asistencia conjunta'});}data={ok:true,message:'Asistencia registrada',student_name:st.full_name,group_name:s.groups.find(g=>g.id===st.group_id).name,attendance_date:s.event.attendance_date,status:'present',registered_at:new Date().toISOString()};}
  }else if(table==='v2_close_attendance_event'){
   s.closed=true;s.event.status='closed';s.event.closed_at=new Date().toISOString();
   if(s.event.auto_mark_absent) for(const st of s.students.filter(st=>s.event.group_ids.includes(st.group_id))) if(!s.records.some(r=>r.student_id===st.id)) s.records.push({id:`record-${st.id}`,attendance_session_id:`session-${st.group_id}`,student_id:st.id,teacher_id:uid,status:'absent'});
   data=s.event.id;
  }else if(table==='v2_attendance_sessions')data=s.event?[{id:`session-${eq('group_id')}`,group_id:eq('group_id'),teacher_id:uid,attendance_date:s.event.attendance_date,status:s.closed?'closed':'open',entry_mode:'qr',checkin_event_id:s.event.id,late_after_minutes:s.event.late_after_minutes,auto_mark_absent:s.event.auto_mark_absent,notes:''}]:[];
  else if(table==='v2_attendance_records')data=s.records.filter(r=>r.attendance_session_id===eq('attendance_session_id'));
  if(req.headers().accept?.includes('vnd.pgrst.object+json')&&Array.isArray(data))data=data[0]??null;
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
 });
}
async function start(page,s,all=true){await fixture(page,s);await page.goto('/teacher#/attendance');await page.getByRole('link',{name:'Asistencia conjunta · QR'}).click();await page.getByLabel('Nombre de la clase').fill('Anatomía · sesión conjunta');for(let i=1;i<=(all?4:1);i++)await page.getByRole('checkbox',{name:`Grupo ${i} · Materia ${i}`,exact:true}).check();}
async function publicPage(browser,s,testInfo){const context=await browser.newContext({...devices[testInfo.project.name==='iphone-webkit'?'iPhone 15 Pro':'Desktop Chrome'],serviceWorkers:'block'});const page=await context.newPage();await fixture(page,s,false);return {context,page};}
async function screenshot(page,testInfo,name){await page.screenshot({path:testInfo.outputPath(name),fullPage:true});}
test('QR conjunto: cuatro grupos, alumno sin cuenta, matrícula correcta, control y cierre',async({page,browser},testInfo)=>{
 const s=state();await start(page,s);await page.getByLabel('Tiempo para registrarse').selectOption('30');await screenshot(page,testInfo,'joint-setup.png');await page.getByRole('button',{name:'Iniciar asistencia conjunta'}).click();await expect(page.getByRole('heading',{name:'Anatomía · sesión conjunta',level:1})).toBeVisible();await expect(page.getByAltText('Código QR para registrar asistencia')).toBeVisible();expect(s.creates[0].p.group_ids).toHaveLength(4);expect(s.records).toHaveLength(0);
 await page.getByRole('link',{name:'Ver lista del grupo →'}).first().click();await expect(page.getByRole('heading',{name:'Registro por QR en curso'})).toBeVisible();await expect(page.getByText('Sin registro',{exact:true})).toHaveCount(2);await expect(page.getByRole('button',{name:'Todos presentes'})).toHaveCount(0);await page.getByRole('link',{name:'Abrir asistencia conjunta'}).click();
 const url=await page.getByLabel('Enlace para alumnos').inputValue();const pupil=await publicPage(browser,s,testInfo);await pupil.page.goto(url);await expect(pupil.page.getByRole('heading',{name:'Anatomía · sesión conjunta'})).toBeVisible();await expect(pupil.page.getByText('No necesitas una cuenta de TEDVIO.',{exact:false})).toBeVisible();await pupil.page.getByRole('combobox',{name:/Tu grupo/}).selectOption(gids[3]);await pupil.page.getByLabel('Código de la clase',{exact:false}).fill(s.challenge.code);await pupil.page.getByLabel('Matrícula',{exact:true}).fill('999');await pupil.page.getByRole('button',{name:'Registrar mi asistencia'}).click();await expect(pupil.page.getByRole('alert')).toContainText('matrícula');await pupil.page.getByLabel('Matrícula',{exact:true}).fill('001');await screenshot(pupil.page,testInfo,'joint-student-form.png');await pupil.page.getByRole('button',{name:'Registrar mi asistencia'}).click();await expect(pupil.page.getByRole('heading',{name:'Asistencia registrada'})).toBeVisible();await expect(pupil.page.getByRole('heading',{name:'Alumno 4-1'})).toBeVisible();expect(s.registrations[0].group_id).toBe(gids[3]);await screenshot(pupil.page,testInfo,'joint-student-success.png');
 await page.getByRole('button',{name:'Actualizar',exact:true}).click();await expect(page.locator('.joint-total>strong')).toContainText('1 / 8');await screenshot(page,testInfo,'joint-live.png');await page.getByRole('button',{name:'Mostrar QR y código'}).click();const dialog=page.getByRole('dialog');await expect(dialog.getByAltText('Código QR para registrar asistencia')).toBeVisible();await expect(dialog.getByText('Alumno 4-1')).toHaveCount(0);await dialog.getByRole('button',{name:'Listo'}).click();await page.getByRole('button',{name:'Cerrar asistencia',exact:true}).click();await page.getByRole('button',{name:'Cerrar y guardar listas'}).click();await expect(page.getByText('Listas guardadas',{exact:true})).toBeVisible();expect(s.records.filter(r=>r.status==='absent')).toHaveLength(7);await pupil.page.reload();await expect(pupil.page.getByRole('alert')).toContainText('terminó');await expect(pupil.page.getByRole('button',{name:'Registrar mi asistencia'})).toHaveCount(0);await pupil.context.close();
});
test('configuración y reintentos sobreviven desconexión y no duplican registros conjuntos',async({page,context},testInfo)=>{
 const s=state();await start(page,s,false);await context.setOffline(true);await expect(page.getByRole('button',{name:'Iniciar asistencia conjunta'})).toBeDisabled();await expect(page.getByText('Sin conexión. Tu configuración se conserva; vuelve a conectarte para iniciar.')).toBeVisible();expect(s.creates).toHaveLength(0);await context.setOffline(false);s.failCreate=true;await page.getByRole('button',{name:'Iniciar asistencia conjunta'}).click();await expect(page.getByRole('alert')).toContainText('Respuesta no confirmada');await page.getByRole('button',{name:'Iniciar asistencia conjunta'}).click();await expect(page.getByAltText('Código QR para registrar asistencia')).toBeVisible();expect(s.creates).toHaveLength(2);expect(s.creates[0].id).toBe(s.creates[1].id);await page.evaluate(()=>document.documentElement.dataset.theme='dark');await screenshot(page,testInfo,'joint-live-dark.png');s.event.expires_at=new Date(Date.now()-1000).toISOString();await page.getByRole('button',{name:'Actualizar',exact:true}).click();await expect(page.getByText('Tiempo agotado',{exact:true})).toBeVisible({timeout:10000});await expect(page.getByAltText('Código QR para registrar asistencia')).toHaveCount(0);await expect(page.getByRole('button',{name:'Cerrar asistencia',exact:true})).toBeEnabled();
});
test('cerrar sin faltas mantiene pendientes visibles y el formulario cabe en pantallas pequeñas',async({page},testInfo)=>{
 const s=state();await start(page,s,false);await page.getByRole('checkbox',{name:'Marcar faltas al cerrar',exact:false}).uncheck();for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);}await page.getByRole('button',{name:'Iniciar asistencia conjunta'}).click();await page.getByRole('button',{name:'Cerrar asistencia',exact:true}).click();await page.getByRole('button',{name:'Cerrar y guardar listas'}).click();await expect(page.getByText('Listas guardadas',{exact:true})).toBeVisible();expect(s.records).toHaveLength(0);await page.getByRole('link',{name:'Ver lista del grupo →'}).click();await expect(page.getByText('Sin registro',{exact:true})).toHaveCount(2);await expect(page.locator('.metric-card').filter({hasText:'Faltas'}).locator('b')).toHaveText('0');await screenshot(page,testInfo,'joint-closed-pending.png');
});

test('QR cambia automáticamente, el enlace queda fijo y un QR vencido conserva los datos del alumno',async({page,browser},testInfo)=>{
 const s=state();s.challengeTTL=1500;await start(page,s,false);await page.getByRole('button',{name:'Iniciar asistencia conjunta'}).click();
 await expect(page.getByLabel('Código temporal',{exact:true})).toBeVisible();
 const first=s.challenge,link=await page.getByLabel('Enlace para alumnos').inputValue();expect(link).not.toContain('&q=');
 const pupil=await publicPage(browser,s,testInfo);await pupil.page.goto(link+'&q='+first.qr_proof);
 await expect(pupil.page.getByLabel('Matrícula',{exact:true})).toBeVisible();await pupil.page.getByLabel('Matrícula',{exact:true}).fill('001');
 await expect(pupil.page.getByLabel('Código de la clase',{exact:false})).toHaveCount(0);
 s.challengeTTL=60000;
 await expect.poll(()=>s.rotations).toBeGreaterThan(1);
 await expect(page.getByLabel('Código temporal',{exact:true})).not.toHaveText(first.code);
 expect(await page.getByLabel('Enlace para alumnos').inputValue()).toBe(link);
 await pupil.page.getByRole('button',{name:'Registrar mi asistencia'}).click();await expect(pupil.page.getByRole('alert')).toContainText('ya no es válido');
 await expect(pupil.page.getByLabel('Matrícula',{exact:true})).toHaveValue('001');await expect(pupil.page.getByRole('combobox',{name:/Tu grupo/})).toHaveValue(gids[0]);
 expect(s.records).toHaveLength(0);await pupil.page.getByLabel('Código de la clase',{exact:false}).fill(s.challenge.code);
 await screenshot(pupil.page,testInfo,'rotating-expired-form.png');await pupil.page.getByRole('button',{name:'Registrar mi asistencia'}).click();await expect(pupil.page.getByRole('heading',{name:'Asistencia registrada'})).toBeVisible();
 await page.getByRole('button',{name:'Mostrar QR y código'}).click();await expect(page.getByRole('dialog').getByLabel('Código temporal',{exact:true})).toHaveText(s.challenge.code);
 const projectedQR=page.getByRole('dialog').getByAltText('Código QR para registrar asistencia');
 // WebKit rounds fractional image dimensions in IntersectionObserver. Check the
 // actual bounds as well, so the complete QR must fit in both dialog and screen.
 await expect(projectedQR).toBeInViewport({ratio:0.99});
 const bounds=await projectedQR.evaluate(img=>{const qr=img.getBoundingClientRect(),dialog=img.closest('dialog').getBoundingClientRect();return {left:qr.left,top:qr.top,right:qr.right,bottom:qr.bottom,minLeft:Math.max(0,dialog.left),minTop:Math.max(0,dialog.top),maxRight:Math.min(innerWidth,dialog.right),maxBottom:Math.min(innerHeight,dialog.bottom)};});
 expect(bounds.left).toBeGreaterThanOrEqual(bounds.minLeft);expect(bounds.top).toBeGreaterThanOrEqual(bounds.minTop);expect(bounds.right).toBeLessThanOrEqual(bounds.maxRight);expect(bounds.bottom).toBeLessThanOrEqual(bounds.maxBottom);
 await page.screenshot({path:testInfo.outputPath('rotating-projection.png')});await pupil.context.close();
});
test('QR vigente registra sin escribir código; al perder conexión no muestra secretos vencidos',async({page,browser,context},testInfo)=>{
 const s=state();await start(page,s,false);await page.getByRole('button',{name:'Iniciar asistencia conjunta'}).click();await expect(page.getByLabel('Código temporal',{exact:true})).toBeVisible();
 const link=await page.getByLabel('Enlace para alumnos').inputValue(),pupil=await publicPage(browser,s,testInfo);await pupil.page.goto(link+'&q='+s.challenge.qr_proof);await pupil.page.getByLabel('Matrícula',{exact:true}).fill('001');
 await expect(pupil.page.getByLabel('Código de la clase',{exact:false})).toHaveCount(0);await pupil.page.getByRole('button',{name:'Registrar mi asistencia'}).click();await expect(pupil.page.getByRole('heading',{name:'Asistencia registrada'})).toBeVisible();
 await context.setOffline(true);await expect(page.getByText('Sin conexión para renovar',{exact:true})).toBeVisible();await expect(page.getByAltText('Código QR para registrar asistencia')).toHaveCount(0);await expect(page.getByLabel('Código temporal',{exact:true})).toHaveCount(0);
 await context.setOffline(false);await expect(page.getByLabel('Código temporal',{exact:true})).toBeVisible();s.failChallenge=true;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
 await expect(page.getByText('No se pudo renovar el código',{exact:true})).toBeVisible();await expect(page.getByAltText('Código QR para registrar asistencia')).toHaveCount(0);
 s.failChallenge=false;await page.getByRole('button',{name:'Reintentar código'}).click();await expect(page.getByLabel('Código temporal',{exact:true})).toBeVisible();await pupil.context.close();
});
test('docente activa rotación en una clase existente y el enlace anterior solicita código',async({page,browser},testInfo)=>{
 const s=state();await start(page,s,false);await page.getByRole('button',{name:'Iniciar asistencia conjunta'}).click();await expect(page.getByLabel('Código temporal',{exact:true})).toBeVisible();
 s.event.verification_mode='static';await page.reload();await expect(page.getByRole('button',{name:'Activar QR dinámico'})).toBeVisible();
 const link=await page.getByLabel('Enlace para alumnos').inputValue(),pupil=await publicPage(browser,s,testInfo);await pupil.page.goto(link);await pupil.page.getByLabel('Matrícula',{exact:true}).fill('001');await expect(pupil.page.getByLabel('Código de la clase',{exact:false})).toHaveCount(0);
 await page.getByRole('button',{name:'Activar QR dinámico'}).click();await page.getByRole('dialog').getByRole('button',{name:'Activar QR dinámico'}).click();await expect(page.getByLabel('Código temporal',{exact:true})).toBeVisible();
 await pupil.page.getByRole('button',{name:'Registrar mi asistencia'}).click();await expect(pupil.page.getByLabel('Código de la clase',{exact:false})).toBeVisible();await expect(pupil.page.getByLabel('Matrícula',{exact:true})).toHaveValue('001');
 await pupil.page.getByLabel('Código de la clase',{exact:false}).fill(s.challenge.code);await pupil.page.getByRole('button',{name:'Registrar mi asistencia'}).click();await expect(pupil.page.getByRole('heading',{name:'Asistencia registrada'})).toBeVisible();await pupil.context.close();
});
