import { createClient } from '@supabase/supabase-js';

// Tylko Auth (email/hasło + sesja). Zlecenia i koszyk idą przez backend / Railway Postgres.

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);