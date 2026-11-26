import { before, beforeEach, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createOnlineFormsTestDatabase } from './online-forms-fixture.mjs';

let fixture, db, owner, other, group, foreignGroup, bank;
before(async () => {
  fixture = await createOnlineFormsTestDatabase();
  ({ db, owner, other, group, otherGroup: foreignGroup, bank } = fixture);
});
after(() => db.close());
beforeEach(() => fixture.reset());
async function queryAs(sql, params = [], actor = owner, role = 'authenticated') {
  return fixture.asRole(sql, params, actor, role);
}
async function rpc(name, params = [], actor = owner, role = 'authenticated') {
  return (await queryAs(`select public.${name}(${params.map((_, i) => `$${i + 1}`).join(',')}) result`, params, actor, role)).rows[0].result;
}
const anon = (name, params = []) => rpc(name, params, null, 'anon');
function payload(overrides = {}) {
  return { title: 'Evaluación de prueba', instructions: 'Contesta las preguntas.', max_attempts: 1,
    shuffle_questions: true, shuffle_options: true, feedback_mode: 'after_submit',
    sections: [
      { title: 'Tema A', draw_count: 2, items: bank.slice(0, 4).map(bank_id => ({ bank_id, points: 1 })) },
      { title: 'Tema B', draw_count: 1, items: bank.slice(4, 8).map(bank_id => ({ bank_id, points: 2 })) },
    ], ...overrides };
}
const save = (data = payload(), actor = owner) => rpc('v2_online_form_save', [data], actor);
const detail = (id, actor = owner) => rpc('v2_online_form_detail', [id], actor);
const results = (id, actor = owner) => rpc('v2_online_form_results', [id], actor);
const status = (id, value, actor = owner) => rpc('v2_online_form_set_status', [id, value], actor);
const state = token => anon('v2_online_form_state', [token]);
const answer = (token, id, value) => anon('v2_online_form_answer', [token, id, value]);
const submit = token => anon('v2_online_form_submit', [token]);
const start = (form, token = randomUUID(), enrollment = '001', name = 'Alumno sintético') => anon('v2_online_form_start', [form.code, name, enrollment, token]);
async function ready(overrides = {}) { const f = await save(payload(overrides)); return status(f.id, 'published'); }
const allItems = form => form.sections.flatMap(s => s.items);
const numberOf = async table => Number((await db.query(`select count(*) n from public.${table}`)).rows[0].n);
function noSecrets(value) {
  const text = JSON.stringify(value);
  assert.doesNotMatch(text, /token_hash|access_token/);
}
function noAnswers(value) {
  assert.doesNotMatch(JSON.stringify(value), /correct_answer|explanation|is_correct/);
}

test('creación atómica, snapshots, recuentos y lectura docente aislada por propietario', async () => {
  const f = await save();
  assert.equal(f.status, 'draft'); assert.equal(f.question_count, 3); assert.equal(f.pool_count, 8);
  assert.deepEqual(f.sections.map(s => s.draw_count), [2, 1]);
  assert.equal(allItems(f)[0].correct_answer, 'Correcta 0');
  assert.equal((await rpc('v2_online_forms_list')).length, 1);
  assert.deepEqual(await rpc('v2_online_forms_list', [], other), []);
  for (const call of [() => detail(f.id, other), () => results(f.id, other), () => status(f.id, 'published', other), () => save(payload({ id: f.id }), other)]) await assert.rejects(call, /no está disponible/);
  assert.equal(await anon('v2_online_form_meta', [f.code]), null);
  const published = await status(f.id, 'published');
  const meta = await anon('v2_online_form_meta', [published.code]);
  assert.equal(meta.available, true); assert.ok(meta.server_now); noAnswers(meta); noSecrets(meta);
});

test('un error tardío revierte edición y creación; rechaza banco ajeno, duplicados y cuotas imposibles', async () => {
  const f = await save();
  const bad = payload({ id: f.id, title: 'Cambio que se debe revertir' });
  bad.sections[1].items.push({ bank_id: bank[8], points: 1 });
  await assert.rejects(() => save(bad), /no pertenece/);
  assert.deepEqual(await detail(f.id), f);
  const duplicate = payload(); duplicate.sections[1].items.push({ bank_id: bank[0], points: 1 });
  await assert.rejects(() => save(duplicate), /sin duplicados/);
  const insufficient = payload(); insufficient.sections[0].draw_count = 5;
  await assert.rejects(() => save(insufficient), /suficientes/);
  for (const index of [9, 10]) {
    const invalid = payload({ sections: [{ title: 'Inválida', draw_count: 1, items: [{ bank_id: bank[index], points: 1 }] }] });
    await assert.rejects(() => save(invalid), /archivada|opción múltiple/);
  }
  await assert.rejects(() => save(payload({ group_id: foreignGroup })), /tus grupos/);
  await assert.rejects(() => save(payload({ opens_at: '2026-12-03T12:00:00Z', closes_at: '2026-12-02T12:00:00Z' })), /check constraint/);
  assert.equal(await numberOf('v2_online_forms'), 1);
});

