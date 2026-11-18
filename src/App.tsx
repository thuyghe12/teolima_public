/**
 * Teolima — Visual Multi-Agent Architecture Coach
 * Architecture:
 * - Sub-300ms duplex audio streaming with Gemini Multimodal Live API
 * - Real-time Tool Calling emitting JSON doodle drawing & writing payloads
 * - Rough.js animated progressive tweening loops via requestAnimationFrame
 * - Layer Management System (Visibility, Stacking, Lock, Opacity, AI Target Assignment)
 * - Undo/Redo Engine for AI & User Drawings
 * - Goal & Context Upload for non-tech builders
 * - Brand Design System: Light paper canvas, Ink, Volt accents, Nanum Pen Script doodles
 * - Supabase & local storage for post-call session archiving
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { getAccessToken } from './lib/access';
import { Whiteboard } from './components/Whiteboard';
import { CanvasToolbar } from './components/CanvasToolbar';
import { VoiceCallHUD } from './components/VoiceCallHUD';
import { SessionHistoryModal } from './components/SessionHistoryModal';
import { SettingsModal } from './components/SettingsModal';
import { LayerPanel } from './components/LayerPanel';
import { GoalContextModal } from './components/GoalContextModal';

import { CanvasEngine } from './lib/canvas/canvasEngine';
import { LiveAudioManager } from './lib/audio/audioManager';
import { getSavedSessions, saveSession } from './lib/supabase';
import {
  CallSession,
  CanvasElement,
  CanvasLayer,
  DrawingInstruction,
  LiveTranscriptItem,
  UserGoalProject,
  VoiceSettings,
  WSServerMessage
} from './types';

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

  // Focus mode
  const [isFocusMode, setIsFocusMode] = useState(false);

  // Goal & Context project
  const [currentGoal, setCurrentGoal] = useState<UserGoalProject | null>(null);
  const [isGoalModalOpen, setIsGoalModalOpen] = useState(false);

  // Session & Transcripts
  const [transcripts, setTranscripts] = useState<LiveTranscriptItem[]>([]);
  const [savedSessions, setSavedSessions] = useState<CallSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [sessionStartTime, setSessionStartTime] = useState<number>(0);
  const [statusMessage, setStatusMessage] = useState<string>('');

  // Modals
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Settings
  const [settings, setSettings] = useState<VoiceSettings>({
    voiceName: 'Kore',
    animationSpeed: 'normal',
    handDrawnRoughness: 1.4,
    defaultStrokeWidth: 2,
    soundEffects: true,
    canvasTheme: 'paper-dots',
    aiLayerId: 'layer-ai',
  });

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
      console.log('[App] Executing Coach Tool Call:', call.name, call.args);
      const instruction: DrawingInstruction = {
        tool: call.name as any,
        params: call.args || {},
      };
      engine.executeAIInstruction(instruction);
    }

    // Synchronize current whiteboard spatial layout back to Gemini session for spatial awareness
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      setTimeout(() => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && engine) {
          const summary = engine.getElementsSummary();
          wsRef.current.send(JSON.stringify({
            type: 'canvas_state_update',
            elements: summary,
          }));
        }
      }, 500);
    }
  }, [engine]);

  /**
   * Starts a Speech-to-Speech call session
   */
  const startCall = async (initialGoal?: UserGoalProject) => {
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
        console.log('[App] WebSocket opened, starting Live Coach session...');
        ws.send(JSON.stringify({
          type: 'start_call',
          voice: settings.voiceName,
        }));

        // Send goal context if provided
        const goalToUse = initialGoal || currentGoal;
        if (goalToUse) {
          setTimeout(() => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({
                type: 'set_goal_context',
                goal: goalToUse.goal,
                domain: goalToUse.domain,
                coachArchetype: goalToUse.coachArchetype,
                coachArchetypeDescription: goalToUse.coachArchetypeDescription,
                technicalLevel: goalToUse.technicalLevel,
                technicalLevelLabel: goalToUse.technicalLevelLabel,
                architecturalNotes: goalToUse.architecturalNotes,
                fileSnippet: goalToUse.fileContext?.textSnippet,
                fileName: goalToUse.fileContext?.name
              }));
            }
          }, 300);
        }

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
        setTranscripts([
          {
            id: 'sys-start',
            speaker: 'system',
            text: `Connected with Coach Teolima (${settings.voiceName}). Ready to architect your multi-agent system!`,
            timestamp: Date.now(),
          }
        ]);
      };

      ws.onmessage = (event) => {
        try {
          const data: WSServerMessage = JSON.parse(event.data);

          if (data.type === 'audio' && data.audio) {
            audio.playChunk(data.audio);
          } else if (data.type === 'interrupted') {
            console.log('[App] Interruption signal received, stopping audio playback');
            audio.interrupt();
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
              console.log('[App] Status update:', data.status.message);
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
        console.log('[App] WebSocket closed');
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
   * Ends the Speech-to-Speech call and archives session to Supabase/Local Storage
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
        title: currentGoal?.goal.slice(0, 45) || transcripts.find((t) => t.speaker === 'user')?.text.slice(0, 45) || 'Multi-Agent System Architecture',
        goal: currentGoal?.goal,
        domain: currentGoal?.domain,
        coachArchetype: currentGoal?.coachArchetype,
        technicalLevel: currentGoal?.technicalLevel,
        technicalLevelLabel: currentGoal?.technicalLevelLabel,
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

  const toggleCall = () => {
    if (isCallActive) {
      endCall();
    } else {
      startCall();
    }
  };

  const toggleMute = () => {
    if (!audioManager) return;
    const newMuted = !isMuted;
    audioManager.setMuted(newMuted);
    setIsMuted(newMuted);
  };

  /**
   * Captures snapshot of whiteboard and sends to Gemini Live API vision grounding
   */
  const captureVision = () => {
    if (!engine || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    const jpegBase64 = engine.captureSnapshot(0.85);
    wsRef.current.send(JSON.stringify({
      type: 'canvas_snapshot',
      image: jpegBase64,
    }));
    setTranscripts((prev) => [
      ...prev,
      {
        id: 'vision-' + Date.now(),
        speaker: 'system',
        text: '📸 Whiteboard snapshot shared with coach vision.',
        timestamp: Date.now(),
      }
    ]);
  };

  /**
   * Handle Starting a session from the Goal modal
   */
  const handleStartSessionWithGoal = (goalProject: UserGoalProject) => {
    setCurrentGoal(goalProject);
    if (!isCallActive) {
      startCall(goalProject);
    } else if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'set_goal_context',
        goal: goalProject.goal,
        domain: goalProject.domain,
        coachArchetype: goalProject.coachArchetype,
        coachArchetypeDescription: goalProject.coachArchetypeDescription,
        technicalLevel: goalProject.technicalLevel,
        technicalLevelLabel: goalProject.technicalLevelLabel,
        architecturalNotes: goalProject.architecturalNotes,
        fileSnippet: goalProject.fileContext?.textSnippet,
        fileName: goalProject.fileContext?.name
      }));
    }
  };

  /**
   * Sends prompt from suggestion pills (or triggers simulation if call not started yet)
   */
  const handleSelectPrompt = async (promptText: string) => {
    if (!isCallActive) {
      await startCall();
      setTimeout(() => {
        sendPromptText(promptText);
      }, 800);
    } else {
      sendPromptText(promptText);
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
    } else {
      // Offline / Simulation generator demo for multi-agent systems
      simulateMultiAgentArchitectResponse(text);
    }
  };

  /**
   * Offline interactive simulation for multi-agent architectures
   */
  const simulateMultiAgentArchitectResponse = (promptText: string) => {
    if (!engine) return;

    setIsAiSpeaking(true);
    setTimeout(() => {
      if (promptText.toLowerCase().includes('router') || promptText.toLowerCase().includes('swarm')) {
        engine.executeAIInstruction({
          tool: 'draw_doodle_writing',
          params: { text: 'Orchestrator Router Pattern', x: 260, y: 90, fontSize: 24, strokeColor: '#18181c', doodleStyle: 'highlight' }
        });
        engine.executeAIInstruction({
          tool: 'draw_agent_node',
          params: { id: 'user_in', label: 'User Request Intake', role: 'intake', x: 180, y: 220, tools: ['Chat UI', 'File Upload'] }
        });
        engine.executeAIInstruction({
          tool: 'draw_agent_node',
          params: { id: 'router', label: 'Triage Router Agent', role: 'orchestrator', x: 380, y: 220, subLabel: 'Classifies Intent', tools: ['Semantic Classifier'] }
        });
        engine.executeAIInstruction({
          tool: 'draw_agent_node',
          params: { id: 'worker_a', label: 'Research Specialist', role: 'worker', x: 600, y: 140, tools: ['Google Search', 'ArXiv API'] }
        });
        engine.executeAIInstruction({
          tool: 'draw_agent_node',
          params: { id: 'worker_b', label: 'Billing & Refund Bot', role: 'worker', x: 600, y: 300, tools: ['Stripe API', 'CRM Database'] }
        });
        engine.executeAIInstruction({
          tool: 'draw_agent_node',
          params: { id: 'human_gate', label: 'Human Manager Sign-off', role: 'human_in_loop', x: 820, y: 300, subLabel: 'Refund > $100' }
        });
        engine.executeAIInstruction({
          tool: 'draw_arrow',
          params: { fromX: 280, fromY: 220, toX: 380, toY: 220, label: 'Prompt' }
        });
        engine.executeAIInstruction({
          tool: 'draw_arrow',
          params: { fromX: 480, fromY: 200, toX: 600, toY: 150, label: 'Research' }
        });
        engine.executeAIInstruction({
          tool: 'draw_arrow',
          params: { fromX: 480, fromY: 240, toX: 600, toY: 290, label: 'Finance' }
        });
        engine.executeAIInstruction({
          tool: 'draw_arrow',
          params: { fromX: 700, fromY: 300, toX: 820, toY: 300, label: 'Review' }
        });
        engine.executeAIInstruction({
          tool: 'draw_callout',
          params: { text: 'Key choice: Single point of routing avoids token bloat!', x: 420, y: 380, width: 220, pointerDirection: 'up' }
        });
      } else if (promptText.toLowerCase().includes('memory') || promptText.toLowerCase().includes('vector')) {
        engine.executeAIInstruction({
          tool: 'draw_doodle_writing',
          params: { text: 'Short-Term vs Vector Memory Pipeline', x: 260, y: 90, fontSize: 24, strokeColor: '#18181c', doodleStyle: 'sparkle' }
        });
        engine.executeAIInstruction({
          tool: 'draw_agent_node',
          params: { id: 'agent_core', label: 'Synthesizer Agent', role: 'worker', x: 300, y: 220, tools: ['LLM Context'] }
        });
        engine.executeAIInstruction({
          tool: 'draw_agent_node',
          params: { id: 'vector_db', label: 'Pinecone / Vector DB', role: 'database', x: 560, y: 160, subLabel: 'Long-Term Embeddings' }
        });
        engine.executeAIInstruction({
          tool: 'draw_agent_node',
          params: { id: 'chat_history', label: 'Session State (Redis)', role: 'memory', x: 560, y: 280, subLabel: 'Last 10 turns' }
        });
        engine.executeAIInstruction({
          tool: 'draw_arrow',
          params: { fromX: 400, fromY: 200, toX: 560, toY: 170, label: 'Top-K Retrieval' }
        });
        engine.executeAIInstruction({
          tool: 'draw_arrow',
          params: { fromX: 400, fromY: 240, toX: 560, toY: 280, label: 'Save Turn' }
        });
      } else {
        engine.executeAIInstruction({
          tool: 'draw_doodle_writing',
          params: { text: promptText.slice(0, 35), x: 280, y: 120, fontSize: 22, strokeColor: '#18181c', doodleStyle: 'underline' }
        });
        engine.executeAIInstruction({
          tool: 'draw_agent_node',
          params: { id: 'demo_worker', label: 'Autonomous Worker', role: 'worker', x: 380, y: 240, tools: ['Tool Dispatcher'] }
        });
        engine.executeAIInstruction({
          tool: 'draw_agent_node',
          params: { id: 'demo_guard', label: 'Policy Guardrail', role: 'guardrail', x: 620, y: 240, subLabel: 'Zero Hallucinations' }
        });
        engine.executeAIInstruction({
          tool: 'draw_arrow',
          params: { fromX: 480, fromY: 240, toX: 620, toY: 240, label: 'Validate' }
        });
      }

      setTranscripts((prev) => [
        ...prev,
        {
          id: 'ai-sim-' + Date.now(),
          speaker: 'ai',
          text: `I have sketched out this architectural pattern for you. Notice the separation of responsibilities between your workers and safety guardrails!`,
          timestamp: Date.now(),
        }
      ]);
      setIsAiSpeaking(false);
    }, 500);
  };

  const handleRestoreSession = (session: CallSession) => {
    if (engine && session.elements) {
      engine.setElements(session.elements);
      if (session.goal) {
        setCurrentGoal({ goal: session.goal, domain: 'Restored Architecture' });
      }
    }
  };

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-[#fafafa] flex flex-col font-body text-[#18181c]">
      {/* Top Floating Canvas Toolbar */}
      <CanvasToolbar
        engine={engine}
        settings={settings}
        onUpdateSettings={handleUpdateSettings}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onToggleLayerPanel={() => setIsLayerPanelOpen(!isLayerPanelOpen)}
        isLayerPanelOpen={isLayerPanelOpen}
        layers={layers}
        activeLayerId={activeLayerId}
        isFocusMode={isFocusMode}
        onToggleFocusMode={() => setIsFocusMode(!isFocusMode)}
        onOpenGoalModal={() => setIsGoalModalOpen(true)}
        activeGoal={currentGoal?.goal}
        onSelectPrompt={handleSelectPrompt}
        isCallActive={isCallActive}
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
        onEngineReady={handleEngineReady}
        settings={settings}
        isAiDrawing={isAiDrawing}
        onLayersUpdate={(updatedLayers, activeId) => {
          setLayers([...updatedLayers]);
          setActiveLayerId(activeId);
        }}
      />

      {/* Real-time Voice Call HUD (Audio visualizer, mic mute, snapshot, live subtitles) */}
      <VoiceCallHUD
        isCallActive={isCallActive}
        onToggleCall={toggleCall}
        isMuted={isMuted}
        onToggleMute={toggleMute}
        inputVolume={inputVolume}
        outputVolume={outputVolume}
        isAiSpeaking={isAiSpeaking}
        isAiDrawing={isAiDrawing}
        transcripts={transcripts}
        onCaptureVision={captureVision}
        onOpenHistory={() => setIsHistoryOpen(true)}
        savedCount={savedSessions.length}
        settings={settings}
        onUpdateSettings={handleUpdateSettings}
        statusMessage={statusMessage}
        isConnecting={isConnecting}
        onSendTextMessage={sendPromptText}
        activeGoal={currentGoal?.goal}
      />

      {/* Goal & Context File Upload Modal */}
      <GoalContextModal
        isOpen={isGoalModalOpen}
        onClose={() => setIsGoalModalOpen(false)}
        onStartSessionWithGoal={handleStartSessionWithGoal}
        currentGoal={currentGoal?.goal}
      />

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
