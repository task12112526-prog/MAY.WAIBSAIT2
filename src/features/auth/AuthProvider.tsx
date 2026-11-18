import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import type { AppRole } from '../../types';
import { requireSupabaseConfig, supabase } from '../../lib/supabase';

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  role: AppRole | null;
  loading: boolean;
  refreshRole: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshRole = useCallback(async () => {
    requireSupabaseConfig();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setRole(null);
      return;
    }
    const appRole = user.app_metadata.role;
    if (appRole !== undefined && appRole !== 'admin' && appRole !== 'hr_manager' && appRole !== 'employee') {
      throw new Error('This account has an unsupported PeopleOS role. Ask an administrator to check its app_metadata.role.');
    }
    setRole((appRole as AppRole | undefined) ?? 'employee');
  }, []);

  useEffect(() => {
    let active = true;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return;
      setSession(nextSession);
      if (!nextSession) {
        setRole(null);
        setLoading(false);
        return;
      }
      window.setTimeout(() => {
        if (active) void refreshRole().catch((error: unknown) => console.error('Could not load the signed-in user role.', error));
      }, 0);
    });

    void supabase.auth.getSession().then(async ({ data, error }) => {
      if (error) throw error;
      if (!active) return;
      setSession(data.session);
      if (data.session && import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY) {
        await refreshRole();
      }
      if (active) setLoading(false);
    }).catch((error: unknown) => {
      console.error('Could not restore the signed-in session.', error);
      if (active) setLoading(false);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [refreshRole]);

  const value = useMemo(() => ({ session, user: session?.user ?? null, role, loading, refreshRole }), [session, role, loading, refreshRole]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider.');
  return context;
}
