import React, { useEffect, useState } from 'react';
import {
  Phone,
  PhoneOff,
  Mic,
  MicOff,
  Sparkles,
  Camera,
  Volume2,
  Activity,
  ChevronUp,
  ChevronDown,
  Clock,
  Radio,
  History,
  Send,
  Bot,
  MessageSquare,
  Keyboard,
  X
} from 'lucide-react';
import { LiveTranscriptItem, VoiceSettings } from '../types';

interface VoiceCallHUDProps {
  isCallActive: boolean;
  onToggleCall: () => void;
  isMuted: boolean;
  onToggleMute: () => void;
  inputVolume: number;
  outputVolume: number;
  isAiSpeaking: boolean;
  isAiDrawing: boolean;
  transcripts: LiveTranscriptItem[];
  onCaptureVision: () => void;
  onOpenHistory: () => void;
  savedCount: number;
  settings: VoiceSettings;
  onUpdateSettings: (settings: Partial<VoiceSettings>) => void;
  statusMessage?: string;
  isConnecting?: boolean;
  onSendTextMessage?: (text: string) => void;
  activeGoal?: string;
}

export const VoiceCallHUD: React.FC<VoiceCallHUDProps> = ({
  isCallActive,
  onToggleCall,
  isMuted,
  onToggleMute,
  inputVolume,
  outputVolume,
  isAiSpeaking,
  isAiDrawing,
  transcripts,
  onCaptureVision,
  onOpenHistory,
  savedCount,
  settings,
  onUpdateSettings,
  statusMessage,
  isConnecting,
  onSendTextMessage,
  activeGoal
}) => {
  const [callDuration, setCallDuration] = useState(0);
  const [isExpanded, setIsExpanded] = useState(true);
  const [isTextInputOpen, setIsTextInputOpen] = useState(false);
  const [typedPrompt, setTypedPrompt] = useState('');

  // Call duration timer
  useEffect(() => {
    let timer: any = null;
    if (isCallActive) {
      timer = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);
    } else {
      setCallDuration(0);
    }
    return () => clearInterval(timer);
  }, [isCallActive]);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const latestTranscript = transcripts[transcripts.length - 1];

  const handleSendText = (e: React.FormEvent) => {
    e.preventDefault();
    if (!typedPrompt.trim() || !onSendTextMessage) return;
    onSendTextMessage(typedPrompt.trim());
    setTypedPrompt('');
  };

  return (
    <div
      id="voice-call-hud-container"
      className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-3 pointer-events-none"
    >
      {/* Transcript Subtitle Banner (when speaking) */}
      {isCallActive && latestTranscript && (
        <div
          id="live-transcript-card"
          className="pointer-events-auto max-w-md w-full p-4 rounded-2xl bg-white/95 border border-[#e2e2e6] shadow-xl backdrop-blur-md text-[#18181c] transition-all transform animate-in fade-in slide-in-from-bottom-2"
        >
          <div className="flex items-center justify-between text-[11px] font-mono-code font-bold uppercase tracking-wider mb-1.5">
            <span className="flex items-center gap-1.5">
              {latestTranscript.speaker === 'ai' ? (
                <span className="text-[#18181c] flex items-center gap-1 bg-[#c8f13a] px-2 py-0.5 rounded-md">
                  <Sparkles className="w-3 h-3 text-[#18181c]" /> Coach Teolima ({settings.voiceName})
                </span>
              ) : latestTranscript.speaker === 'system' ? (
                <span className="text-[#18181c] flex items-center gap-1 bg-[#f0f0f2] px-2 py-0.5 rounded-md">
                  <Sparkles className="w-3 h-3 text-[#5a5a62]" /> Teolima
                </span>
              ) : (
                <span className="text-[#18181c] flex items-center gap-1 bg-[#f0f0f2] px-2 py-0.5 rounded-md">
                  <Mic className="w-3 h-3 text-[#5a5a62]" /> You
                </span>
              )}
            </span>
            <span className="text-[#87868e] text-[10px]">Real-Time Transcript</span>
          </div>
          <p className="text-sm font-medium leading-relaxed line-clamp-3 text-[#18181c] font-body">
            "{latestTranscript.text}"
          </p>
        </div>
      )}

      {/* Main Voice Call Controller Dock */}
      <div
        id="voice-call-dock"
        className="pointer-events-auto flex flex-col p-4 rounded-3xl bg-white/95 text-[#18181c] shadow-2xl border border-[#e2e2e6] backdrop-blur-xl transition-all w-84"
      >
        {/* Header Bar */}
        <div className="flex items-center justify-between px-1 mb-3">
          <div className="flex items-center gap-2">
            <div className="relative flex items-center justify-center">
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  isCallActive
                    ? isAiSpeaking
                      ? 'bg-[#c8f13a] animate-ping'
                      : 'bg-emerald-500'
                    : 'bg-[#e2e2e6]'
                }`}
              />
              <span
                className={`absolute w-2 h-2 rounded-full ${
                  isCallActive ? (isAiSpeaking ? 'bg-[#c8f13a]' : 'bg-emerald-500') : 'bg-[#87868e]'
                }`}
              />
            </div>
            <span className="text-xs font-bold font-mono-code tracking-tight text-[#18181c]">
              {isCallActive
                ? statusMessage?.startsWith('Demo mode')
                  ? 'Demo Replay'
                  : isAiDrawing
                  ? '⚡ Coach Doodling Architecture'
                  : isAiSpeaking
                  ? '⚡ Coach Explaining'
                  : isMuted
                  ? 'Mic Muted'
                  : 'Coach Listening'
                : 'Ready for Call'}
            </span>
          </div>

          <div className="flex items-center gap-1">
            {isCallActive && (
              <span className="text-[11px] font-mono-code px-2 py-0.5 rounded-full bg-[#f0f0f2] text-[#5a5a62]">
                {formatDuration(callDuration)}
              </span>
            )}
            <button
              id="btn-toggle-hud-expand"
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-1 rounded-lg text-[#87868e] hover:text-[#18181c] hover:bg-[#f0f0f2] transition-all"
            >
              {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Status Message */}
        {statusMessage && (
          <div className="text-[11px] text-[#5a5a62] px-2 py-1 rounded-lg bg-[#f0f0f2] mb-3 font-mono-code">
            {statusMessage}
          </div>
        )}

        {isExpanded && (
          <>
            {/* Audio Waveform / Activity Meter */}
            <div className="flex items-center justify-center gap-1.5 h-8 px-3 rounded-2xl bg-[#fafafa] border border-[#e2e2e6] mb-3 relative">
              {isCallActive ? (
                <>
                  <div className="flex items-center gap-1.5 flex-1 justify-center">
                    {Array.from({ length: 14 }).map((_, i) => {
                      const vol = isAiSpeaking ? outputVolume : isMuted ? 0 : inputVolume;
                      const randomOffset = Math.sin(i * 0.8 + performance.now() / 200) * 0.4;
                      const barHeight = Math.max(4, Math.min(24, (vol * 1.5 + randomOffset) * 24));
                      return (
                        <div
                          key={i}
                          className={`w-1 rounded-full transition-all duration-75 ${
                            isAiSpeaking
                              ? 'bg-[#18181c]'
                              : vol > 0.05
                              ? 'bg-[#059669]'
                              : 'bg-[#e2e2e6]'
                          }`}
                          style={{ height: `${barHeight}px` }}
                        />
                      );
                    })}
                  </div>
                  {onSendTextMessage && (
                    <button
                      type="button"
                      id="btn-toggle-text-input"
                      onClick={() => setIsTextInputOpen(!isTextInputOpen)}
                      title={isTextInputOpen ? 'Hide text prompt' : 'Type text prompt'}
                      className={`p-1.5 rounded-lg text-xs transition-colors shrink-0 ${
                        isTextInputOpen
                          ? 'bg-[#18181c] text-[#c8f13a]'
                          : 'text-[#87868e] hover:text-[#18181c] hover:bg-[#e2e2e6]'
                      }`}
                    >
                      <Keyboard className="w-3.5 h-3.5" />
                    </button>
                  )}
                </>
              ) : (
                <span className="text-xs text-[#87868e] font-mono-code flex items-center gap-1.5">
                  <Radio className="w-3.5 h-3.5" /> Start duplex audio to brainstorm
                </span>
              )}
            </div>

            {/* Quick Typed Prompt Input (collapsed by default, toggled via keyboard icon) */}
            {isCallActive && onSendTextMessage && isTextInputOpen && (
              <form onSubmit={handleSendText} className="flex items-center gap-1.5 mb-3 animate-in fade-in slide-in-from-top-1 duration-150">
                <input
                  type="text"
                  value={typedPrompt}
                  onChange={(e) => setTypedPrompt(e.target.value)}
                  placeholder="Type a question or note..."
                  autoFocus
                  className="flex-1 px-3 py-1.5 rounded-xl bg-[#fafafa] border border-[#e2e2e6] text-xs text-[#18181c] placeholder:text-[#87868e] focus:outline-none focus:ring-1 focus:ring-[#18181c]"
                />
                <button
                  type="submit"
                  disabled={!typedPrompt.trim()}
                  className="p-1.5 rounded-xl bg-[#18181c] text-white hover:bg-black disabled:opacity-40 transition-all text-xs"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setIsTextInputOpen(false)}
                  title="Close text input"
                  className="p-1.5 rounded-xl text-[#87868e] hover:text-[#18181c] hover:bg-[#f0f0f2] transition-all text-xs"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </form>
            )}
          </>
        )}

        {/* Primary Call Controls */}
        <div className="flex items-center justify-between gap-2 pt-1 border-t border-[#e2e2e6]">
          {/* Mute Button */}
          <button
            id="btn-toggle-mic-mute"
            onClick={onToggleMute}
            disabled={!isCallActive}
            title={isMuted ? 'Unmute Microphone' : 'Mute Microphone'}
            className={`p-3 rounded-2xl transition-all ${
              !isCallActive
                ? 'opacity-40 cursor-not-allowed bg-[#f0f0f2] text-[#87868e]'
                : isMuted
                ? 'bg-rose-50 border border-rose-200 text-rose-600'
                : 'bg-[#f0f0f2] hover:bg-[#e2e2e6] text-[#18181c]'
            }`}
          >
            {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>

          {/* Vision Capture Button */}
          <button
            id="btn-capture-vision"
            onClick={onCaptureVision}
            disabled={!isCallActive}
            title="Send Whiteboard Visual Snapshot to AI"
            className={`p-3 rounded-2xl transition-all ${
              !isCallActive
                ? 'opacity-40 cursor-not-allowed bg-[#f0f0f2] text-[#87868e]'
                : 'bg-[#f0f0f2] hover:bg-[#e2e2e6] text-[#18181c]'
            }`}
          >
            <Camera className="w-4 h-4" />
          </button>

          {/* Session History Button */}
          <button
            id="btn-open-session-history"
            onClick={onOpenHistory}
            title="Saved Architecture Sessions"
            className="p-3 rounded-2xl bg-[#f0f0f2] hover:bg-[#e2e2e6] text-[#18181c] transition-all relative"
          >
            <History className="w-4 h-4" />
            {savedCount > 0 && (
              <span className="absolute -top-1 -right-1 px-1.5 py-0.2 rounded-full text-[9px] font-mono-code bg-[#18181c] text-white">
                {savedCount}
              </span>
            )}
          </button>

          {/* Main Call Start / End Button */}
          <button
            id="btn-toggle-speech-call"
            onClick={onToggleCall}
            disabled={isConnecting}
            className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-2xl font-bold text-xs font-mono-code tracking-wide shadow-md transition-all active:scale-95 ${
              isCallActive
                ? 'bg-[#e11d48] text-white hover:bg-rose-700'
                : isConnecting
                ? 'bg-[#18181c] text-white opacity-80 cursor-wait'
                : 'bg-[#18181c] text-white hover:bg-black'
            }`}
          >
            {isCallActive ? (
              <>
                <PhoneOff className="w-4 h-4" />
                <span>END CALL</span>
              </>
            ) : isConnecting ? (
              <>
                <Sparkles className="w-4 h-4 text-[#c8f13a] animate-spin" />
                <span>CONNECTING...</span>
              </>
            ) : (
              <>
                <Phone className="w-4 h-4 text-[#c8f13a]" />
                <span>START CALL</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
