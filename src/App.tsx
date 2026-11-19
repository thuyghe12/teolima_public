/**
 * Teolima: the whiteboard, the call panel and the websocket to the coach.
 * The server owns the board model; this app writes the brief, streams audio
 * and draws whatever board the server sends back.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { Board, StageId } from '../shared/board/schema';
import { readiness } from '../shared/board/readiness';
import { boardElements } from './lib/canvas/boardElements';
import { getAccessToken } from './lib/access';
import { Whiteboard } from './components/Whiteboard';
import { StarterPrompts } from './components/StarterPrompts';
import { CanvasToolbar } from './components/CanvasToolbar';
import { CallPanel, type DocumentDraft } from './components/CallPanel';
import { StageDocument } from './components/StageDocument';
import { CompileStudio } from './components/CompileStudio';
import type { ChangeBody } from '../shared/board/changes';
import { sectionsOf } from '../shared/board/arc42';
import { stageDocument } from '../shared/board/spec-document';
import { STAGES, stageOf } from '../shared/board/stages';
import { StageBar } from './components/StageBar';
import { currentFrame, layoutWorkspace } from '../shared/board/workspace';
import { SessionHistoryModal } from './components/SessionHistoryModal';
import { SettingsModal } from './components/SettingsModal';
import { LayerPanel } from './components/LayerPanel';
import { BriefDraft, emptyBrief, normalizeBrief, recentBriefs, rememberBrief } from './lib/briefs';

import { CanvasEngine } from './lib/canvas/canvasEngine';
import { LiveAudioManager } from './lib/audio/audioManager';
import { getSavedSessions, saveSession } from './lib/sessions';
import {
  CallSession,
  CanvasElement,
  CanvasLayer,
  DrawingInstruction,
  LiveTranscriptItem,
  VoiceSettings,
  WSServerMessage
} from './types';

/** The stage whose document the panel opens on: the current stage, or the last one with a document while later stages have none yet. */
const documentStage = (board: Board): StageId => (sectionsOf(board.stage.current).length ? board.stage.current : [...STAGES].reverse().find((s) => s.n < stageOf(board.stage.current).n && sectionsOf(s.id).length)?.id ?? 'discovery');

