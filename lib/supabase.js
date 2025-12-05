import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let supabase = null;

if (supabaseUrl && supabaseAnonKey) {
  supabase = createClient(supabaseUrl, supabaseAnonKey);
}

// Server-side admin client (use service role key) - only if configured
let supabaseAdmin = null;
const serviceUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (serviceUrl && serviceKey) {
  supabaseAdmin = createClient(serviceUrl, serviceKey, { auth: { persistSession: false } });
}

// Get all matches
export async function getMatches() {
  if (!supabase) {
    console.warn('Supabase not configured');
    return [];
  }

  try {
    const { data, error } = await supabase
      .from('matches')
      .select('*')
      .order('match_date', { ascending: true })
      .order('match_time', { ascending: true });

    if (error) {
      console.error('Error fetching matches:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error:', error);
    return [];
  }
}

// Get single match by ID
export async function getMatchById(id) {
  if (!supabase) {
    console.warn('Supabase not configured');
    return null;
  }

  try {
    const { data, error } = await supabase
      .from('matches')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error fetching match:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Error:', error);
    return null;
  }
}

// Create new match
export async function createMatch(matchData) {
  if (!supabaseAdmin) {
    return { success: false, error: 'Supabase admin client not configured' };
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('matches')
      .insert([matchData])
      .select()
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Update match
export async function updateMatch(id, matchData) {
  if (!supabaseAdmin) {
    return { success: false, error: 'Supabase admin client not configured' };
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('matches')
      .update(matchData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Delete match
export async function deleteMatch(id) {
  if (!supabaseAdmin) {
    return { success: false, error: 'Supabase admin client not configured' };
  }

  try {
    const { error } = await supabaseAdmin
      .from('matches')
      .delete()
      .eq('id', id);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export default supabase;
export { supabaseAdmin };