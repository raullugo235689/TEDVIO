import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
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
  signIn(email: string, password: string): Promise<void>;
  signUp(email: string, password: string, acceptances: LegalAcceptanceInput[]): Promise<'signed-in' | 'confirmation-required'>;
  requestPasswordReset(email: string): Promise<void>;
  resendConfirmation(email: string): Promise<void>;
  updateRecoveredPassword(password: string): Promise<void>;
  clearRecoveryMode(): void;
  signOut(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function recoveryHintFromUrl(): boolean {
  if (typeof window === 'undefined' || window.location.pathname.replace(/\/+$/, '') !== '/auth/recovery') return false;
  return /(?:^|[&#])type=recovery(?:&|$)/i.test(window.location.hash);
}

export function AuthProvider({ children }: PropsWithChildren) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [recoveryMode, setRecoveryMode] = useState(recoveryHintFromUrl);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) console.error('TEDVIO initial session', error);
      setSession(data.session ?? null);
      setStatus(data.session ? 'authenticated' : 'anonymous');
    });

    const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!active) return;
      setSession(nextSession);
      setStatus(nextSession ? 'authenticated' : 'anonymous');
      if (event === 'PASSWORD_RECOVERY') setRecoveryMode(true);
      if (event === 'SIGNED_OUT') {
        setRecoveryMode(false);
        queryClient.clear();
      }
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [queryClient]);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!isValidEmail(email) || !password) throw new Error('INVALID_CREDENTIAL_INPUT');
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (error) throw error;
  }, []);

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
      signIn,
      signUp,
      requestPasswordReset,
      resendConfirmation,
      updateRecoveredPassword,
      clearRecoveryMode,
      signOut,
    }),
    [
      session,
      status,
      recoveryMode,
      signIn,
      signUp,
      requestPasswordReset,
      resendConfirmation,
      updateRecoveredPassword,
      clearRecoveryMode,
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
