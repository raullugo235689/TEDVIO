import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/AuthProvider';
import { fetchLabCatalog, setLabActivityState, type LabActivityRow, type LabAssignmentRow } from '../../core/interactive-lab-api';
import { PageHeader, LoadingScreen, ErrorPanel } from '../../shared/components';
import { ActionDialog } from '../../shared/ActionDialog';
import { LabEditor } from './LabEditor';
import { LabAssignDialog } from './LabAssignDialog';
import { LabResults } from './LabResults';
import './interactive-lab.css';
const states: Record<string,string> = { draft:'Borrador', published:'Publicado', archived:'Archivado', withdrawn:'Retirado' };
export function InteractiveLabPage({ create = false }: { create?: boolean }) {
  const { assignmentId } = useParams();
  if (create) return <LabEditor />;
  if (assignmentId) return <LabResults assignmentId={assignmentId} />;
  return <LabCatalog />;
}
function LabCatalog() {
  const { user } = useAuth(); const client = useQueryClient(); const navigate = useNavigate(); const [params,setParams] = useSearchParams();
  const kind = params.get('view') === 'assignments' ? 'assignments' : 'activities'; const page = Math.max(0, Number(params.get('page')) || 0);
  const [assign, setAssign] = useState<LabActivityRow|null>(null); const [publish, setPublish] = useState<LabActivityRow|null>(null);
  const catalog = useQuery({ queryKey: ['interactive-lab', user?.id, kind, page], queryFn: () => fetchLabCatalog<LabActivityRow | LabAssignmentRow>(kind, page*24) });
  const publication = useMutation({ mutationKey: ['lab-write',user?.id], retry:false, mutationFn: async () => { if (publish) await setLabActivityState(publish.id,publish.revision,'published'); }, onSuccess: () => { setPublish(null); void client.invalidateQueries({queryKey:['interactive-lab',user?.id]}); } });
  function view(value: string) { setParams(value === 'assignments' ? {view:value} : {}); }
  return <div className="lab-panel view-stack">
    <PageHeader eyebrow="BIBLIOTECA · ACTIVIDADES INTERACTIVAS" title="Interactive Lab" detail="Crea una actividad, asígnala y reúne los resultados en un mismo lugar." actions={<Link className="button primary" to="/interactive-lab/new">Crear actividad</Link>} />
    <section className="lab-intro"><div><span className="eyebrow">DEL MATERIAL AL APRENDIZAJE</span><h2>Un recorrido. Cada resultado, vinculado.</h2><p>Trabaja con tus grupos actuales. Las entregas se verifican en el servidor y permanecen separadas de las notas oficiales.</p></div><span className="lab-intro-mark" aria-hidden="true">Lab</span></section>
    <nav className="lab-tabs" aria-label="Interactive Lab"><button type="button" className={kind==='activities'?'active':''} aria-current={kind==='activities'?'page':undefined} onClick={()=>view('activities')}>Actividades</button><button type="button" className={kind==='assignments'?'active':''} aria-current={kind==='assignments'?'page':undefined} onClick={()=>view('assignments')}>Asignaciones y resultados</button></nav>
    {catalog.isLoading ? <LoadingScreen label="Consultando Interactive Lab…"/> : catalog.error ? <ErrorPanel title="No pude consultar Interactive Lab" detail={catalog.error.message} onRetry={()=>catalog.refetch()} /> : <>
      <p className="lab-meta">{catalog.data?.total ?? 0} {kind==='activities'?'actividades':'asignaciones'} · Página {page+1}</p>
      {!catalog.data?.rows.length ? <section className="lab-empty"><h2>{kind==='activities'?'Tu primera actividad empieza aquí':'Todavía no hay asignaciones'}</h2><p>{kind==='activities'?'Crea un cuestionario con opciones o cálculos. Publica una versión revisada antes de asignarla.':'Publica una actividad y selecciona sus grupos desde la biblioteca.'}</p><Link className="button secondary" to={kind==='activities'?'/interactive-lab/new':'/interactive-lab'}>{kind==='activities'?'Crear mi primera actividad':'Ver actividades'}</Link></section> : null}
      <section className="lab-card-grid" aria-label={kind==='activities'?'Actividades':'Asignaciones'}>{catalog.data?.rows.map(item => kind==='activities' ? (()=>{ const a=item as LabActivityRow; return <article className="lab-card" key={a.id}>
        <header><span className={`lab-state ${a.status}`}>{states[a.status]}</span><span className="lab-meta">Versión {a.latest_version?.version ?? '—'}</span></header><span className="lab-card-symbol" aria-hidden="true">Aa / 01</span><h2>{a.title}</h2><p>{a.subject || 'Sin materia definida'}</p><div className="lab-card-meta"><span>{a.latest_version?.question_count ?? 0} preguntas</span><span>{a.assignment_count} asignaciones</span></div><footer>{a.status==='draft' ? <button className="button primary" onClick={()=>{publication.reset();setPublish(a);}}>Publicar actividad</button> : <button className="button primary" disabled={a.status!=='published'} onClick={()=>setAssign(a)}>Asignar actividad</button>}</footer>
      </article>;})() : (()=>{const a=item as LabAssignmentRow;return <article className="lab-card" key={a.id}><header><span className={`lab-state ${a.status}`}>{states[a.status]}</span><span className="lab-meta">{a.mode==='practice'?'Práctica':'Evaluación'}</span></header><h2>{a.title}</h2><p>Cierre: {new Date(a.closes_at).toLocaleString('es-MX')}</p><div className="lab-card-meta"><span>{a.max_attempts} intento(s)</span><span>{({first:'Primer',last:'Último',best:'Mejor'}[a.selection_rule])} intento</span></div><footer><Link className="button primary" to={`/interactive-lab/assignments/${a.id}`}>Abrir resultados</Link></footer></article>;})())}</section>
      <div className="lab-actions"><button className="button secondary" disabled={page===0} onClick={()=>setParams({view:kind,page:String(page-1)})}>Anterior</button><button className="button secondary" disabled={!catalog.data?.has_more} onClick={()=>setParams({view:kind,page:String(page+1)})}>Siguiente</button></div>
    </>}
    <p className="lab-note">En esta entrega se utiliza una plantilla nativa revisada. La importación de HTML/ZIP externo aún no está habilitada.</p>
    {publish ? <ActionDialog eyebrow="INTERACTIVE LAB" title="Publicar actividad" detail={`Se habilitará «${publish.title}», versión ${publish.latest_version?.version}, para crear asignaciones. No se enviarán accesos a alumnos ni se registrarán calificaciones.`} confirmLabel="Publicar versión" onConfirm={()=>publication.mutate()} onDismiss={()=>setPublish(null)} busy={publication.isPending} error={publication.error?.message} /> : null}
    {assign ? <LabAssignDialog activity={assign} onDismiss={()=>setAssign(null)} onCreated={id=>{setAssign(null);void client.invalidateQueries({queryKey:['interactive-lab',user?.id]});navigate(`/interactive-lab/assignments/${id}`);}}/> : null}
  </div>;
}