test('anon no lee tablas ni ejecuta RPC docente; el docente no escribe tablas ni lee hashes', async () => {
  const f = await ready(), token = randomUUID(); const s = await start(f, token);
  for (const table of ['v2_online_forms', 'v2_online_form_sections', 'v2_online_form_items', 'v2_online_form_attempts', 'v2_online_form_responses']) {
    await assert.rejects(() => queryAs(`select * from public.${table}`, [], null, 'anon'), /permission denied/);
  }
  for (const [name, args] of [['v2_online_forms_list', []], ['v2_online_form_detail', [f.id]], ['v2_online_form_results', [f.id]], ['v2_online_form_save', [payload()]], ['v2_online_form_set_status', [f.id, 'closed']]]) await assert.rejects(() => anon(name, args), /permission denied/);
  await assert.rejects(() => queryAs('update public.v2_online_forms set status=$1 where id=$2', ['closed', f.id]), /permission denied/);
  await assert.rejects(() => queryAs('select token_hash from public.v2_online_form_attempts'), /permission denied/);
  await assert.rejects(() => queryAs('select tedvio_private.online_form_finalize($1,false)', [s.attempt.id]), /permission denied/);
  assert.equal((await queryAs('select id from public.v2_online_form_attempts', [], other)).rows.length, 0);
  assert.equal((await queryAs('select * from public.v2_online_form_items', [], other)).rows.length, 0);
  assert.equal((await queryAs('select id from public.v2_online_form_attempts')).rows.length, 1);
  noSecrets(await results(f.id));
});

test('selecciona cantidades por sección, sin repetidas, con muestras por alumno y orden persistido', async () => {
  const f = await ready({ shuffle_questions: false, shuffle_options: false });
  const allowed = new Map(allItems(f).map(i => [i.id, i]));
  const samples = new Set();
  await db.query('select setseed(0.1234)');
  for (let n = 0; n < 12; n++) {
    const token = randomUUID(), s = await start(f, token, `R${n}`);
    assert.equal(s.items.length, 3); assert.equal(new Set(s.items.map(i => i.id)).size, 3);
    assert.deepEqual(f.sections.map(section => s.items.filter(i => i.section_id === section.id).length), [2, 1]);
    for (const item of s.items) assert.deepEqual(item.options, allowed.get(item.id).options);
    for (const section of f.sections) {
      const positions = s.items.filter(i => i.section_id === section.id).map(i => allowed.get(i.id).position);
      assert.deepEqual(positions, [...positions].sort((a, b) => a - b));
    }
    assert.deepEqual((await state(token)).items, s.items);
    samples.add(s.items.map(i => i.id).sort().join(',')); noAnswers(s); noSecrets(s);
  }
  assert.ok(samples.size > 1, 'A deterministic seeded sequence exercises different subsets');
});

test('token permite reintento idempotente; matrícula sola nunca recupera ni reemplaza un intento', async () => {
  const f = await ready(), token = randomUUID(), first = await start(f, token);
  await answer(token, first.items[0].id, first.items[0].options[0]);
  const replay = await start(f, token);
  assert.equal(replay.attempt.id, first.attempt.id); assert.deepEqual(replay.items, first.items); assert.equal(replay.response_count, 1);
  assert.equal(await numberOf('v2_online_form_attempts'), 1);
  await assert.rejects(() => start(f, randomUUID()), /intento activo/);
  await assert.rejects(() => start(f, token, 'OTRA'), /token no corresponde/);
  await assert.rejects(() => state(randomUUID()), /no está disponible/);
  const another = await ready(); await assert.rejects(() => start(another, token), /token no corresponde/);
  const hashes = await db.query('select token_hash from public.v2_online_form_attempts');
  assert.equal(hashes.rows[0].token_hash.length, 64); assert.notEqual(hashes.rows[0].token_hash, token);
});

