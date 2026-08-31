import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type PropsWithChildren,
} from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import {
  createDemoWorkspace,
  fetchOnboardingSnapshot,
  onboardingKey,
  onboardingSteps,
  resetDemoWorkspace,
  saveOnboardingProgress,
  trackActivation,
  type OnboardingStep,
} from '../../core/onboarding';
import { useAuth } from '../auth/AuthProvider';

function completedStepIds(steps: OnboardingStep[]): string[] {
  return steps.filter((step) => step.complete).map((step) => step.id);
}

function autoShownKey(userId: string): string {
  return `tedvio.onboarding.auto.v21.${userId}`;
}

export function OnboardingExperience({ children }: PropsWithChildren) {
  const auth = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState('');

  const snapshotQuery = useQuery({
    queryKey: onboardingKey(auth.user?.id),
    queryFn: () => {
      if (!auth.user) throw new Error('Tu sesión expiró.');
      return fetchOnboardingSnapshot(auth.user);
    },
    enabled: Boolean(auth.user),
    staleTime: 20_000,
  });

  const snapshot = snapshotQuery.data;
  const steps = useMemo(() => snapshot ? onboardingSteps(snapshot) : [], [snapshot]);
  const completed = completedStepIds(steps);

  useEffect(() => {
    if (!auth.user || !snapshot || snapshot.completed || snapshot.dismissed) return;
    const key = autoShownKey(auth.user.id);
    try {
      if (window.sessionStorage.getItem(key)) return;
      window.sessionStorage.setItem(key, '1');
    } catch {
      // La guía puede abrirse manualmente aunque sessionStorage no esté disponible.
    }
    setOpen(true);
    void trackActivation(auth.user, 'onboarding_auto_opened', { score: snapshot.score });
  }, [auth.user, snapshot]);

  useEffect(() => {
    if (!open) return undefined;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [open]);

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: onboardingKey(auth.user?.id) }),
      queryClient.invalidateQueries({ queryKey: ['teacher-home', auth.user?.id] }),
      queryClient.invalidateQueries({ queryKey: ['teacher-groups', auth.user?.id] }),
      queryClient.invalidateQueries({ queryKey: ['teacher-classroom', auth.user?.id] }),
      queryClient.invalidateQueries({ queryKey: ['teacher-bank', auth.user?.id] }),
    ]);
  }

  const progressMutation = useMutation({
    mutationFn: async ({ step, dismissed }: { step: string; dismissed: boolean }) => {
      if (!auth.user) throw new Error('Tu sesión expiró.');
      await saveOnboardingProgress(auth.user, step, completed, dismissed);
      await trackActivation(auth.user, dismissed ? 'onboarding_dismissed' : 'onboarding_step_opened', {
        step,
        score: snapshot?.score || 0,
      });
    },
    onSuccess: refresh,
  });

  const demoMutation = useMutation({
    mutationFn: async (reset: boolean) => {
      if (!auth.user) throw new Error('Tu sesión expiró.');
      return reset ? resetDemoWorkspace(auth.user) : createDemoWorkspace(auth.user);
    },
    onSuccess: async (demo, reset) => {
      setNotice(reset ? 'Demostración reiniciada.' : 'Demostración preparada.');
      await refresh();
      setOpen(false);
      navigate(`/classroom/${demo.session_id}`);
    },
  });

  function openGuide() {
    setNotice('');
    setOpen(true);
    if (auth.user) void trackActivation(auth.user, 'onboarding_opened', { score: snapshot?.score || 0 });
  }

  function goToStep(step: OnboardingStep) {
    progressMutation.mutate({ step: step.id, dismissed: false }, {
      onSuccess: () => {
        setOpen(false);
        navigate(step.path);
      },
    });
  }

  function dismissGuide() {
    progressMutation.mutate({ step: snapshot?.last_step || 'welcome', dismissed: true }, {
      onSuccess: () => setOpen(false),
    });
  }

  const operationError = snapshotQuery.error || progressMutation.error || demoMutation.error;
  const score = snapshot?.score || 0;
  const progressStyle = { '--onboarding-progress': `${Math.max(0, Math.min(100, score * 20))}%` } as CSSProperties;

  return (
    <>
      {children}

      {snapshot ? (
        <button
          className={`onboarding-launcher ${snapshot.completed ? 'complete' : ''}`}
          type="button"
          onClick={openGuide}
          aria-label="Abrir guía de primera activación"
        >
          <span>{snapshot.completed ? '✓' : score}</span>
          <b>{snapshot.completed ? 'TEDVIO listo' : `Configuración ${score}/5`}</b>
        </button>
      ) : null}

      {open ? (
        <div className="onboarding-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setOpen(false);
        }}>
          <section className="onboarding-dialog" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
            <header className="onboarding-header">
              <div>
                <span className="eyebrow">PRIMERA ACTIVACIÓN</span>
                <h2 id="onboarding-title">Empieza a trabajar con TEDVIO</h2>
                <p>Completa cinco acciones esenciales o explora una demostración separada de tus datos reales.</p>
              </div>
              <button className="onboarding-close" type="button" onClick={() => setOpen(false)} aria-label="Cerrar guía">×</button>
            </header>

            <div className="onboarding-progress" style={progressStyle}>
              <div><span>Tu avance</span><b>{score}/5</b></div>
              <i><span /></i>
            </div>

            {notice ? <div className="onboarding-notice success">{notice}</div> : null}
            {operationError ? <div className="onboarding-notice error">{operationError.message}</div> : null}

            <div className="onboarding-layout">
              <div className="onboarding-checklist">
                {steps.map((step, index) => (
                  <article key={step.id} className={step.complete ? 'complete' : ''}>
                    <span>{step.complete ? '✓' : index + 1}</span>
                    <div><h3>{step.title}</h3><p>{step.detail}</p></div>
                    <button
                      className={step.complete ? 'button ghost compact' : 'button primary compact'}
                      type="button"
                      disabled={progressMutation.isPending}
                      onClick={() => goToStep(step)}
                    >
                      {step.complete ? 'Revisar' : 'Continuar'}
                    </button>
                  </article>
                ))}
              </div>

              <aside className="onboarding-demo-card">
                <span className="eyebrow">DEMO REINICIABLE</span>
                <h3>Conoce el recorrido sin mezclar datos</h3>
                <p>Genera un grupo demostrativo con 10 alumnos, cinco reactivos y una sesión lista para abrir.</p>
                <ul>
                  <li>Identificado como demostración</li>
                  <li>Excluido de tus reportes ordinarios</li>
                  <li>Puede reiniciarse cuando lo necesites</li>
                </ul>
                {snapshot.demo_ready && snapshot.demo_session_id ? (
                  <div className="onboarding-demo-actions">
                    <button className="button primary" type="button" onClick={() => { setOpen(false); navigate(`/classroom/${snapshot.demo_session_id}`); }}>Abrir demo</button>
                    <button className="button secondary" type="button" disabled={demoMutation.isPending} onClick={() => demoMutation.mutate(true)}>{demoMutation.isPending ? 'Reiniciando…' : 'Reiniciar demo'}</button>
                  </div>
                ) : (
                  <button className="button primary" type="button" disabled={demoMutation.isPending} onClick={() => demoMutation.mutate(false)}>{demoMutation.isPending ? 'Preparando…' : 'Crear demostración'}</button>
                )}
                <small>La oferta inicial se concentra en asistencia, clase, evaluación, OMR, calificaciones y seguimiento.</small>
              </aside>
            </div>

            <footer className="onboarding-footer">
              <Link to="/support" onClick={() => setOpen(false)}>Necesito ayuda</Link>
              <div>
                {!snapshot?.completed ? <button className="button ghost" type="button" disabled={progressMutation.isPending} onClick={dismissGuide}>Ahora no</button> : null}
                <button className="button secondary" type="button" onClick={() => setOpen(false)}>Cerrar</button>
              </div>
            </footer>
          </section>
        </div>
      ) : null}
    </>
  );
}
