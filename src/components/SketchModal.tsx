import React, { useState } from 'react';
import { Sparkles, X, Image as ImageIcon, Wand2, Loader2, Check } from 'lucide-react';
import { CanvasEngine } from '../lib/canvas/canvasEngine';

interface SketchModalProps {
  isOpen: boolean;
  onClose: () => void;
  engine: CanvasEngine | null;
}

const PRESET_METAPHORS = [
  {
    title: 'Chef Orchestrator',
    desc: 'Executive chef directing specialized line cooks',
    prompt: 'An executive head chef in uniform delegating dishes to worker line cooks in a modern kitchen',
    caption: 'Orchestrator Kitchen Metaphor',
  },
  {
    title: 'Bank Vault Guardrail',
    desc: 'Secure vault door with biometric lock',
    prompt: 'A secure high-tech bank vault door with safety locks and verification scanners',
    caption: 'Safety & Guardrail Gate',
  },
  {
    title: 'Vector Filing Archive',
    desc: 'Automated retrieval filing cabinets',
    prompt: 'A neat architectural library archive with indexed filing drawers and glowing search queries',
    caption: 'Vector Memory DB Archive',
  },
  {
    title: 'Radar Tower Dispatcher',
    desc: 'Air traffic control router dispatching flights',
    prompt: 'An air traffic control tower radar screen routing multiple airplane paths',
    caption: 'Router & Dispatcher Metaphor',
  },
  {
    title: 'Human Review Gate',
    desc: 'Executive signature approval checkpoint',
    prompt: 'A sleek executive desk with an approval seal stamp and digital signature pad',
    caption: 'Human-in-the-Loop Gate',
  },
];

export const SketchModal: React.FC<SketchModalProps> = ({ isOpen, onClose, engine }) => {
  const [prompt, setPrompt] = useState('');
  const [caption, setCaption] = useState('');
  const [aspectRatio, setAspectRatio] = useState<'1:1' | '4:3' | '16:9'>('4:3');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleGenerate = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!prompt.trim() || isGenerating || !engine) return;

    setIsGenerating(true);
    setError(null);

    try {
      const response = await fetch('/api/generate-sketch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: prompt.trim(),
          caption: caption.trim() || prompt.trim().slice(0, 36),
          aspectRatio,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to generate sketch: ${response.statusText}`);
      }

      const data = await response.json();
      if (data.imageUrl) {
        // Place on canvas with subtle spring motion
        engine.addSketchImageElement({
          imageUrl: data.imageUrl,
          caption: data.caption || caption || prompt,
          prompt,
          aspectRatio,
          author: 'user',
        });
        onClose();
        setPrompt('');
        setCaption('');
      } else {
        throw new Error('No image returned from generation service');
      }
    } catch (err: any) {
      console.error('[SketchModal] Generation error:', err);
      setError(err.message || 'Failed to sketch illustration');
    } finally {
      setIsGenerating(false);
    }
  };

  const applyPreset = (preset: typeof PRESET_METAPHORS[0]) => {
    setPrompt(preset.prompt);
    setCaption(preset.caption);
  };

  return (
    <div
      id="sketch-illustration-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isGenerating) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-2xl bg-white border border-[#e2e2e6] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#e2e2e6] bg-[#fafafa]">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-[#c8f13a] text-[#18181c]">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-semibold text-sm text-[#18181c]">Brand Sketch Illustration</h3>
              <p className="text-[11px] font-mono-code text-[#5a5a62]">Iconic hand-drawn visual metaphors</p>
            </div>
          </div>
          <button
            id="close-sketch-modal-btn"
            onClick={onClose}
            disabled={isGenerating}
            className="p-1 rounded-lg text-[#5a5a62] hover:text-[#18181c] hover:bg-[#f0f0f2] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleGenerate} className="p-5 flex flex-col gap-4">
          {/* Preset Quick Picks */}
          <div>
            <label className="block text-[11px] font-mono-code uppercase font-semibold text-[#87868e] mb-1.5">
              Quick Metaphor Presets
            </label>
            <div className="flex flex-wrap gap-1.5">
              {PRESET_METAPHORS.map((item) => (
                <button
                  type="button"
                  key={item.title}
                  onClick={() => applyPreset(item)}
                  className={`text-xs px-2.5 py-1 rounded-lg border transition-all ${
                    prompt === item.prompt
                      ? 'bg-[#18181c] text-white border-[#18181c]'
                      : 'bg-[#f5f5f7] hover:bg-[#ebebee] text-[#18181c] border-[#e2e2e6]'
                  }`}
                >
                  {item.title}
                </button>
              ))}
            </div>
          </div>

          {/* Prompt */}
          <div>
            <label className="block text-[11px] font-mono-code uppercase font-semibold text-[#87868e] mb-1">
              Scene Description
            </label>
            <textarea
              id="sketch-prompt-input"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g., An executive chef orchestrating worker line cooks..."
              rows={2}
              className="w-full px-3 py-2 text-sm rounded-xl border border-[#e2e2e6] focus:border-[#18181c] focus:ring-1 focus:ring-[#18181c] outline-hidden resize-none"
              required
            />
          </div>

          {/* Caption */}
          <div>
            <label className="block text-[11px] font-mono-code uppercase font-semibold text-[#87868e] mb-1">
              Handwritten Card Caption (Optional)
            </label>
            <input
              id="sketch-caption-input"
              type="text"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="e.g., Orchestrator Kitchen Metaphor"
              className="w-full px-3 py-2 text-sm rounded-xl border border-[#e2e2e6] focus:border-[#18181c] focus:ring-1 focus:ring-[#18181c] outline-hidden"
            />
          </div>

          {/* Aspect Ratio Selector */}
          <div>
            <label className="block text-[11px] font-mono-code uppercase font-semibold text-[#87868e] mb-1">
              Frame Aspect Ratio
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(['4:3', '1:1', '16:9'] as const).map((ratio) => (
                <button
                  type="button"
                  key={ratio}
                  onClick={() => setAspectRatio(ratio)}
                  className={`py-1.5 text-xs font-mono-code font-medium rounded-xl border text-center transition-all ${
                    aspectRatio === ratio
                      ? 'bg-[#18181c] text-[#c8f13a] border-[#18181c]'
                      : 'bg-white hover:bg-[#f5f5f7] text-[#5a5a62] border-[#e2e2e6]'
                  }`}
                >
                  {ratio}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <p className="text-xs text-red-600 font-mono-code bg-red-50 p-2 rounded-lg border border-red-200">
              {error}
            </p>
          )}

          {/* Submit */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#e2e2e6]">
            <button
              type="button"
              onClick={onClose}
              disabled={isGenerating}
              className="px-3 py-1.5 text-xs font-medium text-[#5a5a62] hover:text-[#18181c] hover:bg-[#f0f0f2] rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              id="submit-sketch-btn"
              type="submit"
              disabled={!prompt.trim() || isGenerating}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl bg-[#c8f13a] text-[#18181c] border border-[#18181c]/10 hover:brightness-105 active:scale-95 disabled:opacity-50 disabled:pointer-events-none transition-all shadow-sm"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Sketching Visual...</span>
                </>
              ) : (
                <>
                  <Wand2 className="w-3.5 h-3.5" />
                  <span>Add Sketch to Board</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
