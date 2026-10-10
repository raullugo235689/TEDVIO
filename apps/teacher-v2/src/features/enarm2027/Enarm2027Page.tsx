import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import {
  fetchEnarmWorkspace, enarmWorkspaceKey, saveEnarmSettings, type EnarmSettings,
  type EnarmTab, ENARM_AREAS,
} from '../../core/enarm2027';
import { calculateEnarmPerformance, weeklyPlan } from '../../core/enarm2027-model';
import { useAuth } from '../auth/AuthProvider';
import { ErrorPanel, LoadingScreen } from '../../shared/components';
import { Icon, type IconName } from '../../shared/icons';
import { EnarmPractice } from './EnarmPractice';
import { EnarmFlashcards } from './EnarmFlashcards';
import { EnarmSimulator } from './EnarmSimulator';

const TABS: Array<{ key:EnarmTab; label:string; description:string; icon:IconName }> = [
  { key:'panorama', label:'Panorama',description:'Tu progreso', icon:'layout' },
  { key:'practica', label:'Entrenar',description:'Casos clínicos', icon:'bank' },
  { key:'repaso', label:'Repasar',description:'Memoria clínica', icon:'refresh' },
  { key:'simulador', label:'Simulador',description:'Tiempo y precisión', icon:'clock' },
  { key:'flashcards', label:'Flashcards',description:'Mi colección privada', icon:'bank' },
  { key:'plan', label:'Mi plan',description:'Objetivos personales', icon:'calendar' },
];

