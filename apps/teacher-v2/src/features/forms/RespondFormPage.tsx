import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import {
  fetchOnlineFormMeta,
  fetchOnlineFormState,
  onlineFormError,
  saveOnlineFormAnswer,
  startOnlineForm,
  submitOnlineForm,
  type OnlineFormMeta,
  type OnlineFormState,
} from '../../core/online-forms';
import uasCrest from '../../assets/uas-crest.png';
import './respond-form.css';

// This cover belongs to the UAS form; other institutions keep their own identity.
const UAS_ANATOMOCLINICAL_FORM_ID = '4400337b-33bf-452f-a41b-d2b99ff22531';

type Answers = Record<string, string>;
interface StoredSession {
  version: 1;
  token: string;
  pendingStart: boolean;
  name: string;
  enrollment: string;
  group?: string;
  pending: Answers;
}
type FormItem = OnlineFormState['items'][number];
const storageKey = (code: string) => `tedvio:online-form:${code}:session:v1`;

const rejectedIdentityMessages = new Set([
  'Escribe una matrícula válida.',
  'La matrícula no identifica a un alumno activo de este grupo.',
  'Escribe tu nombre completo.',
  'Ya existe un intento activo. Reanúdalo con el token guardado en el dispositivo original.',
  'Ya utilizaste los intentos permitidos.',
  'Selecciona un grupo válido y actualiza la página si no aparece la lista.',
  'Este formulario no admite un grupo declarado.',
]);

async function resumeStoredSession(code: string, session: StoredSession): Promise<OnlineFormState> {
  if (!session.pendingStart) return fetchOnlineFormState(session.token);
  try {
    return await fetchOnlineFormState(session.token);
  } catch {
    // A failed lookup never changes the secret or identity. Replaying exactly
    // the original start is idempotent, even if the first response was lost.
    return startOnlineForm(code, session.name, session.enrollment, session.token, session.group);
  }
}

function readSession(code: string): StoredSession | null {
  for (const kind of ['sessionStorage', 'localStorage'] as const) {
    try {
      const raw = window[kind].getItem(storageKey(code));
      if (!raw) continue;
      const value: unknown = JSON.parse(raw);
      if (!value || typeof value !== 'object') continue;
      const stored = value as Partial<StoredSession>;
      if (stored.version !== 1 || typeof stored.token !== 'string' || !/^[a-f\d-]{36}$/i.test(stored.token)) continue;
      const pending: Answers = {};
      if (stored.pending && typeof stored.pending === 'object') {
        for (const [id, answer] of Object.entries(stored.pending)) if (typeof answer === 'string') pending[id] = answer;
      }
      return { version: 1, token: stored.token, pendingStart: stored.pendingStart === true, name: typeof stored.name === 'string' ? stored.name : '', enrollment: typeof stored.enrollment === 'string' ? stored.enrollment : '', group: typeof stored.group === 'string' ? stored.group : '', pending };
    } catch { /* A blocked storage area must not prevent using the form. */ }
  }
  return null;
}

function writeSession(code: string, value: StoredSession): boolean {
  const json = JSON.stringify(value);
  for (const kind of ['localStorage', 'sessionStorage'] as const) {
    try {
      window[kind].setItem(storageKey(code), json);
      if (kind === 'localStorage') {
        try { window.sessionStorage.removeItem(storageKey(code)); } catch { /* Optional fallback cleanup. */ }
      }
      return kind === 'localStorage';
    } catch { /* Try tab storage before falling back to memory. */ }
  }
  return false;
}

function removeSession(code: string): void {
  for (const kind of ['localStorage', 'sessionStorage'] as const) {
    try { window[kind].removeItem(storageKey(code)); } catch { /* Nothing else to remove. */ }
  }
}

function answerMap(state: OnlineFormState): Answers {
  const valid = new Map(state.items.map(item => [item.id, item.options]));
  const map: Answers = {};
  for (const response of state.responses ?? []) {
    if (typeof response.answer === 'string' && valid.get(response.item_id)?.includes(response.answer)) map[response.item_id] = response.answer;
  }
  return map;
}

function readableDate(value: string | null | undefined): string {
  if (!value || !Number.isFinite(Date.parse(value))) return '';
  return new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function durationLabel(milliseconds: number): string {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds % 3600 / 60);
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}` : `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}

function safeMediaUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value, window.location.origin);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.href : null;
  } catch { return null; }
}

function ItemMedia({ item }: { item: FormItem }) {
  const [failed, setFailed] = useState(false);
  const url = safeMediaUrl(item.media_url);
  if (!url) return null;
  if (failed) return <p className="respond-form-muted">No se pudo cargar el recurso. <a href={url} target="_blank" rel="noopener noreferrer">Abrir recurso en otra pestaña</a></p>;
  if (item.media_type === 'audio') return <audio className="respond-form-media" controls preload="metadata" src={url} onError={() => setFailed(true)}>Tu navegador no puede reproducir este audio.</audio>;
  if (item.media_type === 'video') return <video className="respond-form-media" controls preload="metadata" src={url} onError={() => setFailed(true)}>Tu navegador no puede reproducir este video.</video>;
  return <img className="respond-form-media" src={url} alt="Material de apoyo de la pregunta" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />;
}

