import React from 'react';

/** Ways to start, shown on an empty board and gone once there is a design. */
export const STARTER_PROMPTS = [
  {
    label: 'Customer support',
    prompt: 'Design a customer support system that answers order questions and handles refunds safely.',
  },
  {
    label: 'Research assistant',
    prompt: 'Design a research assistant that searches the web and internal documents and writes a sourced summary.',
  },
  {
    label: 'Invoice processing',
    prompt: 'Design a system that reads incoming invoices, checks them against purchase orders and asks a person to approve exceptions.',
  },
  {
    label: 'Content review',
    prompt: 'Design a pipeline where one agent drafts marketing copy, another checks it against brand rules, and a person signs off.',
  },
];

interface StarterPromptsProps {
  onSelect: (prompt: string) => void;
}

export const StarterPrompts: React.FC<StarterPromptsProps> = ({ onSelect }) => (
  <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
    <div className="pointer-events-auto max-w-xl text-center px-6">
      <h1 className="text-2xl font-semibold text-[#18181c] font-body">What should your agents do?</h1>
      <p className="mt-2 text-sm text-[#5a5a62] font-body">
        Start a call and describe it in your own words, or pick a starting point.
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        {STARTER_PROMPTS.map((s) => (
          <button
            key={s.label}
            onClick={() => onSelect(s.prompt)}
            className="px-3.5 py-2 rounded-xl border border-[#e2e2e6] bg-white text-sm text-[#18181c] hover:border-[#18181c] hover:bg-[#fafafa] transition-colors"
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  </div>
);
