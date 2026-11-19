import React, { useMemo, useState } from 'react';
import { Check, Copy, Download, X } from 'lucide-react';
import type { Board } from '../../shared/board/schema';
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

/** The functional specification: discovery topics, then every requirement with its quoted source. */
export const SpecPanel: React.FC<SpecPanelProps> = ({ board, documents, onClose }) => {
  const d = useMemo(() => discovery(board), [board]);
  const groups = useMemo(() => grouped(board), [board]);
  const [copied, setCopied] = useState(false);
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

  return (
    <aside
      aria-label="Functional specification"
      className="fixed top-20 left-5 bottom-5 z-30 w-[360px] max-w-[calc(100vw-2.5rem)] flex flex-col rounded-2xl bg-white border border-[#e2e2e6] shadow-[0_8px_30px_rgba(24,24,28,0.08)] text-[#18181c] font-body"
    >
      <header className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-[#f0f0f2]">
        <div>
          <h2 className="text-sm font-semibold">Functional specification</h2>
          <p className="text-xs text-[#87868e]">What it must do and why. Every line quotes its source.</p>
        </div>
        <div className="flex items-center gap-1">
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

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        <section aria-label="Discovery">
          <div className="text-xs font-medium text-[#5a5a62] mb-1.5">
            Discovery {d.done ? 'done' : `: ${d.missing.length} required topic${d.missing.length === 1 ? '' : 's'} missing`}
          </div>
          <ul className="flex flex-wrap gap-1">
            {d.topics.map(({ topic, covered }) => (
              <li
                key={topic.id}
                title={covered ? topic.title : topic.question}
                className={`px-2 py-0.5 rounded-full text-xs border ${
                  covered
                    ? 'bg-[#18181c] border-[#18181c] text-white'
                    : topic.required
                      ? 'border-[#18181c] text-[#18181c]'
                      : 'border-dashed border-[#c4c4ca] text-[#87868e]'
                }`}
              >
                {covered ? '✓ ' : ''}
                {topic.title}
              </li>
            ))}
          </ul>
          {!d.done && <p className="mt-1.5 text-xs text-[#87868e]">Design starts when every solid topic is covered. Dashed topics can stay open and are confirmed later.</p>}
        </section>

        {groups.length === 0 && <p className="text-xs text-[#87868e]">No requirements yet. Talk the system through, or paste a transcript or notes.</p>}

        {groups.map((g) => (
          <section key={g.kind} aria-label={g.title}>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[#5a5a62] mb-1.5">{g.title}</h3>
            <ul className="space-y-2">
              {g.items.map((r) => (
                <li key={r.id} className="text-sm">
                  <p>
                    {r.text}
                    {r.pillar && <span className="ml-1.5 text-xs text-[#5a5a62]">· {PILLARS[r.pillar]}</span>}
                  </p>
                  <p className="text-xs text-[#87868e]">
                    <span className="font-mono">{r.id}</span> · "{r.source.quote}" · {sourceLabel(r, documents)}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </aside>
  );
};