export default function App() {
  const [engine, setEngine] = useState<CanvasEngine | null>(null);
  const [audioManager, setAudioManager] = useState<LiveAudioManager | null>(null);

  // Call & Stream States
  const [isCallActive, setIsCallActive] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [inputVolume, setInputVolume] = useState(0);
  const [outputVolume, setOutputVolume] = useState(0);
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  const [isAiDrawing, setIsAiDrawing] = useState(false);

  // Layer Management States
  const [layers, setLayers] = useState<CanvasLayer[]>([
    { id: 'layer-ai', name: 'AI Coach Doodles', visible: true, locked: false, opacity: 1, order: 0 },
    { id: 'layer-user', name: 'My Notes & Sketches', visible: true, locked: false, opacity: 1, order: 1 }
  ]);
  const [activeLayerId, setActiveLayerId] = useState<string>('layer-user');
  const [isLayerPanelOpen, setIsLayerPanelOpen] = useState(false);

  // The brief: written in the panel before a call, or saved by the coach during one.
  const [brief, setBrief] = useState<BriefDraft>(emptyBrief);
  const [recent, setRecent] = useState<BriefDraft[]>(() => recentBriefs());
  // A transcript or notes pasted before the call, and the documents the server has accepted.
  const [pastedDoc, setPastedDoc] = useState<DocumentDraft>({ title: '', text: '' });
  const [documents, setDocuments] = useState<Record<string, string>>({});
  const [specOpen, setSpecOpen] = useState(false);
  const [projectOpen, setProjectOpen] = useState(false);
  /** The stage document shown in the panel; null follows the current stage. */
  const [docStage, setDocStage] = useState<StageId | null>(null);
  const specOpenRef = useRef(false);

  // Session & Transcripts
  const [transcripts, setTranscripts] = useState<LiveTranscriptItem[]>([]);
  const [savedSessions, setSavedSessions] = useState<CallSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [sessionStartTime, setSessionStartTime] = useState<number>(0);
  const [statusMessage, setStatusMessage] = useState<string>('');

  // Modals
  // The latest board from the server, handed back when a new call starts.
  const lastBoardRef = useRef<Board | null>(null);
  const [board, setBoard] = useState<Board | null>(null);
  // The design standard steps of the current stage only.
  const steps = React.useMemo(() => {
    if (!board) return undefined;
    const own = stageOf(board.stage.current).steps;
    const list = readiness(board).steps.filter((s) => own.includes(s.id));
    // one step is what the stage bar already shows
    return list.length > 1 ? list : undefined;
  }, [board]);

  /**
   * Keeps the stage being worked on in view, clear of the call panel and the
   * specification drawer. When a stage is approved the next frame appears
   * below the last one, and this pans to it.
   */
  const fitBoard = (b: Board) => {
    if (!engine) return;
    const ws = layoutWorkspace(b);
    const frame = currentFrame(ws, b);
    if (!frame) return;
    const wide = window.innerWidth > 900;
    const panel = document.getElementById('call-panel');
    const right = panel && wide ? panel.offsetWidth + 20 : 0;
    const left = specOpenRef.current && wide ? 380 : 0;
    const box = ws.title && frame === ws.frames[0] ? { ...frame, y: frame.y - 70, h: frame.h + 70 } : frame;
    engine.ensureVisible(box, right, left);
  };
  useEffect(() => {
    specOpenRef.current = specOpen;
    if (board) fitBoard(board);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [specOpen]);

  /** An edit to the stage document, sent as the user's own change. */
  const editDocument = (body: ChangeBody) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'board_change', body, reason: 'Edited in the app' }));
    }
  };

  /** A stage is approved or reopened by the user, in the app; the server records who. */
  const changeStage = (body: { op: 'approve_stage'; stage: StageId; by: string } | { op: 'reopen_stage'; stage: StageId }) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'board_change', body, reason: body.op === 'approve_stage' ? 'Approved in the app' : 'Reopened in the app' }));
    }
  };

  const clearBoard = () => {
    engine?.clear();
    lastBoardRef.current = null;
    setBoard(null);
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'board_change', body: { op: 'clear' }, reason: 'Cleared from the toolbar' }));
    }
  };

  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Settings
  const [settings, setSettings] = useState<VoiceSettings>(() => ({
    ...loadPreferences(),
    animationSpeed: 'normal',
    handDrawnRoughness: 1.4,
    defaultStrokeWidth: 2,
    soundEffects: true,
    canvasTheme: 'paper-dots',
    aiLayerId: 'layer-ai',
  }));

  const wsRef = useRef<WebSocket | null>(null);
  const isCallActiveRef = useRef(isCallActive);
  isCallActiveRef.current = isCallActive;

  // Load initial saved sessions
  const loadSessions = useCallback(async () => {
    const list = await getSavedSessions();
    setSavedSessions(list);
  }, []);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  // Handle engine initialization
  const handleEngineReady = useCallback((eng: CanvasEngine) => {
    setEngine(eng);
    setLayers(eng.layers);
    setActiveLayerId(eng.activeLayerId);

    eng.onActiveDrawingChange = (drawing) => {
      setIsAiDrawing(drawing);
    };

    eng.onLayersChange = (updatedLayers, currentActiveId) => {
      setLayers([...updatedLayers]);
      setActiveLayerId(currentActiveId);
    };
  }, []);

  // Update settings handler
  const handleUpdateSettings = (newSettings: Partial<VoiceSettings>) => {
    setSettings((prev) => {
      const updated = { ...prev, ...newSettings };
      savePreferences(updated);
      if (engine) {
        engine.setSettings(updated);
      }
      return updated;
    });
  };

  /**
   * Dispatches structured drawing tool calls from AI to the canvas engine
   */
  const handleToolCalls = useCallback((toolCalls: Array<{ id: string; name: string; args: any }>) => {
    if (!engine) return;

    for (const call of toolCalls) {
      const instruction: DrawingInstruction = {
        tool: call.name as any,
        params: call.args || {},
      };
      engine.executeAIInstruction(instruction);
    }
  }, [engine]);

  /**
   * Starts a Speech-to-Speech call session
   */
  const startCall = async () => {
    if (isCallActive || isConnecting) return;
    setIsConnecting(true);

    try {
      // 1. Initialize Audio Manager
      const audio = new LiveAudioManager();
      audio.onVolumeUpdate = (inVol, outVol) => {
        setInputVolume(inVol);
        setOutputVolume(outVol);
      };
      audio.onAiSpeakingChange = (speaking) => {
        setIsAiSpeaking(speaking);
      };

      const audioSuccess = await audio.start();
      if (!audioSuccess) {
        alert('Could not access microphone. Please ensure microphone permissions are granted.');
        setIsConnecting(false);
        return;
      }

      setAudioManager(audio);

      // 2. Connect WebSocket
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const token = getAccessToken();
      const wsUrl = `${protocol}//${window.location.host}/ws/live${token ? `?token=${encodeURIComponent(token)}` : ''}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        // Only what the user typed goes to the server; it is saved as the user's change.
        const typed = normalizeBrief(brief);
        if (typed.goal) setRecent(rememberBrief(typed));
        ws.send(JSON.stringify({
          type: 'start_call',
          voice: settings.voiceName,
          // hand the board back, so a new connection continues the same design
          board: lastBoardRef.current,
          brief: typed.goal ? typed : undefined,
          documents: pastedDoc.text.trim() ? [{ title: pastedDoc.title.trim(), text: pastedDoc.text.trim() }] : undefined,
          level: settings.level,
        }));
        if (pastedDoc.text.trim()) setPastedDoc({ title: '', text: '' });


        // Bridge mic audio chunks to WebSocket
        audio.onAudioData = (base64Pcm16) => {
          if (ws.readyState === WebSocket.OPEN && isCallActiveRef.current) {
            ws.send(JSON.stringify({
              type: 'audio',
              audio: base64Pcm16,
            }));
          }
        };

        setIsConnecting(false);
        setIsCallActive(true);
        const sessId = 'call-' + Date.now();
        setActiveSessionId(sessId);
        setSessionStartTime(Date.now());
        setTranscripts([]);
      };

      ws.onmessage = (event) => {
        try {
          const data: WSServerMessage = JSON.parse(event.data);

          if (data.type === 'audio' && data.audio) {
            audio.playChunk(data.audio);
          } else if (data.type === 'interrupted') {
            audio.interrupt();
          } else if (data.type === 'board' && data.board && engine) {
            lastBoardRef.current = data.board;
            setBoard(data.board);
            // The coach may have saved the brief it confirmed with the user.
            if (data.board.brief?.goal) setBrief({ ...data.board.brief, constraints: [...data.board.brief.constraints] });
            // The board model is the source of truth: lay it out, one frame per stage, and draw what changed.
            engine.syncBoardElements(boardElements(layoutWorkspace(data.board)));
            fitBoard(data.board);
          } else if (data.type === 'documents' && data.documents) {
            setDocuments(Object.fromEntries(data.documents.map((d) => [d.id, d.title])));
          } else if (data.type === 'tool_call' && data.toolCalls) {
            handleToolCalls(data.toolCalls);
          } else if (data.type === 'transcript' && data.transcript) {
            setTranscripts((prev) => [
              ...prev,
              {
                id: 'tr-' + Math.random().toString(36).substring(2, 8),
                speaker: data.transcript!.speaker,
                text: data.transcript!.text,
                timestamp: Date.now(),
              }
            ]);
          } else if (data.type === 'status') {
            if (data.status?.message) {
              setStatusMessage(data.status.message);
              if (data.status.state === 'searching') {
                // Auto-clear searching status after 4 seconds if not replaced
                setTimeout(() => setStatusMessage(''), 4000);
              }
            }
          }
        } catch (e) {
          console.error('[App] Failed to parse WebSocket message:', e);
        }
      };

      ws.onerror = (err) => {
        console.warn('[App] WebSocket error:', err);
      };

      ws.onclose = () => {
        if (isCallActiveRef.current) {
          endCall();
        }
      };

    } catch (err) {
      console.error('[App] Failed to start call:', err);
      setIsConnecting(false);
    }
  };

  /**
   * Ends the Speech-to-Speech call and saves the session in browser storage
   */
  const endCall = async () => {
    setIsCallActive(false);
    setIsConnecting(false);

    if (audioManager) {
      audioManager.stop();
      setAudioManager(null);
    }

    if (wsRef.current) {
      try {
        if (wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: 'stop_call' }));
        }
        wsRef.current.close();
      } catch {}
      wsRef.current = null;
    }

    // Archive completed session
    if (activeSessionId && engine) {
      const elements = engine.getElements();
      const durationSeconds = Math.max(1, Math.round((Date.now() - sessionStartTime) / 1000));
      const newSession: CallSession = {
        id: activeSessionId,
        title: lastBoardRef.current?.title || brief.goal.slice(0, 60) || 'Untitled design',
        goal: brief.goal || undefined,
        technicalLevel: settings.level,
        startedAt: sessionStartTime,
        endedAt: Date.now(),
        durationSeconds,
        transcripts: [...transcripts],
        drawingCount: elements.length,
        elements: [...elements],
      };

      await saveSession(newSession);
      loadSessions();
      setActiveSessionId(null);
    }
  };

  const toggleMute = () => {
    if (!audioManager) return;
    const newMuted = !isMuted;
    audioManager.setMuted(newMuted);
    setIsMuted(newMuted);
  };

  /** Saves a brief edited during a call. */
  const saveBrief = (b: BriefDraft) => {
    setBrief(b);
    setRecent(rememberBrief(b));
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'set_brief', brief: b }));
    }
  };

  /** Hands a transcript or notes to the coach during a call. */
  const sendDocument = (d: DocumentDraft) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'document', document: d }));
    }
  };

  const sendPromptText = (text: string) => {
    setTranscripts((prev) => [
      ...prev,
      {
        id: 'user-' + Date.now(),
        speaker: 'user',
        text,
        timestamp: Date.now(),
      }
    ]);

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'text',
        text,
      }));
    }
  };

  const handleRestoreSession = (session: CallSession) => {
    if (engine && session.elements) {
      engine.setElements(session.elements);
      if (session.goal) setBrief({ goal: session.goal, audience: '', constraints: [] });
    }
  };

  return (
    <main
      className="relative w-screen h-screen overflow-hidden bg-[#fafafa] flex flex-col font-body text-[#18181c]"
      style={{ '--toolbar-top': board && (board.brief.goal || board.spec.items.length > 0) ? '72px' : '16px' } as React.CSSProperties}
    >
      {/* Top Floating Canvas Toolbar */}
      <CanvasToolbar
        engine={engine}
        settings={settings}
        onUpdateSettings={handleUpdateSettings}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onToggleLayerPanel={() => setIsLayerPanelOpen(!isLayerPanelOpen)}
        isLayerPanelOpen={isLayerPanelOpen}
        onClearBoard={clearBoard}
      />

      {/* Layer Management Modal / Popover */}
      <LayerPanel
        engine={engine}
        isOpen={isLayerPanelOpen}
        onClose={() => setIsLayerPanelOpen(false)}
        layers={layers}
        activeLayerId={activeLayerId}
      />

      {/* Main Interactive Whiteboard with Rough.js & RAF Loop */}
      <Whiteboard
        emptyState={isCallActive ? undefined : <StarterPrompts onSelect={(b) => setBrief(b)} />}
        onEngineReady={handleEngineReady}
        settings={settings}
        isAiDrawing={isAiDrawing}
        onLayersUpdate={(updatedLayers, activeId) => {
          setLayers([...updatedLayers]);
          setActiveLayerId(activeId);
        }}
      />

      <CallPanel
        isCallActive={isCallActive}
        isConnecting={isConnecting}
        isMuted={isMuted}
        isAiSpeaking={isAiSpeaking}
        isAiDrawing={isAiDrawing}
        statusMessage={statusMessage}
        transcripts={transcripts}
        brief={brief}
        onBriefChange={setBrief}
        recentBriefs={recent}
        onStartCall={startCall}
        onEndCall={endCall}
        onSaveBrief={saveBrief}
        onToggleMute={toggleMute}
        onSendText={sendPromptText}
        onOpenHistory={() => setIsHistoryOpen(true)}
        savedCount={savedSessions.length}
        steps={steps}
        document={pastedDoc}
        onDocumentChange={setPastedDoc}
        onSendDocument={sendDocument}
      />

      {board && (board.brief.goal || board.spec.items.length > 0) && (
        <StageBar
          board={board}
          onApprove={(stage, by) => changeStage({ op: 'approve_stage', stage, by })}
          onReopen={(stage) => changeStage({ op: 'reopen_stage', stage })}
          requirementCount={stageDocument(board, documentStage(board)).reduce((n, s) => n + s.items.length, 0) + (documentStage(board) === 'solution' ? board.spec.scenarios.length : 0)}
          specOpen={specOpen}
          onOpenProject={() => setProjectOpen(true)}
          onToggleSpec={() => {
            setDocStage(null);
            setSpecOpen(!specOpen);
          }}
        />
      )}

      {specOpen && board && (() => {
        const stage = docStage ?? documentStage(board);
        const reached = STAGES.filter((s) => s.n <= stageOf(board.stage.current).n && sectionsOf(s.id).length).map((s) => s.id);
        const connected = isCallActive && wsRef.current?.readyState === WebSocket.OPEN;
        const current = stage === board.stage.current;
        return (
          <StageDocument
            board={board}
            stage={stage}
            stages={reached}
            onSelectStage={(id) => setDocStage(id === documentStage(board) ? null : id)}
            documents={documents}
            onEdit={connected && current ? editDocument : undefined}
            readOnlyReason={!current ? 'Approved. Reopen the stage to edit it.' : !connected ? 'Start a call to edit the document.' : undefined}
            onClose={() => setSpecOpen(false)}
          />
        );
      })()}

      {projectOpen && board && board.stage.current === 'compile' && <CompileStudio board={board} onClose={() => setProjectOpen(false)} />}

      {/* Session History & Review Modal */}
      <SessionHistoryModal
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        onLoadSession={handleRestoreSession}
      />

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onUpdateSettings={handleUpdateSettings}
      />
    </main>
  );
}

/** Voice and level are remembered in this browser; everything else uses defaults. */
const PREFS_KEY = 'teolima.preferences';
const VOICE_NAMES: VoiceSettings['voiceName'][] = ['Kore', 'Zephyr', 'Charon', 'Puck', 'Fenrir'];

function loadPreferences(): Pick<VoiceSettings, 'voiceName' | 'level'> {
  const fallback = { voiceName: 'Kore' as const, level: 2 as const };
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}');
    return {
      voiceName: VOICE_NAMES.includes(p.voiceName) ? p.voiceName : fallback.voiceName,
      level: [1, 2, 3, 4].includes(p.level) ? p.level : fallback.level,
    };
  } catch {
    return fallback;
  }
}

function savePreferences(s: VoiceSettings) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ voiceName: s.voiceName, level: s.level }));
  } catch {
    // not remembered; the call still uses them
  }
}
