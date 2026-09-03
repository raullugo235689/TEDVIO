import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import {
  assertStrongPassword,
  authRedirect,
  isValidEmail,
  type LegalAcceptanceInput,
} from '../../core/auth-security';
import { supabase } from '../../core/supabase';

type AuthStatus = 'loading' | 'authenticated' | 'anonymous';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  status: AuthStatus;
  recoveryMode: boolean;
  accessIssue: AccessIssue | null;
  signIn(email: string, password: string): Promise<void>;
  signUp(email: string, password: string, acceptances: LegalAcceptanceInput[]): Promise<'signed-in' | 'confirmation-required'>;
  requestPasswordReset(email: string): Promise<void>;
  resendConfirmation(email: string): Promise<void>;
  updateRecoveredPassword(password: string): Promise<void>;
  clearRecoveryMode(): void;
  retrySession(): Promise<void>;
  clearLocalSession(): Promise<void>;
  signOut(): Promise<void>;
}

export interface AccessIssue {
  code: string;
  message: string;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const AUTH_BOOT_TIMEOUT_MS = 8_000;
const AUTH_ACTION_TIMEOUT_MS = 15_000;

function diagnosticCode(prefix: string): string {
  const stamp = Date.now().toString(36).slice(-6).toUpperCase();
  const random = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${prefix}-${stamp}-${random}`;
}

function timeoutError(code: string): Error {
  const error = new Error(code);
  error.name = 'TedvioAuthTimeout';
  return error;
}

async function withTimeout<T>(operation: PromiseLike<T>, milliseconds: number, code: string): Promise<T> {
  let timer: number | undefined;
  try {
    return await Promise.race([
      Promise.resolve(operation),
      new Promise<T>((_, reject) => {
        timer = window.setTimeout(() => reject(timeoutError(code)), milliseconds);
      }),
    ]);
  } finally {
    if (timer !== undefined) window.clearTimeout(timer);
  }
}

function recoveryHintFromUrl(): boolean {
  if (typeof window === 'undefined' || window.location.pathname.replace(/\/+$/, '') !== '/auth/recovery') return false;
  return /(?:^|[&#])type=recovery(?:&|$)/i.test(window.location.hash);
}

export function AuthProvider({ children }: PropsWithChildren) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [recoveryMode, setRecoveryMode] = useState(recoveryHintFromUrl);
  const [accessIssue, setAccessIssue] = useState<AccessIssue | null>(null);
  const authEventRevision = useRef(0);
  const sessionLoadRevision = useRef(0);

  const applySession = useCallback((nextSession: Session | null) => {
    setSession(nextSession);
    setStatus(nextSession ? 'authenticated' : 'anonymous');
  }, []);

  const loadInitialSession = useCallback(async () => {
    const loadRevision = ++sessionLoadRevision.current;
    const revisionAtStart = authEventRevision.current;
    setStatus('loading');
    setAccessIssue(null);
    try {
      const { data, error } = await withTimeout(
        supabase.auth.getSession(),
        AUTH_BOOT_TIMEOUT_MS,
        'AUTH_SESSION_TIMEOUT',
      );
      if (error) throw error;
      // Never let a slow boot response overwrite a newer SIGNED_IN/SIGNED_OUT event.
      if (sessionLoadRevision.current === loadRevision && authEventRevision.current === revisionAtStart) {
        applySession(data.session ?? null);
      }
    } catch (error) {
      if (sessionLoadRevision.current !== loadRevision || authEventRevision.current !== revisionAtStart) return;
      applySession(null);
      setAccessIssue({
        code: diagnosticCode('SES'),
        message: error instanceof Error && error.message === 'AUTH_SESSION_TIMEOUT'
          ? 'La sesión guardada tardó demasiado en responder.'
          : 'No se pudo restaurar la sesión guardada en este dispositivo.',
      });
    }
  }, [applySession]);

  useEffect(() => {
    let active = true;

    const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!active) return;
      authEventRevision.current += 1;
      applySession(nextSession);
      setAccessIssue(null);
      if (event === 'PASSWORD_RECOVERY') setRecoveryMode(true);
      if (event === 'SIGNED_OUT') {
        setRecoveryMode(false);
        queryClient.clear();
      }
    });

    void loadInitialSession();

    return () => {
      active = false;
      sessionLoadRevision.current += 1;
      data.subscription.unsubscribe();
    };
  }, [applySession, loadInitialSession, queryClient]);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!isValidEmail(email) || !password) throw new Error('INVALID_CREDENTIAL_INPUT');
    if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new Error('AUTH_OFFLINE');
    setAccessIssue(null);
    try {
      const { data, error } = await withTimeout(
        supabase.auth.signInWithPassword({
          email: email.trim().toLowerCase(),
          password,
        }),
        AUTH_ACTION_TIMEOUT_MS,
        'AUTH_SIGNIN_TIMEOUT',
      );
      if (error) throw error;
      // Supabase already returned a verified session: open the app immediately instead
      // of depending exclusively on a later browser auth event.
      if (!data.session) throw new Error('AUTH_SESSION_MISSING');
      authEventRevision.current += 1;
      applySession(data.session);
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (/AUTH_(SIGNIN_TIMEOUT|SESSION_MISSING)/.test(message)) {
        setAccessIssue({
          code: diagnosticCode('ACC'),
          message: message === 'AUTH_SESSION_MISSING'
            ? 'El acceso fue validado, pero el navegador no conservó la sesión.'
            : 'El servicio de acceso tardó más de lo esperado.',
        });
      }
      throw error;
    }
  }, [applySession]);

  const signUp = useCallback(async (
    email: string,
    password: string,
    acceptances: LegalAcceptanceInput[],
  ) => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!isValidEmail(normalizedEmail)) throw new Error('INVALID_EMAIL');
    assertStrongPassword(password, normalizedEmail);
    if (!acceptances.length || acceptances.some((acceptance) => acceptance.accepted !== true)) {
      throw new Error('LEGAL_ACCEPTANCE_REQUIRED');
    }

    const { data, error } = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        emailRedirectTo: authRedirect('/auth/confirm'),
        data: {
          tedvio_signup_source: 'teacher_v2',
          tedvio_legal_acceptances: acceptances,
          tedvio_legal_accepted_at: new Date().toISOString(),
        },
      },
    });
    if (error) throw error;
    return data.session ? 'signed-in' : 'confirmation-required';
  }, []);

  const requestPasswordReset = useCallback(async (email: string) => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!isValidEmail(normalizedEmail)) throw new Error('INVALID_EMAIL');
    const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
      redirectTo: authRedirect('/auth/recovery'),
    });
    if (error) throw error;
  }, []);

  const resendConfirmation = useCallback(async (email: string) => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!isValidEmail(normalizedEmail)) throw new Error('INVALID_EMAIL');
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: normalizedEmail,
      options: {
        emailRedirectTo: authRedirect('/auth/confirm'),
      },
    });
    if (error) throw error;
  }, []);

  const updateRecoveredPassword = useCallback(async (password: string) => {
    if (!recoveryMode) throw new Error('RECOVERY_SESSION_REQUIRED');
    assertStrongPassword(password, session?.user.email || '');
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;

    await supabase.auth.signOut({ scope: 'others' }).catch(() => undefined);
    const { error: localError } = await supabase.auth.signOut({ scope: 'local' });
    if (localError) throw localError;
    setRecoveryMode(false);
    queryClient.clear();
  }, [queryClient, recoveryMode, session?.user.email]);

  const clearRecoveryMode = useCallback(() => setRecoveryMode(false), []);

  const retrySession = useCallback(async () => {
    await loadInitialSession();
  }, [loadInitialSession]);

  const clearLocalSession = useCallback(async () => {
    try {
      await withTimeout(supabase.auth.signOut({ scope: 'local' }), AUTH_BOOT_TIMEOUT_MS, 'AUTH_CLEAR_TIMEOUT');
    } catch {
      // A failed server call must not leave the access screen permanently blocked.
    }
    authEventRevision.current += 1;
    setRecoveryMode(false);
    setAccessIssue(null);
    queryClient.clear();
    applySession(null);
  }, [applySession, queryClient]);

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (error) throw error;
    setRecoveryMode(false);
    queryClient.clear();
  }, [queryClient]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      status,
      recoveryMode,
      accessIssue,
      signIn,
      signUp,
      requestPasswordReset,
      resendConfirmation,
      updateRecoveredPassword,
      clearRecoveryMode,
      retrySession,
      clearLocalSession,
      signOut,
    }),
    [
      session,
      status,
      recoveryMode,
      accessIssue,
      signIn,
      signUp,
      requestPasswordReset,
      resendConfirmation,
      updateRecoveredPassword,
      clearRecoveryMode,
      retrySession,
      clearLocalSession,
      signOut,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth debe utilizarse dentro de AuthProvider.');
  return context;
}
