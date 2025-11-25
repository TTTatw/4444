/// <reference types="vite/client" />
import { createClient } from '@supabase/supabase-js';

// These should be in your .env file in production
// VITE_SUPABASE_URL
// VITE_SUPABASE_ANON_KEY

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase URL or Key is missing. Cloud features will not work.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);