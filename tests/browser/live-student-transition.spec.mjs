import{test,expect}from'@playwright/test';

const session={
  id:'11111111-1111-4111-8111-111111111111',
  code:'493021',
  title:'Prueba de estabilidad',
  status:'live',
  current_question_id:'22222222-2222-4222-8222-222222222222',
  competitive:true,
  team_mode:false,
  started_at:new Date().toISOString(),
  closed_at:null
};

const question={
  id:session.current_question_id,
  position:1,
  prompt:'¿Cuál es la respuesta correcta?',
  question_type:'multiple_choice',
  options:['Primera','Segunda','Tercera','Cuarta'],
  media_url:null,
  media_type:null,
  timer_seconds:90,
  status:'live',
  launched_at:new Date().toISOString(),
  closed_at:null
};

test('lobby to question survives older Android WebViews',async({page})=>{
  await page.addInitScript(({stored})=>{
    String.prototype.replaceAll=undefined;
    localStorage.setItem('tedvio.student.v2.native',JSON.stringify(stored));
  },{stored:{
    sessionId:session.id,
    participantId:'33333333-3333-4333-8333-333333333333',
    name:'Alumno de prueba',
    team:'',
    matricula:'',
    code:session.code
  }});

  await page.route('**/config.js*',route=>route.fulfill({
    contentType:'application/javascript',
    body:'window.TEDVIO_CONFIG={SUPABASE_URL:"https://supabase.test",SUPABASE_PUBLISHABLE_KEY:"test-publishable-key"};'
  }));
  await page.route('https://supabase.test/**',async route=>{
    const url=new URL(route.request().url());
    let body=[];
    if(url.pathname.endsWith('/v2_sessions'))body=[session];
    else if(url.pathname.endsWith('/v2_questions'))body=[question];
    else if(url.pathname.endsWith('/rpc/v2_record_session_health'))body=true;
    await route.fulfill({status:200,contentType:'application/json',headers:{'content-range':'0-0/1'},body:JSON.stringify(body)});
  });

  await page.goto(`/student-v2/?code=${session.code}`);
  await expect(page.getByText('¿Cuál es la respuesta correcta?')).toBeVisible();
  await expect(page.getByRole('button',{name:/A Primera/})).toBeVisible();
  await expect(page.locator('.live-fatal-shell')).toHaveCount(0);
});
