import React, { useEffect, useRef, useState } from 'react';
import { CanvasEngine } from '../lib/canvas/canvasEngine';
import { CanvasLayer, VoiceSettings } from '../types';
import { ConfirmationModal } from './ConfirmationModal';
import {
  Download,
  Eraser,
  Hand,
  Highlighter,
  Layers,
  MoreHorizontal,
  MousePointer2,
  Pencil,
  Redo2,
  Settings2,
  Trash2,
  Type,
  Undo2,
} from 'lucide-react';

type UserTool = 'pan' | 'select' | 'pencil' | 'highlighter' | 'text' | 'eraser';

interface CanvasToolbarProps {
  engine: CanvasEngine | null;
  settings: VoiceSettings;
  onUpdateSettings: (settings: Partial<VoiceSettings>) => void;
  onOpenSettings: () => void;
  onToggleLayerPanel: () => void;
  isLayerPanelOpen: boolean;
  /** Clears the board through the board model. */
  onClearBoard: () => void;
}

const TOOLS: Array<{ id: UserTool; label: string; key: string; icon: React.ReactNode }> = [
  { id: 'pan', label: 'Move around', key: 'H', icon: <Hand className="w-4 h-4" /> },
  { id: 'select', label: 'Select', key: 'V', icon: <MousePointer2 className="w-4 h-4" /> },
  { id: 'pencil', label: 'Pen', key: 'P', icon: <Pencil className="w-4 h-4" /> },
  { id: 'highlighter', label: 'Highlighter', key: 'M', icon: <Highlighter className="w-4 h-4" /> },
  { id: 'text', label: 'Text', key: 'T', icon: <Type className="w-4 h-4" /> },
  { id: 'eraser', label: 'Eraser', key: 'E', icon: <Eraser className="w-4 h-4" /> },
];

const BACKGROUNDS: Array<{ id: VoiceSettings['canvasTheme']; label: string }> = [
  { id: 'paper-dots', label: 'Dots' },
  { id: 'paper-grid', label: 'Grid' },
  { id: 'paper', label: 'Plain' },
];

const iconButton = (active: boolean) =>
  `flex items-center justify-center w-9 h-9 rounded-xl transition-colors ${
    active ? 'bg-[#18181c] text-white' : 'text-[#5a5a62] hover:bg-[#f0f0f2] hover:text-[#18181c]'
  }`;

/**
 * The canvas toolbar: navigation and annotation tools, undo and redo, export,
 * and one menu for everything else. Moving around is the default tool, so a
 * tablet user can pan and zoom without drawing by accident.
 */
