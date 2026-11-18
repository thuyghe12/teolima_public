import React, { useState } from 'react';
import { VoiceSettings } from '../types';
import { setSupabaseCredentials } from '../lib/supabase';
import { X, Sliders, Volume2, Palette, Zap, Database, Check, Sparkles } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: VoiceSettings;
  onUpdateSettings: (settings: Partial<VoiceSettings>) => void;
}

const VOICES: Array<{ id: 'Zephyr' | 'Puck' | 'Charon' | 'Kore' | 'Fenrir'; label: string; desc: string }> = [
  { id: 'Kore', label: 'Kore', desc: 'Female, firm and clear' },
  { id: 'Zephyr', label: 'Zephyr', desc: 'Female, bright' },
  { id: 'Puck', label: 'Puck', desc: 'Male, upbeat' },
  { id: 'Charon', label: 'Charon', desc: 'Male, informative' },
  { id: 'Fenrir', label: 'Fenrir', desc: 'Male, excitable' },
];

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
}) => {
  const [supabaseUrl, setSupabaseUrl] = useState(localStorage.getItem('supabase_url') || '');
  const [supabaseKey, setSupabaseKey] = useState(localStorage.getItem('supabase_anon_key') || '');
  const [savedSupabase, setSavedSupabase] = useState(false);

  if (!isOpen) return null;

  const handleSaveSupabase = (e: React.FormEvent) => {
    e.preventDefault();
    setSupabaseCredentials(supabaseUrl.trim(), supabaseKey.trim());
    setSavedSupabase(true);
    setTimeout(() => setSavedSupabase(false), 2000);
  };

  return (
    <div
      id="settings-modal-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in"
      onClick={onClose}
    >
      <div
        id="settings-modal-card"
        className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-[#e2e2e6] overflow-hidden text-[#18181c]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-[#e2e2e6] bg-[#fafafa]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-2xl bg-[#c8f13a] text-[#18181c] border border-[#18181c]/10 shadow-sm">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <div className="eyebrow text-[#87868e]">System Config</div>
              <h2 className="text-lg font-bold text-[#18181c] tracking-tight">Coach Voice & Drawing Engine</h2>
            </div>
          </div>

          <button
            id="btn-close-settings-modal"
            onClick={onClose}
            className="p-2 rounded-full hover:bg-[#f0f0f2] text-[#5a5a62] hover:text-[#18181c] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
          {/* Voice Model Selection */}
          <div className="space-y-2">
            <label className="flex items-center gap-1.5 text-xs font-mono-code font-bold uppercase tracking-wider text-[#18181c]">
              <Volume2 className="w-3.5 h-3.5 text-[#18181c]" />
              <span>Coach Voice Persona</span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {VOICES.map((v) => (
                <button
                  key={v.id}
                  onClick={() => onUpdateSettings({ voiceName: v.id })}
                  className={`flex flex-col items-start p-3 rounded-2xl border text-left transition-all ${
                    settings.voiceName === v.id
                      ? 'border-[#18181c] bg-[#f0f0f2] ring-2 ring-[#c8f13a] text-[#18181c]'
                      : 'border-[#e2e2e6] hover:border-[#18181c]/40 bg-[#fafafa] hover:bg-[#f0f0f2] text-[#5a5a62]'
                  }`}
                >
                  <span className="text-sm font-bold text-[#18181c] font-body">{v.label}</span>
                  <span className="text-[11px] text-[#5a5a62]">{v.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Rough.js Hand-Drawn Roughness */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-1.5 text-xs font-mono-code font-bold uppercase tracking-wider text-[#18181c]">
                <Palette className="w-3.5 h-3.5 text-[#18181c]" />
                <span>Hand-Drawn Sketch Roughness</span>
              </label>
              <span className="text-xs font-mono-code font-bold text-[#18181c]">
                {settings.handDrawnRoughness}x
              </span>
            </div>
            <input
              type="range"
              min="0.4"
              max="2.8"
              step="0.2"
              value={settings.handDrawnRoughness}
              onChange={(e) => onUpdateSettings({ handDrawnRoughness: parseFloat(e.target.value) })}
              className="w-full h-2 bg-[#e2e2e6] rounded-lg appearance-none cursor-pointer accent-[#18181c]"
            />
            <div className="flex justify-between text-[10px] font-mono-code text-[#87868e]">
              <span>Crisp Line</span>
              <span>Natural Sketch (Recommended)</span>
              <span>Wobbly Doodle</span>
            </div>
          </div>

          {/* Animation Speed */}
          <div className="space-y-2">
            <label className="flex items-center gap-1.5 text-xs font-mono-code font-bold uppercase tracking-wider text-[#18181c]">
              <Zap className="w-3.5 h-3.5 text-[#18181c]" />
              <span>Doodle Animation Speed</span>
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(['slow', 'normal', 'fast'] as const).map((spd) => (
                <button
                  key={spd}
                  onClick={() => onUpdateSettings({ animationSpeed: spd })}
                  className={`py-2 rounded-xl text-xs font-semibold uppercase tracking-wide border transition-all ${
                    settings.animationSpeed === spd
                      ? 'bg-[#18181c] text-white border-[#18181c]'
                      : 'bg-[#fafafa] hover:bg-[#f0f0f2] border-[#e2e2e6] text-[#5a5a62]'
                  }`}
                >
                  {spd}
                </button>
              ))}
            </div>
          </div>

          {/* Supabase Storage Integration (Optional) */}
          <div className="pt-4 border-t border-[#e2e2e6] space-y-3">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-1.5 text-xs font-mono-code font-bold uppercase tracking-wider text-[#18181c]">
                <Database className="w-3.5 h-3.5 text-[#18181c]" />
                <span>Supabase Session Cloud Sync</span>
              </label>
              <span className="text-[10px] text-[#87868e]">Optional</span>
            </div>

            <form onSubmit={handleSaveSupabase} className="space-y-2">
              <input
                type="text"
                placeholder="https://your-project.supabase.co"
                value={supabaseUrl}
                onChange={(e) => setSupabaseUrl(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl bg-[#fafafa] border border-[#e2e2e6] text-xs text-[#18181c] placeholder:text-[#87868e] focus:outline-none focus:ring-1 focus:ring-[#18181c]"
              />
              <input
                type="password"
                placeholder="Anon public API key"
                value={supabaseKey}
                onChange={(e) => setSupabaseKey(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl bg-[#fafafa] border border-[#e2e2e6] text-xs text-[#18181c] placeholder:text-[#87868e] focus:outline-none focus:ring-1 focus:ring-[#18181c]"
              />
              <div className="flex justify-end pt-1">
                <button
                  type="submit"
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#18181c] hover:bg-black text-white text-xs font-semibold transition-all shadow-sm"
                >
                  {savedSupabase ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-[#c8f13a]" />
                      <span>Saved!</span>
                    </>
                  ) : (
                    <span>Save Sync Credentials</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};
