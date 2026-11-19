import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://qbxivbxiuhgsuqleeylt.supabase.co";
const supabaseAnonKey = "sb_publishable__FwmxJKbCIIea6jb-SgAGw_4AGh5l8a";

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey,
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
  }
);

export function requireSupabaseConfig(): void {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase is not configured.');
  }
}
