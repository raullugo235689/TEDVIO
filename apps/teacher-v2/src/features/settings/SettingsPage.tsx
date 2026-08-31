import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  acceptLegalDocument,
  cancelAccountDeletion,
  changePassword,
  downloadAccountJson,
  exportAccountData,
  fetchLegalDocument,
  fetchSettings,
  institutionLogoUrl,
  requestAccountDeletion,
  saveGroupAlertSettings,
  saveInstitutionBranding,
  saveProfileSettings,
  settingsKey,
  signOutOtherSessions,
  type InstitutionBranding,
  type InstitutionBrandingDraft,
  type LegalDocumentContent,
  type ProfileSettingsDraft,
  type SettingsData,
} from '../../core/settings';
import { EmptyState, ErrorPanel, LoadingScreen, MetricCard, PageHeader, SectionCard, StatusPill } from '../../shared/components';
import { Icon } from '../../shared/icons';
import { useAuth } from '../auth/AuthProvider';

type SettingsTab = 'profile' | 'academic' | 'institution' | 'privacy' | 'security' | 'data';

function groupLabel(group: SettingsData['groups'][number]): string {
  return [group.subject || group.program || 'Asignatura', group.group_name || group.name || 'Grupo'].filter(Boolean).join(' · ');
}

function dateText(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: value.length === 10 ? undefined : 'short' });
}

function defaultProfile(data: SettingsData, email: string, metadataName: string): ProfileSettingsDraft {
  return {
    displayName: data.profile?.display_name || data.account.profile?.full_name || metadataName || email.split('@')[0] || '',
    institution: data.profile?.institution || '',
    educationalProgram: data.profile?.educational_program || '',
    defaultGroup: data.profile?.default_group || '',
  };
}

function InstitutionEditor({ institution, busy, onSave }: { institution: InstitutionBranding; busy: boolean; onSave: (draft: InstitutionBrandingDraft) => void }) {
  const [draft, setDraft] = useState<InstitutionBrandingDraft>({
    institutionId: institution.id,
    displayName: institution.report_display_name || institution.name,
    reportTitle: institution.report_title || 'REGISTRO DE ASISTENCIA Y EVALUACIÓN',
    approverName: institution.report_approver_name || '',
    approverTitle: institution.report_approver_title || '',
    approvalLabel: institution.report_approval_label || 'Vo. Bo.',
    documentCode: institution.report_document_code || '',
    logo: null,
  });
  const logo = institutionLogoUrl(institution);
  return (
    <SectionCard className="institution-settings-card">
      <div className="section-heading"><div><span className="eyebrow">INSTITUCIÓN ADMINISTRABLE</span><h2>{institution.name}</h2><p>Estos datos aparecen en la vista impresa de los reportes.</p></div><StatusPill tone="blue">{String(institution.plan || 'institutional').toUpperCase()}</StatusPill></div>
      <div className="institution-branding-layout">
        <div className="institution-logo-editor">
          <div className="institution-logo-preview">{logo ? <img src={logo} alt="Logotipo institucional" /> : <span>LOGO</span>}</div>
          <label className="button ghost compact">Cambiar logotipo<input type="file" hidden accept="image/png,image/jpeg" onChange={(event) => setDraft({ ...draft, logo: event.target.files?.[0] || null })} /></label>
          <small>{draft.logo ? draft.logo.name : 'PNG o JPG · máximo 2 MB'}</small>
        </div>
        <div className="form-grid two institution-branding-form">
          <label className="wide">Nombre mostrado<input value={draft.displayName} onChange={(event) => setDraft({ ...draft, displayName: event.target.value })} /></label>
          <label className="wide">Título del reporte<input value={draft.reportTitle} onChange={(event) => setDraft({ ...draft, reportTitle: event.target.value })} /></label>
          <label>Responsable de Vo. Bo.<input value={draft.approverName} onChange={(event) => setDraft({ ...draft, approverName: event.target.value })} /></label>
          <label>Cargo<input value={draft.approverTitle} onChange={(event) => setDraft({ ...draft, approverTitle: event.target.value })} /></label>
          <label>Etiqueta de aprobación<input value={draft.approvalLabel} onChange={(event) => setDraft({ ...draft, approvalLabel: event.target.value })} /></label>
          <label>Código documental<input value={draft.documentCode} onChange={(event) => setDraft({ ...draft, documentCode: event.target.value })} /></label>
        </div>
      </div>
      <footer className="phase5-editor-footer"><span>La vinculación del grupo no cambia al editar la identidad documental.</span><button className="button primary" type="button" disabled={busy || !draft.displayName.trim()} onClick={() => onSave(draft)}>{busy ? 'Guardando…' : 'Guardar institución'}</button></footer>
    </SectionCard>
  );
}

