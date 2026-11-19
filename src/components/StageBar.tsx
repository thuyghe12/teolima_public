import React, { useEffect, useState } from 'react';
import { Check, RotateCcw } from 'lucide-react';
import type { Board, StageId } from '../../shared/board/schema';
import { gate, stageOf, STAGES } from '../../shared/board/stages';

interface StageBarProps {
  board: Board;
  onApprove: (stage: StageId, by: string) => void;
  onReopen: (stage: StageId) => void;
  requirementCount: number;
  specOpen: boolean;
  onToggleSpec: () => void;
  /** Opens the compiled project, once technical design is approved. */
  onOpenProject: () => void;
}

const formatTime = (iso: string) => new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/**
 * Where the session stands in the architect's process: the four stages, who
 * the current one is for, and the gate to the next. Approving is always a
 * person's click; the coach can only ask for it.
 */
export const StageBar: React.FC<StageBarProps> = ({ board, onApprove, onReopen, requirementCount, specOpen, onToggleSpec, onOpenProject }) => {
  const stage = stageOf(board.stage.current);
  const g = gate(board, stage.id);
  const [approving, setApproving] = useState(false);
  const [by, setBy] = useState(stage.approver);
  const [showStages, setShowStages] = useState(false);

  useEffect(() => {
    setApproving(false);
    setBy(stage.approver);
  }, [stage.id, stage.approver]);

  const approvedBy = (id: StageId) => board.stage.approvals.find((a) => a.stage === id);

  return (
    <header
      aria-label="Stage"
      className="fixed top-0 inset-x-0 z-40 h-14 bg-white/95 backdrop-blur-xl border-b border-[#e2e2e6] text-[#18181c] font-body"
    >
      <div className="h-full flex items-center gap-4 px-5">
        <ol className="flex items-center gap-1 min-w-0">
          {STAGES.map((s, i) => {
            const a = approvedBy(s.id);
            const current = s.id === stage.id;
            return (
              <li key={s.id} className="flex items-center gap-1 min-w-0">
                {i > 0 && <span aria-hidden className={`w-4 lg:w-8 h-px ${a || current ? 'bg-[#18181c]' : 'bg-[#e2e2e6]'}`} />}
                <button
                  onClick={() => setShowStages(!showStages)}
                  aria-expanded={showStages}
                  aria-current={current ? 'step' : undefined}
                  title={a ? `Approved by ${a.by}, ${formatTime(a.at)}` : `For ${s.audience.charAt(0).toLowerCase() + s.audience.slice(1)}`}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded-lg min-w-0 ${current ? 'bg-[#f6f6f8]' : 'hover:bg-[#f6f6f8]'}`}
                >
                  <span
                    className={`shrink-0 w-5 h-5 rounded-full grid place-items-center text-[11px] font-semibold tabular-nums ${
                      a ? 'bg-[#18181c] text-white' : current ? 'bg-[#c8f13a] text-[#18181c]' : 'bg-[#f0f0f2] text-[#87868e]'
                    }`}
                  >
                    {a ? <Check className="w-3 h-3" /> : s.n}
                  </span>
                  <span className={`text-left min-w-0 ${current ? '' : 'hidden md:block'}`}>
                    <span className={`block text-sm truncate ${current ? 'font-semibold' : a ? 'text-[#18181c]' : 'text-[#87868e]'}`}>{s.title}</span>
                    {current && (
                      <span className="hidden xl:block text-[11px] leading-tight text-[#87868e] truncate max-w-[260px]">
                        For {s.audience.charAt(0).toLowerCase() + s.audience.slice(1)}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>

        <div className="ml-auto flex items-center gap-3 shrink-0">
          <button
            onClick={onToggleSpec}
            aria-pressed={specOpen}
            className={`text-xs px-2.5 py-1.5 rounded-lg ${specOpen ? 'bg-[#f0f0f2] text-[#18181c]' : 'text-[#5a5a62] hover:text-[#18181c] hover:bg-[#f0f0f2]'}`}
          >
            Document · {requirementCount}
          </button>
          {stage.id === 'compile' && (
            <button onClick={onOpenProject} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[#18181c] text-white hover:bg-black">
              Open the project
            </button>
          )}
          {stage.id !== 'compile' && g.ready && !approving && (
            <button onClick={() => setApproving(true)} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[#18181c] text-white hover:bg-black">
              Approve {stage.title.toLowerCase()}
            </button>
          )}
          {stage.id !== 'compile' && !g.ready && (
            <span className="text-xs text-[#87868e]" title={g.missing.join(', ')}>
              {g.missing.length} to go
            </span>
          )}
        </div>
      </div>

      {showStages && (
        <ol className="absolute left-5 top-full mt-2 w-[360px] max-w-[calc(100vw-2.5rem)] p-3 space-y-2 rounded-2xl bg-white border border-[#e2e2e6] shadow-[0_8px_30px_rgba(24,24,28,0.08)]">
          {STAGES.map((s) => {
            const a = approvedBy(s.id);
            return (
              <li key={s.id} className="flex items-start justify-between gap-2 text-xs">
                <div>
                  <span className={s.id === stage.id ? 'font-semibold' : a ? '' : 'text-[#a1a0a8]'}>
                    {a ? <Check className="inline w-3 h-3 mr-1 -mt-0.5" /> : <span className="inline-block w-4 tabular-nums">{s.n}</span>}
                    {s.title}
                  </span>
                  <p className="ml-4 text-[#87868e]">For {s.audience.charAt(0).toLowerCase() + s.audience.slice(1)}</p>
                  <p className="ml-4 text-[#87868e]">{a ? `Approved by ${a.by}, ${formatTime(a.at)}` : s.artifact}</p>
                </div>
                {a && (
                  <button
                    onClick={() => {
                      if (window.confirm(`Reopen ${s.title.toLowerCase()}? Every stage after it will need approval again.`)) onReopen(s.id);
                    }}
                    className="shrink-0 flex items-center gap-1 text-[#5a5a62] hover:text-[#18181c]"
                    title={`Reopen ${s.title.toLowerCase()}`}
                  >
                    <RotateCcw className="w-3 h-3" /> Reopen
                  </button>
                )}
              </li>
            );
          })}
        </ol>
      )}

      {approving && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (by.trim()) onApprove(stage.id, by.trim());
          }}
          className="absolute right-5 top-full mt-2 w-[400px] max-w-[calc(100vw-2.5rem)] p-3 space-y-2 rounded-2xl bg-white border border-[#e2e2e6] shadow-[0_8px_30px_rgba(24,24,28,0.08)]"
        >
          <label htmlFor="approver" className="block text-xs text-[#5a5a62]">
            Approved by, name or role. The next stage builds on this one.
          </label>
          <div className="flex gap-2">
            <input
              id="approver"
              autoFocus
              maxLength={80}
              value={by}
              onChange={(e) => setBy(e.target.value)}
              className="flex-1 min-w-0 px-3 py-1.5 rounded-lg border border-[#e2e2e6] text-sm focus:outline-none focus:border-[#18181c]"
            />
            <button type="submit" disabled={!by.trim()} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[#18181c] text-white disabled:opacity-40">
              Approve
            </button>
            <button type="button" onClick={() => setApproving(false)} className="px-2 py-1.5 rounded-lg text-xs text-[#5a5a62] hover:bg-[#f0f0f2]">
              Cancel
            </button>
          </div>
        </form>
      )}
    </header>
  );
};
