import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAcademicDraft } from '../../core/useAcademicDraft';
import { supabase } from '../../core/supabase';
import { addDays, agendaConflicts, dateLabel, localDate, validateAgendaDraft, type AgendaDraft } from '../../core/agenda-model';
import { formatTime, groupName, groupSubject } from '../../core/academic';
import type { AgendaOccurrence, TeacherHomeData } from '../../core/types';
import { InstitutionIdentity } from '../../shared/InstitutionIdentity';
import { groupAccent } from '../../core/group-identity';

interface EditorValue { form: AgendaDraft; revision: number | null; requestId: string; allowConflicts: boolean }
export function AgendaEditor({ data, occurrence, initialDate, onClose, onSaved }: { data: TeacherHomeData; occurrence: AgendaOccurrence | null; initialDate: string; onClose: () => void; onSaved: (message: string) => void }) {
  const queryClient = useQueryClient();
  const dialog = useRef<HTMLDialogElement>(null);
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [remoteConflict, setRemoteConflict] = useState(false);
  const [stale, setStale] = useState(false);
  const groups = data.dashboard.groups || [];
  const source = occurrence?.source;
  const [initial] = useState<EditorValue>(() => ({
    revision: source?.revision ?? null, requestId: crypto.randomUUID(), allowConflicts: false,
    form: { group_id: source?.group_id || groups[0]?.id || '', class_date: occurrence ? localDate(occurrence.start) : initialDate,
      end_date: source?.ends_on || addDays(initialDate, 120), start_time: formatTime(occurrence?.slot.start_time || '08:00'), end_time: formatTime(occurrence?.slot.end_time || '09:00'),
      room: occurrence?.slot.room || '', modality: occurrence?.slot.modality || 'Presencial', recurrence: source?.recurrence || 'weekly',
      scope: 'one', action: occurrence?.status === 'cancelled' ? 'restore' : 'save', note: occurrence?.note || '' },
  })); // Opening a new editor captures the original version once.
  const draft = useAcademicDraft<EditorValue>(['agenda-draft', data.user.id, source?.id || 'new', occurrence?.originalDate || 'new'], initial, { persistInSession: true });
  const form = draft.value.form;
  const allowConflicts = draft.value.allowConflicts;
  const group = groups.find(item => item.id === form.group_id);
  const conflicts = agendaConflicts(form, occurrence, data.schedule, data.scheduleExceptions || [], groups);
  const hasConflict = conflicts.length > 0 || remoteConflict;
  const validation = validateAgendaDraft(form, occurrence);

  useEffect(() => { dialog.current?.showModal(); }, []);
  const change = (patch: Partial<AgendaDraft>) => {
    draft.set(value => ({ ...value, requestId: crypto.randomUUID(), allowConflicts: false, form: { ...value.form, ...patch } }));
    setError(''); setRemoteConflict(false);
  };
  const close = () => {
    if (busy.current) return;
    if (draft.dirty && !window.confirm('¿Descartar los cambios sin guardar de esta clase?')) return;
    draft.clear(); onClose();
  };
  const save = async () => {
    if (busy.current) return;
    if (validation) { setError(validation); return; }
    if (!navigator.onLine) { setError('Sin conexión. Tu borrador se conserva; vuelve a guardar cuando tengas internet.'); return; }
    if (hasConflict && !allowConflicts && form.action === 'save') { setError('Revisa el empalme o marca la opción para conservar ambos horarios.'); return; }
    draft.set({ ...draft.value });
    busy.current = true; setPending(true); setError('');
    try {
      const { data: result, error: failure } = await supabase.rpc('v2_save_schedule', { p_request_id: draft.value.requestId, p_payload: {
        ...form, slot_id: source?.id || null, original_date: occurrence?.originalDate || null, revision: draft.value.revision, allow_conflicts: allowConflicts,
      } });
      if (failure) {
        if (failure.code === '40001') setStale(true);
        if (failure.code === 'P0001' && failure.message.includes('empalman')) setRemoteConflict(true);
        throw new Error(failure.message);
      }
      if (!result?.saved) throw new Error('El servidor no confirmó el guardado. Tu borrador se conserva.');
      draft.clear();
      await queryClient.invalidateQueries({ queryKey: ['teacher-home', data.user.id] });
      onSaved(form.action === 'restore' ? 'Clase restaurada a su horario original.' : form.action === 'suspend' ? (form.scope === 'future' ? 'Horario finalizado desde la fecha seleccionada.' : 'Clase suspendida. Las siguientes conservan su horario.') : occurrence ? 'Cambios guardados en tu agenda.' : 'Clase añadida a tu agenda.');
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'No pude guardar los cambios. Intenta de nuevo.'); }
    finally { busy.current = false; setPending(false); }
  };

  return <dialog ref={dialog} className="agenda-editor" aria-labelledby="agenda-editor-title" onCancel={event => { event.preventDefault(); close(); }}>
    <form onSubmit={event => { event.preventDefault(); void save(); }}>
      <header className="agenda-editor-head" data-group-color={groupAccent(form.group_id)}><div><span className="eyebrow">TU AGENDA</span><h2 id="agenda-editor-title">{occurrence ? 'Editar clase' : 'Programar clase'}</h2><p>{occurrence ? `Clase original: ${dateLabel(occurrence.originalDate)}` : 'Organiza una fecha o el horario del semestre.'}</p></div><button className="button ghost compact" type="button" aria-label="Cerrar editor" disabled={pending} onClick={close}>✕</button></header>
      <div className="agenda-editor-body">
        <fieldset disabled={pending || stale} className="agenda-editor-fields">
          <label>Grupo<select value={form.group_id} disabled={Boolean(occurrence)} onChange={e => change({ group_id: e.target.value })}><option value="">Selecciona un grupo</option>{groups.map(item => <option key={item.id} value={item.id}>{groupSubject(item)} · {groupName(item)}</option>)}</select></label>
          {group ? <InstitutionIdentity name={group.university} logoUrl={group.institution_logo_url} /> : null}
          {occurrence ? <div className="agenda-editor-row"><label>¿Qué quieres hacer?<select value={form.action} onChange={e => change({ action: e.target.value as AgendaDraft['action'], scope: 'one' })}><option value="save">Editar o reprogramar</option><option value="suspend">Suspender clase</option>{occurrence.status !== 'scheduled' ? <option value="restore">Restaurar horario original</option> : null}</select></label><label>Aplicar a<select value={form.scope} disabled={form.action === 'restore' || source?.recurrence === 'once'} onChange={e => change({ scope: e.target.value as AgendaDraft['scope'] })}><option value="one">Solo esta clase</option><option value="future">Esta y las siguientes</option></select></label></div> : null}
          {occurrence && form.scope === 'future' ? <p className="agenda-scope-note">Desde el {dateLabel(occurrence.originalDate)}. Las clases anteriores se conservan. Se reemplazan los cambios y suspensiones posteriores de este horario.</p> : null}
          {form.action === 'save' ? <>
            <div className="agenda-editor-row"><label>{occurrence && form.scope === 'one' ? 'Nueva fecha' : 'Primera clase'}<input type="date" required value={form.class_date} onChange={e => change({ class_date: e.target.value })} /></label>{!occurrence || form.scope === 'future' ? <label>Repetición<select value={form.recurrence} onChange={e => change({ recurrence: e.target.value as AgendaDraft['recurrence'] })}><option value="weekly">Cada semana</option><option value="once">Una sola vez</option></select></label> : <div className="agenda-editor-hint">{occurrence.status === 'moved' ? 'Se cambia la reprogramación de esta clase.' : 'El resto del horario conserva sus días y horas.'}</div>}</div>
            {form.recurrence === 'weekly' && (!occurrence || form.scope === 'future') ? <label>Repetir hasta<input type="date" required min={form.class_date} max={addDays(form.class_date || initialDate, 730)} value={form.end_date} onChange={e => change({ end_date: e.target.value })} /><small>Se repetirá el mismo día de la semana, hasta esta fecha.</small></label> : null}
            <div className="agenda-editor-row"><label>Hora de entrada<input type="time" required value={form.start_time} onChange={e => change({ start_time: e.target.value })} /></label><label>Hora de salida<input type="time" required value={form.end_time} onChange={e => change({ end_time: e.target.value })} /></label></div>
            <div className="agenda-editor-row"><label>Aula o ubicación<input maxLength={120} value={form.room} placeholder="Ej. Anfiteatro · Edificio A" onChange={e => change({ room: e.target.value })} /></label><label>Modalidad<select value={form.modality} onChange={e => change({ modality: e.target.value })}>{Array.from(new Set(['Presencial','En línea','Bimodal',form.modality].filter(Boolean))).map(value => <option key={value}>{value}</option>)}</select></label></div>
          </> : <p className="agenda-scope-note">{form.action === 'restore' ? 'Se recuperarán el día, el aula y las horas del horario original.' : form.scope === 'one' ? 'Esta fecha aparecerá como suspendida y dejará de mostrarse como tu próxima clase.' : 'No se programarán clases de este horario a partir de la fecha seleccionada.'} Los registros de asistencia se conservan.</p>}
          {form.action !== 'restore' && occurrence && form.scope === 'one' ? <label>Nota opcional<textarea maxLength={300} rows={2} placeholder="Ej. Suspensión por lluvia" value={form.note} onChange={e => change({ note: e.target.value })} /></label> : null}
          {hasConflict ? <section className="agenda-conflict" aria-label="Empalmes detectados"><b>Hay horarios que se empalman</b>{conflicts.length ? <ul>{conflicts.map(item => <li key={`${item.slot.id}:${item.originalDate}`}>{dateLabel(localDate(item.start))} · {formatTime(item.slot.start_time)}–{formatTime(item.slot.end_time)} · {groupSubject(item.group)} · {groupName(item.group)}</li>)}</ul> : <p>Otro horario coincide con esta clase. Actualiza la agenda para consultar sus detalles.</p>}<label className="agenda-checkbox"><input type="checkbox" checked={allowConflicts} onChange={e => { const checked = e.target.checked; draft.set(value => ({ ...value, requestId: crypto.randomUUID(), allowConflicts: checked })); }} />He revisado el empalme y quiero conservar ambos horarios.</label></section> : null}
        </fieldset>
        {error ? <div className="agenda-editor-error" role="alert">{error}{stale ? <button type="button" className="button ghost compact" onClick={async () => { draft.clear(); await queryClient.invalidateQueries({ queryKey: ['teacher-home', data.user.id] }); onClose(); }}>Descartar borrador y actualizar</button> : null}</div> : null}
        {draft.dirty ? <small className="agenda-draft-note">Borrador conservado en este dispositivo hasta guardar o descartarlo.</small> : null}
      </div>
      <footer className="agenda-editor-footer"><button className="button ghost" type="button" disabled={pending} onClick={close}>Cancelar</button><button className="button primary" type="submit" disabled={pending || stale || (!groups.length)}>{pending ? 'Guardando…' : form.action === 'suspend' ? 'Confirmar suspensión' : form.action === 'restore' ? 'Restaurar clase' : 'Guardar clase'}</button></footer>
    </form>
  </dialog>;
}
