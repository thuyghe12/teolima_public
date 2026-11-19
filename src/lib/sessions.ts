import { CallSession } from '../types';

const STORAGE_KEY = 'live_canvas_call_sessions';

/** Saved sessions live in this browser's storage. */
export function getLocalSessions(): CallSession[] {
  try {
    const json = localStorage.getItem(STORAGE_KEY);
    return json ? JSON.parse(json) : [];
  } catch {
    return [];
  }
}

function write(sessions: CallSession[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  } catch (err) {
    console.warn('Could not save the session in browser storage:', err);
  }
}

export async function saveSession(session: CallSession): Promise<boolean> {
  write([session, ...getLocalSessions().filter((s) => s.id !== session.id)]);
  return true;
}

export async function getSavedSessions(): Promise<CallSession[]> {
  return getLocalSessions();
}

export async function deleteSavedSession(id: string): Promise<void> {
  write(getLocalSessions().filter((s) => s.id !== id));
}