export function RespondFormPage() {
  const { code = '' } = useParams<{ code: string }>();
  return <RespondForm key={code} code={code.trim()} />;
}

function RespondForm({ code }: { code: string }) {
  const [meta, setMeta] = useState<OnlineFormMeta | null>(null);
  const [metaLoading, setMetaLoading] = useState(true);
  const [metaError, setMetaError] = useState('');
  const [attempt, setAttempt] = useState<OnlineFormState | null>(null);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Answers>({});
  const [pending, setPending] = useState<Answers>({});
  const [name, setName] = useState('');
  const [enrollment, setEnrollment] = useState('');
  const [declaredGroup, setDeclaredGroup] = useState('');
  const [recovering, setRecovering] = useState(false);
  const [starting, setStarting] = useState(false);
  const [accessError, setAccessError] = useState('');
  const [hasSession, setHasSession] = useState(false);
  const [storageWarning, setStorageWarning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [checking, setChecking] = useState(false);
  const [submitBusy, setSubmitBusy] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [uncertainSubmission, setUncertainSubmission] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [lostChanges, setLostChanges] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [online, setOnline] = useState(typeof navigator === 'undefined' || navigator.onLine);
  const [lastSaved, setLastSaved] = useState('');
  const [notice, setNotice] = useState('');
  const mounted = useRef(true);
  const sessionRef = useRef<StoredSession | null>(null);
  const attemptRef = useRef<OnlineFormState | null>(null);
  const answersRef = useRef<Answers>({});
  const pendingRef = useRef<Answers>({});
  const savedRef = useRef<Answers>({});
  const saveBusyRef = useRef(false);
  const startBusyRef = useRef(false);
  const submitBusyRef = useRef(false);
  const checkingRef = useRef(false);
  const uncertainRef = useRef(false);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const expiredChecked = useRef(false);
  const clock = useRef({ server: Date.now(), received: performance.now() });
  const retrySaveRef = useRef<() => Promise<void>>(async () => {});
  const refreshRef = useRef<() => Promise<void>>(async () => {});
  const confirmDialog = useRef<HTMLDialogElement>(null);
  const resultHeading = useRef<HTMLHeadingElement>(null);
  const questionCard = useRef<HTMLElement>(null);

  const serverTime = () => clock.current.server + performance.now() - clock.current.received;
  const syncClock = (serverNow?: string | null) => {
    if (!serverNow || !Number.isFinite(Date.parse(serverNow))) return;
    clock.current = { server: Date.parse(serverNow), received: performance.now() };
    setNow(clock.current.server);
  };
  const persist = () => {
    const session = sessionRef.current;
    if (!session) return;
    session.pending = { ...pendingRef.current };
    setStorageWarning(!writeSession(code, session));
  };
  const replacePending = (next: Answers) => {
    pendingRef.current = next;
    setPending(next);
    persist();
  };
  const hasExpired = () => {
    const deadline = attemptRef.current?.expires_at;
    return !!deadline && Number.isFinite(Date.parse(deadline)) && serverTime() >= Date.parse(deadline);
  };
  const clearRejectedStart = (session: StoredSession, error: unknown) => {
    // These backend validation failures occur before creation and are returned
    // only after checking for an existing attempt with this same token.
    if (sessionRef.current !== session || !session.pendingStart || attemptRef.current || !rejectedIdentityMessages.has(onlineFormError(error))) return;
    removeSession(code);
    sessionRef.current = null;
    setHasSession(false);
    setStorageWarning(false);
    setName(session.name);
    setEnrollment(session.enrollment);
    setDeclaredGroup(session.group || '');
    void loadMeta();
  };

  function applyState(value: OnlineFormState) {
    if (!mounted.current) return;
    if (!value || (value.status !== 'in_progress' && value.status !== 'submitted') || !Array.isArray(value.items)) throw new Error('No se recibió un estado válido del intento. Vuelve a consultarlo.');
    if (value.form_code.toLowerCase() !== code.toLowerCase()) throw new Error('El acceso guardado corresponde a otro formulario. Abre el enlace original de tu docente.');
    syncClock(value.server_now);
    const confirmed = answerMap(value);
    const remaining: Answers = {};
    for (const item of value.items) {
      const draft = pendingRef.current[item.id];
      if (typeof draft === 'string' && item.options.includes(draft) && confirmed[item.id] !== draft) remaining[item.id] = draft;
    }
    // Start or resume at the first unanswered question; reconciliation of the
    // same attempt must never move the student's current question.
    if (attemptRef.current?.attempt_id !== value.attempt_id) {
      const selected = { ...confirmed, ...remaining };
      const firstUnanswered = value.items.findIndex(item => typeof selected[item.id] !== 'string');
      setQuestionIndex(firstUnanswered < 0 ? Math.max(0, value.items.length - 1) : firstUnanswered);
    }
    savedRef.current = confirmed;
    attemptRef.current = value;
    setAttempt(value);
    setAccessError('');
    if (value.status === 'submitted') {
      setLostChanges(Object.keys(remaining).length);
      answersRef.current = confirmed;
      setAnswers(confirmed);
      replacePending({});
      setSaveError('');
      setSubmitError('');
      setConfirmOpen(false);
      uncertainRef.current = false;
      setUncertainSubmission(false);
    } else {
      answersRef.current = { ...confirmed, ...remaining };
      setAnswers(answersRef.current);
      replacePending(remaining);
      uncertainRef.current = false;
      setUncertainSubmission(false);
    }
    if (sessionRef.current) {
      sessionRef.current.pendingStart = false;
      sessionRef.current.name = value.display_name;
      sessionRef.current.enrollment = value.enrollment;
      sessionRef.current.group = value.declared_group || '';
      persist();
    }
  }

  async function loadMeta() {
    setMetaLoading(true);
    setMetaError('');
    try {
      const value = await fetchOnlineFormMeta(code);
      if (!mounted.current) return;
      setMeta(value);
      if (!attemptRef.current) syncClock(value.server_now);
    } catch (error) {
      if (mounted.current) setMetaError(onlineFormError(error));
    } finally { if (mounted.current) setMetaLoading(false); }
  }

  async function restoreSession() {
    const session = sessionRef.current;
    if (!session || checkingRef.current || startBusyRef.current || submitBusyRef.current || saveBusyRef.current) return;
    checkingRef.current = true;
    setRecovering(!attemptRef.current);
    setChecking(true);
    setAccessError('');
    setSubmitError('');
    try {
      const value = await resumeStoredSession(code, session);
      if (!mounted.current) return;
      applyState(value);
      if (value.status === 'in_progress' && Object.keys(pendingRef.current).length > 0 && !hasExpired()) {
        if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
        autosaveTimer.current = setTimeout(() => { void retrySaveRef.current(); }, 200);
      }
    } catch (error) {
      if (!mounted.current) return;
      clearRejectedStart(session, error);
      const message = onlineFormError(error);
      if (attemptRef.current) setSubmitError(`No pudimos confirmar el estado del intento. ${message}`);
      else setAccessError(message);
    } finally {
      checkingRef.current = false;
      if (mounted.current) { setRecovering(false); setChecking(false); }
    }
  }
  refreshRef.current = restoreSession;

  async function drainAnswers() {
    const session = sessionRef.current;
    if (!session || saveBusyRef.current || submitBusyRef.current || checkingRef.current || uncertainRef.current || attemptRef.current?.status !== 'in_progress' || hasExpired()) return;
    saveBusyRef.current = true;
    setSaving(true);
    setSaveError('');
    let mustRefresh = false;
    try {
      while (mounted.current && Object.keys(pendingRef.current).length > 0 && attemptRef.current?.status === 'in_progress' && !hasExpired()) {
        const entry = Object.entries(pendingRef.current)[0];
        if (!entry) break;
        const [itemId, answer] = entry;
        const receipt = await saveOnlineFormAnswer(session.token, itemId, answer);
        if (!mounted.current) return;
        syncClock(receipt.server_now);
        if (receipt.saved !== true) {
          mustRefresh = Boolean(receipt.submitted || receipt.expired);
          throw new Error(mustRefresh ? 'El intento se cerró antes de confirmar este cambio. Estamos consultando la entrega registrada.' : 'La respuesta no quedó confirmada. Reintenta el guardado.');
        }
        savedRef.current = { ...savedRef.current, [itemId]: answer };
        const next = { ...pendingRef.current };
        if (next[itemId] === answer) delete next[itemId];
        replacePending(next);
        setLastSaved(receipt.server_now || new Date(serverTime()).toISOString());
      }
    } catch (error) {
      if (mounted.current) setSaveError(onlineFormError(error));
    } finally {
      saveBusyRef.current = false;
      if (mounted.current) setSaving(false);
      if (mounted.current && mustRefresh) void refreshRef.current();
    }
  }
  retrySaveRef.current = drainAnswers;

  function chooseAnswer(itemId: string, answer: string) {
    if (attemptRef.current?.status !== 'in_progress' || hasExpired() || submitBusyRef.current || uncertainRef.current || checkingRef.current) return;
    answersRef.current = { ...answersRef.current, [itemId]: answer };
    setAnswers(answersRef.current);
    const next = { ...pendingRef.current, [itemId]: answer };
    // Every changed selection needs a fresh receipt. An earlier failed request
    // may have committed, so returning to an older saved option is also a write.
    replacePending(next);
    setSubmitError('');
    setSaveError('');
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => { void retrySaveRef.current(); }, 350);
  }

  async function begin(event: FormEvent) {
    event.preventDefault();
    if (startBusyRef.current || checkingRef.current || !name.trim() || !enrollment.trim() || ((meta?.group_choices?.length || 0)>0 && !meta?.group_choices?.includes(declaredGroup))) return;
    startBusyRef.current = true;
    setStarting(true);
    setAccessError('');
    setNotice('');
    let session: StoredSession | null = null;
    try {
      const retry = !!sessionRef.current;
      if (!sessionRef.current) {
        if (typeof crypto.randomUUID !== 'function') throw new Error('Abre este formulario en un navegador actualizado y mediante el enlace seguro de tu docente.');
        sessionRef.current = { version: 1, token: crypto.randomUUID(), pendingStart: true, name: name.trim(), enrollment: enrollment.trim(), group: declaredGroup, pending: {} };
        setHasSession(true);
        persist();
      }
      session = sessionRef.current;
      const value = retry ? await resumeStoredSession(code, session) : await startOnlineForm(code, session.name, session.enrollment, session.token, session.group);
      if (mounted.current) applyState(value);
    } catch (error) { if (mounted.current) { if (session) clearRejectedStart(session, error); setAccessError(onlineFormError(error)); } }
    finally { startBusyRef.current = false; if (mounted.current) setStarting(false); }
  }

  async function confirmSubmit() {
    const session = sessionRef.current;
    if (!session || submitBusyRef.current || saveBusyRef.current || checkingRef.current || Object.keys(pendingRef.current).length > 0 || attemptRef.current?.status !== 'in_progress') return;
    if (hasExpired()) { setConfirmOpen(false); void restoreSession(); return; }
    submitBusyRef.current = true;
    setSubmitBusy(true);
    setSubmitError('');
    try {
      const value = await submitOnlineForm(session.token);
      if (!mounted.current) return;
      applyState(value);
      if (value.status !== 'submitted') throw new Error('El servidor todavía no confirmó la entrega. Consulta el estado antes de salir.');
    } catch (error) {
      if (mounted.current) {
        uncertainRef.current = true;
        setUncertainSubmission(true);
        setSubmitError(`No pudimos confirmar la entrega. ${onlineFormError(error)}`);
        setConfirmOpen(false);
      }
    } finally { submitBusyRef.current = false; if (mounted.current) setSubmitBusy(false); }
  }

  function forgetCompletedSession() {
    if (attemptRef.current?.status !== 'submitted' || checkingRef.current || submitBusyRef.current) return;
    removeSession(code);
    sessionRef.current = null;
    attemptRef.current = null;
    answersRef.current = {};
    pendingRef.current = {};
    savedRef.current = {};
    expiredChecked.current = false;
    setHasSession(false);
    setAttempt(null);
    setQuestionIndex(0);
    setAnswers({});
    setPending({});
    setName('');
    setEnrollment('');
    setDeclaredGroup('');
    setLastSaved('');
    setSubmitError('');
    setSaveError('');
    setLostChanges(0);
    setStorageWarning(false);
    setNotice('Tu entrega permanece registrada. Se cerró tu acceso en este dispositivo.');
    void loadMeta();
  }

  useEffect(() => {
    mounted.current = true;
    let current = true;
    const stored = readSession(code);
    sessionRef.current = stored;
    pendingRef.current = stored?.pending || {};
    setPending(pendingRef.current);
    setHasSession(!!stored);
    if (stored) { setName(stored.name); setEnrollment(stored.enrollment); setDeclaredGroup(stored.group || ''); setRecovering(true); }
    void fetchOnlineFormMeta(code).then(value => {
      if (!current) return;
      setMeta(value);
      if (!attemptRef.current) syncClock(value.server_now);
    }).catch(error => { if (current) setMetaError(onlineFormError(error)); }).finally(() => { if (current) setMetaLoading(false); });
    if (stored) {
      const recovery = resumeStoredSession(code, stored);
      void recovery.then(value => {
        if (!current) return;
        applyState(value);
        if (value.status === 'in_progress' && Object.keys(pendingRef.current).length && !hasExpired()) autosaveTimer.current = setTimeout(() => { void retrySaveRef.current(); }, 200);
      }).catch(error => { if (current) { clearRejectedStart(stored, error); setAccessError(onlineFormError(error)); } }).finally(() => { if (current) setRecovering(false); });
    }
    return () => { current = false; mounted.current = false; if (autosaveTimer.current) clearTimeout(autosaveTimer.current); };
  }, [code]);

  useEffect(() => {
    if (attempt?.status !== 'in_progress') return;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => { setNow(serverTime()); timer = setTimeout(tick, 1000); };
    tick();
    return () => clearTimeout(timer);
  }, [attempt?.status, attempt?.expires_at]);

  const deadline = attempt?.expires_at && Number.isFinite(Date.parse(attempt.expires_at)) ? Date.parse(attempt.expires_at) : null;
  const remaining = deadline === null ? null : Math.max(0, deadline - now);
  const expired = attempt?.status === 'in_progress' && remaining !== null && remaining <= 0;
  useEffect(() => {
    if (!expired) { expiredChecked.current = false; return; }
    setConfirmOpen(false);
    if (saving || checking || submitBusy || expiredChecked.current) return;
    expiredChecked.current = true;
    void refreshRef.current();
  }, [expired, saving, checking, submitBusy]);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (Object.keys(pendingRef.current).length > 0 || saveBusyRef.current || submitBusyRef.current) { event.preventDefault(); event.returnValue = ''; }
    };
    const onOnline = () => { setOnline(true); if (hasExpired() || uncertainRef.current) void refreshRef.current(); else void retrySaveRef.current(); };
    const onOffline = () => setOnline(false);
    const onVisibility = () => { if (document.visibilityState === 'visible' && attemptRef.current?.status === 'in_progress') void refreshRef.current(); };
    window.addEventListener('beforeunload', beforeUnload);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  useEffect(() => {
    const dialog = confirmDialog.current;
    if (!dialog) return;
    if (confirmOpen && !dialog.open) dialog.showModal();
    if (!confirmOpen && dialog.open) dialog.close();
  }, [confirmOpen]);
  useEffect(() => { if (attempt?.status === 'submitted') resultHeading.current?.focus(); }, [attempt?.status]);

  useEffect(() => {
    if (attempt?.status !== 'in_progress') return;
    const card = questionCard.current;
    if (card) {
      card.focus({ preventScroll: true });
      card.scrollIntoView({ block: 'start', behavior: 'auto' });
    }
  }, [questionIndex, attempt?.attempt_id, attempt?.status]);

  const items = attempt?.items || [];
  const currentIndex = Math.min(questionIndex, Math.max(0, items.length - 1));
  const isLastQuestion = currentIndex === items.length - 1;
  const answeredCount = items.filter(item => typeof answers[item.id] === 'string').length;
  const pendingCount = Object.keys(pending).length;
  const savedCount = items.filter(item => typeof savedRef.current[item.id] === 'string').length;
  const locked = expired || submitBusy || uncertainSubmission || checking;
  const canSubmit = attempt?.status === 'in_progress' && !locked && !saving && pendingCount === 0;
  const canNavigate = canSubmit && items.length > 0;
  const canStart = !!meta?.available && !hasSession && !metaLoading && !recovering;
  const title = attempt?.title || meta?.title || 'Formulario';
  const showUasCover = meta?.id === UAS_ANATOMOCLINICAL_FORM_ID && attempt?.status !== 'in_progress';
  const instructions = attempt?.instructions || meta?.instructions;
  const scoreVisible = attempt?.status === 'submitted' && attempt.released && typeof attempt.score === 'number';

  return <main className={`respond-form-shell${attempt?.status === 'in_progress' ? ' is-answering' : ''}${attempt?.status === 'submitted' ? ' is-delivered' : ''}`}>
    <a className="respond-form-skip" href="#respond-form-content" onClick={event => { event.preventDefault(); document.getElementById('respond-form-content')?.focus(); }}>Ir al formulario</a>
    <header className="respond-form-brand"><img src="/assets/tedvio_official_isotipo.svg" alt="TEDVIO" width="38" height="38" /><div><strong>TEDVIO</strong><span>Formularios</span></div><span className="respond-form-private"><span aria-hidden="true" className="respond-form-live-dot"/> Acceso de estudiantes</span></header>
    <div className="respond-form-wrap" id="respond-form-content" tabIndex={-1}>
      <section className="respond-form-intro">
        {showUasCover && (
          <div className="respond-form-institution">
            <img src={uasCrest} alt="Escudo de la UAS" width="250" height="321" />
            <p>Universidad Autónoma de Sinaloa</p>
          </div>
        )}
        <span className="respond-form-eyebrow">{attempt?.status === 'submitted' ? 'TU ENTREGA' : 'FORMULARIO ACADÉMICO'}</span>
        <h1>{title}</h1>
        {meta?.group_name ? <p className="respond-form-group">{meta.group_name}</p> : null}
        {instructions && attempt?.status !== 'in_progress' && attempt?.status !== 'submitted' ? <p className="respond-form-instructions">{instructions}</p> : null}
        <div className="respond-form-facts">
          {meta?.question_count ? <span>{meta.question_count} preguntas</span> : items.length ? <span>{items.length} preguntas</span> : null}
          {meta?.time_limit_minutes ? <span>{meta.time_limit_minutes} minutos por intento</span> : null}
          {meta?.max_attempts ? <span>{meta.max_attempts === 1 ? '1 intento permitido' : `Hasta ${meta.max_attempts} intentos`}</span> : null}
        </div>
        {!attempt && meta?.closes_at ? <p className="respond-form-deadline">Cierre: {readableDate(meta.closes_at)}</p> : null}
      </section>

      {!online ? <p className="respond-form-alert warning" role="status">No hay conexión. Tus cambios no estarán confirmados hasta que puedas guardarlos.</p> : null}
      {storageWarning ? <p className="respond-form-alert warning" role="status">Este navegador no permite conservar tu acceso. Mantén esta pestaña abierta hasta confirmar tu entrega.</p> : null}
      {notice ? <p className="respond-form-alert success" role="status">{notice}</p> : null}

      {!attempt ? <section className="respond-form-card respond-form-entry" aria-busy={metaLoading || recovering || starting}>
        {metaLoading || recovering ? <div className="respond-form-loading" role="status"><span className="respond-form-spinner" aria-hidden="true" /><p>{recovering ? 'Recuperando tu intento…' : 'Abriendo el formulario…'}</p></div> : null}
        {metaError ? <div className="respond-form-alert error" role="alert"><p>{metaError}</p><button type="button" className="respond-form-button secondary" onClick={() => void loadMeta()} disabled={metaLoading}>Volver a consultar</button></div> : null}
        {accessError ? <div className="respond-form-alert error" role="alert"><p>{accessError}</p>{hasSession ? <><p>Conservamos el acceso a este intento en este navegador. Vuelve a consultarlo antes de salir.</p>{sessionRef.current?.pendingStart ? <p>Datos enviados: {sessionRef.current.name} · Matrícula {sessionRef.current.enrollment}. Primero confirmaremos si el intento ya comenzó.</p> : null}<button type="button" className="respond-form-button secondary" disabled={recovering || starting} onClick={() => void restoreSession()}>Reintentar mi intento</button></> : null}</div> : null}
        {!metaLoading && !recovering && meta && !meta.available && !hasSession ? <div className="respond-form-unavailable"><h2>El formulario no está disponible</h2><p>{meta.message || (meta.status === 'closed' ? 'Tu docente cerró la recepción de respuestas.' : 'Consulta con tu docente cuándo puedes iniciar.')}</p>{meta.opens_at ? <p>Apertura: {readableDate(meta.opens_at)}</p> : null}<button type="button" className="respond-form-button secondary" onClick={() => void loadMeta()}>Consultar disponibilidad</button></div> : null}
        {canStart ? <><div className="respond-form-entry-heading"><span className="respond-form-eyebrow">01 · IDENTIFICACIÓN</span><h2>Comienza tu evaluación</h2><p className="respond-form-muted">Escribe tu nombre completo y matrícula. Comprueba tus datos antes de comenzar.</p></div><form onSubmit={event => { void begin(event); }} className="respond-form-identity">
          <label htmlFor="respond-form-name">Nombre completo<input id="respond-form-name" name="name" autoComplete="name" required maxLength={160} value={name} disabled={starting} onChange={event => setName(event.target.value)} placeholder="Tu nombre y apellidos" /></label>
          <label htmlFor="respond-form-enrollment">Matrícula<input id="respond-form-enrollment" name="enrollment" autoComplete="off" autoCapitalize="none" spellCheck={false} required maxLength={100} value={enrollment} disabled={starting} onChange={event => setEnrollment(event.target.value)} placeholder="Tu matrícula" /></label>
          {meta.group_choices?.length ? <label htmlFor="respond-form-group">Grupo<select id="respond-form-group" name="group" aria-label="Grupo" required value={declaredGroup} disabled={starting} onChange={event => setDeclaredGroup(event.target.value)}><option value="" disabled>Selecciona tu grupo</option>{meta.group_choices.map(label => <option key={label} value={label}>{label}</option>)}</select></label> : null}
          <p className="respond-form-entry-note">{meta.time_limit_minutes ? 'El tiempo empieza cuando inicias el intento. ' : ''}Podrás continuar desde este mismo navegador si cierras la página.</p>
          <button className="respond-form-button primary" type="submit" disabled={starting || !name.trim() || !enrollment.trim() || (!!meta.group_choices?.length && !meta.group_choices.includes(declaredGroup))}>{starting ? 'Preparando tu intento…' : 'Comenzar formulario'}<span aria-hidden="true">→</span></button>
        </form></> : null}
        {starting ? <p role="status">Preparando tu intento. Espera la confirmación…</p> : null}
      </section> : null}

      {attempt?.status === 'in_progress' ? <>
        <section className="respond-form-progress" aria-label="Estado del intento">
          <div className="respond-form-progress-heading"><div><strong>{attempt.display_name}</strong><span>{attempt.declared_group ? `Grupo ${attempt.declared_group} · ` : ''}Matrícula {attempt.enrollment} · Intento {attempt.attempt_no}</span></div>{remaining !== null ? <div className={`respond-form-timer${remaining < 120000 ? ' urgent' : ''}`} role="timer" aria-label={`Tiempo restante ${durationLabel(remaining)}`}><span>Tiempo restante</span><strong>{durationLabel(remaining)}</strong></div> : <span className="respond-form-open-label">En curso</span>}</div>
          <div className="respond-form-progress-row"><span>{answeredCount} de {items.length} respondidas</span><span>{savedCount} guardadas</span></div><progress max={Math.max(1, items.length)} value={answeredCount} aria-label={`${answeredCount} de ${items.length} preguntas respondidas`} />
          <p className={`respond-form-save-state${saveError ? ' error' : ''}`} aria-live="polite" aria-atomic="true">{saving ? 'Guardando respuestas…' : saveError ? 'Hay respuestas sin guardar.' : pendingCount > 0 ? `${pendingCount} ${pendingCount === 1 ? 'respuesta pendiente' : 'respuestas pendientes'} de guardar.` : savedCount > 0 ? `Respuestas guardadas${lastSaved ? ` · ${new Date(lastSaved).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}` : ''}` : 'Selecciona una opción. Cada respuesta se guarda automáticamente.'}</p>
        </section>
        {expired ? <section className="respond-form-alert warning" role="status"><h2>El tiempo terminó</h2><p>{checking ? 'Estamos consultando el cierre de tu intento.' : 'Consulta el estado para confirmar el cierre y las respuestas que quedaron registradas.'}</p>{pendingCount > 0 ? <p>{pendingCount} {pendingCount === 1 ? 'cambio no tiene' : 'cambios no tienen'} confirmación de guardado.</p> : null}<button type="button" className="respond-form-button secondary" onClick={() => void restoreSession()} disabled={checking || saving}>{checking ? 'Consultando…' : 'Consultar cierre'}</button></section> : null}
        {saveError && !expired ? <div className="respond-form-alert error" role="alert"><p>{saveError}</p><p>Tus selecciones siguen visibles. Deben guardarse antes de enviar.</p><button type="button" className="respond-form-button secondary" disabled={saving || checking || submitBusy} onClick={() => void drainAnswers()}>Reintentar guardado</button></div> : null}
        {submitError ? <div className="respond-form-alert error" role="alert"><p>{submitError}</p><button type="button" className="respond-form-button secondary" onClick={() => void restoreSession()} disabled={checking || saving || submitBusy}>{checking ? 'Consultando…' : 'Consultar estado de mi intento'}</button></div> : null}
        <div className="respond-form-questions">
          {items.slice(currentIndex, currentIndex + 1).map(item => <section ref={questionCard} tabIndex={-1} className="respond-form-card respond-form-question" key={item.id} aria-labelledby={`question-${item.id}`}>
            <div className="respond-form-question-top"><span>Pregunta {currentIndex + 1} de {items.length}{item.section_title ? ` · ${item.section_title}` : ''}</span><span>{item.points} {item.points === 1 ? 'punto' : 'puntos'}</span></div>
            <fieldset disabled={locked}><legend id={`question-${item.id}`}>{item.prompt}</legend><ItemMedia item={item} /><div className="respond-form-options">
              {item.options.map((option, optionIndex) => <label className={`respond-form-option${answers[item.id] === option ? ' selected' : ''}`} key={`${item.id}-${optionIndex}`}><input type="radio" name={`question-${item.id}`} value={option} checked={answers[item.id] === option} onChange={() => chooseAnswer(item.id, option)} /><span className="respond-form-option-letter" aria-hidden="true">{String.fromCharCode(65 + optionIndex)}</span><span>{option}</span></label>)}
            </div></fieldset>
            <p className={`respond-form-question-status${pending[item.id] !== undefined ? ' pending' : ''}`}>{pending[item.id] !== undefined ? 'Cambio pendiente de confirmar' : answers[item.id] !== undefined ? 'Respuesta guardada' : 'Sin responder'}</p>
          </section>)}
        </div>
        <nav className="respond-form-step-nav" aria-label="Navegación de preguntas">
          <div className="respond-form-step-count" aria-live="polite">Pregunta {currentIndex + 1} de {items.length} · {answeredCount} respondidas</div>
          <div className="respond-form-step-actions">
            <button type="button" className="respond-form-button secondary" disabled={!canNavigate || currentIndex === 0} onClick={() => setQuestionIndex(index => Math.max(0, index - 1))}>Anterior</button>
            {isLastQuestion ? <button type="button" className="respond-form-button primary" disabled={!canSubmit} onClick={() => setConfirmOpen(true)}>{submitBusy ? 'Enviando…' : 'Revisar y enviar'}</button> : <button type="button" className="respond-form-button primary" disabled={!canNavigate} onClick={() => setQuestionIndex(index => Math.min(items.length - 1, index + 1))}>Siguiente <span aria-hidden="true">→</span></button>}
          </div>
          {pendingCount > 0 || saving ? <p className="respond-form-step-note" role="status">Confirma el guardado de tu respuesta para continuar.</p> : isLastQuestion ? <p className="respond-form-step-note">{answeredCount === items.length ? 'Has respondido todas las preguntas.' : `Quedan ${items.length - answeredCount} sin responder. Puedes regresar a revisarlas antes de entregar.`}</p> : <p className="respond-form-step-note">Puedes dejar una pregunta sin responder y regresar antes de entregar.</p>}
        </nav>
      </> : null}

      {attempt?.status === 'submitted' ? <section className="respond-form-card respond-form-result">
        <span className="respond-form-success-mark" aria-hidden="true">✓</span><span className="respond-form-eyebrow">{attempt.auto_submitted ? 'TIEMPO FINALIZADO' : 'REGISTRO CONFIRMADO'}</span><h2 ref={resultHeading} tabIndex={-1}>Tu formulario quedó entregado</h2><p>{attempt.display_name} · {attempt.declared_group ? `Grupo ${attempt.declared_group} · ` : ''}Matrícula {attempt.enrollment}</p>{attempt.submitted_at ? <p className="respond-form-muted">Entregado el {readableDate(attempt.submitted_at)}</p> : null}{attempt.attempt_id ? <p className="respond-form-receipt">Folio: {attempt.attempt_id}</p> : null}
        {lostChanges > 0 ? <p className="respond-form-alert warning">{lostChanges} {lostChanges === 1 ? 'cambio no alcanzó' : 'cambios no alcanzaron'} a guardarse antes del cierre y no se incluyeron en la entrega.</p> : null}
        {scoreVisible ? <div className="respond-form-score"><span>Tu resultado</span><strong>{attempt.score}<small> / {attempt.max_score} puntos</small></strong>{typeof attempt.percentage === 'number' ? <p>{attempt.percentage.toLocaleString('es-MX', { maximumFractionDigits: 1 })}%</p> : null}</div> : <p className="respond-form-result-message">Tu docente recibió las respuestas. El resultado se mostrará cuando lo habilite.</p>}
        {attempt.released && attempt.show_answers && attempt.feedback?.length ? <div className="respond-form-feedback"><h3>Revisión de respuestas</h3>{attempt.feedback.map(feedback => {
          const index = items.findIndex(item => item.id === feedback.item_id);
          const item = items[index];
          return <article key={feedback.item_id}><h4>{index >= 0 ? `${index + 1}. ` : ''}{item?.prompt || 'Pregunta'}</h4><p><strong>Tu respuesta:</strong> {answers[feedback.item_id] || 'Sin responder'}</p>{feedback.correct_answer ? <p><strong>Respuesta correcta:</strong> {feedback.correct_answer}</p> : null}{feedback.explanation ? <p className="respond-form-muted">{feedback.explanation}</p> : null}</article>;
        })}</div> : null}
        <div className="respond-form-result-actions"><button type="button" className="respond-form-button secondary" disabled={checking} onClick={() => void restoreSession()}>{checking ? 'Consultando…' : 'Actualizar resultado'}</button><button type="button" className="respond-form-text-button" disabled={checking} onClick={forgetCompletedSession}>Cerrar mi acceso en este dispositivo</button></div>{submitError ? <p className="respond-form-alert error" role="alert">{submitError}</p> : null}
      </section> : null}

      <footer className="respond-form-footer">TEDVIO · Tu aprendizaje, paso a paso.</footer>
    </div>
    <dialog ref={confirmDialog} className="respond-form-dialog" aria-labelledby="respond-form-confirm-title" onCancel={event => { if (submitBusy) event.preventDefault(); else setConfirmOpen(false); }} onClose={() => { if (!submitBusy) setConfirmOpen(false); }}>
      <span className="respond-form-eyebrow">CONFIRMAR ENTREGA</span><h2 id="respond-form-confirm-title">¿Enviar tu formulario?</h2><p>Se enviarán {answeredCount} de {items.length} respuestas. Después de entregar no podrás modificarlas.</p>{answeredCount < items.length ? <p className="respond-form-alert warning">{items.length - answeredCount} {items.length - answeredCount === 1 ? 'pregunta quedará' : 'preguntas quedarán'} sin responder y se calificará{items.length - answeredCount === 1 ? '' : 'n'} con cero puntos.</p> : null}<div className="respond-form-dialog-actions"><button type="button" className="respond-form-button secondary" disabled={submitBusy} onClick={() => setConfirmOpen(false)}>Seguir revisando</button><button type="button" className="respond-form-button primary" disabled={submitBusy || saving || checking || pendingCount > 0 || expired} onClick={() => void confirmSubmit()}>{submitBusy ? 'Confirmando entrega…' : 'Sí, enviar formulario'}</button></div>
    </dialog>
  </main>;
}
