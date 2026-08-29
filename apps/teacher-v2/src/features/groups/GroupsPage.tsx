import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { attendanceLabel, formatActivity, formatGrade, formatPercent, groupName, groupSubject } from '../../core/academic';
import {
  createProgram,
  createUniversity,
  fetchGroupWorkspace,
  groupWorkspaceKey,
  saveGroup,
  type GroupDraft,
} from '../../core/groups';
import { useTeacherHome } from '../../core/useTeacherHome';
import type { DashboardGroup, GroupRecord } from '../../core/types';
import { EmptyState, ErrorPanel, LoadingScreen, PageHeader, SectionCard, StatusPill } from '../../shared/components';
import { Icon } from '../../shared/icons';
import { useAuth } from '../auth/AuthProvider';

function tone(group?: DashboardGroup): string {
  if (Number(group?.risk_count || 0) > 0) return 'red';
  if (Number(group?.watch_count || 0) > 0) return 'amber';
  if (group?.today_attendance_status === 'closed') return 'green';
  return 'blue';
}

function emptyDraft(programId = ''): GroupDraft {
  return { programId, name: '', subject: '', term: '' };
}

export function GroupsPage() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const home = useTeacherHome();
  const [query, setQuery] = useState('');
  const [editor, setEditor] = useState<GroupDraft | null>(null);
  const [structureOpen, setStructureOpen] = useState(false);
  const [universityName, setUniversityName] = useState('');
  const [programName, setProgramName] = useState('');
  const [programUniversityId, setProgramUniversityId] = useState('');
  const [notice, setNotice] = useState('');

  const workspace = useQuery({
    queryKey: groupWorkspaceKey(auth.user?.id),
    queryFn: () => {
      if (!auth.user) throw new Error('No hay una sesión docente activa.');
      return fetchGroupWorkspace(auth.user);
    },
    enabled: Boolean(auth.user),
  });

  async function invalidate() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: groupWorkspaceKey(auth.user?.id) }),
      queryClient.invalidateQueries({ queryKey: ['teacher-home', auth.user?.id] }),
    ]);
  }

  const universityMutation = useMutation({
    mutationFn: () => {
      if (!auth.user) throw new Error('Tu sesión expiró.');
      return createUniversity(auth.user, universityName);
    },
    onSuccess: async (university) => {
      setUniversityName('');
      setProgramUniversityId(university.id);
      setNotice('Institución disponible para crear programas.');
      await invalidate();
    },
  });

  const programMutation = useMutation({
    mutationFn: () => {
      if (!auth.user) throw new Error('Tu sesión expiró.');
      return createProgram(auth.user, programUniversityId, programName);
    },
    onSuccess: async (program) => {
      setProgramName('');
      setNotice('Programa académico creado.');
      setEditor((current) => current ? { ...current, programId: program.id } : emptyDraft(program.id));
      await invalidate();
    },
  });

  const groupMutation = useMutation({
    mutationFn: (draft: GroupDraft) => {
      if (!auth.user || !workspace.data) throw new Error('El catálogo académico todavía no está listo.');
      return saveGroup(auth.user, workspace.data, draft);
    },
    onSuccess: async (group) => {
      setEditor(null);
      setNotice(`Grupo ${group.group_name || group.name} guardado.`);
      await invalidate();
    },
  });

  const dashboardById = useMemo(() => new Map((home.data?.dashboard.groups || []).map((group) => [group.id, group])), [home.data?.dashboard.groups]);
  const programLabel = useMemo(() => {
    const universities = new Map((workspace.data?.universities || []).map((item) => [item.id, item.name]));
    return new Map((workspace.data?.programs || []).map((program) => [program.id, `${universities.get(program.university_id) || 'Institución'} · ${program.name}`]));
  }, [workspace.data?.programs, workspace.data?.universities]);

  const filtered = useMemo(() => {
    const groups = workspace.data?.groups || [];
    const needle = query.trim().toLocaleLowerCase('es-MX');
    if (!needle) return groups;
    return groups.filter((group) => [group.group_name || group.name, group.subject, group.university_name, group.program_name, group.term].filter(Boolean).join(' ').toLocaleLowerCase('es-MX').includes(needle));
  }, [workspace.data?.groups, query]);

  function editGroup(group: GroupRecord) {
    setEditor({
      id: group.id,
      programId: group.program_id,
      name: group.group_name || group.name,
      subject: group.subject || '',
      term: group.term || group.school_cycle || '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  if (workspace.isLoading || home.isLoading) return <LoadingScreen label="Cargando grupos…" />;
  if (workspace.isError) return <ErrorPanel title="No pude cargar tus grupos" detail={workspace.error.message} onRetry={() => workspace.refetch()} />;
  if (home.isError) return <ErrorPanel title="No pude cargar el resumen académico" detail={home.error.message} onRetry={() => home.refetch()} />;
  if (!workspace.data) return null;

  const programs = workspace.data.programs;
  const universities = workspace.data.universities;

  return (
    <div className="view-stack">
      <PageHeader
        eyebrow="GRUPOS"
        title="Centro de grupos"
        detail="Crea la estructura académica, administra tus grupos y entra al padrón o a la asistencia sin abandonar TEDVIO 2.0."
        actions={<div className="page-actions"><button className="button ghost" type="button" onClick={() => setStructureOpen((value) => !value)}>Estructura académica</button><button className="button primary" type="button" onClick={() => setEditor(emptyDraft(programs[0]?.id || ''))}>＋ Nuevo grupo</button></div>}
      />

      {notice ? <div className="success-strip"><Icon name="check" /><span>{notice}</span><button type="button" onClick={() => setNotice('')}>×</button></div> : null}
      {universityMutation.isError || programMutation.isError || groupMutation.isError ? <ErrorPanel title="No se pudo completar la operación" detail={(universityMutation.error || programMutation.error || groupMutation.error)?.message || 'Intenta nuevamente.'} /> : null}

      {structureOpen ? (
        <SectionCard className="structure-panel">
          <div className="section-heading"><div><span className="eyebrow">ESTRUCTURA ACADÉMICA</span><h2>Institución → programa → grupo</h2><p>Los grupos se vinculan a una estructura única para evitar duplicados.</p></div><StatusPill tone="blue">{universities.length} instituciones · {programs.length} programas</StatusPill></div>
          <div className="structure-grid">
            <form onSubmit={(event) => { event.preventDefault(); universityMutation.mutate(); }}>
              <span className="eyebrow">NUEVA INSTITUCIÓN</span><label>Nombre<input value={universityName} onChange={(event) => setUniversityName(event.target.value)} placeholder="Universidad Autónoma de Sinaloa" required /></label><button className="button secondary" type="submit" disabled={universityMutation.isPending}>{universityMutation.isPending ? 'Guardando…' : 'Agregar institución'}</button>
            </form>
            <form onSubmit={(event) => { event.preventDefault(); programMutation.mutate(); }}>
              <span className="eyebrow">NUEVO PROGRAMA</span><label>Institución<select value={programUniversityId} onChange={(event) => setProgramUniversityId(event.target.value)} required><option value="">Selecciona</option>{universities.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><label>Programa<input value={programName} onChange={(event) => setProgramName(event.target.value)} placeholder="Licenciatura en Medicina General" required /></label><button className="button secondary" type="submit" disabled={programMutation.isPending || !universities.length}>{programMutation.isPending ? 'Guardando…' : 'Agregar programa'}</button>
            </form>
            <div className="structure-catalog"><span className="eyebrow">CATÁLOGO</span>{programs.length ? programs.map((program) => <article key={program.id}><b>{program.name}</b><small>{universities.find((item) => item.id === program.university_id)?.name || 'Institución'}</small></article>) : <p>Aún no hay programas.</p>}</div>
          </div>
        </SectionCard>
      ) : null}

      {editor ? (
        <form className="editor-panel group-editor" onSubmit={(event) => { event.preventDefault(); groupMutation.mutate(editor); }}>
          <header><div><span className="eyebrow">{editor.id ? 'EDITAR GRUPO' : 'NUEVO GRUPO'}</span><h2>{editor.id ? 'Actualizar datos académicos' : 'Crear grupo'}</h2><p>El padrón y las asistencias permanecerán vinculados al mismo identificador.</p></div><button className="icon-button" type="button" onClick={() => setEditor(null)} aria-label="Cerrar">×</button></header>
          {programs.length ? (
            <div className="form-grid two">
              <label>Programa académico<select value={editor.programId} onChange={(event) => setEditor({ ...editor, programId: event.target.value })} required><option value="">Selecciona</option>{programs.map((program) => <option key={program.id} value={program.id}>{programLabel.get(program.id)}</option>)}</select></label>
              <label>Asignatura<input value={editor.subject} onChange={(event) => setEditor({ ...editor, subject: event.target.value })} placeholder="Anatomía Humana" required /></label>
              <label>Grado y grupo<input value={editor.name} onChange={(event) => setEditor({ ...editor, name: event.target.value })} placeholder="1-02" required /></label>
              <label>Periodo o ciclo<input value={editor.term} onChange={(event) => setEditor({ ...editor, term: event.target.value })} placeholder="2026-2027" /></label>
            </div>
          ) : <div className="warning-strip"><Icon name="alert" /><span>Crea primero una institución y un programa académico.</span></div>}
          <footer><button className="button ghost" type="button" onClick={() => setEditor(null)}>Cancelar</button><button className="button primary" type="submit" disabled={!programs.length || groupMutation.isPending}>{groupMutation.isPending ? 'Guardando…' : editor.id ? 'Guardar cambios' : 'Crear grupo'}</button></footer>
        </form>
      ) : null}

      <div className="toolbar-v2">
        <label className="search-field"><Icon name="search" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar grupo, materia o institución" aria-label="Buscar grupos" /></label>
        <StatusPill tone="blue">{filtered.length} de {workspace.data.groups.length}</StatusPill>
      </div>

      {filtered.length ? (
        <section className="groups-catalog">
          {filtered.map((group) => {
            const dashboard = dashboardById.get(group.id);
            return (
              <article className="group-catalog-card" key={group.id}>
                <header>
                  <div><span className="eyebrow">{group.subject || 'Grupo'}</span><h2>{group.group_name || group.name}</h2><p>{group.university_name || group.university || 'TEDVIO'}{group.program_name || group.program ? ` · ${group.program_name || group.program}` : ''}{group.term ? ` · ${group.term}` : ''}</p></div>
                  <StatusPill tone={tone(dashboard)}>{attendanceLabel(dashboard)}</StatusPill>
                </header>
                <div className="group-catalog-metrics">
                  <span><small>Alumnos</small><b>{Number(dashboard?.students || 0).toLocaleString('es-MX')}</b></span>
                  <span><small>Asistencia</small><b>{formatPercent(dashboard?.attendance_rate)}</b></span>
                  <span><small>Promedio</small><b>{formatGrade(dashboard?.grade_avg)}</b></span>
                  <span><small>Alertas</small><b>{Number(dashboard?.risk_count || 0) + Number(dashboard?.watch_count || 0)}</b></span>
                </div>
                <div className="group-catalog-context">
                  <span><Icon name="clock" />{formatActivity(dashboard?.last_activity)}</span>
                  <span>{Number(dashboard?.attendance_sessions_count || 0)} listas históricas</span>
                </div>
                <footer>
                  <button className="button ghost compact" type="button" onClick={() => editGroup(group)}>Editar</button>
                  <Link className="button secondary" to={`/groups/${group.id}`}>Abrir grupo</Link>
                  <Link className="button primary" to={`/attendance/${group.id}`}>Asistencia</Link>
                </footer>
              </article>
            );
          })}
        </section>
      ) : (
        <EmptyState icon="groups" title={workspace.data.groups.length ? 'No encontramos coincidencias' : 'Aún no tienes grupos'} detail={workspace.data.groups.length ? 'Prueba con otra materia, grupo o institución.' : 'Crea la estructura académica y después registra el primer grupo.'} action={<button className="button primary" type="button" onClick={() => setEditor(emptyDraft(programs[0]?.id || ''))}>Crear grupo</button>} />
      )}
    </div>
  );
}
