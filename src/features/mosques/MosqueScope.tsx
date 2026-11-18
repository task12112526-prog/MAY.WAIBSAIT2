import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../auth/AuthProvider';
import { isSupabaseConfigured, requireSupabaseConfig, supabase } from '../../lib/supabase';
import { isLocalDemoEnabled, localDemoList } from '../../services/localDemo';

const storageKey = 'masjid-selected-mosque';

export type MosqueOption = { id: string; name: string; registration_number: string | null };
type MosqueScopeValue = {
  mosqueId: string;
  mosques: MosqueOption[];
  isLoading: boolean;
  error: Error | null;
  setMosqueId: (id: string) => void;
};

const MosqueScopeContext = createContext<MosqueScopeValue | null>(null);

export function getSelectedMosqueId(): string {
  return typeof window === 'undefined' ? '' : localStorage.getItem(storageKey) ?? '';
}

export function MosqueScopeProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const [demo, setDemo] = useState(isLocalDemoEnabled);
  const [selectedId, setSelectedId] = useState(getSelectedMosqueId);
  useEffect(() => {
    const refresh = () => setDemo(isLocalDemoEnabled());
    window.addEventListener('masjid-demo-mode-changed', refresh);
    return () => window.removeEventListener('masjid-demo-mode-changed', refresh);
  }, []);
  const mosquesQuery = useQuery<MosqueOption[]>({
    queryKey: ['mosque-options', demo, session?.user.id],
    queryFn: async () => {
      if (demo) {
        return localDemoList('mosque_registrations', {
          page: 0, pageSize: 1000, search: '', sortBy: 'name', sortDirection: 'asc', searchFields: [],
        }).rows as MosqueOption[];
      }
      requireSupabaseConfig();
      const { data, error } = await supabase.rpc('list_mosque_options');
      if (error) throw error;
      return (data ?? []) as MosqueOption[];
    },
    enabled: (Boolean(session) && isSupabaseConfigured) || demo,
  });

  const mosques = mosquesQuery.data ?? [];
  const demoMosqueId = demo ? mosques.find((mosque) => mosque.registration_number === 'DEMO-REG-KHI-001')?.id : undefined;
  const effectiveId = mosques.some((mosque) => mosque.id === selectedId)
    ? selectedId
    : demoMosqueId ?? mosques[0]?.id ?? '';

  useEffect(() => {
    if (effectiveId && effectiveId !== selectedId) setSelectedId(effectiveId);
    if (effectiveId) localStorage.setItem(storageKey, effectiveId);
    else localStorage.removeItem(storageKey);
  }, [effectiveId, selectedId]);

  const value = useMemo<MosqueScopeValue>(() => ({
    mosqueId: effectiveId,
    mosques,
    isLoading: mosquesQuery.isLoading,
    error: mosquesQuery.error instanceof Error ? mosquesQuery.error : null,
    setMosqueId: (id) => {
      if (!mosques.some((mosque) => mosque.id === id)) throw new Error('Choose a registered mosque.');
      setSelectedId(id);
    },
  }), [effectiveId, mosques, mosquesQuery.error, mosquesQuery.isLoading]);

  return <MosqueScopeContext.Provider value={value}>{children}</MosqueScopeContext.Provider>;
}

export function useMosqueScope(): MosqueScopeValue {
  const value = useContext(MosqueScopeContext);
  if (!value) throw new Error('useMosqueScope must be used inside MosqueScopeProvider.');
  return value;
}