test('califica en servidor con puntos ponderados, vacías cero, y entrega idempotente e inmutable', async () => {
  const f = await ready(), token = randomUUID(), s = await start(f, token), items = new Map(allItems(f).map(i => [i.id, i]));
  const right = items.get(s.items[0].id), wrong = items.get(s.items[1].id);
  await answer(token, right.id, right.correct_answer);
  await answer(token, wrong.id, wrong.options.find(o => o !== wrong.correct_answer));
  await assert.rejects(() => answer(token, right.id, 'A'), /coincidir/);
  const unused = allItems(f).find(i => !s.items.some(q => q.id === i.id));
  await assert.rejects(() => answer(token, unused.id, unused.options[0]), /no pertenece/);
  noAnswers(await state(token));
  assert.equal((await results(f.id)).attempts[0].responses[0].is_correct, null);
  const submitted = await submit(token);
  assert.equal(submitted.attempt.status, 'submitted'); assert.equal(submitted.attempt.score, right.points);
  assert.equal(submitted.attempt.max_score, 4); assert.equal(submitted.attempt.percentage, 25);
  assert.equal(submitted.feedback.length, 3); assert.equal(submitted.feedback.filter(r => r.is_correct).length, 1);
  assert.equal(submitted.response_count, 2); assert.equal(submitted.released, true);
  const again = await submit(token); assert.deepEqual(again.attempt, submitted.attempt);
  assert.equal((await answer(token, right.id, right.options[1])).saved, false);
  const report = await results(f.id); assert.equal(report.attempts[0].score, 1);
  assert.equal(report.items.length, 8); assert.equal(report.form.sections.length, 2);
  assert.deepEqual(report.attempts[0].item_ids, s.items.map(i => i.id));
  assert.deepEqual(report.attempts[0].responses.map(r => r.item_id), [right.id, wrong.id]); noSecrets(report);
});

test('las preguntas y claves son snapshots; editar o borrar el banco no altera intentos ni calificación', async () => {
  const f = await ready(), token = randomUUID(), s = await start(f, token), original = new Map(allItems(f).map(i => [i.id, i]));
  await db.query("update public.v2_question_bank set prompt='Cambio posterior',options='[\"Nueva\",\"Otra\"]',correct_answer='\"Nueva\"'");
  await db.query('delete from public.v2_question_bank where id=$1', [original.get(s.items[0].id).bank_id]);
  assert.deepEqual((await state(token)).items, s.items);
  for (const item of s.items) await answer(token, item.id, original.get(item.id).correct_answer);
  assert.equal((await submit(token)).attempt.percentage, 100);
  await assert.rejects(() => save(payload({ id: f.id })), /congeladas/);
  await assert.rejects(() => status(f.id, 'draft'), /borrador/);
  assert.deepEqual(allItems(await detail(f.id)), allItems(f));
});

test('políticas de retroalimentación: after_close retiene claves y puntaje; score_only nunca revela claves', async () => {
  const f = await ready({ feedback_mode: 'after_close' }), token = randomUUID(); await start(f, token);
  const pending = await submit(token); assert.equal(pending.released, false); assert.equal(pending.attempt.score, null); noAnswers(pending);
  assert.equal((await results(f.id)).attempts[0].score, 0);
  await status(f.id, 'closed'); const released = await state(token);
  assert.equal(released.released, true); assert.equal(released.feedback.length, 3); assert.equal(released.attempt.score, 0);
  const only = await ready({ feedback_mode: 'score_only' }), another = randomUUID(); await start(only, another);
  const score = await submit(another); assert.equal(score.released, true); assert.equal(score.attempt.score, 0); noAnswers(score);
});

test('fechas de apertura/cierre se validan al iniciar; el servidor finaliza al consultar vencimiento', async () => {
  const future = new Date(Date.now() + 86_400_000).toISOString(), past = new Date(Date.now() - 86_400_000).toISOString();
  const scheduled = await ready({ opens_at: future }); assert.equal((await anon('v2_online_form_meta', [scheduled.code])).available, false);
  await assert.rejects(() => start(scheduled), /todavía no abre/);
  const closed = await ready({ closes_at: past }); await assert.rejects(() => start(closed), /ya cerró/);
  const f = await ready({ time_limit_minutes: 1 }), token = randomUUID(), s = await start(f, token);
  assert.ok(s.attempt.expires_at); await db.query("update public.v2_online_form_attempts set expires_at=now()-interval '1 second' where id=$1", [s.attempt.id]);
  const finished = await state(token); assert.equal(finished.attempt.status, 'submitted'); assert.equal(finished.attempt.auto_submitted, true); assert.equal(finished.attempt.score, 0);
  assert.equal((await answer(token, s.items[0].id, s.items[0].options[0])).saved, false);
  assert.deepEqual((await submit(token)).attempt, finished.attempt);
});