function Dashboard({ workspace, go }: {
  workspace: Awaited<ReturnType<typeof fetchEnarmWorkspace>>;
  go: (tab: EnarmTab) => void;
}) {
  const summary = useMemo(
    () => calculateEnarmPerformance(workspace.cases,workspace.attempts,workspace.reviews),
    [workspace],
  );
  const areas = summary.byArea;
  const practiced = new Map(workspace.cases.map(q=>[q.id,q]));
  const last = workspace.attempts.filter(a=>practiced.has(a.question_id)).slice(0,6);
  const weak = [...areas].filter(a=>a.accuracy!==null && a.total>=2).sort((a,b)=>(a.accuracy??100)-(b.accuracy??100))[0] || null;
  const goal = workspace.settings.target_pct;

  return <div className="enarm-dashboard">
    <section className="enarm-metric-grid" aria-label="Indicadores de tu preparación">
      <article className="enarm-metric">
        <div><Icon name="analytics"/><span>PRECISIÓN ACUMULADA</span></div>
        <strong>{summary.accuracy === null ? '—' : `${summary.accuracy}%`}</strong>
        <p>{summary.attempts ? `${summary.correct} correctas de ${summary.attempts} respuestas recientes` : 'Comienza tu primer entrenamiento'}</p>
      </article>
      <article className="enarm-metric"><div><Icon name="bank"/><span>CASOS ESTUDIADOS</span></div>
        <strong>{summary.studied}<small>/{workspace.cases.length}</small></strong>
        <p>Reactivos diferentes revisados</p>
      </article>
      <article className="enarm-metric"><div><Icon name="refresh"/><span>REPASOS DISPONIBLES</span></div>
        <strong>{summary.due}</strong><p>{summary.due ? 'Ya puedes recuperar conceptos de sesiones previas' : 'Se programarán a medida que respondas'}</p>
      </article>
      <article className="enarm-metric"><div><Icon name="clock"/><span>COMPROMISO SEMANAL</span></div>
        <strong>{workspace.settings.weekly_hours}<small>h</small></strong><p>Meta editable · rendimiento objetivo {goal}%</p>
      </article>
    </section>

    <div className="enarm-dashboard-columns">
      <div className="enarm-main-column">
        <section className="enarm-surface enarm-focus">
          <div className="enarm-surface-header"><div><span className="enarm-eyebrow">TU SIGUIENTE MOVIMIENTO</span><h2>Una sesión bien aprovechada cada día.</h2>
            <p>{weak ? `Tu área con mayor oportunidad de mejora es ${weak.label}. Puedes reforzarla con casos y lecturas dirigidas.` : 'Comienza con casos clínicos de las siete áreas. Tus resultados irán orientando tus siguientes repasos.'}</p>
          </div><span className="enarm-focus-orbit"><Icon name="route"/></span></div>
          <div className="enarm-focus-actions">
            <button type="button" className="enarm-primary" onClick={()=>go('practica')}>Resolver casos <Icon name="arrow"/></button>
            <button type="button" className="enarm-secondary" onClick={()=>go(summary.due||summary.wrongCases?'repaso':'simulador')}>
              {summary.due||summary.wrongCases?'Reforzar errores':'Simulador breve'}
            </button>
          </div>
        </section>
        <section className="enarm-surface enarm-performance">
          <header className="enarm-surface-header"><div><span className="enarm-eyebrow">DOMINIO POR ÁREA</span><h2>Mapa de rendimiento clínico</h2><p>Precisión de tus respuestas registradas en cada especialidad.</p></div></header>
          <div className="enarm-area-list">
            {areas.map(a=>{
              const meta = ENARM_AREAS.find(x=>x.key===a.area);
              return <div className="enarm-area-row" key={a.area}>
                <span className="enarm-area-dot" style={{background:meta?.accent}}/>
                <div className="enarm-area-info"><strong>{a.label}</strong><small>{a.total ? `${a.correct} de ${a.total} respuestas correctas` : 'Aún sin datos'}</small></div>
                <div className="enarm-area-track" aria-label={`${a.label}: ${a.accuracy===null?'sin datos':a.accuracy+'%'}`}><i style={{width:`${a.accuracy??0}%`,background:meta?.accent}}/></div>
                <b>{a.accuracy===null?'—':`${a.accuracy}%`}</b>
              </div>;
            })}
          </div>
          <footer>Las áreas se presentan para planificar el estudio; no representan una ponderación oficial del ENARM 2027.</footer>
        </section>
      </div>
      <aside className="enarm-side-column">
        <section className="enarm-surface enarm-quick-plan">
          <span className="enarm-eyebrow">PLAN PERSONAL</span>
          <h2>{workspace.settings.weekly_hours} horas para avanzar esta semana.</h2>
          <div className="enarm-mini-plan">
            {weeklyPlan(workspace.settings.weekly_hours).map(t=><div key={t.key}><span>{t.label}</span><b>{t.minutes} min</b></div>)}
          </div>
          <button className="enarm-text-link" type="button" onClick={()=>go('plan')}>Editar mi plan <Icon name="arrow"/></button>
        </section>
        <section className="enarm-surface enarm-activity">
          <span className="enarm-eyebrow">ACTIVIDAD RECIENTE</span><h2>Tu trayectoria</h2>
          {last.length ? <div className="enarm-activity-list">
            {last.map(attempt=>{
              const q=practiced.get(attempt.question_id);
              return <div key={attempt.id}>
                <span className={attempt.is_correct?'enarm-act-correct':'enarm-act-wrong'}><Icon name={attempt.is_correct?'check':'alert'}/></span>
                <div><b>{q?.topic||'Caso clínico'}</b><small>{new Date(attempt.answered_at).toLocaleDateString('es-MX',{day:'numeric',month:'short'})} · {attempt.mode}</small></div>
              </div>;
            })}
          </div> : <p className="enarm-muted">Aquí aparecerán tus respuestas y avances después de resolver los primeros casos.</p>}
        </section>
      </aside>
    </div>
  </div>;
}

