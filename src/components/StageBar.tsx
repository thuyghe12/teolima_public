import React from 'react';
import { Check } from 'lucide-react';
import type { Board, StageId } from '../../shared/board/schema';
import { gate, stageOf, STAGES } from '../../shared/board/stages';

interface StageBarProps {
  board: Board;
  /** The stage whose document is open, if any. */
  openStage: StageId | null;
  /** Opens a stage: its document, or the project for compile. */
  onSelectStage: (stage: StageId) => void;
}

const formatTime = (iso: string) => new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/**
 * The architect's process as a stepper across the top: the four stages, who
 * each is for, and how far the current one is from its gate. Each stage opens
 * its own document, where a person reviews and approves it.
 */
export const StageBar: React.FC<StageBarProps> = ({ board, openStage, onSelectStage }) => {
  const stage = stageOf(board.stage.current);
  const g = gate(board, stage.id);
  const approvedBy = (id: StageId) => board.stage.approvals.find((a) => a.stage === id);

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
            <button onClick={() => onSelectStage('compile')} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[#18181c] text-white hover:bg-black">
              Open the project
            </button>
          ) : g.ready ? (
            <button onClick={() => onSelectStage(stage.id)} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[#18181c] text-white hover:bg-black">
              Review and approve
            </button>
          ) : (
            <button onClick={() => onSelectStage(stage.id)} className="text-xs text-[#5a5a62] hover:text-[#18181c]" title={g.missing.join(', ')}>
              {g.missing.length} to go before approval
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
