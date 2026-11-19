import React from 'react';
import { RotateCcw } from 'lucide-react';
import type { Board, StageId } from '../../shared/board/schema';
import { stageOf } from '../../shared/board/stages';

interface StageGateProps {
  board: Board;
  stage: StageId;
  onReopen: (stage: StageId) => void;
}

const formatTime = (iso: string) => new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** The foot of an approved stage's document: who approved it, and a way to reopen it. */
export const StageGate: React.FC<StageGateProps> = ({ board, stage, onReopen }) => {
  const st = stageOf(stage);
  const approval = board.stage.approvals.find((a) => a.stage === stage);

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
  return null;
};
