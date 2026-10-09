import { test, expect } from '@playwright/test';

// No real school or student data. All public responses are deterministic.
test.use({ serviceWorkers: 'block' });
const origin = 'https://classroom31-fixture.supabase.test';
const sessionId = '11111111-1111-4111-8111-111111111111';
const questionId = '22222222-2222-4222-8222-222222222222';

async function fixture(page, { visual = false } = {}) {
  const state = { phase: 'lobby', safeSelects: [], revealCalls: 0, errors: [] };
  if (visual) await page.route('https://visual-fixture.test/**', route => route.fulfill({
    contentType: 'image/svg+xml',
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="420"><rect width="640" height="420" fill="#eef1f8"/><ellipse cx="320" cy="210" rx="180" ry="155" fill="#c4cfde"/></svg>',
  }));
  page.on('pageerror', error => state.errors.push(error.message));
  await page.route('**/config.js*', route => route.fulfill({
    contentType: 'application/javascript',
    body: 'window.TEDVIO_CONFIG={SUPABASE_URL:"' + origin + '",SUPABASE_PUBLISHABLE_KEY:"public-fixture"};',
  }));
  await page.route(origin + '/**', route => {
    const request = route.request();
    const u = new URL(request.url());
    const endpoint = u.pathname.split('/').at(-1);
    const headers = {
      'access-control-allow-origin':'*',
      'access-control-allow-methods':'GET,POST,OPTIONS',
      'access-control-allow-headers':'apikey,authorization,content-type,prefer,x-client-info',
    };
    if (request.method() === 'OPTIONS') return route.fulfill({ status:204,headers,body:'' });
    let value = [];
    if (endpoint === 'v2_public_session_meta') {
      value = [{
        session_id:sessionId,title:'Sesión de Anatomía',university:'Universidad de prueba',
        educational_program:'Medicina',group_name:'3A',team_mode:false,
        competitive:false,roster_required:false,status:'live',
      }];
    } else if (endpoint === 'v2_public_live_counts') {
      value = [{ participant_count:12,answered_count:state.phase === 'lobby' ? 0 : 7 }];
    } else if (endpoint === 'v2_public_session_people') {
      value = [{display_name:'Participante de prueba'}];
    } else if (endpoint === 'v2_sessions') {
      value = [{
        id:sessionId,current_question_id:state.phase === 'lobby' ? null : questionId,
        status:'live',competitive:false,team_mode:false,
      }];
    } else if (endpoint === 'v2_questions') {
      state.safeSelects.push(u.searchParams.get('select') || '');
      value = [{
        id:questionId,session_id:sessionId,position:1,
        prompt:visual ? 'Ubica los huesos del cráneo' : '¿Cuál es la estructura anatómica indicada?',
        question_type:visual ? 'ordering' : 'multiple_choice',
        options:visual ? ['Hueso temporal','Hueso frontal'] : ['Respuesta A','Respuesta B','Respuesta C'],
        visual_layout:visual ? { kind:'image_labeling',version:1,targets:[{id:'z1',x:30,y:35},{id:'z2',x:65,y:65}] } : null,
        media_url:visual ? 'https://visual-fixture.test/craneo.svg' : null,
        media_type:visual ? 'image' : null,status:state.phase === 'result' ? 'revealed' : 'live',
        launched_at:new Date(Date.now()-8_000).toISOString(),timer_seconds:90,closed_at:null,
      }];
    } else if (endpoint === 'v2_public_server_clock') {
      value = new Date(Date.now()+12_000).toISOString();
    } else if (endpoint === 'v2_public_revealed_question') {
      state.revealCalls++;
      value = state.phase === 'result'
        ? {correct_answer:visual ? ['Hueso frontal','Hueso temporal'] : 'Respuesta A',explanation:'Explicación académica de la prueba.'}
        : null;
    } else if (endpoint === 'v2_public_question_results') {
      value = [{answer:'Respuesta A',votes:7,total:12}];
    }
    if (request.headers().accept?.includes('vnd.pgrst.object+json') && Array.isArray(value)) value=value[0]??null;
    return route.fulfill({status:200,headers,json:value});
  });
  return state;
}

async function noOverflow(page) {
  const result=await page.evaluate(()=>({content:document.documentElement.scrollWidth,viewport:innerWidth}));
  expect(result.content,JSON.stringify(result)).toBeLessThanOrEqual(result.viewport+1);
}

