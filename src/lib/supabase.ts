import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { CallSession } from '../types';

const LOCAL_STORAGE_KEY = 'live_canvas_call_sessions';

let supabaseClient: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  if (supabaseClient) return supabaseClient;

  // Check Vite env or local configuration
  const url = (import.meta as any).env?.VITE_SUPABASE_URL || localStorage.getItem('supabase_url') || '';
  const key = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || localStorage.getItem('supabase_anon_key') || '';

  if (url && key) {
    try {
      supabaseClient = createClient(url, key);
    } catch (e) {
      console.warn('Failed to initialize Supabase client:', e);
    }
  }
  return supabaseClient;
}

export function setSupabaseCredentials(url: string, key: string): void {
  if (url && key) {
    localStorage.setItem('supabase_url', url);
    localStorage.setItem('supabase_anon_key', key);
    try {
      supabaseClient = createClient(url, key);
    } catch (e) {
      console.error(e);
    }
  } else {
    localStorage.removeItem('supabase_url');
    localStorage.removeItem('supabase_anon_key');
    supabaseClient = null;
  }
}

/**
 * Saves a completed call session (bypassed during live loop, called post-call for persistence)
 */
export async function saveSession(session: CallSession): Promise<boolean> {
  // 1. Always persist locally
  try {
    const existing = getLocalSessions();
    const updated = [session, ...existing.filter((s) => s.id !== session.id)];
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
  } catch (err) {
    console.warn('Failed to save session to local storage:', err);
  }

  // 2. Persist to Supabase if configured
  const client = getSupabaseClient();
  if (client) {
    try {
      const { error } = await client.from('call_sessions').upsert({
        id: session.id,
        title: session.title,
        started_at: new Date(session.startedAt).toISOString(),
        ended_at: session.endedAt ? new Date(session.endedAt).toISOString() : null,
        duration_seconds: session.durationSeconds,
        transcripts: session.transcripts,
        drawing_count: session.drawingCount,
        elements: session.elements,
        thumbnail_url: session.thumbnailUrl,
        updated_at: new Date().toISOString(),
      });
      if (error) {
        console.warn('Supabase session save error (ignoring to prevent UI blockage):', error);
      }
    } catch (err) {
      console.warn('Supabase post-call sync error:', err);
    }
  }

  return true;
}

/**
 * Fetches all saved call sessions from local storage or Supabase
 */
export async function getSavedSessions(): Promise<CallSession[]> {
  const local = getLocalSessions();
  const client = getSupabaseClient();

  if (!client) {
    return local;
  }

  try {
    const { data, error } = await client
      .from('call_sessions')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(30);

    if (error || !data) {
      return local;
    }

    const remoteSessions: CallSession[] = data.map((item: any) => ({
      id: item.id,
      title: item.title,
      startedAt: new Date(item.started_at).getTime(),
      endedAt: item.ended_at ? new Date(item.ended_at).getTime() : undefined,
      durationSeconds: item.duration_seconds,
      transcripts: item.transcripts || [],
      drawingCount: item.drawing_count || 0,
      elements: item.elements || [],
      thumbnailUrl: item.thumbnail_url,
    }));

    // Merge remote and local (remote takes precedence by ID)
    const remoteIds = new Set(remoteSessions.map((s) => s.id));
    const merged = [...remoteSessions, ...local.filter((l) => !remoteIds.has(l.id))];
    return merged;
  } catch (err) {
    console.warn('Supabase fetch error:', err);
    return local;
  }
}

export function getLocalSessions(): CallSession[] {
  try {
    const json = localStorage.getItem(LOCAL_STORAGE_KEY);
    return json ? JSON.parse(json) : [];
  } catch {
    return [];
  }
}

export async function deleteSavedSession(id: string): Promise<void> {
  const local = getLocalSessions().filter((s) => s.id !== id);
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(local));

  const client = getSupabaseClient();
  if (client) {
    try {
      await client.from('call_sessions').delete().eq('id', id);
    } catch (e) {
      console.warn('Supabase delete error:', e);
    }
  }
}
