import React, { useEffect, useState } from 'react';
import { Check, ChevronDown, RotateCcw } from 'lucide-react';
import type { Board, StageId } from '../../shared/board/schema';
import { gate, stageOf, STAGES } from '../../shared/board/stages';

interface StageBarProps {
  board: Board;
  onApprove: (stage: StageId, by: string) => void;
  onReopen: (stage: StageId) => void;
  requirementCount: number;
  specOpen: boolean;
  onToggleSpec: () => void;
}

const formatTime = (iso: string) => new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/**
 * Where the session stands in the architect's process: the four stages, who
 * the current one is for, and the gate to the next. Approving is always a
 * person's click; the coach can only ask for it.
 */
export const StageBar: React.FC<StageBarProps> = ({ board, onApprove, onReopen, requirementCount, specOpen, onToggleSpec }) => {
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
    <section
      aria-label="Stage"
      className="fixed top-4 left-5 z-30 w-[340px] max-w-[calc(100vw-2.5rem)] rounded-2xl bg-white border border-[#e2e2e6] shadow-[0_8px_30px_rgba(24,24,28,0.06)] text-[#18181c] font-body"
    >
      <button onClick={() => setShowStages(!showStages)} className="w-full text-left px-4 pt-3 pb-2" aria-expanded={showStages}>
        <div className="flex gap-1" aria-hidden>
          {STAGES.map((s) => (
            <span
              key={s.id}
              className={`h-1 flex-1 rounded-full ${approvedBy(s.id) ? 'bg-[#18181c]' : s.id === stage.id ? 'bg-[#c8f13a]' : 'bg-[#e2e2e6]'}`}
            />
          ))}
        </div>
        <div className="mt-2 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">
            <span className="text-[#87868e] font-normal tabular-nums">{stage.n} of {STAGES.length}</span> · {stage.title}
          </h2>
          <ChevronDown className={`w-4 h-4 text-[#87868e] transition-transform ${showStages ? 'rotate-180' : ''}`} />
        </div>
        <p className="text-xs text-[#87868e]">For {stage.audience.charAt(0).toLowerCase() + stage.audience.slice(1)}</p>
      </button>

      {showStages && (
        <ol className="px-4 pb-2 space-y-1.5 border-t border-[#f0f0f2] pt-2">
          {STAGES.map((s) => {
            const a = approvedBy(s.id);
            return (
              <li key={s.id} className="flex items-start justify-between gap-2 text-xs">
                <div>
                  <span className={s.id === stage.id ? 'font-semibold' : a ? '' : 'text-[#a1a0a8]'}>
                    {a ? <Check className="inline w-3 h-3 mr-1 -mt-0.5" /> : <span className="inline-block w-4 tabular-nums">{s.n}</span>}
                    {s.title}
                  </span>
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

      <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-t border-[#f0f0f2]">
        <button
          onClick={onToggleSpec}
          aria-pressed={specOpen}
          className={`text-xs px-2 py-1 -ml-2 rounded-md ${specOpen ? 'bg-[#f0f0f2] text-[#18181c]' : 'text-[#5a5a62] hover:text-[#18181c] hover:bg-[#f0f0f2]'}`}
        >
          Document · {requirementCount}
        </button>
        {g.ready && !approving && (
          <button onClick={() => setApproving(true)} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[#18181c] text-white hover:bg-black">
            Approve {stage.title.toLowerCase()}
          </button>
        )}
        {!g.ready && (
          <span className="text-xs text-[#87868e] text-right truncate" title={g.missing.join(', ')}>
            {stage.n > 2 ? 'Coming next' : `${g.missing.length} to go`}
          </span>
        )}
      </div>

      {approving && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (by.trim()) onApprove(stage.id, by.trim());
          }}
          className="px-4 pb-3 space-y-2"
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
              className="flex-1 px-3 py-1.5 rounded-lg border border-[#e2e2e6] text-sm focus:outline-none focus:border-[#18181c]"
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
    </section>
  );
};
