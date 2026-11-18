import React, { useEffect, useState } from 'react';
import { CallSession, CanvasElement } from '../types';
import { getSavedSessions, deleteSavedSession } from '../lib/supabase';
import { ConfirmationModal } from './ConfirmationModal';
import {
  History,
  X,
  Calendar,
  Clock,
  Trash2,
  Download,
  FolderOpen,
  Sparkles,
  Compass
} from 'lucide-react';

interface SessionHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoadSession: (session: CallSession) => void;
}

export const SessionHistoryModal: React.FC<SessionHistoryModalProps> = ({
  isOpen,
  onClose,
  onLoadSession,
}) => {
  const [sessions, setSessions] = useState<CallSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<CallSession | null>(null);
  const [sessionToDelete, setSessionToDelete] = useState<CallSession | null>(null);

  const fetchSessions = async () => {
    const list = await getSavedSessions();
    setSessions(list);
    if (list.length > 0 && !selectedSession) {
      setSelectedSession(list[0]);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchSessions();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleConfirmDelete = async () => {
    if (!sessionToDelete) return;
    const id = sessionToDelete.id;
    await deleteSavedSession(id);
    const updated = await getSavedSessions();
    setSessions(updated);
    if (selectedSession?.id === id) {
      setSelectedSession(updated.length > 0 ? updated[0] : null);
    }
    setSessionToDelete(null);
  };

  const handleRestore = (session: CallSession) => {
    onLoadSession(session);
    onClose();
  };

  return (
    <div
      id="session-history-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in"
      onClick={onClose}
    >
      <div
        id="session-history-modal-dialog"
        className="relative w-full max-w-4xl bg-white rounded-3xl shadow-2xl border border-[#e2e2e6] overflow-hidden flex flex-col max-h-[85vh] text-[#18181c]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-[#e2e2e6] bg-[#fafafa]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-2xl bg-[#c8f13a] text-[#18181c] border border-[#18181c]/10 shadow-sm">
              <History className="w-5 h-5" />
            </div>
            <div>
              <div className="eyebrow text-[#87868e]">Session Archives</div>
              <h2 className="text-lg font-bold text-[#18181c] tracking-tight">Saved Multi-Agent Architecture Boards</h2>
            </div>
          </div>

          <button
            id="btn-close-history-modal"
            onClick={onClose}
            className="p-2 rounded-full hover:bg-[#f0f0f2] text-[#5a5a62] hover:text-[#18181c] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          {/* List Sidebar */}
          <div className="w-full md:w-80 border-r border-[#e2e2e6] overflow-y-auto p-4 space-y-2 bg-[#fafafa]">
            {sessions.length === 0 ? (
              <div className="text-center py-12 text-[#87868e] text-xs">
                <Compass className="w-8 h-8 mx-auto mb-2 opacity-40 text-[#18181c]" />
                <p>No saved architecture sessions yet.</p>
                <p className="mt-1">Calls with the coach automatically save here.</p>
              </div>
            ) : (
              sessions.map((session) => (
                <div
                  key={session.id}
                  onClick={() => setSelectedSession(session)}
                  className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex flex-col gap-1.5 ${
                    selectedSession?.id === session.id
                      ? 'bg-[#f0f0f2] border-[#18181c] shadow-sm'
                      : 'bg-white border-[#e2e2e6] hover:border-[#18181c]/40'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[#18181c] truncate flex-1 font-body">
                      {session.title || 'Multi-Agent System Architecture'}
                    </span>
                    <button
                      id={`btn-delete-session-${session.id}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSessionToDelete(session);
                      }}
                      title="Delete saved session"
                      className="p-1 text-[#87868e] hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {session.goal && (
                    <div className="text-[11px] text-[#5a5a62] line-clamp-1 italic font-body">
                      "{session.goal}"
                    </div>
                  )}

                  <div className="flex items-center gap-2 text-[10px] text-[#87868e] font-mono-code flex-wrap">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {new Date(session.startedAt).toLocaleDateString()}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {Math.round(session.durationSeconds)}s
                    </span>
                    {session.coachArchetype && (
                      <span className="px-1.5 py-0.5 rounded bg-[#18181c]/5 text-[#18181c] font-semibold truncate max-w-[120px]">
                        {session.coachArchetype.split(' ')[0]}
                      </span>
                    )}
                    {session.technicalLevel && (
                      <span className="px-1.5 py-0.5 rounded bg-[#18181c] text-[#c8f13a] font-bold">
                        Lvl {session.technicalLevel}
                      </span>
                    )}
                    <span>{session.drawingCount || session.elements?.length || 0} items</span>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Preview Detail Area */}
          <div className="flex-1 p-6 overflow-y-auto bg-white flex flex-col justify-between">
            {selectedSession ? (
              <div className="space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-base font-bold text-[#18181c] font-body">
                      {selectedSession.title}
                    </h3>
                    <div className="flex items-center gap-2 mt-1">
                      <p className="text-xs text-[#5a5a62] font-mono-code">
                        Session ID: {selectedSession.id} · Recorded{' '}
                        {new Date(selectedSession.startedAt).toLocaleString()}
                      </p>
                      {selectedSession.coachArchetype && (
                        <span className="px-2 py-0.5 rounded-md bg-[#fafafa] border border-[#e2e2e6] text-[10px] font-mono-code font-bold text-[#18181c]">
                          {selectedSession.coachArchetype}
                        </span>
                      )}
                      {selectedSession.technicalLevel && (
                        <span className="px-2 py-0.5 rounded-md bg-[#18181c] text-[#c8f13a] text-[10px] font-mono-code font-bold">
                          Level {selectedSession.technicalLevel} ({selectedSession.technicalLevelLabel || 'Tech Depth'})
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      id="btn-delete-current-version"
                      onClick={() => setSessionToDelete(selectedSession)}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#e2e2e6] hover:border-rose-300 hover:bg-rose-50 text-[#87868e] hover:text-rose-600 text-xs font-semibold transition-all"
                      title="Delete this saved session version"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete Version</span>
                    </button>

                    <button
                      id="btn-restore-session"
                      onClick={() => handleRestore(selectedSession)}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#18181c] hover:bg-black text-white text-xs font-semibold shadow-md active:scale-95 transition-all"
                    >
                      <FolderOpen className="w-3.5 h-3.5 text-[#c8f13a]" />
                      <span>Open On Whiteboard</span>
                    </button>
                  </div>
                </div>

                {selectedSession.goal && (
                  <div className="p-3 rounded-2xl bg-[#fafafa] border border-[#e2e2e6]">
                    <div className="text-[10px] font-mono-code font-bold uppercase text-[#87868e] mb-1">
                      Target Goal
                    </div>
                    <div className="text-xs font-medium text-[#18181c]">
                      {selectedSession.goal}
                    </div>
                  </div>
                )}

                {/* Session Thumbnail */}
                {selectedSession.thumbnailUrl && (
                  <div className="rounded-2xl border border-[#e2e2e6] overflow-hidden bg-[#fafafa] max-h-56 flex items-center justify-center p-2">
                    <img
                      src={selectedSession.thumbnailUrl}
                      alt="Session Diagram Preview"
                      className="max-h-52 object-contain rounded-xl"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                )}

                {/* Conversation Transcripts Excerpt */}
                {selectedSession.transcripts && selectedSession.transcripts.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-mono-code font-bold uppercase tracking-wider text-[#18181c]">
                      Dialogue Notes ({selectedSession.transcripts.length})
                    </h4>
                    <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
                      {selectedSession.transcripts.map((t, idx) => (
                        <div
                          key={idx}
                          className={`p-2.5 rounded-xl text-xs font-body ${
                            t.speaker === 'ai'
                              ? 'bg-[#f0f0f2] text-[#18181c]'
                              : 'bg-[#fafafa] border border-[#e2e2e6] text-[#5a5a62]'
                          }`}
                        >
                          <span className="font-mono-code font-bold text-[10px] block mb-0.5 text-[#87868e]">
                            {t.speaker === 'ai' ? '⚡ TEOLIMA COACH' : '🎤 YOU'}
                          </span>
                          <span>{t.text}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-[#87868e] text-xs">
                <Compass className="w-12 h-12 mb-3 text-[#e2e2e6]" />
                <p>Select a session on the left to view architecture summary</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Delete Session Confirmation Modal */}
      <ConfirmationModal
        isOpen={!!sessionToDelete}
        title="Delete Architecture Session?"
        description={`Are you sure you want to permanently delete "${sessionToDelete?.title || 'this session'}"? This action cannot be undone.`}
        confirmLabel="Delete Session"
        cancelLabel="Keep Session"
        variant="danger"
        onConfirm={handleConfirmDelete}
        onClose={() => setSessionToDelete(null)}
      />
    </div>
  );
};
