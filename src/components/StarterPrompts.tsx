import React from 'react';
import type { BriefDraft } from '../lib/briefs';

/**
 * Example briefs, shown on an empty board. Picking one fills the brief in the
 * call panel, where the user can change it before the call starts.
 */
export const STARTER_BRIEFS: Array<{ label: string; brief: BriefDraft }> = [
  {
    label: 'Customer support',
    brief: { goal: 'Answer order questions and handle refunds safely', audience: 'Customers of a web shop', constraints: [] },
  },
  {
    label: 'Research assistant',
    brief: { goal: 'Search internal documents and write a sourced summary', audience: 'Analysts', constraints: [] },
  },
  {
    label: 'Invoice processing',
    brief: { goal: 'Check incoming invoices against purchase orders and route exceptions to a person', audience: 'The finance team', constraints: [] },
  },
  {
    label: 'Content review',
    brief: { goal: 'Draft marketing copy, check it against brand rules, and get a person to sign off', audience: 'The marketing team', constraints: [] },
  },
];

interface StarterPromptsProps {
  onSelect: (brief: BriefDraft) => void;
}

export const StarterPrompts: React.FC<StarterPromptsProps> = ({ onSelect }) => (
  <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
    <div className="pointer-events-auto max-w-xl text-center px-6">
      <h1 className="text-2xl font-semibold text-[#18181c] font-body">What should your agents do?</h1>
      <p className="mt-2 text-sm text-[#5a5a62] font-body">
        Write a brief in the panel, or start from an example.
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        {STARTER_BRIEFS.map((s) => (
          <button
            key={s.label}
            onClick={() => onSelect({ ...s.brief })}
            className="px-3.5 py-2 rounded-xl border border-[#e2e2e6] bg-white text-sm text-[#18181c] hover:border-[#18181c] hover:bg-[#fafafa] transition-colors"
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  </div>
);
