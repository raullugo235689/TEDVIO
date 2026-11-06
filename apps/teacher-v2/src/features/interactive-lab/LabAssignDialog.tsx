import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useAcademicDraft } from '../../core/useAcademicDraft';
import { useAuth } from '../auth/AuthProvider';
import { supabase } from '../../core/supabase';
import { createLabOnce, type LabActivityRow } from '../../core/interactive-lab-api';
import { localLabDate } from '../../core/interactive-lab-model';
import { ActionDialog } from '../../shared/ActionDialog';
interface Group { id: string; name: string; subject: string | null; university: string | null }
export function LabAssignDialog({ activity, onDismiss, onCreated }: { activity: LabActivityRow; onDismiss: () => void; onCreated: (id: string) => void }) {
  const { user } = useAuth();
  const [initial] = useState(() => ({ groupIds: [] as string[], opens: localLabDate(new Date()), closes: localLabDate(new Date(Date.now()+7*86400000)), mode:'practice', selection:'best', attempts:1, duration:'', requestId:crypto.randomUUID(), locked:false }));
  const draft = useAcademicDraft(['lab-draft',user?.id,`assignment-${activity.id}`],initial,{persistInSession:true});
  const {groupIds,opens,closes,mode,selection,attempts,duration,requestId,locked}=draft.value;
  const setGroupIds=(update: (v:string[])=>string[])=>draft.set(v=>({...v,groupIds:update(v.groupIds)}));
  const setOpens=(opens:string)=>draft.set(v=>({...v,opens}));const setCloses=(closes:string)=>draft.set(v=>({...v,closes}));
  const setMode=(mode:string)=>draft.set(v=>({...v,mode}));const setSelection=(selection:string)=>draft.set(v=>({...v,selection}));
  const setAttempts=(attempts:number)=>draft.set(v=>({...v,attempts}));const setDuration=(duration:string)=>draft.set(v=>({...v,duration}));
  const setLocked=(locked:boolean)=>draft.set(v=>({...v,locked}));const [error,setError]=useState('');
  const groups = useQuery({ queryKey: ['interactive-lab', user?.id, 'groups'], queryFn: async () => {
    if (!user) throw new Error('Inicia sesión.');
    const { data, error } = await supabase.from('v2_groups').select('id,name,subject,university').eq('teacher_id', user.id).eq('is_demo', false).order('name').limit(500);
    if (error) throw error; return data as Group[];
  }});
  const create = useMutation({ mutationKey: ['lab-write', user?.id], retry: false, mutationFn: async () => {
    if (!groupIds.length || !activity.latest_version) throw new Error('Selecciona al menos un grupo.');
    const start = new Date(opens), end = new Date(closes);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) throw new Error('Revisa las fechas de apertura y cierre.');
    const seconds = duration.trim() ? Number(duration)*60 : null;
    if (seconds !== null && (!Number.isInteger(seconds) || seconds < 30 || seconds > 14400)) throw new Error('La duración debe ser de 0.5 a 240 minutos.');
    if (!Number.isInteger(attempts) || attempts < 1 || attempts > 20) throw new Error('Permite entre 1 y 20 intentos.');
    setLocked(true);
    return createLabOnce<{ assignment_id: string }>(requestId, 'create_assignment', { version_id: activity.latest_version.id, group_ids: groupIds,
      title: activity.title, opens_at: start.toISOString(), closes_at: end.toISOString(), max_attempts: attempts, mode, selection_rule: selection, duration_seconds: seconds });
  }, onSuccess: data => {draft.clear();onCreated(data.assignment_id);}, onError: e => {setError(e.message);if(/^(22|23|42501)/.test((e as Error & {code?:string}).code||''))setLocked(false);} });
  return <ActionDialog eyebrow="INTERACTIVE LAB · ASIGNACIÓN" title="Asignar a tus grupos" detail={`${activity.title} · versión ${activity.latest_version?.version}. La asignación se crea en borrador; revisa los destinatarios antes de publicarla.`} confirmLabel={locked ? 'Reintentar creación' : 'Crear asignación'} onConfirm={() => { setError(''); create.mutate(); }} onDismiss={onDismiss} busy={create.isPending} confirmDisabled={!groupIds.length || groups.isLoading} error={error} className="lab-dialog">
    {groups.error ? <p role="alert">{groups.error.message}</p> : null}
    <fieldset disabled={create.isPending || locked} className="lab-fields"><legend>Grupos y condiciones</legend>
      <div className="lab-span lab-group-options">{groups.data?.map(g => <label key={g.id}><input type="checkbox" checked={groupIds.includes(g.id)} onChange={e => setGroupIds(v => e.target.checked ? [...v,g.id] : v.filter(id=>id!==g.id))} /><span><b>{g.name}</b><small>{[g.subject,g.university].filter(Boolean).join(' · ')}</small></span></label>)}{groups.data?.length === 0 ? <p>No hay grupos disponibles. Agrega un grupo con alumnos activos antes de asignar.</p> : null}</div>
      <label>Apertura (hora local)<input type="datetime-local" value={opens} onChange={e => setOpens(e.target.value)} /></label><label>Cierre (hora local)<input type="datetime-local" value={closes} onChange={e => setCloses(e.target.value)} /></label>
      <label>Modalidad<select value={mode} onChange={e => setMode(e.target.value)}><option value="practice">Práctica formativa</option><option value="evaluation">Evaluación, sin nota oficial automática</option></select></label>
      <label>Intentos permitidos<input type="number" min={1} max={20} value={attempts} onChange={e => setAttempts(Number(e.target.value))} /></label>
      <label>Resultado a considerar<select value={selection} onChange={e => setSelection(e.target.value)}><option value="best">Mejor intento</option><option value="first">Primer intento</option><option value="last">Último intento</option></select></label>
      <label>Duración en minutos (opcional)<input type="number" min={0.5} max={240} step={0.5} value={duration} onChange={e => setDuration(e.target.value)} placeholder="Hasta el cierre" /></label>
    </fieldset>
    <p className="lab-note">El servidor valida la pertenencia de cada grupo e incorpora únicamente a sus alumnos activos. No crea alumnos nuevos.</p>
  </ActionDialog>;
}