export const CanvasToolbar: React.FC<CanvasToolbarProps> = ({
  engine,
  settings,
  onUpdateSettings,
  onOpenSettings,
  onToggleLayerPanel,
  isLayerPanelOpen,
  onClearBoard,
}) => {
  const [tool, setTool] = useState<UserTool>('pan');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isClearConfirmOpen, setIsClearConfirmOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const selectTool = (next: UserTool) => {
    setTool(next);
    if (engine) engine.userTool = next;
  };

  useEffect(() => {
    if (engine) engine.userTool = tool;
  }, [engine]); // eslint-disable-line react-hooks/exhaustive-deps

  // keyboard shortcuts, ignored while typing
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const match = TOOLS.find((t) => t.key.toLowerCase() === e.key.toLowerCase());
      if (match) selectTool(match.id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [engine]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isMenuOpen) return;
    const onDown = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setIsMenuOpen(false);
    };
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, [isMenuOpen]);

  const handleExport = () => {
    if (!engine) return;
    const a = document.createElement('a');
    a.href = engine.exportImage();
    a.download = `teolima-board-${Date.now()}.png`;
    a.click();
  };

  const setBackground = (id: VoiceSettings['canvasTheme']) => {
    onUpdateSettings({ canvasTheme: id });
    if (engine) engine.settings.canvasTheme = id;
  };

  const menuItem = 'flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-sm text-left text-[#18181c] hover:bg-[#f0f0f2]';

  return (
    <div
      id="main-canvas-toolbar"
      className="absolute top-[var(--toolbar-top,16px)] left-1/2 -translate-x-1/2 z-30 flex items-center gap-1 p-1 rounded-2xl bg-white/95 shadow-lg shadow-black/5 border border-[#e2e2e6] backdrop-blur-xl"
    >
      {TOOLS.map((t) => (
        <button
          key={t.id}
          id={`tool-${t.id}`}
          onClick={() => selectTool(t.id)}
          className={iconButton(tool === t.id)}
          title={`${t.label} (${t.key})`}
          aria-label={t.label}
          aria-pressed={tool === t.id}
        >
          {t.icon}
        </button>
      ))}

      <div className="w-px h-6 bg-[#e2e2e6] mx-1" />

      <button onClick={() => engine?.undo()} className={iconButton(false)} title="Undo (Ctrl+Z)" aria-label="Undo">
        <Undo2 className="w-4 h-4" />
      </button>
      <button onClick={() => engine?.redo()} className={iconButton(false)} title="Redo (Ctrl+Y)" aria-label="Redo">
        <Redo2 className="w-4 h-4" />
      </button>

      <div className="w-px h-6 bg-[#e2e2e6] mx-1" />

      <button onClick={handleExport} className={iconButton(false)} title="Export as PNG" aria-label="Export as PNG">
        <Download className="w-4 h-4" />
      </button>

      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          className={iconButton(isMenuOpen)}
          title="More"
          aria-label="More"
          aria-expanded={isMenuOpen}
        >
          <MoreHorizontal className="w-4 h-4" />
        </button>

        {isMenuOpen && (
          <div className="absolute right-0 top-full mt-2 w-56 p-1.5 rounded-2xl bg-white border border-[#e2e2e6] shadow-xl z-50">
            <button className={menuItem} onClick={() => { setIsMenuOpen(false); onToggleLayerPanel(); }}>
              <Layers className="w-4 h-4 text-[#5a5a62]" /> {isLayerPanelOpen ? 'Hide layers' : 'Layers'}
            </button>
            <button className={menuItem} onClick={() => { setIsMenuOpen(false); onOpenSettings(); }}>
              <Settings2 className="w-4 h-4 text-[#5a5a62]" /> Settings
            </button>

            <div className="px-3 pt-2 pb-1 text-[11px] font-mono-code uppercase tracking-wider text-[#87868e]">Background</div>
            <div className="flex gap-1 px-2 pb-2">
              {BACKGROUNDS.map((b) => (
                <button
                  key={b.id}
                  onClick={() => setBackground(b.id)}
                  className={`flex-1 px-2 py-1.5 rounded-lg text-xs border ${
                    settings.canvasTheme === b.id ? 'border-[#18181c] bg-[#f0f0f2]' : 'border-[#e2e2e6] hover:bg-[#fafafa]'
                  }`}
                >
                  {b.label}
                </button>
              ))}
            </div>

            <div className="h-px bg-[#e2e2e6] my-1" />
            <button
              className={`${menuItem} text-[#b91c1c] hover:bg-[#fef2f2]`}
              onClick={() => { setIsMenuOpen(false); setIsClearConfirmOpen(true); }}
            >
              <Trash2 className="w-4 h-4" /> Clear board
            </button>
          </div>
        )}
      </div>

      <ConfirmationModal
        isOpen={isClearConfirmOpen}
        title="Clear the board?"
        description="This removes the whole design from the board, for you and the coach."
        confirmLabel="Clear board"
        cancelLabel="Keep it"
        variant="danger"
        onConfirm={() => {
          onClearBoard();
          setIsClearConfirmOpen(false);
        }}
        onClose={() => setIsClearConfirmOpen(false)}
      />
    </div>
  );
};
