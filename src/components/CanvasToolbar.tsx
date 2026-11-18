import React, { useState } from 'react';
import { CanvasEngine } from '../lib/canvas/canvasEngine';
import { CanvasLayer, ShapeKind, VoiceSettings } from '../types';
import { ConfirmationModal } from './ConfirmationModal';
import { SketchModal } from './SketchModal';
import {
  Pencil,
  Highlighter,
  Square,
  Circle,
  Diamond,
  ArrowRight,
  Minus,
  Type,
  Image as ImageIcon,
  Eraser,
  Hand,
  Undo2,
  Redo2,
  Trash2,
  Download,
  Layers,
  Sliders,
  ChevronDown,
  Palette,
  Sparkles,
  Compass,
  FileText,
  GitFork,
  Database,
  UserCheck,
  ShieldCheck,
  Cpu
} from 'lucide-react';

interface CanvasToolbarProps {
  engine: CanvasEngine | null;
  settings: VoiceSettings;
  onUpdateSettings: (settings: Partial<VoiceSettings>) => void;
  onOpenSettings: () => void;
  onToggleLayerPanel: () => void;
  isLayerPanelOpen: boolean;
  layers: CanvasLayer[];
  activeLayerId: string;
  isFocusMode?: boolean;
  onToggleFocusMode?: () => void;
  onOpenGoalModal: () => void;
  activeGoal?: string;
  onSelectPrompt?: (prompt: string) => void;
  isCallActive?: boolean;
}

const AGENT_COACHING_PROMPTS = [
  {
    icon: <GitFork className="w-3.5 h-3.5 text-[#18181c]" />,
    label: 'Router vs Swarm',
    desc: 'Dispatcher vs decentralized handoffs',
    prompt: 'Can you sketch and explain how an Orchestrator Router delegates work compared to an Autonomous Swarm?',
  },
  {
    icon: <Database className="w-3.5 h-3.5 text-[#4f46e5]" />,
    label: 'Agent Vector Memory',
    desc: 'Short-term context vs embeddings DB',
    prompt: 'Show me how short-term chat memory vs long-term Vector database storage connects to worker agents on the board.',
  },
  {
    icon: <UserCheck className="w-3.5 h-3.5 text-[#059669]" />,
    label: 'Human-in-the-Loop',
    desc: 'Approval gates for high-stakes actions',
    prompt: 'Where should I place a Human Approval gate before an AI agent sends emails or issues refunds?',
  },
  {
    icon: <ShieldCheck className="w-3.5 h-3.5 text-[#e11d48]" />,
    label: 'Safety & Budgets',
    desc: 'Guardrails, rate limits, P95 latency',
    prompt: 'Please draw a safety guardrail and token budget check between the user intake and the LLM workers.',
  },
  {
    icon: <Cpu className="w-3.5 h-3.5 text-[#d97706]" />,
    label: 'Tool & MCP Pipeline',
    desc: 'External APIs, scrapers, SQL tools',
    prompt: 'Sketch how a Researcher Agent decides when to invoke a Web Search tool vs a SQL Database tool.',
  },
];

const PRIMARY_PALETTE = [
  { name: 'Dark Ink', hex: '#18181c' },
  { name: 'Volt Joy', hex: '#c8f13a' },
];

const EXTENDED_PALETTE = [
  { name: 'Soft Slate', hex: '#5a5a62' },
  { name: 'Indigo Agent', hex: '#4f46e5' },
  { name: 'Emerald Guard', hex: '#059669' },
  { name: 'Coral Action', hex: '#e11d48' },
  { name: 'Warm Ochre', hex: '#d97706' },
  { name: 'Sky Blue', hex: '#0284c7' },
  { name: 'Violet Memory', hex: '#7c3aed' },
  { name: 'Amber Core', hex: '#f59e0b' },
];

const SHAPE_OPTIONS: Array<{ kind: ShapeKind; label: string; icon: React.ReactNode }> = [
  { kind: 'rectangle', label: 'Box / Agent Card', icon: <Square className="w-4 h-4" /> },
  { kind: 'circle', label: 'Circle / Gateway', icon: <Circle className="w-4 h-4" /> },
  { kind: 'diamond', label: 'Diamond / Router', icon: <Diamond className="w-4 h-4" /> },
  { kind: 'arrow', label: 'Arrow / Flow', icon: <ArrowRight className="w-4 h-4" /> },
  { kind: 'line', label: 'Divider Line', icon: <Minus className="w-4 h-4" /> },
  { kind: 'cylinder', label: 'Cylinder / Memory DB', icon: <Square className="w-4 h-4 rounded-sm" /> },
  { kind: 'sticky', label: 'Sticky Note', icon: <FileText className="w-4 h-4" /> },
];

