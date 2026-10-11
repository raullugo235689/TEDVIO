import {test,expect} from '@playwright/test';
test.use({serviceWorkers:'block'});
const userId='11111111-1111-4111-8111-111111111111';
const cards=Array.from({length:5},(_,i)=>({id:`card-${i}`,area:'medicina_interna',topic:'Tema de prueba',subtopic:'Conceptos',question:`Pregunta sintética de práctica número ${i+1}: ¿cuál es la opción correcta?`,answer:`Respuesta correcta ${i+1}`,explanation:'Explicación sintética de la pregunta.',quiz_distractors:[`Distractor A ${i+1}`,`Distractor B ${i+1}`,`Distractor C ${i+1}`],source_file:'fixture.pdf',source_page:1,references_json:[]}));
async function setup(page,{failOnce=false}={}){
 const state={writes:[],errors:[]};page.on('pageerror',e=>state.errors.push(e.message));
 await page.addInitScript(({userId})=>localStorage.setItem('sb-game-fixture-auth-token',JSON.stringify({access_token:'synthetic-access-token',refresh_token:'synthetic-refresh-token',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user:{id:userId,email:'test@example.test',aud:'authenticated',role:'authenticated'}})),{userId});
 await page.route('**/config.js*',r=>r.fulfill({contentType:'application/javascript',body:'window.TEDVIO_CONFIG={SUPABASE_URL:"https://game-fixture.supabase.test",SUPABASE_PUBLISHABLE_KEY:"synthetic-key"};'}));
 await page.route('https://game-fixture.supabase.test/**',async r=>{
  const request=r.request(),table=new URL(request.url()).pathname.split('/').at(-1);let rows=[];
  if(table==='user')rows={id:userId,email:'test@example.test',aud:'authenticated',role:'authenticated',user_metadata:{}};
  else if(table==='tedvio_required_legal_documents_v21')rows=[{document_key:'terms',version:'test',required:true,title:'Prueba',content_html:'Prueba'}];
  else if(table==='tedvio_user_consents')rows=[{document_key:'terms',document_version:'test'}];
  else if(table==='tedvio_onboarding_snapshot_v21')rows={completed:true,score:5,dismissed:true};
  else if(table==='tedvio_user_profiles')rows=[{status:'active',plan:'free',role:'teacher',full_name:'Prueba'}];
  else if(table==='profiles')rows=[{id:userId,display_name:'Cuenta sintética'}];
  else if(table==='tedvio_current_entitlements')rows={plan:'free',display_name:'Free'};
  else if(table==='tedvio_enarm2027_flashcards')rows=cards;
  else if(table==='tedvio_enarm2027_rate_flashcard'){
   state.writes.push(request.postDataJSON());if(failOnce&&state.writes.length===1)return r.fulfill({status:503,json:{message:'Synthetic offline'}});
   rows={stage:1,due_at:new Date(Date.now()+86400000).toISOString()};
  }
  if(request.headers().accept?.includes('vnd.pgrst.object+json')&&Array.isArray(rows))rows=rows[0]??null;
  await r.fulfill({json:rows});
 });
 await page.goto('/teacher#/enarm-2027?tab=flashcards');return state;
}
test('ENARM juego: mobile layout, shuffled choices, score and private review',async({page})=>{
 const state=await setup(page);await expect(page.getByRole('button',{name:'Empezar ronda'})).toBeVisible();
 await expect(page.locator('.game-settings')).not.toHaveAttribute('open','');
 for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);}
 await page.setViewportSize({width:390,height:844});
 await page.getByRole('button',{name:'Empezar ronda'}).click();
 await expect(page.locator('.game-option')).toHaveCount(4);await expect(page.locator('.game-feedback')).toHaveCount(0);
 await page.screenshot({path:test.info().outputPath('enarm-game-mobile.png'),fullPage:true});
 for(let i=0;i<5;i++){
  await page.locator('.game-option').filter({hasText:i===0?'Distractor A':'Respuesta correcta'}).click();
  await expect(page.locator('.game-feedback')).toBeVisible();
  await page.getByRole('button',{name:i===4?'Ver mi resultado':'Siguiente pregunta →',exact:true}).click();
 }
 await expect(page.locator('.enarm-game-finish')).toContainText('4/5');await expect(page.locator('.game-final-score')).toContainText('550');
 expect(state.writes).toHaveLength(5);expect(state.writes[0].p_rating).toBe('again');expect(new Set(state.writes.map(w=>w.p_event_id)).size).toBe(5);
 await page.getByRole('button',{name:'Volver a intentar mis errores'}).click();await expect(page.locator('.game-hud')).toContainText('1 / 1');expect(state.errors).toEqual([]);
});
test('ENARM juego: retry keeps event id and prevents advancing before save',async({page})=>{
 const state=await setup(page,{failOnce:true});await page.getByRole('button',{name:'Empezar ronda'}).click();await page.locator('.game-option').filter({hasText:'Respuesta correcta'}).click();
 await page.getByRole('button',{name:'Reintentar guardado'}).click();await expect(page.getByRole('button',{name:'Siguiente pregunta →'})).toBeEnabled();expect(state.writes).toHaveLength(2);expect(state.writes[0]).toEqual(state.writes[1]);
});
test('ENARM juego: optional timer expires once, reveals solution and schedules review',async({page})=>{
 const state=await setup(page);await page.locator('.game-settings summary').click();await page.getByLabel('Tiempo por pregunta').selectOption('30');
 await page.clock.install();await page.getByRole('button',{name:'Empezar ronda'}).click();await page.clock.fastForward(31000);await expect(page.locator('.game-feedback')).toContainText('Se terminó el tiempo');expect(state.writes).toHaveLength(1);expect(state.writes[0].p_rating).toBe('again');
});