function PersonalPlan({ initial, onSaved }: {
  initial: EnarmSettings;
  onSaved: () => Promise<unknown>;
}) {
  const auth = useAuth();
  const [weeklyHours,setWeeklyHours]=useState(initial.weekly_hours);
  const [targetPct,setTargetPct]=useState(initial.target_pct);
  const [targetDate,setTargetDate]=useState(initial.target_date||'');
  const [desiredSpecialty,setDesiredSpecialty]=useState(initial.desired_specialty);
  const [saved,setSaved]=useState(false);
  const mutation = useMutation({
    mutationFn: () => {
      if(!auth.user) throw new Error('Necesitas una sesión activa.');
      return saveEnarmSettings(auth.user,{
        weekly_hours:weeklyHours,target_pct:targetPct,
        target_date:targetDate||null,desired_specialty:desiredSpecialty.trim(),
      });
    },
    onSuccess: () => {setSaved(true);void onSaved();},
  });
  useEffect(()=>{setWeeklyHours(initial.weekly_hours);setTargetPct(initial.target_pct);setTargetDate(initial.target_date||'');setDesiredSpecialty(initial.desired_specialty);},[initial.user_id]);

  const tasks=weeklyPlan(weeklyHours);
  const weekdayMinutes=Math.round(weeklyHours*60/6);
  const suggested=[
    {day:'Lunes a jueves',minutes:weekdayMinutes,detail:'Bloques breves repartidos entre los cuatro días'},
    {day:'Viernes',minutes:weeklyHours*10,detail:'Repasar casos fallados'},
    {day:'Sábado',minutes:weeklyHours*20,detail:'Casos nuevos y guías'},
    {day:'Domingo',minutes:weeklyHours*20,detail:'Simulador y análisis'},
  ];
  return <div className="enarm-personal-plan">
    <div className="enarm-section-heading"><div><span className="enarm-eyebrow">TU ESTRATEGIA</span><h2>Un plan que se adapte a tu tiempo.</h2>
      <p>Estudia de forma sostenible, mide resultados y aumenta la dificultad conforme identifiques áreas de mejora.</p></div></div>
    <div className="enarm-dashboard-columns">
      <section className="enarm-surface enarm-plan-form">
        <h3>Mis objetivos</h3>
        <form onSubmit={e=>{e.preventDefault();setSaved(false);mutation.mutate();}}>
          <label>Horas por semana
            <div className="enarm-range-heading"><input type="range" min="1" max="25" step="1" value={weeklyHours} onChange={e=>setWeeklyHours(Number(e.target.value))}/><strong>{weeklyHours} h</strong></div>
          </label>
          <label>Meta personal de precisión
            <div className="enarm-range-heading"><input type="range" min="50" max="100" step="5" value={targetPct} onChange={e=>setTargetPct(Number(e.target.value))}/><strong>{targetPct}%</strong></div>
          </label>
          <label>Especialidad que me interesa
            <input type="text" maxLength={100} value={desiredSpecialty} onChange={e=>setDesiredSpecialty(e.target.value)} placeholder="Ej. Medicina Interna, Anestesiología…"/>
          </label>
          <label>Fecha objetivo personal (opcional)
            <input type="date" min="2027-01-01" max="2027-12-31" value={targetDate} onChange={e=>setTargetDate(e.target.value)}/>
            <small>Es una fecha para organizar tu estudio, no una fecha oficial del ENARM 2027.</small>
          </label>
          {mutation.isError?<p className="enarm-error" role="alert">{mutation.error.message}</p>:null}
          {saved?<p className="enarm-note-confirm" role="status"><Icon name="check"/> Objetivos guardados en tu cuenta TEDVIO</p>:null}
          <button className="enarm-primary" type="submit" disabled={mutation.isPending}>{mutation.isPending?'Guardando…':'Guardar objetivos'} <Icon name="check"/></button>
        </form>
      </section>
      <div className="enarm-side-column">
        <section className="enarm-surface enarm-plan-breakdown">
          <span className="enarm-eyebrow">DISTRIBUCIÓN SEMANAL</span><h3>{weeklyHours*60} minutos con propósito</h3>
          {tasks.map(t=><div className="enarm-weekly-task" key={t.key}>
            <div><strong>{t.label}</strong><small>{t.description}</small></div><b>{t.minutes} min</b>
            <div className="enarm-task-track"><i style={{width:`${t.weight*100}%`}}/></div>
          </div>)}
        </section>
        <section className="enarm-surface enarm-schedule">
          <span className="enarm-eyebrow">DISTRIBUCIÓN SUGERIDA</span><h3>Bloques adaptables a tu jornada</h3>
          {suggested.map(t=><div key={t.day}><b>{t.day}</b><span>{t.minutes} min</span><small>{t.detail}</small></div>)}
          <p>Es un punto de partida, no una obligación. Puedes redistribuir las horas según tus clases y actividades.</p>
        </section>
      </div>
    </div>
  </div>;
}

