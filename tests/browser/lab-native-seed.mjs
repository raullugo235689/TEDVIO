/** Isolated local Supabase only. Generates synthetic accounts and rosters.
 * All keys/sessions come from the ephemeral local stack, never production.
 * The private fixture stays outside published artifacts and is removed after CI.
 */
import {execFileSync} from 'node:child_process';
import {writeFileSync,mkdirSync,readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
const cwd=process.cwd();
if(!readFileSync('supabase/config.toml','utf8').includes('project_id = "tedvio-recovery-drill"')) throw new Error('Refuse non-isolated project');
execFileSync('supabase',['status','--help'],{stdio:'ignore'});
const status=JSON.parse(execFileSync('supabase',['status','--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
const api=status.API_URL;
if(!/^http:\/\/(127\.0\.0\.1|localhost):54321\/?$/.test(api))throw new Error('Local API required');
const anon=status.ANON_KEY,service=status.SERVICE_ROLE_KEY;
if(!anon||!service)throw new Error('Missing ephemeral local keys');
async function request(endpoint,body,token=anon,method='POST'){
 const r=await fetch(api+endpoint,{method,headers:{apikey:anon,Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:method==='GET'?undefined:JSON.stringify(body)});
 const data=await r.json();if(!r.ok)throw new Error(`${endpoint}: ${data.message||data.msg||data.error_description||r.status}`);return data;
}
const docs=await request('/rest/v1/rpc/tedvio_required_legal_documents_v21',{});
if(!Array.isArray(docs)||!docs.length)throw new Error('Legal fixture missing');
const acceptance=docs.filter(d=>d.required).map(d=>({document_key:d.document_key,document_version:d.version,accepted:true}));
const people=[];
for(let n=0;n<2;n++){
 const email=`lab-native-${n}-${randomUUID()}@example.test`,password=`Z!7x-${randomUUID()}`;
 const created=await request('/auth/v1/admin/users',{email,password,email_confirm:true,user_metadata:{full_name:`Docente sintético ${n}`,tedvio_legal_acceptances:acceptance}},service);
 const id=created.id||created.user?.id;if(!/^[0-9a-f-]{36}$/.test(id))throw new Error('User creation not confirmed');
 execFileSync('psql',['-h','127.0.0.1','-p','54322','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-c',`update public.tedvio_user_profiles set status='active',role='teacher',plan='pro' where user_id='${id}';
 insert into public.tedvio_onboarding_progress(user_id,last_step,completed_steps,dismissed,completed_at,updated_at) values('${id}','session',array['group','students','attendance','question','session'],true,now(),now()) on conflict(user_id) do update set dismissed=true,completed_at=now();`],{env:{...process.env,PGPASSWORD:'postgres'},stdio:'ignore'});
 const session=await request('/auth/v1/token?grant_type=password',{email,password});if(!session.access_token)throw new Error('Login not confirmed');people.push({id,session});
}
const teacher=people[0].id,group=randomUUID(),university=randomUUID(),program=randomUUID();
execFileSync('psql',['-h','127.0.0.1','-p','54322','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-c',`
 insert into public.v2_universities(id,teacher_id,name) values('${university}','${teacher}','Institución sintética Lab');
 insert into public.v2_programs(id,teacher_id,university_id,name) values('${program}','${teacher}','${university}','Programa sintético');
 insert into public.v2_groups(id,teacher_id,program_id,name,subject,group_name,is_demo) values('${group}','${teacher}','${program}','Grupo de prueba A','Práctica de cálculo','Grupo de prueba A',false);
 insert into public.v2_group_students(id,teacher_id,group_id,enrollment,full_name,active) values('${randomUUID()}','${teacher}','${group}','TEST-001','Persona sintética A',true),('${randomUUID()}','${teacher}','${group}','TEST-002','Persona sintética B',true);
 notify pgrst,'reload schema';`],{env:{...process.env,PGPASSWORD:'postgres'},stdio:'ignore'});
mkdirSync('.lab-test-local',{recursive:true});
writeFileSync('.lab-test-local/fixture.json',JSON.stringify({api,anon,teacher:people[0],other:people[1],group}),{mode:0o600});
console.log('Synthetic local accounts and canonical roster ready; no credentials logged.');
