import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { CoachLevel, VoiceSettings } from '../types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: VoiceSettings;
  onUpdateSettings: (settings: Partial<VoiceSettings>) => void;
}

const VOICES: Array<{ id: VoiceSettings['voiceName']; desc: string }> = [
  { id: 'Kore', desc: 'Female, firm' },
  { id: 'Zephyr', desc: 'Female, bright' },
  { id: 'Charon', desc: 'Male, informative' },
  { id: 'Puck', desc: 'Male, upbeat' },
  { id: 'Fenrir', desc: 'Male, excitable' },
];

/** Mirrors the levels in server/prompts/coach.ts. */
const LEVELS: Array<{ id: CoachLevel; label: string; desc: string }> = [
  { id: 1, label: 'New to AI', desc: 'Plain language, every element explained' },
  { id: 2, label: 'Familiar with LLMs', desc: 'Focus on how the work is split' },
  { id: 3, label: 'AI engineer', desc: 'Orchestration patterns, tools, evaluation' },
  { id: 4, label: 'Architect', desc: 'Failure handling, latency, cost' },
];

const row = (active: boolean) =>
  `w-full flex items-center justify-between px-3 py-2.5 rounded-lg border text-left transition-colors ${
    active ? 'border-[#18181c] bg-[#fafafa]' : 'border-[#e2e2e6] hover:border-[#a1a0a8]'
  }`;

const Radio: React.FC<{ on: boolean }> = ({ on }) => (
  <span aria-hidden className={`w-3.5 h-3.5 rounded-full border ${on ? 'border-[#18181c] border-[4px]' : 'border-[#a1a0a8]'}`} />
);

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, settings, onUpdateSettings }) => {
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/20" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        className="w-full max-w-md bg-white rounded-2xl border border-[#e2e2e6] shadow-xl text-[#18181c] font-body"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#f0f0f2]">
          <h2 id="settings-title" className="text-base font-semibold">Settings</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-[#5a5a62] hover:bg-[#f0f0f2]" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-5 max-h-[75vh] overflow-y-auto">
          <fieldset>
            <legend className="text-sm font-medium mb-2">Coach voice</legend>
            <div className="space-y-1.5">
              {VOICES.map((v) => (
                <button key={v.id} role="radio" aria-checked={settings.voiceName === v.id} onClick={() => onUpdateSettings({ voiceName: v.id })} className={row(settings.voiceName === v.id)}>
                  <span className="text-sm">
                    {v.id} <span className="text-[#87868e]">· {v.desc}</span>
                  </span>
                  <Radio on={settings.voiceName === v.id} />
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-[#87868e]">Applies from the next call.</p>
          </fieldset>

          <fieldset>
            <legend className="text-sm font-medium mb-2">How the coach explains</legend>
            <div className="space-y-1.5">
              {LEVELS.map((l) => (
                <button key={l.id} role="radio" aria-checked={settings.level === l.id} onClick={() => onUpdateSettings({ level: l.id })} className={row(settings.level === l.id)}>
                  <span className="text-sm">
                    {l.label} <span className="text-[#87868e]">· {l.desc}</span>
                  </span>
                  <Radio on={settings.level === l.id} />
                </button>
              ))}
            </div>
          </fieldset>
        </div>
      </div>
    </div>
  );
};