test('Projection 3.0: sala, QR, pregunta y solución sólo tras revelar',async({page})=>{
  test.setTimeout(80_000);
  const state=await fixture(page);
  await page.goto('/projection-v2/?code=123456',{waitUntil:'domcontentloaded'});
  await expect(page.locator('.p3-lobby-panel')).toBeVisible({timeout:15_000});
  await expect(page.locator('.p3-code-caption')).toBeVisible();
  await expect(page.getByText('Sesión de Anatomía')).toBeVisible();
  await expect(page.locator('.p3-qr-card canvas')).toBeVisible();
  await noOverflow(page);
  await page.screenshot({path:test.info().outputPath('projection31-lobby.png'),fullPage:true});

  state.phase='question';
  await page.reload({waitUntil:'domcontentloaded'});
  await expect(page.locator('.p3-question-panel')).toContainText('¿Cuál es la estructura anatómica indicada?',{timeout:15_000});
  await expect(page.locator('.p2-option.correct')).toHaveCount(0);
  await expect(page.locator('.p2-metric').first()).toContainText('TIEMPO RESTANTE');
  expect(state.revealCalls).toBe(0);
  expect(state.safeSelects.length).toBeGreaterThan(0);
  for(const select of state.safeSelects) {
    expect(select).not.toContain('*');
    expect(select).not.toContain('correct_answer');
    expect(select).not.toContain('explanation');
  }
  await noOverflow(page);
  await page.screenshot({path:test.info().outputPath('projection31-question.png'),fullPage:true});

  state.phase='result';
  await page.reload({waitUntil:'domcontentloaded'});
  await expect(page.locator('.p3-question-panel')).toContainText('Explicación académica',{timeout:15_000});
  await expect(page.locator('.p2-option.correct')).toHaveCount(1);
  expect(state.revealCalls).toBeGreaterThan(0);
  await page.screenshot({path:test.info().outputPath('projection31-result.png'),fullPage:true});
  expect(state.errors).toEqual([]);
});

test('Projection 3.0: lector QR y escena conservan legibilidad en tablet y móvil',async({page})=>{
  const state=await fixture(page);
  await page.setViewportSize({width:390,height:844});
  await page.goto('/projection-v2/?code=123456',{waitUntil:'domcontentloaded'});
  await expect(page.locator('.p3-lobby-panel')).toBeVisible({timeout:15_000});
  await noOverflow(page);
  state.phase='question';
  await page.reload({waitUntil:'domcontentloaded'});
  await expect(page.locator('.p3-question-panel .p2-option')).toHaveCount(3);
  await noOverflow(page);
  await page.setViewportSize({width:768,height:1024});
  await noOverflow(page);
  expect(state.errors).toEqual([]);
});


test('Classroom Visual 5.0: Projection sólo revela las etiquetas anatómicas después del RPC seguro', async ({ page }) => {
  test.setTimeout(80_000);
  const state = await fixture(page, { visual:true });
  state.phase='question';
  await page.goto('/projection-v2/?code=123456', { waitUntil:'domcontentloaded' });
  await expect(page.locator('.visual5-projection-image img')).toBeVisible({timeout:15_000});
  await expect(page.locator('.visual5-projection-zone')).toHaveCount(2);
  await expect(page.locator('.visual5-projection-zone.revealed')).toHaveCount(0);
  await expect(page.locator('.p3-question-panel')).not.toContainText('Hueso frontal');
  expect(state.revealCalls).toBe(0);
  for(const select of state.safeSelects) {
    expect(select).not.toContain('correct_answer');
    expect(select).not.toContain('explanation');
    expect(select).not.toContain('*');
  }
  await noOverflow(page);
  await page.screenshot({path:test.info().outputPath('visual5-projection-hidden.png'),fullPage:true});
  state.phase='result';
  await page.reload({ waitUntil:'domcontentloaded' });
  await expect(page.locator('.visual5-projection-zone.revealed')).toHaveCount(2,{timeout:15_000});
  await expect(page.locator('.p3-question-panel')).toContainText('Hueso frontal');
  await expect(page.locator('.p3-question-panel')).toContainText('Hueso temporal');
  expect(state.revealCalls).toBeGreaterThan(0);
  await page.setViewportSize({ width:390,height:844 });
  await noOverflow(page);
  await page.screenshot({path:test.info().outputPath('visual5-projection-iphone.png'),fullPage:true});
  await page.setViewportSize({ width:768,height:1024 });
  await noOverflow(page);
  expect(state.errors).toEqual([]);
});
