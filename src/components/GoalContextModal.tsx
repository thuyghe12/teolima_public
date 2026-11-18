import React, { useState, useRef } from 'react';
import { UserGoalProject, UploadedFileContext } from '../types';
import {
  Sparkles,
  Paperclip,
  FileText,
  X,
  ArrowRight,
  Brain,
  Hammer,
  Lightbulb,
  ShieldCheck,
  Zap,
  SlidersHorizontal,
  Compass
} from 'lucide-react';

interface GoalContextModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStartSessionWithGoal: (goalProject: UserGoalProject) => void;
  currentGoal?: string;
}

interface CoachArchetype {
  id: string;
  name: string;
  vibe: string;
  promptInstruction: string;
  icon: React.ComponentType<{ className?: string }>;
}

const COACH_ARCHETYPES: CoachArchetype[] = [
  {
    id: 'practical_builder',
    name: 'Practical Builder',
    vibe: 'Direct, action-first implementation',
    promptInstruction: 'Act as a Practical Systems Builder: be direct, concise, and action-oriented. Immediately start sketching standard production router-to-worker architecture and concrete APIs.',
    icon: Hammer,
  },
  {
    id: 'socratic_architect',
    name: 'Socratic Architect',
    vibe: 'Probes edge cases and tradeoffs',
    promptInstruction: 'Act as a Socratic Solutions Architect: ask sharp, insightful clarifying questions about edge cases, latency, and business logic before proposing or drawing architecture nodes.',
    icon: Brain,
  },
  {
    id: 'metaphor_translator',
    name: 'ELI5 Translator',
    vibe: 'Intuitive real-world analogies',
    promptInstruction: 'Act as an ELI5 Concept Translator: explain multi-agent mechanics using vivid real-world analogies (e.g. restaurant kitchens, air traffic control) with zero intimidating jargon and patient encouragement.',
    icon: Lightbulb,
  },
  {
    id: 'production_hardener',
    name: 'Production & Safety',
    vibe: 'Guardrails & human-in-the-loop',
    promptInstruction: 'Act as a Production Hardening Specialist: emphasize guardrails, evaluator loops, token budgets, rate limits, P99 latency bounds, and human-in-the-loop review checkpoints in every architecture.',
    icon: ShieldCheck,
  },
  {
    id: 'swarm_pioneer',
    name: 'Swarm Pioneer',
    vibe: 'Autonomous peer-to-peer debate',
    promptInstruction: 'Act as a Creative Swarm Pioneer: explore novel multi-agent topologies including peer-to-peer swarms, multi-persona debate loops, reflexion cycles, and autonomous agent-to-agent negotiation.',
    icon: Zap,
  }
];

const KNOWLEDGE_LEVELS = [
  {
    level: 1,
    label: 'Beginner',
    tagline: 'Analogies, clear concepts, zero jargon',
    guidance: 'User is a beginner. Avoid unexplained acronyms and academic jargon. Use real-world analogies (e.g., dispatcher, manager, filing cabinet) and explain why each agent role exists.'
  },
  {
    level: 2,
    label: 'Intermediate',
    tagline: 'Standard agent flows, tools & routing',
    guidance: 'User understands core workflows and APIs. Focus on orchestrator-worker flows, state handoffs, tools, and human-in-the-loop checkpoints without over-explaining basic concepts.'
  },
  {
    level: 3,
    label: 'Advanced',
    tagline: 'LangGraph, MCP servers & vector state',
    guidance: 'User is an experienced engineer. Use standard technical terminology directly (StateGraph, MCP servers, embeddings, vector similarity thresholds, token budgets, retry policies, async tool routing).'
  },
  {
    level: 4,
    label: 'Expert',
    tagline: 'Distributed consensus & P99 latency bounds',
    guidance: 'User is a Staff AI Architect. Dive straight into high-depth distributed systems engineering: deterministic vs stochastic routing, streaming backpressure, distributed consensus/A2A handoffs, P99 latency ceilings, evaluator scoring functions, and failover fallbacks.'
  }
];

const QUICK_STARTERS = [
  {
    label: 'Customer Support Squad',
    goal: 'Build an autonomous customer support team that routes tickets, checks refund policies, drafts responses, and escalates to human managers.'
  },
  {
    label: 'Deep Research Agent',
    goal: 'Design a multi-agent research team that queries multiple sources, cross-references facts, synthesizes a summary report, and archives findings.'
  },
  {
    label: 'Code Review Pipeline',
    goal: 'Create an automated PR reviewer that runs security audits, evaluates test coverage, and drafts inline GitHub comments.'
  },
  {
    label: 'Lead Triage Bot',
    goal: 'An inbound lead triage agent that parses form submissions, checks CRM history via tools, and notifies sales reps.'
  }
];