export function Enarm2027Page() {
  const auth = useAuth();
  const client = useQueryClient();
  const [params,setParams]=useSearchParams();
  const candidate = params.get('tab');
  const tab:EnarmTab = TABS.some(x=>x.key===candidate) ? candidate as EnarmTab : 'panorama';
  const workspace = useQuery({
    queryKey:enarmWorkspaceKey(auth.user?.id),
    queryFn:()=>{if(!auth.user)throw new Error('Inicia sesión para acceder a tu preparación.');return fetchEnarmWorkspace(auth.user);},
    enabled:Boolean(auth.user),
    staleTime:20_000,
    retry:1,
  });
  const go=(next:EnarmTab)=>setParams(next==='panorama'?{}:{tab:next}, {replace:false});
  const refresh=()=>client.invalidateQueries({queryKey:enarmWorkspaceKey(auth.user?.id)});
  if(workspace.isLoading)return <LoadingScreen label="Preparando tu estudio ENARM 2027…"/>;
  if(workspace.isError)return <div className="enarm2027-page"><ErrorPanel title="No pude abrir tu preparación ENARM" detail={workspace.error.message} onRetry={()=>workspace.refetch()}/></div>;
  if(!workspace.data)return null;
  const data=workspace.data;
  return <div className="enarm2027-page" data-enarm-app="2027">
    <header className="enarm-hero">
      <div className="enarm-hero-content">
        <span className="enarm-hero-eyebrow"><i/> MI ESPACIO PERSONAL DE PREPARACIÓN</span>
        <div className="enarm-hero-title"><span>TEDVIO</span><h1>ENARM <em>2027</em></h1></div>
        <p>Tu preparación clínica, en un solo lugar. Practica, identifica debilidades y vuelve a estudiar con intención.</p>
        <div className="enarm-hero-actions">
          <button className="enarm-hero-button" type="button" onClick={()=>go('practica')}>Empezar a estudiar <Icon name="arrow"/></button>
          <button className="enarm-hero-outline" type="button" onClick={()=>go('plan')}>Mi estrategia 2027</button>
        </div>
      </div>
      <div className="enarm-hero-art" aria-hidden="true"><span className="enarm-hero-orbit first"/><span className="enarm-hero-orbit second"/><span className="enarm-hero-core"><Icon name="shield"/></span><span className="enarm-hero-coordinate c1">MEDICINA</span><span className="enarm-hero-coordinate c2">2027</span></div>
      <div className="enarm-hero-footer"><span><Icon name="shield"/> Datos de estudio privados</span><span><Icon name="bank"/> {data.cases.length} casos piloto originales</span><span><Icon name="clock"/> Revisión espaciada</span></div>
    </header>

    <nav className="enarm-navigation" role="tablist" aria-label="Apartados de ENARM 2027">
      {TABS.map(t=><button type="button" key={t.key} role="tab" aria-selected={tab===t.key}
        className={tab===t.key?'selected':''} onClick={()=>go(t.key)}>
        <Icon name={t.icon}/><span>{t.label}</span><small>{t.description}</small>
      </button>)}
    </nav>
    <section role="tabpanel" aria-label={TABS.find(t=>t.key===tab)?.label} className="enarm-content">
      {tab==='panorama'?<Dashboard workspace={data} go={go}/>:null}
      {tab==='practica'?<EnarmPractice key="practice" workspace={data} mode="practica" onProgress={refresh}/>:null}
      {tab==='repaso'?<EnarmPractice key="review" workspace={data} mode="repaso" onProgress={refresh}/>:null}
      {tab==='simulador'?<EnarmSimulator workspace={data} onProgress={refresh}/>:null}
      {tab==='flashcards'&&auth.user?<EnarmFlashcards key={auth.user.id} userId={auth.user.id}/>:null}
      {tab==='plan'?<PersonalPlan initial={data.settings} onSaved={refresh}/>:null}
    </section>
    <footer className="enarm2027-footer">
      <Icon name="alert"/><p>Plataforma educativa independiente y no oficial. Los casos son originales de práctica y no garantizan un puntaje ni una plaza. La convocatoria ENARM 2027 deberá verificarse cuando la publique la CIFRHS.</p>
      <a href="https://cifrhs.salud.gob.mx/site1/enarm/2026/" target="_blank" rel="noopener noreferrer">Referencia oficial 2026 <Icon name="external"/></a>
    </footer>
  </div>;
}
