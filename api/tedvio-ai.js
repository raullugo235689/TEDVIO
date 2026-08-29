export const config={maxDuration:10};

const SUPABASE_URL='https://ggjknixnrjzkzkpwbwsl.supabase.co';
const SUPABASE_KEY='sb_publishable_2sQojzbcJWI4AXwFsNallQ_bvRE9oFc';
const WINDOW_MS=5*60*1000;
const MAX_REQUESTS=40;
const rateBuckets=globalThis.__TEDVIO_INSIGHT742_RATE__||(globalThis.__TEDVIO_INSIGHT742_RATE__=new Map());

const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
const cleanText=(value,max=1800)=>String(value??'').replace(/\u0000/g,'').trim().slice(0,max);
const uuid=value=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value||''));
const mean=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:null;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const pct=v=>v==null?null:Number(Number(v).toFixed(1));

function sameOrigin(request){
  const origin=request.headers.get('origin');
  if(!origin)return true;
  try{
    const host=request.headers.get('x-forwarded-host')||request.headers.get('host')||'';
    return new URL(origin).host===host;
  }catch{return false}
}
function limited(userId){
  const now=Date.now(),old=rateBuckets.get(userId)||[];
  const recent=old.filter(t=>now-t<WINDOW_MS);
  if(recent.length>=MAX_REQUESTS){rateBuckets.set(userId,recent);return true}
  recent.push(now);rateBuckets.set(userId,recent);
  if(rateBuckets.size>500){
    for(const[k,v]of rateBuckets){
      if(!v.some(t=>now-t<WINDOW_MS))rateBuckets.delete(k);
      if(rateBuckets.size<=400)break;
    }
  }
  return false;
}
async function supabaseFetch(path,token,{method='GET',body,headers={}}={}){
  const r=await fetch(`${SUPABASE_URL}${path}`,{
    method,
    headers:{apikey:SUPABASE_KEY,authorization:`Bearer ${token}`,'content-type':'application/json',accept:'application/json',...headers},
    body:body===undefined?undefined:JSON.stringify(body)
  });
  const text=await r.text();
  let data=null;
  try{data=text?JSON.parse(text):null}catch{data=text}
  if(!r.ok){
    const e=new Error(data?.message||data?.error_description||`Supabase ${r.status}`);
    e.status=r.status;e.code=data?.code||'supabase_error';throw e;
  }
  return data;
}
async function authenticatedUser(token){
  if(!token)return null;
  try{return await supabaseFetch('/auth/v1/user',token)}catch{return null}
}
function explicitStudentNames(message){
  return /(qu[ié]nes|qu[eé]\s+alumnos|cu[aá]les\s+alumnos|dame\s+los\s+nombres|lista\s+de\s+(alumnos|estudiantes)|nombres\s+de\s+(alumnos|estudiantes))/i.test(message);
}
function groupSummary(g){
  return{
    id:String(g?.id||''),name:cleanText(g?.name,100),subject:cleanText(g?.subject,120),term:cleanText(g?.term,80),
    students:Number(g?.students||0),attendance_rate:g?.attendance_rate==null?null:Number(g.attendance_rate),
    attendance_sessions_count:Number(g?.attendance_sessions_count||0),attendance_records_count:Number(g?.attendance_records_count||0),
    today_attendance_records_count:Number(g?.today_attendance_records_count||0),grade_avg:g?.grade_avg==null?null:Number(g.grade_avg),
    risk_count:Number(g?.risk_count||0),watch_count:Number(g?.watch_count||0),today_attendance_status:cleanText(g?.today_attendance_status,30)||null,
    last_activity:g?.last_activity||null
  };
}
function compactPriority(items,includeNames){
  return(items||[]).slice(0,12).map((x,i)=>({
    student:includeNames?cleanText(x?.full_name,120):`Alumno ${i+1}`,
    group_id:String(x?.group_id||''),attendance_rate:x?.attendance_rate==null?null:Number(x.attendance_rate),
    grade:x?.grade==null?null:Number(x.grade),status:['risk','watch'].includes(String(x?.status))?String(x.status):'watch'
  }));
}
function normalizeAnswers(value){
  if(Array.isArray(value))return value;
  if(value&&typeof value==='object')return Object.keys(value).sort((a,b)=>Number(a)-Number(b)).map(k=>value[k]);
  return[];
}
function keyFor(exam,result){
  const keys=exam?.answer_keys;if(Array.isArray(keys))return keys;if(!keys||typeof keys!=='object')return[];
  const v=String(result?.version||'A');return normalizeAnswers(keys[v]??keys[v.toUpperCase()]??keys.A??keys.a??keys.default??keys);
}
function itemMeta(exam,q){
  const root=exam?.question_metadata&&typeof exam.question_metadata==='object'&&!Array.isArray(exam.question_metadata)?exam.question_metadata:{};
  const items=root.items&&typeof root.items==='object'?root.items:{};const x=items[String(q)]||{};return x&&typeof x==='object'?x:{};
}
function topicFor(exam,q){
  const root=exam?.question_metadata&&typeof exam.question_metadata==='object'&&!Array.isArray(exam.question_metadata)?exam.question_metadata:{};
  const topics=Array.isArray(root.topics)?root.topics:[];
  const hit=topics.find(x=>q>=Number(x?.from)&&q<=Number(x?.to)&&String(x?.topic||'').trim());
  return hit?cleanText(hit.topic,100):'';
}
async function assessmentAggregate(latest,token){
  const examId=String(latest?.id||'');if(!uuid(examId))return null;
  const select='id,group_id,title,subject,question_count,versions,answer_keys,question_metadata';
  const exams=await supabaseFetch(`/rest/v1/v2_paper_exams?id=eq.${encodeURIComponent(examId)}&select=${encodeURIComponent(select)}`,token);
  const exam=Array.isArray(exams)?exams[0]:null;if(!exam)return null;
  const results=await supabaseFetch(`/rest/v1/v2_paper_exam_results?exam_id=eq.${encodeURIComponent(examId)}&select=${encodeURIComponent('version,answers,score')}&order=created_at.asc`,token,{headers:{range:'0-1999'}});
  const rows=Array.isArray(results)?results:[],qCount=clamp(Number(exam.question_count||0),0,120),items=[];
  for(let i=0;i<qCount;i++){
    const q=i+1;if(itemMeta(exam,q).exclude_analysis)continue;
    let correct=0,blank=0,valid=0;
    for(const r of rows){
      const key=keyFor(exam,r),answers=normalizeAnswers(r.answers),k=String(key[i]??'').trim().toUpperCase(),a=String(answers[i]??'').trim().toUpperCase();
      if(!k)continue;valid++;if(!a)blank++;if(a&&a===k)correct++;
    }
    if(valid)items.push({q,accuracy:Math.round(correct/valid*100),blank:Math.round(blank/valid*100),topic:topicFor(exam,q)||null});
  }
  const topicMap=new Map();
  for(const x of items){if(!x.topic)continue;const values=topicMap.get(x.topic)||[];values.push(x.accuracy);topicMap.set(x.topic,values)}
  return{
    exam:{id:exam.id,group_id:String(exam.group_id||''),title:cleanText(exam.title,140),subject:cleanText(exam.subject,120),question_count:qCount},
    result_count:rows.length,
    weak_topics:[...topicMap.entries()].map(([topic,values])=>({topic,accuracy:Math.round(mean(values))})).sort((a,b)=>a.accuracy-b.accuracy).slice(0,5),
    weak_items:[...items].sort((a,b)=>a.accuracy-b.accuracy||b.blank-a.blank).slice(0,8)
  };
}
function compactContext(raw,assessment,message){
  const groups=(raw?.groups||[]).slice(0,12).map(groupSummary),validIds=new Set(groups.map(g=>g.id));
  return{
    date:raw?.date||null,scope_group_id:raw?.scope_group_id||null,groups,groups_count:Number(raw?.groups_count||groups.length),
    pending_attendance:Number(raw?.pending_attendance||0),risk_students:Number(raw?.risk_students||0),watch_students:Number(raw?.watch_students||0),
    priority_students:compactPriority(raw?.priority_students,explicitStudentNames(message)).filter(x=>!x.group_id||validIds.has(x.group_id)),
    latest_evaluation:raw?.latest_evaluation?{
      id:String(raw.latest_evaluation.id||''),title:cleanText(raw.latest_evaluation.title,140),group_id:String(raw.latest_evaluation.group_id||''),
      average:raw.latest_evaluation.average==null?null:Number(raw.latest_evaluation.average),subject:cleanText(raw.latest_evaluation.subject,120),
      question_count:Number(raw.latest_evaluation.question_count||0),at:raw.latest_evaluation.at||null
    }:null,
    assessment
  };
}
function coverageFor(group,context){
  const sessions=Number(group.attendance_sessions_count||0);
  const attendance=sessions===0?{status:'insufficient',label:'Sin evidencia',detail:'No hay listas de asistencia cerradas o registradas.'}:
    sessions<3?{status:'preliminary',label:'Preliminar',detail:`Hay ${sessions} lista${sessions===1?'':'s'}; conviene acumular al menos 3 para interpretar tendencia.`}:
    {status:'sufficient',label:'Con evidencia',detail:`Hay ${sessions} listas de asistencia registradas.`};
  const performance=group.grade_avg==null?{status:'insufficient',label:'Sin evidencia',detail:'Todavía no existe un promedio académico consolidado.'}:
    {status:'sufficient',label:'Con evidencia',detail:`Existe un promedio académico disponible de ${pct(group.grade_avg)}/10.`};
  const risk=sessions>=3&&group.grade_avg!=null?{status:'sufficient',label:'Evaluable',detail:'Hay evidencia de asistencia y rendimiento para una lectura combinada.'}:
    sessions>=3||group.grade_avg!=null?{status:'partial',label:'Parcial',detail:'Solo una dimensión tiene evidencia suficiente; evita interpretar el riesgo como diagnóstico completo.'}:
    {status:'insufficient',label:'No evaluable',detail:'Faltan suficientes datos de asistencia y rendimiento.'};
  const assessment=context.assessment&&String(context.assessment.exam?.group_id||'')===group.id?context.assessment:null;
  const evaluation=assessment?.result_count>0?{status:'sufficient',label:'Con evidencia',detail:`El último OMR contiene ${assessment.result_count} resultado${assessment.result_count===1?'':'s'}.`}:
    {status:'insufficient',label:'Sin OMR',detail:'No hay resultados OMR recientes dentro del contexto.'};
  return{attendance,performance,risk,evaluation};
}
function interpretIntent(message,intent){
  if(intent==='reinforcement'||/(reforz|reactiv|banco|repas|preguntas)/i.test(message))return'reinforcement';
  if(/(asistencia|lista|ausencia|faltas|presentes|retardo)/i.test(message))return'attendance';
  if(/(calific|promedio|rendimiento|nota|evaluaci[oó]n)/i.test(message))return'performance';
  if(/(riesgo|atenci[oó]n|seguimiento|prioridad|qu[ié]nes|qu[eé]\s+alumnos)/i.test(message))return'risk';
  if(/(evidencia|datos faltan|informaci[oó]n falta|suficiente)/i.test(message))return'evidence';
  return'status';
}
async function bankSuggestions(topic,token,userId){
  if(!topic)return[];
  const fields='id,title,prompt,topic,difficulty,bloom,question_type';
  const path=`/rest/v1/v2_question_bank?teacher_id=eq.${encodeURIComponent(userId)}&archived=eq.false&topic=eq.${encodeURIComponent(topic)}&select=${encodeURIComponent(fields)}&order=updated_at.desc&limit=12`;
  const rows=await supabaseFetch(path,token);
  return(Array.isArray(rows)?rows:[]).filter(x=>x.question_type==='multiple_choice'||x.question_type==='true_false').slice(0,5).map(x=>({
    id:String(x.id),title:cleanText(x.title,100),prompt:cleanText(x.prompt,260),topic:cleanText(x.topic,100),difficulty:cleanText(x.difficulty,30),bloom:cleanText(x.bloom,30)
  }));
}
function action(kind,label,groupId=''){return{kind,label,group_id:groupId,prompt:''}}
function nextAction(group,context){
  const assessment=context.assessment&&String(context.assessment.exam?.group_id||'')===group.id?context.assessment:null;
  const weak=assessment?.weak_topics?.[0]||null;
  if(['open','paused'].includes(group.today_attendance_status))return{answer:'Continúa y cierra correctamente la asistencia de hoy.',actions:[action('take_attendance','Continuar asistencia',group.id)]};
  if(group.students>0&&!group.today_attendance_status)return{answer:'Crea la lista de asistencia de hoy antes de continuar con el seguimiento académico.',actions:[action('take_attendance','Tomar asistencia',group.id)]};
  if(group.risk_count>0||group.watch_count>0)return{answer:`Revisa primero a los ${group.risk_count+group.watch_count} alumnos con señales académicas de riesgo o seguimiento.`,actions:[action('open_grades','Revisar alumnos prioritarios',group.id)]};
  if(weak)return{answer:`Refuerza ${weak.topic}, el contenido con menor dominio del último OMR (${weak.accuracy}% de aciertos).`,actions:[action('open_omr','Revisar contenido débil',group.id),action('open_bank','Abrir Banco de Reactivos',group.id)]};
  if(group.attendance_sessions_count>=3&&group.attendance_rate!=null&&group.attendance_rate<80)return{answer:'Revisa ausencias y registros: la asistencia acumulada está por debajo de 80%.',actions:[action('open_group','Revisar asistencia del grupo',group.id)]};
  if(group.grade_avg==null)return{answer:'Registra o revisa la primera evidencia de evaluación para poder interpretar rendimiento.',actions:[action('open_grades','Abrir libro de calificaciones',group.id)]};
  if(group.grade_avg<6)return{answer:'Revisa las evidencias del libro: el promedio disponible está por debajo del nivel aprobatorio.',actions:[action('open_grades','Revisar libro',group.id)]};
  return{answer:'Los indicadores disponibles no muestran una prioridad crítica; continúa con la siguiente actividad y mantén seguimiento habitual.',actions:[action('open_group','Abrir centro del grupo',group.id)]};
}
async function groupInsight(group,context,intent,token,userId){
  const coverage=coverageFor(group,context),assessment=context.assessment&&String(context.assessment.exam?.group_id||'')===group.id?context.assessment:null;
  const weak=assessment?.weak_topics?.[0]||null;
  const evidence=[`${group.name} tiene ${group.students} alumnos registrados.`];
  if(group.attendance_rate!=null)evidence.push(`Asistencia acumulada: ${pct(group.attendance_rate)}% en ${group.attendance_sessions_count} lista${group.attendance_sessions_count===1?'':'s'}.`);
  else evidence.push('No hay tasa acumulada de asistencia disponible.');
  evidence.push(group.grade_avg==null?'Todavía no existe un promedio académico consolidado.':`Promedio académico disponible: ${pct(group.grade_avg)}/10.`);
  if(['open','paused'].includes(group.today_attendance_status))evidence.push(`La asistencia de hoy está ${group.today_attendance_status==='open'?'abierta':'pausada'}.`);
  else if(!group.today_attendance_status)evidence.push('No hay una lista de asistencia registrada hoy.');
  if(coverage.risk.status==='sufficient')evidence.push(`${group.risk_count} alumnos en riesgo y ${group.watch_count} en seguimiento según las reglas configuradas.`);
  else evidence.push(`Riesgo combinado: ${coverage.risk.label.toLowerCase()}; ${coverage.risk.detail}`);
  if(weak)evidence.push(`${weak.topic} es el contenido con menor dominio del último OMR (${weak.accuracy}% de aciertos).`);
  const next=nextAction(group,context);
  let answer='',actions=[...next.actions],bank_items=[];
  if(intent==='attendance')answer=`${group.name}: ${group.attendance_rate==null?'todavía no hay una tasa acumulada de asistencia':`la asistencia acumulada es ${pct(group.attendance_rate)}%`} y existen ${group.attendance_sessions_count} listas registradas. ${coverage.attendance.detail}`;
  else if(intent==='performance')answer=group.grade_avg==null?`${group.name} todavía no tiene evidencia suficiente de rendimiento para calcular un promedio consolidado. ${next.answer}`:`${group.name} tiene un promedio disponible de ${pct(group.grade_avg)}/10. ${next.answer}`;
  else if(intent==='risk')answer=coverage.risk.status==='sufficient'?`${group.name} tiene ${group.risk_count} alumnos en riesgo y ${group.watch_count} en seguimiento según las reglas académicas configuradas. ${next.answer}`:`Todavía no conviene interpretar “0 alumnos en riesgo” como ausencia de riesgo: ${coverage.risk.detail} ${next.answer}`;
  else if(intent==='evidence')answer=`Cobertura actual de ${group.name}: asistencia ${coverage.attendance.label.toLowerCase()}, rendimiento ${coverage.performance.label.toLowerCase()}, riesgo combinado ${coverage.risk.label.toLowerCase()} y OMR ${coverage.evaluation.label.toLowerCase()}. ${next.answer}`;
  else if(intent==='reinforcement'){
    if(weak){
      try{bank_items=await bankSuggestions(weak.topic,token,userId)}catch{}
      answer=bank_items.length?`${weak.topic} es el contenido prioritario (${weak.accuracy}% de aciertos). Encontré ${bank_items.length} reactivo${bank_items.length===1?'':'s'} ya existente${bank_items.length===1?'':'s'} en tu Banco para preparar un reforzamiento sin generar contenido nuevo.`:`${weak.topic} es el contenido prioritario (${weak.accuracy}% de aciertos), pero no encontré reactivos del mismo tema en tu Banco. Puedes abrir Question Studio para agregar o etiquetar preguntas.`;
      actions=[action('open_bank','Abrir Banco de Reactivos',group.id),action('open_omr','Ver evidencia OMR',group.id)];
    }else{
      answer='No hay un contenido débil mapeado con suficiente detalle para seleccionar un reforzamiento. Etiqueta los reactivos por tema en OMR y vuelve a consultar.';
      actions=[action('open_omr','Mapear contenidos en OMR',group.id),action('open_bank','Abrir Banco de Reactivos',group.id)];
    }
  }else answer=`${group.name} tiene ${group.students} alumnos${group.attendance_rate==null?'':`, ${pct(group.attendance_rate)}% de asistencia acumulada`}${group.grade_avg==null?'':` y promedio de ${pct(group.grade_avg)}/10`}. ${next.answer}`;
  if(!actions.some(a=>a.kind==='open_group')&&actions.length<3)actions.push(action('open_group','Abrir centro del grupo',group.id));
  return{answer,evidence:evidence.slice(0,6),actions:actions.slice(0,3),coverage,bank_items,caution:'Lectura determinística basada en datos de TEDVIO. No usa IA generativa ni realiza decisiones automáticas sobre estudiantes.'};
}
function portfolioInsight(context){
  const groups=[...(context.groups||[])].sort((a,b)=>{
    const score=g=>(['open','paused'].includes(g.today_attendance_status)?100:0)+(g.students&&!g.today_attendance_status?35:0)+g.risk_count*8+g.watch_count*3+(g.attendance_sessions_count>=3&&g.attendance_rate!=null&&g.attendance_rate<80?20:0)+(g.grade_avg==null?5:0);
    return score(b)-score(a);
  });
  if(!groups.length)return{answer:'No encontré grupos activos dentro del contexto autorizado.',evidence:['El contexto académico no devolvió grupos activos.'],actions:[],coverage:null,bank_items:[],caution:'TEDVIO Insight usa reglas académicas locales y no IA generativa.'};
  const top=groups[0],next=nextAction(top,context);
  return{
    answer:`Tienes ${context.groups_count} grupos. La prioridad operativa actual es ${top.name}. ${next.answer}`,
    evidence:[`${context.groups_count} grupos disponibles.`,`${context.pending_attendance} listas abiertas o pausadas.`,`${context.risk_students} alumnos en riesgo y ${context.watch_students} en seguimiento en los grupos con evidencia suficiente.`,`${top.name} tiene ${top.students} alumnos.`].slice(0,6),
    actions:[...next.actions,action('open_group','Abrir grupo prioritario',top.id)].slice(0,3),coverage:null,bank_items:[],
    caution:'Priorización determinística basada en reglas académicas; no usa IA generativa.'
  };
}