export const GoalContextModal: React.FC<GoalContextModalProps> = ({
  isOpen,
  onClose,
  onStartSessionWithGoal,
  currentGoal = ''
}) => {
  const [goalText, setGoalText] = useState(currentGoal || '');
  const [selectedArchetypeId, setSelectedArchetypeId] = useState<string>('practical_builder');
  const [technicalLevel, setTechnicalLevel] = useState<number>(2);
  const [fileContext, setFileContext] = useState<UploadedFileContext | null>(null);
  const [isReadingFile, setIsReadingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const currentLevelInfo = KNOWLEDGE_LEVELS.find((l) => l.level === technicalLevel) || KNOWLEDGE_LEVELS[1];
  const currentArchetype = COACH_ARCHETYPES.find((a) => a.id === selectedArchetypeId) || COACH_ARCHETYPES[0];

  const handleFile = async (file: File) => {
    setIsReadingFile(true);
    try {
      const text = await file.text();
      const snippet = text.slice(0, 8000);
      setFileContext({
        name: file.name,
        size: file.size,
        type: file.type || 'text/plain',
        textSnippet: snippet,
        summary: `File: ${file.name} (${Math.round(file.size / 1024)} KB)`,
        uploadedAt: Date.now()
      });
    } catch (e) {
      console.error('Failed to read file text:', e);
    } finally {
      setIsReadingFile(false);
    }
  };

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!goalText.trim()) return;

    onStartSessionWithGoal({
      goal: goalText.trim(),
      domain: 'General Multi-Agent System',
      coachArchetype: currentArchetype.name,
      coachArchetypeDescription: currentArchetype.promptInstruction,
      technicalLevel: currentLevelInfo.level,
      technicalLevelLabel: `${currentLevelInfo.label} (${currentLevelInfo.tagline})`,
      architecturalNotes: [currentLevelInfo.guidance],
      fileContext: fileContext || undefined,
    });
    onClose();
  };

  return (
    <div
      id="goal-context-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-150"
    >
      <div
        id="goal-context-modal-dialog"
        className="w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-[#e2e2e6] overflow-hidden flex flex-col max-h-[92vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#f0f0f2] bg-white sticky top-0 z-10">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#18181c] text-[#c8f13a] flex items-center justify-center font-bold text-sm">
              <Compass className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-[#18181c] tracking-tight">
                Architecture Coaching Setup
              </h2>
              <p className="text-xs text-[#87868e]">
                Set your project goal and preferred coaching style
              </p>
            </div>
          </div>
          <button
            id="btn-close-goal-modal"
            onClick={onClose}
            className="p-1.5 rounded-xl text-[#87868e] hover:text-[#18181c] hover:bg-[#f0f0f2] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-6 overflow-y-auto space-y-5">
          {/* Main Goal Prompt Input */}
          <div className="space-y-2">
            <label htmlFor="input-user-goal" className="block text-xs font-bold text-[#18181c] uppercase tracking-wider">
              What do you want to build?
            </label>
            <textarea
              id="input-user-goal"
              value={goalText}
              onChange={(e) => setGoalText(e.target.value)}
              placeholder="e.g. An automated customer support pipeline that routes tickets, verifies accounts, and escalates edge cases..."
              rows={3}
              className="w-full p-3.5 rounded-2xl bg-[#fafafa] border border-[#e2e2e6] text-[#18181c] placeholder:text-[#87868e] focus:outline-none focus:ring-2 focus:ring-[#18181c] focus:bg-white text-xs leading-relaxed transition-all resize-none font-body"
              autoFocus
            />

            {/* Quick Starters / Suggestions */}
            <div className="pt-1">
              <div className="text-[11px] font-medium text-[#87868e] mb-1.5 flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-[#18181c]" /> Quick inspiration:
              </div>
              <div className="flex flex-wrap gap-1.5">
                {QUICK_STARTERS.map((s, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setGoalText(s.goal)}
                    className="px-2.5 py-1 rounded-lg bg-[#f0f0f2] hover:bg-[#e2e2e6] text-[#18181c] text-xs font-medium transition-all hover:scale-[1.01] active:scale-95 text-left"
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Knowledge Level Selector */}
          <div className="space-y-2">
            <label className="flex items-center justify-between text-xs font-bold text-[#18181c] uppercase tracking-wider">
              <span className="flex items-center gap-1.5">
                <SlidersHorizontal className="w-3.5 h-3.5 text-[#87868e]" />
                Technical Depth
              </span>
            </label>

            <div className="grid grid-cols-4 gap-1.5 p-1 bg-[#f0f0f2] rounded-2xl border border-[#e2e2e6]">
              {KNOWLEDGE_LEVELS.map((lvl) => {
                const isSelected = technicalLevel === lvl.level;
                return (
                  <button
                    key={lvl.level}
                    type="button"
                    id={`btn-tech-level-${lvl.level}`}
                    onClick={() => setTechnicalLevel(lvl.level)}
                    className={`py-2 px-1 rounded-xl text-xs font-semibold transition-all text-center ${
                      isSelected
                        ? 'bg-[#18181c] text-[#c8f13a] shadow-sm'
                        : 'text-[#5a5a62] hover:text-[#18181c] hover:bg-white/70'
                    }`}
                  >
                    {lvl.label}
                  </button>
                );
              })}
            </div>

            {/* Explanatory subtitle for selected level */}
            <div className="px-3 py-2 rounded-xl bg-[#fafafa] border border-[#e2e2e6] text-xs text-[#5a5a62]">
              <span className="font-bold text-[#18181c]">{currentLevelInfo.label}: </span>
              {currentLevelInfo.tagline}
            </div>
          </div>

          {/* Coach Style Picker */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-[#18181c] uppercase tracking-wider">
              Coach Persona
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {COACH_ARCHETYPES.map((archetype) => {
                const isSelected = selectedArchetypeId === archetype.id;
                const IconComponent = archetype.icon;

                return (
                  <button
                    key={archetype.id}
                    type="button"
                    id={`btn-coach-archetype-${archetype.id}`}
                    onClick={() => setSelectedArchetypeId(archetype.id)}
                    className={`p-3 rounded-2xl text-left transition-all border flex items-center gap-3 ${
                      isSelected
                        ? 'border-[#18181c] bg-[#18181c] text-white shadow-sm'
                        : 'border-[#e2e2e6] bg-[#fafafa] hover:border-[#87868e] hover:bg-white text-[#18181c]'
                    }`}
                  >
                    <div
                      className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 ${
                        isSelected ? 'bg-white/20 text-[#c8f13a]' : 'bg-white border border-[#e2e2e6] text-[#18181c]'
                      }`}
                    >
                      <IconComponent className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className={`text-xs font-bold ${isSelected ? 'text-white' : 'text-[#18181c]'}`}>
                        {archetype.name}
                      </div>
                      <div className={`text-[11px] leading-tight ${isSelected ? 'text-white/70' : 'text-[#87868e]'}`}>
                        {archetype.vibe}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Optional Spec / Document Attachment */}
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,.md,.json,.csv,.pdf,.doc,.docx"
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  handleFile(e.target.files[0]);
                }
              }}
            />

            {fileContext ? (
              <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-[#f0f0f2] border border-[#e2e2e6]">
                <div className="flex items-center gap-2 overflow-hidden text-xs text-[#18181c]">
                  <FileText className="w-4 h-4 text-[#18181c] shrink-0" />
                  <span className="font-semibold truncate">{fileContext.name}</span>
                  <span className="text-[#87868e] text-[11px]">({Math.round(fileContext.size / 1024)} KB)</span>
                </div>
                <button
                  type="button"
                  onClick={() => setFileContext(null)}
                  className="p-1 rounded-lg text-[#87868e] hover:text-rose-600 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 text-xs text-[#5a5a62] hover:text-[#18181c] transition-colors py-1"
              >
                <Paperclip className="w-3.5 h-3.5" />
                <span>{isReadingFile ? 'Reading file...' : 'Attach spec, PRD or notes (optional)'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[#f0f0f2] bg-white flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-[#87868e] hover:text-[#18181c] hover:bg-[#f0f0f2] transition-colors"
          >
            Cancel
          </button>
          <button
            id="btn-submit-goal-start"
            onClick={handleSubmit}
            disabled={!goalText.trim()}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#18181c] text-white hover:bg-black font-semibold text-xs transition-all shadow-md active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <span>Start Coaching</span>
            <ArrowRight className="w-3.5 h-3.5 text-[#c8f13a]" />
          </button>
        </div>
      </div>
    </div>
  );
};