export function SettingsPage() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<SettingsTab>('profile');
  const [profileDraft, setProfileDraft] = useState<ProfileSettingsDraft>({ displayName: '', institution: '', educationalProgram: '', defaultGroup: '' });
  const [thresholds, setThresholds] = useState<Record<string, { minAttendance: number; minGrade: number }>>({});
  const [legalDocument, setLegalDocument] = useState<LegalDocumentContent | null>(null);
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [deletePhrase, setDeletePhrase] = useState('');
  const [deleteReason, setDeleteReason] = useState('');
  const [notice, setNotice] = useState('');

  const settingsQuery = useQuery({
    queryKey: settingsKey(auth.user?.id),
    queryFn: () => {
      if (!auth.user) throw new Error('Tu sesión expiró.');
      return fetchSettings(auth.user);
    },
    enabled: Boolean(auth.user),
  });

  const data = settingsQuery.data;
  useEffect(() => {
    if (!data || !auth.user) return;
    setProfileDraft(defaultProfile(data, auth.user.email || '', String(auth.user.user_metadata?.full_name || auth.user.user_metadata?.display_name || '')));
    setThresholds(Object.fromEntries(data.groups.map((group) => {
      const current = data.groupSettings.find((setting) => setting.group_id === group.id);
      return [group.id, { minAttendance: Number(current?.min_attendance ?? 80), minGrade: Number(current?.min_grade ?? 6) }];
    })));
  }, [auth.user, data]);

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: settingsKey(auth.user?.id) });
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['teacher-home', auth.user?.id] }),
      queryClient.invalidateQueries({ queryKey: ['teacher-gradebook-workspace', auth.user?.id] }),
      queryClient.invalidateQueries({ queryKey: ['teacher-student360-directory', auth.user?.id] }),
    ]);
  }

  const profileMutation = useMutation({
    mutationFn: () => {
      if (!auth.user) throw new Error('Tu sesión expiró.');
      return saveProfileSettings(auth.user, profileDraft);
    },
    onSuccess: async () => { setNotice('Perfil docente actualizado.'); await refresh(); },
  });

  const thresholdMutation = useMutation({
    mutationFn: ({ groupId, minAttendance, minGrade }: { groupId: string; minAttendance: number; minGrade: number }) => {
      if (!auth.user) throw new Error('Tu sesión expiró.');
      return saveGroupAlertSettings(auth.user, groupId, minAttendance, minGrade);
    },
    onSuccess: async () => { setNotice('Umbrales académicos guardados.'); await refresh(); },
  });

  const brandingMutation = useMutation({
    mutationFn: ({ current, draft }: { current: InstitutionBranding; draft: InstitutionBrandingDraft }) => {
      if (!auth.user) throw new Error('Tu sesión expiró.');
      return saveInstitutionBranding(auth.user, current, draft);
    },
    onSuccess: async () => { setNotice('Identidad institucional actualizada.'); await refresh(); },
  });

  const legalMutation = useMutation({
    mutationFn: ({ key, version }: { key: string; version: string }) => fetchLegalDocument(key, version),
    onSuccess: setLegalDocument,
  });

  const acceptMutation = useMutation({
    mutationFn: ({ key, version }: { key: string; version: string }) => {
      if (!auth.user) throw new Error('Tu sesión expiró.');
      return acceptLegalDocument(auth.user, key, version);
    },
    onSuccess: async () => { setNotice('Aceptación registrada.'); await refresh(); },
  });

  const passwordMutation = useMutation({
    mutationFn: async () => {
      if (password !== passwordConfirm) throw new Error('Las contraseñas no coinciden.');
      return changePassword(password);
    },
    onSuccess: () => { setPassword(''); setPasswordConfirm(''); setNotice('Contraseña actualizada.'); },
  });

  const sessionsMutation = useMutation({
    mutationFn: signOutOtherSessions,
    onSuccess: () => setNotice('Las otras sesiones fueron cerradas.'),
  });

  const exportMutation = useMutation({
    mutationFn: exportAccountData,
    onSuccess: (exported) => { downloadAccountJson(exported); setNotice('Exportación de cuenta preparada.'); },
  });

  const deletionMutation = useMutation({
    mutationFn: async (cancel: boolean) => {
      if (!auth.user) throw new Error('Tu sesión expiró.');
      if (cancel) return cancelAccountDeletion(auth.user);
      if (deletePhrase.trim().toUpperCase() !== 'ELIMINAR') throw new Error('Escribe ELIMINAR para confirmar la solicitud.');
      return requestAccountDeletion(auth.user, deleteReason);
    },
    onSuccess: async (_, cancel) => {
      setDeletePhrase(''); setDeleteReason('');
      setNotice(cancel ? 'Solicitud de eliminación cancelada.' : 'Solicitud de eliminación registrada.');
      await refresh();
    },
  });

  const mutationError = profileMutation.error || thresholdMutation.error || brandingMutation.error || legalMutation.error || acceptMutation.error || passwordMutation.error || sessionsMutation.error || exportMutation.error || deletionMutation.error;

  if (settingsQuery.isLoading) return <LoadingScreen label="Abriendo Configuración…" />;
  if (settingsQuery.isError) return <ErrorPanel title="No pude abrir la configuración" detail={settingsQuery.error.message} onRetry={() => settingsQuery.refetch()} />;
  if (!data || !auth.user) return null;

  const pendingDocs = (data.account.documents || []).filter((document) => document.required && !document.accepted);
  const accountProfile = data.account.profile || {};
  const pendingDeletion = data.account.pending_deletion;
  const tabs: Array<{ id: SettingsTab; label: string }> = [
    { id: 'profile', label: 'Perfil' },
    { id: 'academic', label: 'Académico' },
    { id: 'institution', label: 'Institución' },
    { id: 'privacy', label: `Privacidad${pendingDocs.length ? ` (${pendingDocs.length})` : ''}` },
    { id: 'security', label: 'Seguridad' },
    { id: 'data', label: 'Mis datos' },
  ];

  return (
    <div className="view-stack phase5-page settings-page">
      <PageHeader
        eyebrow="FASE 5 · CONFIGURACIÓN"
        title="Cuenta, privacidad y reglas académicas"
        detail="Administra tu perfil, umbrales, identidad institucional y controles de cuenta sin salir del frontend unificado."
      />

      {notice ? <div className="success-strip"><Icon name="check" /><span>{notice}</span><button type="button" onClick={() => setNotice('')}>×</button></div> : null}
      {mutationError ? <ErrorPanel title="No se pudo completar la operación" detail={mutationError.message} /> : null}

      <section className="metric-grid four">
        <MetricCard label="Cuenta" value={pendingDocs.length ? 'Revisión' : 'Al día'} detail={auth.user.email || ''} icon="shield" tone={pendingDocs.length ? 'amber' : 'green'} />
        <MetricCard label="Plan" value={String(accountProfile.plan || 'free').toUpperCase()} detail={accountProfile.role || 'teacher'} icon="layout" tone="blue" />
        <MetricCard label="Grupos" value={String(data.groups.length)} detail="Con umbrales configurables" icon="groups" tone="violet" />
        <MetricCard label="Instituciones" value={String(data.institutions.length)} detail="Administrables por tu cuenta" icon="reports" tone="neutral" />
      </section>

      <div className="module-tabs settings-tabs" role="tablist" aria-label="Secciones de configuración">
        {tabs.map((item) => <button key={item.id} type="button" className={tab === item.id ? 'active' : ''} onClick={() => setTab(item.id)}>{item.label}</button>)}
      </div>

      {tab === 'profile' ? (
        <SectionCard>
          <div className="section-heading"><div><span className="eyebrow">PERFIL DOCENTE</span><h2>Identidad y contexto predeterminado</h2><p>El nombre mostrado se sincroniza con tu sesión. El grupo predeterminado debe pertenecer a tu cuenta.</p></div><StatusPill tone="blue">{accountProfile.status || 'active'}</StatusPill></div>
          <div className="form-grid two settings-form-grid">
            <label>Nombre mostrado<input value={profileDraft.displayName} onChange={(event) => setProfileDraft({ ...profileDraft, displayName: event.target.value })} /></label>
            <label>Correo<input value={auth.user.email || ''} disabled /></label>
            <label>Institución habitual<input value={profileDraft.institution} onChange={(event) => setProfileDraft({ ...profileDraft, institution: event.target.value })} /></label>
            <label>Programa educativo<input value={profileDraft.educationalProgram} onChange={(event) => setProfileDraft({ ...profileDraft, educationalProgram: event.target.value })} /></label>
            <label className="wide">Grupo predeterminado<select value={profileDraft.defaultGroup} onChange={(event) => setProfileDraft({ ...profileDraft, defaultGroup: event.target.value })}><option value="">Sin grupo predeterminado</option>{data.groups.map((group) => <option key={group.id} value={group.id}>{groupLabel(group)}</option>)}</select></label>
          </div>
          <footer className="phase5-editor-footer"><span>Último acceso: {dateText(accountProfile.last_sign_in_at || auth.user.last_sign_in_at)}</span><button className="button primary" type="button" disabled={profileMutation.isPending || !profileDraft.displayName.trim()} onClick={() => profileMutation.mutate()}>{profileMutation.isPending ? 'Guardando…' : 'Guardar perfil'}</button></footer>
        </SectionCard>
      ) : null}

      {tab === 'academic' ? (
        <SectionCard>
          <div className="section-heading"><div><span className="eyebrow">REGLAS ACADÉMICAS</span><h2>Umbrales por grupo</h2><p>Alumno 360° utiliza estos valores para identificar riesgo y atención. No modifican la calificación.</p></div></div>
          {data.groups.length ? <div className="academic-threshold-list">{data.groups.map((group) => {
            const values = thresholds[group.id] || { minAttendance: 80, minGrade: 6 };
            return <article key={group.id}><div><b>{groupLabel(group)}</b><small>{group.school_cycle || group.term || 'Sin ciclo escolar'}</small></div><label>Asistencia mínima<input type="number" min="0" max="100" step="1" value={values.minAttendance} onChange={(event) => setThresholds({ ...thresholds, [group.id]: { ...values, minAttendance: Number(event.target.value) } })} /><span>%</span></label><label>Calificación mínima<input type="number" min="0" max="10" step="0.1" value={values.minGrade} onChange={(event) => setThresholds({ ...thresholds, [group.id]: { ...values, minGrade: Number(event.target.value) } })} /></label><button className="button secondary compact" type="button" disabled={thresholdMutation.isPending} onClick={() => thresholdMutation.mutate({ groupId: group.id, minAttendance: values.minAttendance, minGrade: values.minGrade })}>Guardar</button></article>;
          })}</div> : <EmptyState icon="groups" title="Sin grupos" detail="Crea un grupo para configurar sus umbrales." />}
        </SectionCard>
      ) : null}

      {tab === 'institution' ? (
        data.institutions.length ? <div className="view-stack compact-stack">{data.institutions.map((institution) => <InstitutionEditor key={`${institution.id}-${institution.report_logo_path || ''}-${institution.report_display_name || ''}`} institution={institution} busy={brandingMutation.isPending} onSave={(draft) => brandingMutation.mutate({ current: institution, draft })} />)}</div> : <EmptyState icon="reports" title="Sin instituciones administrables" detail="Esta sección está disponible para administradores institucionales activos." />
      ) : null}

      {tab === 'privacy' ? (
        <div className="view-stack compact-stack">
          <SectionCard>
            <div className="section-heading"><div><span className="eyebrow">DOCUMENTOS VIGENTES</span><h2>Privacidad y condiciones</h2><p>TEDVIO registra qué versión aceptaste y cuándo.</p></div><StatusPill tone={pendingDocs.length ? 'amber' : 'green'}>{pendingDocs.length ? `${pendingDocs.length} pendiente(s)` : 'Al día'}</StatusPill></div>
            <div className="privacy-document-list">{(data.account.documents || []).map((document) => <article key={`${document.document_key}-${document.version}`}><div><span className="eyebrow">{document.document_key.toUpperCase()} · v{document.version}</span><h3>{document.title}</h3><p>{document.summary || 'Documento legal vigente.'}</p><small>Vigente desde {dateText(document.effective_at)}</small></div><div><button className="button ghost compact" type="button" onClick={() => legalMutation.mutate({ key: document.document_key, version: document.version })}>Leer</button>{document.accepted ? <StatusPill tone="green">Aceptado</StatusPill> : <button className="button primary compact" type="button" disabled={acceptMutation.isPending} onClick={() => acceptMutation.mutate({ key: document.document_key, version: document.version })}>Aceptar versión</button>}</div></article>)}</div>
          </SectionCard>
          <SectionCard>
            <div className="section-heading compact"><div><span className="eyebrow">HISTORIAL</span><h2>Consentimientos registrados</h2></div></div>
            {data.consents.length ? <div className="settings-history-list">{data.consents.map((consent, index) => <article key={`${consent.document_key}-${consent.document_version}-${index}`}><Icon name="check" /><div><b>{consent.document_key} · v{consent.document_version}</b><p>{consent.source || 'TEDVIO'}</p></div><time>{dateText(consent.accepted_at)}</time></article>)}</div> : <EmptyState icon="shield" title="Sin aceptaciones registradas" detail="El historial aparecerá cuando aceptes una versión vigente." />}
          </SectionCard>
          <div className="legal-review-note">Los textos operativos deben recibir revisión jurídica independiente antes de un lanzamiento comercial amplio.</div>
        </div>
      ) : null}

      {tab === 'security' ? (
        <div className="settings-two-column">
          <SectionCard>
            <div className="section-heading compact"><div><span className="eyebrow">CONTRASEÑA</span><h2>Cambiar contraseña</h2><p>Usa al menos 8 caracteres.</p></div></div>
            <div className="settings-password-form"><label>Nueva contraseña<input type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label><label>Confirmar contraseña<input type="password" autoComplete="new-password" value={passwordConfirm} onChange={(event) => setPasswordConfirm(event.target.value)} /></label><button className="button primary" type="button" disabled={passwordMutation.isPending || password.length < 8} onClick={() => passwordMutation.mutate()}>{passwordMutation.isPending ? 'Actualizando…' : 'Actualizar contraseña'}</button></div>
          </SectionCard>
          <SectionCard>
            <div className="section-heading compact"><div><span className="eyebrow">SESIONES</span><h2>Control de acceso</h2><p>Invalida otros dispositivos sin cerrar la sesión actual.</p></div></div>
            <button className="button secondary" type="button" disabled={sessionsMutation.isPending} onClick={() => sessionsMutation.mutate()}>{sessionsMutation.isPending ? 'Cerrando…' : 'Cerrar otras sesiones'}</button>
            <div className="settings-security-note"><Icon name="shield" /><span><b>Sesión actual protegida</b><small>Para salir de este dispositivo utiliza el botón superior de cierre de sesión.</small></span></div>
          </SectionCard>
        </div>
      ) : null}

      {tab === 'data' ? (
        <div className="view-stack compact-stack">
          <SectionCard>
            <div className="section-heading"><div><span className="eyebrow">PORTABILIDAD</span><h2>Descargar mis datos</h2><p>Obtén un JSON estructurado sin contraseñas, tokens ni credenciales privadas.</p></div><StatusPill tone="blue">{data.account.export_count || 0} exportaciones</StatusPill></div>
            <button className="button primary" type="button" disabled={exportMutation.isPending} onClick={() => exportMutation.mutate()}>{exportMutation.isPending ? 'Preparando…' : 'Descargar mis datos'}</button>
          </SectionCard>
          <SectionCard className="danger-zone-card">
            <div className="section-heading"><div><span className="eyebrow">ZONA DE CONTROL</span><h2>Eliminación de cuenta</h2><p>La solicitud incluye una ventana de 30 días y revisión de dependencias institucionales.</p></div></div>
            {pendingDeletion ? <div className="pending-deletion"><Icon name="alert" /><div><b>Solicitud pendiente</b><p>Registrada {dateText(pendingDeletion.requested_at)} · fecha objetivo {dateText(pendingDeletion.scheduled_for)}.</p></div><button className="button secondary" type="button" disabled={deletionMutation.isPending} onClick={() => { if (window.confirm('¿Cancelar la solicitud de eliminación?')) deletionMutation.mutate(true); }}>Cancelar solicitud</button></div> : <div className="deletion-form"><label>Motivo opcional<textarea rows={3} value={deleteReason} onChange={(event) => setDeleteReason(event.target.value)} /></label>{(data.account.deletion_blockers || []).length ? <div className="warning-strip"><Icon name="alert" /><span>Eres el único administrador activo en: {(data.account.deletion_blockers || []).map((blocker) => blocker.name).join(', ')}. La baja definitiva requerirá transferir la administración.</span></div> : null}<label>Escribe ELIMINAR para confirmar<input value={deletePhrase} onChange={(event) => setDeletePhrase(event.target.value)} placeholder="ELIMINAR" /></label><button className="button danger" type="button" disabled={deletionMutation.isPending || deletePhrase.trim().toUpperCase() !== 'ELIMINAR'} onClick={() => { if (window.confirm('¿Registrar la solicitud de eliminación de la cuenta?')) deletionMutation.mutate(false); }}>{deletionMutation.isPending ? 'Registrando…' : 'Solicitar eliminación'}</button></div>}
          </SectionCard>
        </div>
      ) : null}

      {legalDocument ? (
        <div className="phase5-modal-backdrop" role="presentation" onClick={() => setLegalDocument(null)}>
          <section className="phase5-modal legal-document-modal" role="dialog" aria-modal="true" aria-label={legalDocument.title} onClick={(event) => event.stopPropagation()}>
            <header><div><span className="eyebrow">{legalDocument.document_key.toUpperCase()} · v{legalDocument.version}</span><h2>{legalDocument.title}</h2><p>Vigente desde {dateText(legalDocument.effective_at)}</p></div><button className="icon-button" type="button" onClick={() => setLegalDocument(null)} aria-label="Cerrar">×</button></header>
            <pre>{legalDocument.text}</pre>
          </section>
        </div>
      ) : null}
    </div>
  );
}