export default{async fetch(request){
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{allow:'POST, OPTIONS','cache-control':'no-store'}});
  if(request.method!=='POST')return json({error:'Método no permitido.'},405);
  if(!sameOrigin(request))return json({error:'Origen no permitido.'},403);
  const auth=request.headers.get('authorization')||'',token=auth.match(/^Bearer\s+(.+)$/i)?.[1]||'',user=await authenticatedUser(token);
  if(!user?.id)return json({error:'Sesión docente no válida.'},401);
  if(limited(user.id))return json({error:'Demasiadas consultas en poco tiempo. Intenta nuevamente en unos minutos.',code:'rate_limited'},429);
  let body={};try{body=await request.json()}catch{return json({error:'Solicitud inválida.'},400)}
  const message=cleanText(body?.message,1800);if(!message)return json({error:'Escribe una consulta.'},400);
  const groupId=uuid(body?.groupId)?String(body.groupId):null,intent=interpretIntent(message,body?.intent);
  try{
    const raw=await supabaseFetch('/rest/v1/rpc/v2_teacher_ai_context',token,{method:'POST',body:{p_group_id:groupId}});
    if(groupId&&!(raw?.groups||[]).length)return json({error:'No encontré ese grupo dentro de tu cuenta.'},404);
    let assessment=null;try{assessment=await assessmentAggregate(raw?.latest_evaluation,token)}catch{}
    const context=compactContext(raw,assessment,message);
    const selected=groupId?context.groups.find(g=>g.id===groupId):null;
    const result=selected?await groupInsight(selected,context,intent,token,user.id):portfolioInsight(context);
    return json({...result,scope_group_id:groupId,mode:'insight',provider:'local-rules',model:null,generative_ai:false,inference_cost:0,version:'2026.08.28.742'});
  }catch(error){
    console.error('TEDVIO Insight',error?.code||error?.message||'unknown');
    const status=Number(error?.status)||500;
    return json({error:status>=500?'TEDVIO no pudo preparar el análisis académico en este momento.':cleanText(error.message,500),code:error?.code||'insight_error'},status>=400&&status<600?status:500);
  }
}};