export const CanvasToolbar: React.FC<CanvasToolbarProps> = ({
  engine,
  settings,
  onUpdateSettings,
  onOpenSettings,
  onToggleLayerPanel,
  isLayerPanelOpen,
  layers,
  activeLayerId,
  onOpenGoalModal,
  onSelectPrompt,
  isCallActive = false,
}) => {
  const [activeTool, setActiveTool] = useState<string>('pencil');
  const [activeColor, setActiveColor] = useState<string>('#18181c');
  const [activeShapeKind, setActiveShapeKind] = useState<ShapeKind>('rectangle');
  const [isShapeMenuOpen, setIsShapeMenuOpen] = useState(false);
  const [isThemeMenuOpen, setIsThemeMenuOpen] = useState(false);
  const [isInquiriesOpen, setIsInquiriesOpen] = useState(false);
  const [isColorMenuOpen, setIsColorMenuOpen] = useState(false);
  const [isClearConfirmOpen, setIsClearConfirmOpen] = useState(false);
  const [isSketchModalOpen, setIsSketchModalOpen] = useState(false);

  const selectTool = (tool: 'select' | 'pencil' | 'highlighter' | 'eraser' | 'shape' | 'text' | 'pan') => {
    setActiveTool(tool);
    if (engine) {
      engine.userTool = tool;
    }
  };

  const selectShape = (kind: ShapeKind) => {
    setActiveShapeKind(kind);
    setActiveTool('shape');
    if (engine) {
      engine.userTool = 'shape';
      engine.userShapeKind = kind;
    }
    setIsShapeMenuOpen(false);
  };

  const selectColor = (hex: string) => {
    setActiveColor(hex);
    if (engine) {
      engine.userStrokeColor = hex;
      engine.userFillColor = hex === '#c8f13a' ? 'rgba(200, 241, 58, 0.3)' : `${hex}1a`;
    }
  };

  const handleExport = () => {
    if (!engine) return;
    const url = engine.exportImage();
    const a = document.createElement('a');
    a.href = url;
    a.download = `teolima-architecture-${Date.now()}.png`;
    a.click();
  };

  const activeLayer = layers.find((l) => l.id === activeLayerId);

  return (
    <div
      id="main-canvas-toolbar"
      className="absolute top-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1.5 p-1.5 rounded-2xl bg-white/95 shadow-xl shadow-black/5 border border-[#e2e2e6] backdrop-blur-xl text-[#18181c] transition-all"
    >
      {/* Goal & Project Context Launcher Button */}
      <button
        id="toolbar-goal-context-btn"
        onClick={onOpenGoalModal}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-[#c8f13a] text-[#18181c] font-semibold text-xs border border-[#18181c]/10 hover:brightness-105 active:scale-95 transition-all shadow-sm"
        title="Set System Goal & Context File"
      >
        <Compass className="w-3.5 h-3.5" />
        <span className="font-mono-code">Goal & Context</span>
      </button>

      {/* Architecture Ideas / Blueprints Popover Menu */}
      <div className="relative">
        <button
          id="toolbar-blueprints-btn"
          onClick={() => setIsInquiriesOpen(!isInquiriesOpen)}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium border transition-all active:scale-95 shadow-2xs ${
            isInquiriesOpen
              ? 'bg-[#18181c] text-white border-[#18181c]'
              : 'bg-white hover:bg-[#f0f0f2] text-[#18181c] border-[#e2e2e6] hover:border-[#18181c]/20'
          }`}
          title="Multi-Agent Architectural Ideas & Blueprint Inquiries"
        >
          <Sparkles className={`w-3.5 h-3.5 ${isInquiriesOpen ? 'text-[#c8f13a]' : 'text-[#87868e]'}`} />
          <span className="font-mono-code hidden sm:inline">Ideas</span>
          <ChevronDown className={`w-3 h-3 transition-transform ${isInquiriesOpen ? 'rotate-180 opacity-100' : 'opacity-60'}`} />
        </button>

        {isInquiriesOpen && (
          <div
            id="blueprints-selection-popover"
            className="absolute left-0 top-full mt-2 w-80 rounded-2xl bg-white/98 border border-[#e2e2e6] shadow-2xl p-2.5 z-50 flex flex-col gap-2 backdrop-blur-xl animate-in fade-in zoom-in-95 duration-100"
          >
            <div className="flex items-center justify-between pb-1.5 border-b border-[#e2e2e6]/80">
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-[#18181c]" />
                <span className="font-mono-code font-bold uppercase tracking-wider text-[11px] text-[#18181c]">
                  Architecture Blueprints
                </span>
              </div>
              <button
                onClick={() => setIsInquiriesOpen(false)}
                className="text-[10px] font-mono-code text-[#87868e] hover:text-[#18181c] px-1 py-0.5 rounded hover:bg-[#f0f0f2]"
              >
                esc
              </button>
            </div>

            <p className="text-[11px] text-[#87868e] font-body">
              {isCallActive
                ? 'Select a multi-agent topic to have Coach Teolima live-sketch it:'
                : 'Click to start co-designing this architecture:'}
            </p>

            <div className="flex flex-col gap-1 max-h-64 overflow-y-auto pr-0.5">
              {AGENT_COACHING_PROMPTS.map((item, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    onSelectPrompt?.(item.prompt);
                    setIsInquiriesOpen(false);
                  }}
                  className="flex items-start gap-2.5 p-2 rounded-xl bg-[#fafafa] hover:bg-[#f0f0f2] border border-transparent hover:border-[#e2e2e6] text-left transition-all group active:scale-[0.98]"
                >
                  <div className="mt-0.5 p-1 rounded-lg bg-white border border-[#e2e2e6] shadow-2xs group-hover:scale-105 transition-transform">
                    {item.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold font-body text-[#18181c]">
                        {item.label}
                      </span>
                      <ArrowRight className="w-3 h-3 text-[#87868e] opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
                    </div>
                    <p className="text-[10.5px] text-[#5a5a62] font-body truncate mt-0.5">
                      {item.desc}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="w-[1px] h-6 bg-[#e2e2e6]" />

      {/* Primary Drawing Tools */}
      <div className="flex items-center gap-1 pr-1 border-r border-[#e2e2e6]">
        <button
          id="tool-pencil"
          onClick={() => selectTool('pencil')}
          title="Hand-Drawn Pen (Freehand Co-sketching)"
          className={`p-2 rounded-xl transition-all ${
            activeTool === 'pencil'
              ? 'bg-[#18181c] text-white shadow-sm font-semibold'
              : 'hover:bg-[#f0f0f2] text-[#5a5a62]'
          }`}
        >
          <Pencil className="w-4 h-4" />
        </button>

        <button
          id="tool-highlighter"
          onClick={() => selectTool('highlighter')}
          title="Volt Highlighter Marker"
          className={`p-2 rounded-xl transition-all ${
            activeTool === 'highlighter'
              ? 'bg-[#c8f13a] text-[#18181c] shadow-sm font-semibold'
              : 'hover:bg-[#f0f0f2] text-[#5a5a62]'
          }`}
        >
          <Highlighter className="w-4 h-4" />
        </button>

        {/* Shapes Dropdown */}
        <div className="relative">
          <button
            id="tool-shapes-dropdown"
            onClick={() => setIsShapeMenuOpen(!isShapeMenuOpen)}
            title="Multi-Agent Shapes & Cards"
            className={`flex items-center gap-0.5 p-2 rounded-xl transition-all ${
              activeTool === 'shape'
                ? 'bg-[#18181c] text-white shadow-sm font-semibold'
                : 'hover:bg-[#f0f0f2] text-[#5a5a62]'
            }`}
          >
            {SHAPE_OPTIONS.find((s) => s.kind === activeShapeKind)?.icon || <Square className="w-4 h-4" />}
            <ChevronDown className="w-3 h-3 ml-0.5 opacity-60" />
          </button>

          {isShapeMenuOpen && (
            <div
              id="shape-selection-menu"
              className="absolute left-0 top-full mt-2 w-48 rounded-xl bg-white border border-[#e2e2e6] shadow-xl p-1.5 z-50 flex flex-col gap-1 animate-in fade-in zoom-in-95 duration-100"
            >
              <div className="px-2 py-1 text-[10px] font-mono-code font-bold uppercase tracking-wider text-[#87868e]">
                Agent Shapes
              </div>
              {SHAPE_OPTIONS.map((item) => (
                <button
                  key={item.kind}
                  id={`shape-option-${item.kind}`}
                  onClick={() => selectShape(item.kind)}
                  className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs transition-all text-left ${
                    activeShapeKind === item.kind && activeTool === 'shape'
                      ? 'bg-[#18181c] text-white font-medium'
                      : 'hover:bg-[#f0f0f2] text-[#18181c]'
                  }`}
                >
                  <span className="opacity-80">{item.icon}</span>
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          id="tool-text"
          onClick={() => selectTool('text')}
          title="Type Notes or Labels"
          className={`p-2 rounded-xl transition-all ${
            activeTool === 'text'
              ? 'bg-[#18181c] text-white shadow-sm font-semibold'
              : 'hover:bg-[#f0f0f2] text-[#5a5a62]'
          }`}
        >
          <Type className="w-4 h-4" />
        </button>

        <button
          id="tool-sketch-illustration"
          onClick={() => setIsSketchModalOpen(true)}
          title="Add Iconic On-Brand Sketch Illustration"
          className="p-2 rounded-xl transition-all hover:bg-[#c8f13a]/30 text-[#18181c] hover:border-[#c8f13a] border border-transparent flex items-center gap-1"
        >
          <ImageIcon className="w-4 h-4" />
        </button>

        <button
          id="tool-eraser"
          onClick={() => selectTool('eraser')}
          title="Eraser (Tap elements to remove)"
          className={`p-2 rounded-xl transition-all ${
            activeTool === 'eraser'
              ? 'bg-[#e11d48] text-white shadow-sm font-semibold'
              : 'hover:bg-[#f0f0f2] text-[#5a5a62]'
          }`}
        >
          <Eraser className="w-4 h-4" />
        </button>

        <button
          id="tool-pan"
          onClick={() => selectTool('pan')}
          title="Pan & Navigate Whiteboard Canvas"
          className={`p-2 rounded-xl transition-all ${
            activeTool === 'pan'
              ? 'bg-[#18181c] text-white shadow-sm font-semibold'
              : 'hover:bg-[#f0f0f2] text-[#5a5a62]'
          }`}
        >
          <Hand className="w-4 h-4" />
        </button>
      </div>

      {/* Palette Colors (2 hero colors + expand menu for clean aesthetic) */}
      <div className="relative flex items-center gap-1.5 px-1 border-r border-[#e2e2e6]">
        {PRIMARY_PALETTE.map((color) => {
          const isSelected = activeColor.toLowerCase() === color.hex.toLowerCase();
          return (
            <button
              key={color.hex}
              id={`color-${color.name.toLowerCase().replace(/\s+/g, '-')}`}
              onClick={() => selectColor(color.hex)}
              title={color.name}
              className={`w-6 h-6 rounded-full transition-all flex items-center justify-center border ${
                isSelected
                  ? 'scale-110 border-[#18181c] ring-2 ring-[#c8f13a] shadow-xs'
                  : 'border-black/10 hover:scale-105 opacity-90 hover:opacity-100'
              }`}
              style={{ backgroundColor: color.hex }}
            >
              {isSelected && (
                <div className="w-1.5 h-1.5 rounded-full bg-white shadow-sm" />
              )}
            </button>
          );
        })}

        {/* If an extended or custom color is currently selected, show it as an active swatch */}
        {!PRIMARY_PALETTE.some((p) => p.hex.toLowerCase() === activeColor.toLowerCase()) && (
          <button
            id="color-active-custom"
            onClick={() => selectColor(activeColor)}
            title={`Active: ${activeColor}`}
            className="w-6 h-6 rounded-full transition-all flex items-center justify-center border border-[#18181c] ring-2 ring-[#c8f13a] scale-110 shadow-xs"
            style={{ backgroundColor: activeColor }}
          >
            <div className="w-1.5 h-1.5 rounded-full bg-white shadow-sm" />
          </button>
        )}

        {/* Expand / More Colors Menu */}
        <div className="relative">
          <button
            id="btn-more-colors"
            onClick={() => setIsColorMenuOpen(!isColorMenuOpen)}
            title="More Color Options"
            className={`p-1.5 rounded-xl transition-all flex items-center gap-0.5 text-xs ${
              isColorMenuOpen
                ? 'bg-[#18181c] text-white shadow-sm'
                : 'hover:bg-[#f0f0f2] text-[#5a5a62] hover:text-[#18181c]'
            }`}
          >
            <Palette className="w-3.5 h-3.5" />
            <ChevronDown className={`w-2.5 h-2.5 transition-transform ${isColorMenuOpen ? 'rotate-180' : 'opacity-60'}`} />
          </button>

          {isColorMenuOpen && (
            <div
              id="extended-colors-menu"
              className="absolute left-0 top-full mt-2 w-52 rounded-2xl bg-white/98 border border-[#e2e2e6] shadow-2xl p-2.5 z-50 flex flex-col gap-2 backdrop-blur-xl animate-in fade-in zoom-in-95 duration-100"
            >
              <div className="flex items-center justify-between pb-1 border-b border-[#e2e2e6]/80">
                <span className="text-[10px] font-mono-code font-bold uppercase tracking-wider text-[#87868e]">
                  Color Palette
                </span>
                <button
                  onClick={() => setIsColorMenuOpen(false)}
                  className="text-[10px] font-mono-code text-[#87868e] hover:text-[#18181c] px-1 py-0.5 rounded hover:bg-[#f0f0f2]"
                >
                  esc
                </button>
              </div>

              <div className="grid grid-cols-4 gap-1.5 py-1">
                {[...PRIMARY_PALETTE, ...EXTENDED_PALETTE].map((color) => {
                  const isSelected = activeColor.toLowerCase() === color.hex.toLowerCase();
                  return (
                    <button
                      key={color.hex}
                      id={`ext-color-${color.name.toLowerCase().replace(/\s+/g, '-')}`}
                      onClick={() => {
                        selectColor(color.hex);
                        setIsColorMenuOpen(false);
                      }}
                      title={color.name}
                      className={`group flex flex-col items-center gap-1 p-1 rounded-xl transition-all hover:bg-[#f0f0f2] ${
                        isSelected ? 'bg-[#f0f0f2] ring-1 ring-[#18181c]' : ''
                      }`}
                    >
                      <div
                        className="w-5 h-5 rounded-full border border-black/10 flex items-center justify-center group-hover:scale-105 transition-transform"
                        style={{ backgroundColor: color.hex }}
                      >
                        {isSelected && (
                          <div className="w-1 h-1 rounded-full bg-white shadow-sm" />
                        )}
                      </div>
                      <span className="text-[9px] text-[#5a5a62] font-mono-code leading-none truncate w-full text-center">
                        {color.name.split(' ')[0]}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="pt-1.5 border-t border-[#e2e2e6] flex items-center justify-between">
                <span className="text-[10px] font-mono-code text-[#5a5a62]">Custom Hex:</span>
                <input
                  type="color"
                  value={activeColor}
                  onChange={(e) => selectColor(e.target.value)}
                  className="w-6 h-6 rounded cursor-pointer border-0 bg-transparent"
                  title="Pick custom color"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* History & Manipulation */}
      <div className="flex items-center gap-1 px-1 border-r border-[#e2e2e6]">
        <button
          id="btn-undo"
          onClick={() => engine?.undo()}
          title="Undo (Ctrl+Z)"
          className="p-2 rounded-xl hover:bg-[#f0f0f2] text-[#5a5a62] hover:text-[#18181c] transition-all"
        >
          <Undo2 className="w-4 h-4" />
        </button>
        <button
          id="btn-redo"
          onClick={() => engine?.redo()}
          title="Redo (Ctrl+Y)"
          className="p-2 rounded-xl hover:bg-[#f0f0f2] text-[#5a5a62] hover:text-[#18181c] transition-all"
        >
          <Redo2 className="w-4 h-4" />
        </button>
        <button
          id="btn-clear-canvas"
          onClick={() => setIsClearConfirmOpen(true)}
          title="Clear Board"
          className="p-2 rounded-xl hover:bg-rose-50 text-[#87868e] hover:text-rose-600 transition-all"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Theme Switcher */}
      <div className="relative">
        <button
          id="btn-canvas-theme"
          onClick={() => setIsThemeMenuOpen(!isThemeMenuOpen)}
          title="Paper Canvas Style"
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl hover:bg-[#f0f0f2] text-xs font-medium text-[#5a5a62] hover:text-[#18181c] transition-all"
        >
          <Sparkles className="w-3.5 h-3.5 text-[#87868e]" />
          <span className="capitalize hidden md:inline text-xs font-mono-code">
            {settings.canvasTheme.replace('-', ' ')}
          </span>
          <ChevronDown className="w-3 h-3 opacity-60" />
        </button>

        {isThemeMenuOpen && (
          <div
            id="theme-selection-menu"
            className="absolute left-0 top-full mt-2 w-44 rounded-xl bg-white border border-[#e2e2e6] shadow-xl p-1.5 z-50 flex flex-col gap-1 animate-in fade-in zoom-in-95 duration-100"
          >
            <div className="px-2 py-1 text-[10px] font-mono-code font-bold uppercase tracking-wider text-[#87868e]">
              Canvas Style
            </div>
            {(['paper-dots', 'paper-grid', 'paper', 'blueprint', 'darkboard'] as const).map((t) => (
              <button
                key={t}
                id={`theme-option-${t}`}
                onClick={() => {
                  onUpdateSettings({ canvasTheme: t });
                  if (engine) engine.settings.canvasTheme = t;
                  setIsThemeMenuOpen(false);
                }}
                className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-all text-left capitalize ${
                  settings.canvasTheme === t
                    ? 'bg-[#18181c] text-white font-medium'
                    : 'hover:bg-[#f0f0f2] text-[#18181c]'
                }`}
              >
                <span>{t.replace('-', ' ')}</span>
                {settings.canvasTheme === t && <div className="w-1.5 h-1.5 rounded-full bg-[#c8f13a]" />}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Layer Management Drawer Toggle */}
      <button
        id="btn-toggle-layers"
        onClick={onToggleLayerPanel}
        title="Canvas Layers (AI Coach vs User Notes)"
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium transition-all ${
          isLayerPanelOpen
            ? 'bg-[#18181c] text-white shadow-sm'
            : 'hover:bg-[#f0f0f2] text-[#5a5a62] hover:text-[#18181c]'
        }`}
      >
        <Layers className="w-3.5 h-3.5" />
        <span className="hidden sm:inline font-mono-code">Layers</span>
        <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-[#e2e2e6] text-[#18181c] font-semibold">
          {layers.length}
        </span>
      </button>

      {/* Export Button */}
      <button
        id="btn-export-canvas"
        onClick={handleExport}
        title="Export High-Res Architecture PNG"
        className="p-2 rounded-xl hover:bg-[#f0f0f2] text-[#5a5a62] hover:text-[#18181c] transition-all"
      >
        <Download className="w-4 h-4" />
      </button>

      {/* Settings */}
      <div className="flex items-center gap-1 pl-1 border-l border-[#e2e2e6]">
        <button
          id="btn-open-settings"
          onClick={onOpenSettings}
          title="Voice & Drawing Engine Settings"
          className="p-2 rounded-xl hover:bg-[#f0f0f2] text-[#5a5a62] hover:text-[#18181c] transition-all"
        >
          <Sliders className="w-4 h-4" />
        </button>
      </div>

      {/* Clear Canvas Confirmation Modal */}
      <ConfirmationModal
        isOpen={isClearConfirmOpen}
        title="Clear Whiteboard Canvas?"
        description="This will clear all current drawings, text, and architecture diagrams from the whiteboard. You can undo this action if needed."
        confirmLabel="Clear Canvas"
        cancelLabel="Keep Drawing"
        variant="danger"
        onConfirm={() => {
          engine?.clear();
          setIsClearConfirmOpen(false);
        }}
        onClose={() => setIsClearConfirmOpen(false)}
      />

      {/* Brand Sketch Illustration Modal */}
      <SketchModal
        isOpen={isSketchModalOpen}
        onClose={() => setIsSketchModalOpen(false)}
        engine={engine}
      />
    </div>
  );
};
