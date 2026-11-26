import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

/** Isolated PostgreSQL fixture; never connects to Supabase or a remote service. */
export async function createOnlineFormsTestDatabase() {
  const db = new PGlite();
  const owner = randomUUID(), other = randomUUID(), group = randomUUID(), otherGroup = randomUUID();
  const pupil = randomUUID(), inactive = randomUUID();
  const bank = Array.from({ length: 11 }, () => randomUUID());
  await db.exec(readFileSync(new URL('../../../supabase/tests/online_forms_fixture.sql', import.meta.url), 'utf8'));
  await db.query('insert into auth.users values($1),($2)', [owner, other]);
  await db.exec(readFileSync(new URL('../../../supabase/migrations/20261124213410_online_forms_question_bank_attempts.sql', import.meta.url), 'utf8'));
  await db.exec(readFileSync(new URL('../../../supabase/migrations/20261126164641_online_forms_declared_groups.sql', import.meta.url), 'utf8'));

  // PGlite uses one connection. Serialize the entire role/JWT/query block so
  // parallel browser RPC requests cannot inherit another request's identity.
  let roleQueue = Promise.resolve();
  function asRole(sql, params = [], actor = owner, role = actor ? 'authenticated' : 'anon') {
    if (!['anon', 'authenticated'].includes(role)) throw new Error('Unsupported fixture role');
    const run = async () => {
      await db.exec(`set role ${role}`);
      try {
        await db.query("select set_config('request.jwt.claim.sub',$1,false)", [actor || '']);
        return await db.query(sql, params);
      } finally { await db.exec('reset role'); }
    };
    const result = roleQueue.then(run, run);
    roleQueue = result.then(() => undefined, () => undefined);
    return result;
  }
  async function call(name, args = {}, actor = owner, role = actor ? 'authenticated' : 'anon') {
    if (!/^v2_online_forms?_[a-z_]+$/.test(name)) throw new Error('Unsupported fixture RPC');
    const entries = Array.isArray(args) ? args.map((value, index) => [null, value]) : Object.entries(args);
    for (const [key] of entries) if (key && !/^p_[a-z_]+$/.test(key)) throw new Error('Invalid fixture argument');
    const placeholders = entries.map(([key], index) => `${key ? `${key} => ` : ''}$${index + 1}`).join(',');
    return (await asRole(`select public.${name}(${placeholders}) result`, entries.map(([, value]) => value), actor, role)).rows[0].result;
  }
  async function reset() {
    await roleQueue;
    await db.exec('delete from public.v2_online_forms; delete from public.v2_question_bank; delete from public.v2_groups;');
    await db.query("insert into public.v2_groups values($1,$2,'Grupo de prueba'),($3,$4,'Grupo ajeno')", [group, owner, otherGroup, other]);
    await db.query("insert into public.v2_group_students values($1,$2,$3,'Alumno de padrón','ABC123',true),($4,$2,$3,'Alumno inactivo','BAJA',false)", [pupil, group, owner, inactive]);
    for (let i = 0; i < bank.length; i++) {
      const tf = i === 7;
      const options = tf ? ['Verdadero', 'Falso'] : [`Correcta ${i}`, `Distractor ${i}`, `Alternativa ${i}`, `Otra ${i}`];
      await db.query('insert into public.v2_question_bank(id,teacher_id,title,subject,topic,question_type,prompt,options,correct_answer,explanation,difficulty,archived) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',
        [bank[i], i === 8 ? other : owner, `Pregunta ${i}`, 'Materia', i < 4 ? 'Tema A' : 'Tema B', i === 10 ? 'multiple_select' : tf ? 'true_false' : 'multiple_choice', `Enunciado original ${i}`, JSON.stringify(options), JSON.stringify(options[0]), `Explicación ${i}`, 'media', i === 9]);
    }
  }
  await reset();
  const questions = (await db.query('select * from public.v2_question_bank where teacher_id=$1 order by title', [owner])).rows;
  return { db, owner, other, group, otherGroup, pupil, inactive, bank, questions, asRole, call, reset };
}
