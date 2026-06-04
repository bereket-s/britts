/**
 * Supabase client initialization.
 * Falls back to localStorage-only mode if credentials are not configured.
 */

import { createClient } from '@supabase/supabase-js';

let supabase = null;
let supabaseEnabled = false;

export async function initSupabase() {
  const url  = import.meta.env.VITE_SUPABASE_URL  || localStorage.getItem('studymate_sb_url')  || '';
  const key  = import.meta.env.VITE_SUPABASE_ANON_KEY || localStorage.getItem('studymate_sb_key') || '';

  if (!url || !key) {
    console.warn('[StudyMate] Supabase not configured — using localStorage fallback');
    return false;
  }

  try {
    supabase = createClient(url, key);
    // Quick connectivity check
    const { error } = await supabase.from('courses').select('id').limit(1);
    if (error && error.code !== 'PGRST116') {
      // PGRST116 = table doesn't exist yet — still counts as connected
      throw error;
    }
    supabaseEnabled = true;
    console.log('[StudyMate] Supabase connected ✓');
    return true;
  } catch (err) {
    console.error('[StudyMate] Supabase connection failed:', err.message);
    supabase = null;
    return false;
  }
}

export function getSupabase() { return supabase; }
export function isSupabaseEnabled() { return supabaseEnabled; }

/** Re-initialize with new credentials (called from Settings) */
export async function reinitSupabase(url, key) {
  localStorage.setItem('studymate_sb_url', url);
  localStorage.setItem('studymate_sb_key', key);
  supabase = null;
  supabaseEnabled = false;
  return initSupabase();
}
