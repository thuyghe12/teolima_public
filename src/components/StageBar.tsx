import React, { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import type { Board, StageId } from '../../shared/board/schema';
import { gate, stageOf, STAGES } from '../../shared/board/stages';

interface StageBarProps {
  board: Board;
  /** The stage whose document is open, if any. */
  openStage: StageId | null;
  /** Opens a stage: its document, or the project for compile. */
  onSelectStage: (stage: StageId) => void;
  onApprove: (stage: StageId, by: string) => void;
}

const formatTime = (iso: string) => new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/**
 * The architect's process as a stepper across the top: the four stages, who
 * each is for, and how far the current one is from its gate. Each stage opens
 * its own document, where a person reviews and approves it.
 */
export const StageBar: React.FC<StageBarProps> = ({ board, openStage, onSelectStage, onApprove }) => {
  const stage = stageOf(board.stage.current);
  const g = gate(board, stage.id);
  const approvedBy = (id: StageId) => board.stage.approvals.find((a) => a.stage === id);
  const [popover, setPopover] = useState(false);
  const [by, setBy] = useState(stage.approver);
  useEffect(() => {
    setPopover(false);
    setBy(stage.approver);
  }, [stage.id, stage.approver]);

  return (
    <header
      aria-label="Stages"
      className="fixed top-0 inset-x-0 z-40 h-14 bg-white/95 backdrop-blur-xl border-b border-[#e2e2e6] text-[#18181c] font-body"
    >
      <div className="h-full flex items-center gap-4 px-5">
        <ol className="flex items-center gap-1 min-w-0">
          {STAGES.map((s, i) => {
            const a = approvedBy(s.id);
            const current = s.id === stage.id;
            const reached = a || current;
            const open = openStage === s.id;
            return (
              <li key={s.id} className="flex items-center gap-1 min-w-0">
                {i > 0 && <span aria-hidden className={`w-4 lg:w-8 h-px ${reached ? 'bg-[#18181c]' : 'bg-[#e2e2e6]'}`} />}
                <button
                  onClick={() => reached && onSelectStage(s.id)}
                  disabled={!reached}
                  aria-current={current ? 'step' : undefined}
                  aria-pressed={open}
                  title={a ? `Approved by ${a.by}, ${formatTime(a.at)}` : `For ${lower(s.audience)}`}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded-lg min-w-0 border ${
                    open ? 'bg-[#f6f6f8] border-[#e2e2e6]' : 'border-transparent'
                  } ${reached ? 'hover:bg-[#f6f6f8]' : 'cursor-default'}`}
                >
                  <span
                    className={`shrink-0 w-5 h-5 rounded-full grid place-items-center text-[11px] font-semibold tabular-nums ${
                      a ? 'bg-[#18181c] text-white' : current ? 'bg-[#c8f13a] text-[#18181c]' : 'bg-[#f0f0f2] text-[#87868e]'
                    }`}
                  >
                    {a ? <Check className="w-3 h-3" /> : s.n}
                  </span>
                  <span className={`text-left min-w-0 ${current ? '' : 'hidden md:block'}`}>
                    <span className={`block text-sm truncate ${current ? 'font-semibold' : a ? 'text-[#18181c]' : 'text-[#a1a0a8]'}`}>{s.title}</span>
                    {current && <span className="hidden xl:block text-[11px] leading-tight text-[#87868e] truncate max-w-[260px]">For {lower(s.audience)}</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>

        <div className="ml-auto flex items-center gap-3 shrink-0">
          {stage.id === 'compile' ? (
            <button onClick={() => onSelectStage('compile')} className="px-4 py-2 rounded-lg text-sm font-semibold bg-[#c8f13a] text-[#18181c] hover:bg-[#b9e22b]">
              Open the project
            </button>
          ) : (
            <button
              onClick={() => setPopover(!popover)}
              aria-expanded={popover}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                g.ready ? 'bg-[#c8f13a] text-[#18181c] hover:bg-[#b9e22b] shadow-[0_0_0_3px_rgba(200,241,58,0.25)]' : 'bg-[#f0f0f2] text-[#87868e] hover:text-[#18181c]'
              }`}
            >
              Approve {stage.title.toLowerCase()}
              {!g.ready && <span className="text-[11px] font-medium px-1.5 py-0.5 rounded-md bg-white text-[#5a5a62] tabular-nums">{g.missing.length} to go</span>}
            </button>
          )}
        </div>
      </div>

      {popover && stage.id !== 'compile' && (
        <div className="absolute right-5 top-full mt-2 w-[380px] max-w-[calc(100vw-2.5rem)] p-4 rounded-2xl bg-white border border-[#e2e2e6] shadow-[0_12px_40px_rgba(24,24,28,0.12)]">
          {g.ready ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (by.trim()) {
                  onApprove(stage.id, by.trim());
                  setPopover(false);
                }
              }}
              className="space-y-3"
            >
              <p className="text-sm font-semibold">Approve {stage.title.toLowerCase()}</p>
              <p className="text-xs text-[#5a5a62]">The next stage builds on it. You can reopen it later; every stage after it then needs approval again.</p>
              <label className="block text-xs text-[#5a5a62]">
                Approved by, name or role
                <input
                  autoFocus
                  maxLength={80}
                  value={by}
                  onChange={(e) => setBy(e.target.value)}
                  className="mt-1 w-full px-3 py-2 rounded-lg border border-[#e2e2e6] text-sm text-[#18181c] focus:outline-none focus:border-[#18181c]"
                />
              </label>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setPopover(false)} className="px-3 py-1.5 rounded-lg text-xs text-[#5a5a62] hover:bg-[#f0f0f2]">
                  Cancel
                </button>
                <button type="submit" disabled={!by.trim()} className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-[#18181c] text-white hover:bg-black disabled:opacity-40">
                  Approve
                </button>
              </div>
            </form>
          ) : (
            <div className="space-y-2">
              <p className="text-sm font-semibold">{g.missing.length} to go before {stage.approver.toLowerCase()} can approve</p>
              <ul className="max-h-60 overflow-y-auto space-y-1">
                {g.missing.map((m) => (
                  <li key={m} className="text-xs text-[#5a5a62]">○ {m}</li>
                ))}
              </ul>
              <button onClick={() => { setPopover(false); onSelectStage(stage.id); }} className="text-xs font-medium text-[#18181c] underline underline-offset-2">
                Open the {stage.title.toLowerCase()} document
              </button>
            </div>
          )}
        </div>
      )}
    </header>
  );
};