test('guardar tras vencer finaliza sin aceptar la respuesta; resultados docentes también cierran vencidos', async () => {
  const f = await ready(), token = randomUUID(), s = await start(f, token);
  await db.query("update public.v2_online_form_attempts set expires_at=now()-interval '1 second' where id=$1", [s.attempt.id]);
  const late = await answer(token, s.items[0].id, s.items[0].options[0]); assert.deepEqual([late.saved, late.submitted, late.expired], [false, true, true]);
  assert.equal((await state(token)).response_count, 0);
  const secondToken = randomUUID(), another = await start(f, secondToken, '002');
  await db.query("update public.v2_online_form_attempts set expires_at=now()-interval '1 second' where id=$1", [another.attempt.id]);
  const report = await results(f.id); assert.ok(report.attempts.every(a => a.status === 'submitted'));
});

test('el cierre docente entrega intentos activos y el envío posterior conserva el resultado', async () => {
  const f = await ready(), token = randomUUID(), s = await start(f, token), original = new Map(allItems(f).map(i => [i.id, i]));
  await answer(token, s.items[0].id, original.get(s.items[0].id).correct_answer);
  await status(f.id, 'closed'); const finished = await submit(token);
  assert.equal(finished.attempt.status, 'submitted'); assert.equal(finished.attempt.auto_submitted, true); assert.equal(finished.attempt.score, 1);
  await assert.rejects(() => start(f, randomUUID(), 'OTRO'), /no está abierta/);
  assert.deepEqual((await start(f, token)).attempt, finished.attempt);
});

test('respeta el número de intentos y cada intento nuevo tiene selección persistida independiente', async () => {
  const f = await ready({ max_attempts: 2 }), first = randomUUID(), second = randomUUID();
  const s1 = await start(f, first); await submit(first); const s2 = await start(f, second);
  assert.notEqual(s1.attempt.id, s2.attempt.id); assert.equal(s2.attempt.attempt_no, 2);
  assert.deepEqual((await state(first)).items, s1.items); await submit(second);
  await assert.rejects(() => start(f), /intentos permitidos/);
});

test('grupo valida padrón activo y nunca se vuelve público si se elimina el grupo', async () => {
  const f = await ready({ group_id: group, max_attempts: 2 });
  await db.query("update public.v2_group_students set enrollment=' ABC123 ',full_name=' Alumno de padrón ' where enrollment='ABC123'");
  for (const id of ['DESCONOCIDO', 'BAJA']) await assert.rejects(() => start(f, randomUUID(), id), /alumno activo/);
  const token = randomUUID(), s = await start(f, token, ' abc123 ', 'Nombre ignorado');
  assert.equal(s.attempt.display_name, 'Alumno de padrón'); assert.equal(s.attempt.enrollment, 'ABC123');
  await submit(token);
  const secondToken = randomUUID(), second = await start(f, secondToken, 'abc123');
  assert.equal(second.attempt.attempt_no, 2);
  await db.query('delete from public.v2_groups where id=$1', [group]);
  const meta = await anon('v2_online_form_meta', [f.code]); assert.equal(meta.roster_required, true); assert.equal(meta.available, false);
  await assert.rejects(() => start(f, randomUUID(), 'NUEVO'), /grupo.*no está disponible/);
  assert.equal((await submit(secondToken)).attempt.status, 'submitted');
});

test('limita payloads, opciones inválidas, tiempo, puntos y revisiones obsoletas sin cambios parciales', async () => {
  const f = await save();
  await assert.rejects(() => save(payload({ id: f.id, revision: f.revision - 1 })), /cambió/);
  await assert.rejects(() => save(payload({ title: 'x'.repeat(201) })), /200 caracteres/);
  await assert.rejects(() => save(payload({ instructions: 'x'.repeat(260000) })), /demasiado grandes/);
  await assert.rejects(() => save(payload({ time_limit_minutes: 301 })), /check constraint/);
  const badPoints = payload(); badPoints.sections[1].items[0].points = -1; await assert.rejects(() => save(badPoints), /check constraint/);
  await db.query('update public.v2_question_bank set options=$1 where id=$2', [JSON.stringify(['Duplicada', ' Duplicada ']), bank[0]]);
  await assert.rejects(() => save(), /repetirse/);
  assert.equal(await numberOf('v2_online_forms'), 1); assert.deepEqual(await detail(f.id), f);
});

