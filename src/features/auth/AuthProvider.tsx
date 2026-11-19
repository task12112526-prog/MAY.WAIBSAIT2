import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import type { AppRole } from '../../types';
import { requireSupabaseConfig, supabase } from '../../lib/supabase';

type AuthValue = {
  session: Session | null;
  user: User | null;
  role: AppRole | null;
  loading: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);
const validRoles: AppRole[] = ['admin', 'mosque_manager', 'accountant', 'property_manager', 'imam', 'committee', 'tenant', 'worshipper'];

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);

  const applySession = useCallback((next: Session | null) => {
    setSession(next);
    const claim: unknown = next?.user.app_metadata.role;
    if (typeof claim === 'string' && validRoles.includes(claim as AppRole)) setRole(claim as AppRole);
    else setRole(next ? 'worshipper' : null);
  }, []);

  useEffect(() => {
    if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
      setLoading(false);
      return;
    }
    let active = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => {
      if (active) applySession(next);
    });
    void supabase.auth.getSession().then(({ data, error }) => {
      if (error) throw error;
      if (active) {
        applySession(data.session);
        setLoading(false);
      }
    }).catch((error: unknown) => {
      console.error('Unable to restore Supabase session.', error);
      if (active) setLoading(false);
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [applySession]);

  const signOut = useCallback(async () => {
    requireSupabaseConfig();
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }, []);
  const value = useMemo(() => ({ session, user: session?.user ?? null, role, loading, signOut }), [session, role, loading, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider.');
  return value;
}
