import React, { useEffect, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import type { Board, StageId } from '../../shared/board/schema';
import { gate, stageOf } from '../../shared/board/stages';

interface StageGateProps {
  board: Board;
  stage: StageId;
  onApprove: (stage: StageId, by: string) => void;
  onReopen: (stage: StageId) => void;
}

const formatTime = (iso: string) => new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** The foot of a stage document: what is left, the approval, or who approved it. */
export const StageGate: React.FC<StageGateProps> = ({ board, stage, onApprove, onReopen }) => {
  const st = stageOf(stage);
  const approval = board.stage.approvals.find((a) => a.stage === stage);
  const current = board.stage.current === stage;
  const g = gate(board, stage);
  const [by, setBy] = useState(st.approver);
  const [showMissing, setShowMissing] = useState(false);
  useEffect(() => setBy(st.approver), [st.approver]);

  if (approval) {
    return (
      <footer className="flex items-center justify-between gap-2 px-5 py-3 border-t border-[#e2e2e6] bg-[#fafafa] text-xs">
        <span className="text-[#5a5a62]">
          Approved by <span className="text-[#18181c] font-medium">{approval.by}</span>, {formatTime(approval.at)}
        </span>
        <button
          onClick={() => {
            if (window.confirm(`Reopen ${st.title.toLowerCase()}? Every stage after it will need approval again.`)) onReopen(stage);
          }}
          className="shrink-0 flex items-center gap-1 text-[#5a5a62] hover:text-[#18181c]"
        >
          <RotateCcw className="w-3 h-3" /> Reopen
        </button>
      </footer>
    );
  }
  if (!current) return null;

  return (
    <footer className="px-5 py-3 border-t border-[#e2e2e6] bg-[#fafafa] space-y-2">
      {g.ready ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (by.trim()) onApprove(stage, by.trim());
          }}
          className="space-y-2"
        >
          <label htmlFor="approver" className="block text-xs text-[#5a5a62]">
            Approve {st.title.toLowerCase()}. Approved by, name or role; the next stage builds on this one.
          </label>
          <div className="flex gap-2">
            <input
              id="approver"
              maxLength={80}
              value={by}
              onChange={(e) => setBy(e.target.value)}
              className="flex-1 min-w-0 px-3 py-1.5 rounded-lg border border-[#e2e2e6] bg-white text-sm focus:outline-none focus:border-[#18181c]"
            />
            <button type="submit" disabled={!by.trim()} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[#18181c] text-white hover:bg-black disabled:opacity-40">
              Approve {st.title.toLowerCase()}
            </button>
          </div>
        </form>
      ) : (
        <>
          <button onClick={() => setShowMissing(!showMissing)} className="w-full flex items-center justify-between text-xs" aria-expanded={showMissing}>
            <span className="text-[#18181c] font-medium">{g.missing.length} to go before {st.approver.toLowerCase()} can approve</span>
            <span className="text-[#87868e]">{showMissing ? 'Hide' : 'Show'}</span>
          </button>
          {showMissing && (
            <ul className="max-h-40 overflow-y-auto space-y-1">
              {g.missing.map((m) => (
                <li key={m} className="text-xs text-[#5a5a62]">○ {m}</li>
              ))}
            </ul>
          )}
        </>
      )}
    </footer>
  );
};