test('verdadero/falso y contrato JSON con parámetros nombrados funcionan desde el mismo adaptador del navegador', async () => {
  const data = payload({ sections: [{ title: 'Verdadero/falso', draw_count: 1, items: [{ bank_id: bank[7], points: 1 }] }] });
  const f = await fixture.call('v2_online_form_save', { p_form: data });
  await fixture.call('v2_online_form_set_status', { p_form_id: f.id, p_status: 'published' });
  const token = randomUUID();
  const s = await fixture.call('v2_online_form_start', { p_code: f.code, p_name: 'Prueba', p_enrollment: 'TF1', p_token: token }, null);
  assert.equal(s.items[0].question_type, 'true_false');
  assert.deepEqual([...s.items[0].options].sort(), ['Falso', 'Verdadero']);
  await fixture.call('v2_online_form_answer', { p_token: token, p_item_id: s.items[0].id, p_answer: 'Verdadero' }, null);
  const done = await fixture.call('v2_online_form_submit', { p_token: token }, null);
  assert.equal(done.attempt.percentage, 100);
});


test('grupo declarado se valida y persiste sin exponer padrón ni permitir cambiar la identidad', async () => {
 const f = await ready({group_choices:['3-01','3-02','3-03','3-04','3-09'],feedback_mode:'score_only'});
 const m=await anon('v2_online_form_meta',[f.code]); assert.deepEqual(m.group_choices,['3-01','3-02','3-03','3-04','3-09']); noAnswers(m);
 const token=randomUUID();
 await assert.rejects(()=>start(f,token), /Selecciona un grupo válido/);
 await assert.rejects(()=>anon('v2_online_form_start_grouped',[f.code,'Alumno sintético','001',token,'3-99']), /Selecciona un grupo válido/);
 const s=await anon('v2_online_form_start_grouped',[f.code,'Alumno sintético','001',token,'3-09']); assert.equal(s.attempt.declared_group,'3-09'); noAnswers(s);
 assert.equal((await state(token)).attempt.declared_group,'3-09');
 await assert.rejects(()=>anon('v2_online_form_start_grouped',[f.code,'Alumno sintético','001',token,'3-01']), /grupo no corresponde/);
 await assert.rejects(()=>anon('v2_online_form_start_grouped',[f.code,'Alumno sintético','001',randomUUID(),'3-01']), /Ya existe un intento activo/);
 const receipt=await submit(token); assert.equal(receipt.attempt.declared_group,'3-09'); noAnswers(receipt);
 assert.equal((await results(f.id)).attempts[0].declared_group,'3-09');
 await assert.rejects(()=>rpc('v2_online_form_set_group_choices',[f.id,['3-01']],other), /no está disponible/);
 await assert.rejects(()=>rpc('v2_online_form_set_group_choices',[f.id,['3-01']]), /congelada/);
});
test('configurar por primera vez un formulario publicado conserva los intentos previos', async () => {
 const f=await ready({feedback_mode:'score_only'}), token=randomUUID(); await start(f,token);
 const previous=await state(token);
 const updated=await rpc('v2_online_form_set_group_choices',[f.id,['3-01','3-09']]);
 assert.deepEqual(updated.group_choices,['3-01','3-09']); assert.equal(updated.status,'published');
 const recovered=await state(token); assert.equal(recovered.attempt.id,previous.attempt.id); assert.equal(recovered.attempt.declared_group,null); assert.deepEqual(recovered.items,previous.items);
 const legacy=await start(f,token); assert.equal(legacy.attempt.id,previous.attempt.id);
 const newToken=randomUUID(); const next=await anon('v2_online_form_start_grouped',[f.code,'Otro alumno','002',newToken,'3-09']); assert.equal(next.attempt.declared_group,'3-09');
 assert.equal((await results(f.id)).attempts.length,2);
 await assert.rejects(()=>anon('v2_online_form_set_group_choices',[f.id,['3-09']]), /permission denied/);
 await assert.rejects(()=>save(payload({group_choices:['A','a']})), /no pueden repetirse/);
 await assert.rejects(()=>save(payload({group_id:group,group_choices:['A']})), /no ambos/);
});
