import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "اپنا_URL_یہاں_لکھیں";
const supabaseAnonKey = "اپنی_KEY_یہاں_لکھیں";

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-anon-key',
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
  },
);

export function requireSupabaseConfig(): void {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your .env.local file.');
  }
}
