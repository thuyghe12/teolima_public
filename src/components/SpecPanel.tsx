import React, { useMemo, useState } from 'react';
import { Check, ChevronRight, Copy, Download, FileText, Mic, PenLine, X } from 'lucide-react';
import type { Board, Requirement } from '../../shared/board/schema';
import { discovery } from '../../shared/board/discovery';
import { grouped, sourceLabel, specMarkdown } from '../../shared/board/spec-document';

interface SpecPanelProps {
  board: Board;
  /** Titles of pasted documents, by id. */
  documents: Record<string, string>;
  onClose: () => void;
}

const PILLARS: Record<string, string> = {
  reliability: 'Reliability',
  security: 'Security',
  'cost-optimization': 'Cost',
  'operational-excellence': 'Operations',
  'performance-efficiency': 'Performance',
};

const SourceIcon: React.FC<{ r: Requirement }> = ({ r }) => {
  const Icon = r.source.kind === 'document' ? FileText : r.source.kind === 'brief' ? PenLine : Mic;
  return <Icon className="w-3.5 h-3.5 shrink-0 text-[#a1a0a8]" aria-hidden />;
};

/** One requirement: a single line; its source and quote one click away. */
const Item: React.FC<{ r: Requirement; documents: Record<string, string> }> = ({ r, documents }) => {
  const [open, setOpen] = useState(false);
  return (
    <li>
      <button onClick={() => setOpen(!open)} className="w-full flex items-start gap-2 py-1.5 text-left group" aria-expanded={open}>
        <span className="flex-1 text-sm leading-snug">
          {r.text}
          {r.pillar && <span className="ml-1.5 text-xs text-[#87868e]">{PILLARS[r.pillar]}</span>}
        </span>
        <SourceIcon r={r} />
      </button>
      {open && (
        <blockquote className="mb-2 ml-0.5 pl-3 border-l-2 border-[#e2e2e6] text-xs text-[#5a5a62]">
          "{r.source.quote}"
          <span className="block mt-0.5 text-[#a1a0a8]">
            {sourceLabel(r, documents)} · {r.id}
          </span>
        </blockquote>
      )}
    </li>
  );
};

/** The functional specification, opened on demand: grouped, one line per requirement, sources on request. */
export const SpecPanel: React.FC<SpecPanelProps> = ({ board, documents, onClose }) => {
  const d = useMemo(() => discovery(board), [board]);
  const groups = useMemo(() => grouped(board), [board]);
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const [showTopics, setShowTopics] = useState(false);
  const [copied, setCopied] = useState(false);
  const required = d.topics.filter((t) => t.topic.required);
  const covered = required.filter((t) => t.covered).length;
  const approval = board.stage.approvals.find((a) => a.stage === 'discovery');
  const markdown = () => specMarkdown(board, documents);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(markdown());
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([markdown()], { type: 'text/markdown' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(board.title || 'functional-specification').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const toggle = (kind: string) =>
    setClosed((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });

  return (
    <aside
      aria-label="Functional specification"
      className="fixed top-[150px] left-5 bottom-5 z-20 w-[340px] max-w-[calc(100vw-2.5rem)] flex flex-col rounded-2xl bg-white border border-[#e2e2e6] shadow-[0_8px_30px_rgba(24,24,28,0.06)] text-[#18181c] font-body"
    >
      <header className="flex items-center justify-between pl-4 pr-2 py-2.5 border-b border-[#f0f0f2]">
        <h2 className="text-sm font-semibold">Specification</h2>
        <div className="flex items-center">
          <button onClick={copy} className="p-2 rounded-lg text-[#5a5a62] hover:bg-[#f0f0f2]" aria-label="Copy as Markdown" title="Copy as Markdown">
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          </button>
          <button onClick={download} className="p-2 rounded-lg text-[#5a5a62] hover:bg-[#f0f0f2]" aria-label="Download as Markdown" title="Download as Markdown">
            <Download className="w-4 h-4" />
          </button>
          <button onClick={onClose} className="p-2 rounded-lg text-[#5a5a62] hover:bg-[#f0f0f2]" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>
      </header>

      <div className="px-4 py-2.5 border-b border-[#f0f0f2]">
        <button onClick={() => setShowTopics(!showTopics)} className="w-full flex items-center justify-between text-xs text-[#5a5a62]" aria-expanded={showTopics}>
          <span>{approval ? `Approved by ${approval.by}` : `${covered} of ${required.length} required topics covered`}</span>
          <ChevronRight className={`w-3.5 h-3.5 transition-transform ${showTopics ? 'rotate-90' : ''}`} />
        </button>
        {showTopics && (
          <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
            {d.topics.map(({ topic, covered: c }) => (
              <li key={topic.id} title={c ? undefined : topic.question} className={`text-xs ${c ? 'text-[#18181c]' : topic.required ? 'text-[#5a5a62]' : 'text-[#a1a0a8]'}`}>
                {c ? '✓' : topic.required ? '○' : '·'} {topic.title}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-2">
        {groups.length === 0 && <p className="py-2 text-xs text-[#87868e]">No requirements yet. Talk it through, or paste a transcript or notes.</p>}
        {groups.map((g) => (
          <section key={g.kind} className="py-1.5">
            <button onClick={() => toggle(g.kind)} className="w-full flex items-center justify-between py-1 text-xs font-medium text-[#5a5a62]" aria-expanded={!closed.has(g.kind)}>
              <span>
                {g.title} <span className="text-[#a1a0a8] tabular-nums">{g.items.length}</span>
              </span>
              <ChevronRight className={`w-3.5 h-3.5 transition-transform ${closed.has(g.kind) ? '' : 'rotate-90'}`} />
            </button>
            {!closed.has(g.kind) && (
              <ul className="divide-y divide-[#f4f4f6]">
                {g.items.map((r) => (
                  <Item key={r.id} r={r} documents={documents} />
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
    </aside>
  );
};
