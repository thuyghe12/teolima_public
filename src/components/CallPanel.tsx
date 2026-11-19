import React, { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, ClipboardPaste, History, Keyboard, ListChecks, Mic, MicOff, Phone, PhoneOff, Send } from 'lucide-react';
import type { LiveTranscriptItem } from '../types';
import type { Step } from '../../shared/board/readiness';
import { BRIEF_LIMITS, BriefDraft, constraintsFromText, normalizeBrief } from '../lib/briefs';

interface CallPanelProps {
  isCallActive: boolean;
  isConnecting: boolean;
  isMuted: boolean;
  isAiSpeaking: boolean;
  isAiDrawing: boolean;
  statusMessage?: string;
  transcripts: LiveTranscriptItem[];
  brief: BriefDraft;
  onBriefChange: (brief: BriefDraft) => void;
  recentBriefs: BriefDraft[];
  onStartCall: () => void;
  onEndCall: () => void;
  /** Saves an edited brief during a call. */
  onSaveBrief: (brief: BriefDraft) => void;
  onToggleMute: () => void;
  onSendText: (text: string) => void;
  onOpenHistory: () => void;
  savedCount: number;
  /** Where the board stands against the design standard (shared/board/readiness.ts). */
  steps?: Step[];
  /** A transcript or notes to hand the coach when the call starts. */
  document: DocumentDraft;
  onDocumentChange: (d: DocumentDraft) => void;
  /** Hands a pasted document to the coach during a call. */
  onSendDocument: (d: DocumentDraft) => void;
  /** Requirements recorded so far, and whether the specification is open. */
  requirementCount: number;
  specOpen: boolean;
  onToggleSpec: () => void;
}

export interface DocumentDraft {
  title: string;
  text: string;
}

export const MAX_DOCUMENT_CHARS = 60_000;

/** A pasted transcript, RFP or notes: the coach records the requirements it states, each quoted. */
const DocumentFields: React.FC<{ doc: DocumentDraft; onChange: (d: DocumentDraft) => void; autoFocus?: boolean }> = ({ doc, onChange, autoFocus }) => (
  <div className="space-y-2">
    <input
      aria-label="Document title"
      maxLength={80}
      value={doc.title}
      onChange={(e) => onChange({ ...doc, title: e.target.value })}
      placeholder="Title, e.g. Discovery call with Contoso"
      className={field}
    />
    <textarea
      aria-label="Transcript or notes"
      autoFocus={autoFocus}
      rows={5}
      maxLength={MAX_DOCUMENT_CHARS}
      value={doc.text}
      onChange={(e) => onChange({ ...doc, text: e.target.value })}
      placeholder="Paste a discovery call transcript, an RFP or notes. The coach records the requirements it states, each with a quote."
      className={`${field} resize-y`}
    />
  </div>
);

/** The steps of the design standard as a row of segments, with the next one named. */
const DesignSteps: React.FC<{ steps: Step[] }> = ({ steps }) => {
  const [open, setOpen] = useState(false);
  const shown = steps.filter((s) => s.status !== 'later');
  const done = shown.filter((s) => s.status === 'done').length;
  const next = shown.find((s) => s.status !== 'done');
  return (
    <div>
      <button onClick={() => setOpen(!open)} className="w-full text-left" aria-expanded={open}>
        <div className="flex gap-1" aria-hidden>
          {shown.map((s) => (
            <span key={s.id} title={s.title} className={`h-1 flex-1 rounded-full ${s.status === 'done' ? 'bg-[#18181c]' : s.status === 'open' ? 'bg-[#a1a0a8]' : 'bg-[#e2e2e6]'}`} />
          ))}
        </div>
        <div className="mt-1.5 flex justify-between text-xs text-[#5a5a62]">
          <span>{next ? `Next: ${next.title}` : 'Every step done'}</span>
          <span className="tabular-nums">{done} of {shown.length}</span>
        </div>
      </button>
      {open && (
        <ol className="mt-2 space-y-1.5">
          {steps.map((s) => (
            <li key={s.id} className="text-xs">
              <span className={`font-medium ${s.status === 'done' ? 'text-[#18181c]' : 'text-[#5a5a62]'}`}>
                {s.status === 'done' ? '✓' : s.status === 'later' ? '·' : '○'} {s.title}
              </span>
              {s.status !== 'done' && <p className="ml-4 text-[#87868e]">{s.detail}</p>}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
};

const label = 'block text-xs font-medium text-[#5a5a62] mb-1';
const field =
  'w-full px-3 py-2 rounded-lg bg-white border border-[#e2e2e6] text-sm text-[#18181c] placeholder:text-[#a1a0a8] focus:outline-none focus:border-[#18181c] transition-colors';
const quiet = 'p-2 rounded-lg text-[#5a5a62] hover:text-[#18181c] hover:bg-[#f0f0f2] transition-colors disabled:opacity-40';

/** The brief form, used before a call and when editing during one. */
const BriefFields: React.FC<{ brief: BriefDraft; onChange: (b: BriefDraft) => void; autoFocus?: boolean }> = ({
  brief,
  onChange,
  autoFocus,
}) => {
  // Constraints are edited as text so typing a new line is not swallowed.
  const [constraintsText, setConstraintsText] = useState(brief.constraints.join('\n'));
  useEffect(() => {
    if (constraintsFromText(constraintsText).join('\n') !== brief.constraints.join('\n')) {
      setConstraintsText(brief.constraints.join('\n'));
    }
    // only when the brief is replaced from outside (a recent brief, the coach)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brief.constraints.join('\n')]);

  return (
    <div className="space-y-3">
      <div>
        <label htmlFor="brief-goal" className={label}>What should the system do?</label>
        <textarea
          id="brief-goal"
          rows={3}
          autoFocus={autoFocus}
          maxLength={BRIEF_LIMITS.goal}
          value={brief.goal}
          onChange={(e) => onChange({ ...brief, goal: e.target.value })}
          placeholder="e.g. Answer order questions and handle refunds safely"
          className={`${field} resize-none`}
        />
      </div>
      <div>
        <label htmlFor="brief-audience" className={label}>Who uses it?</label>
        <input
          id="brief-audience"
          maxLength={BRIEF_LIMITS.audience}
          value={brief.audience}
          onChange={(e) => onChange({ ...brief, audience: e.target.value })}
          placeholder="e.g. Customers of a web shop"
          className={field}
        />
      </div>
      <div>
        <label htmlFor="brief-constraints" className={label}>Constraints, one per line</label>
        <textarea
          id="brief-constraints"
          rows={2}
          value={constraintsText}
          onChange={(e) => {
            setConstraintsText(e.target.value);
            onChange({ ...brief, constraints: constraintsFromText(e.target.value) });
          }}
          placeholder="e.g. Refunds over 100 EUR need a person"
          className={`${field} resize-none`}
        />
      </div>
    </div>
  );
};

function statusText(p: CallPanelProps): string {
  if (p.isConnecting) return 'Connecting';
  if (!p.isCallActive) return 'Brief';
  if (p.statusMessage?.startsWith('Demo mode')) return 'Demo replay';
  if (p.isAiDrawing) return 'Building';
  if (p.isAiSpeaking) return 'Speaking';
  if (p.isMuted) return 'Muted';
  return 'Listening';
}

const formatDuration = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export const CallPanel: React.FC<CallPanelProps> = (props) => {
  const { isCallActive, isConnecting, brief, transcripts } = props;
  const [collapsed, setCollapsed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<BriefDraft>(brief);
  const [typing, setTyping] = useState(false);
  const [pasting, setPasting] = useState(false);
  const [showDocument, setShowDocument] = useState(false);
  const [callDoc, setCallDoc] = useState<DocumentDraft>({ title: '', text: '' });
  const [text, setText] = useState('');
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (!isCallActive) {
      setSeconds(0);
      setEditing(false);
      setTyping(false);
      setPasting(false);
      return;
    }
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [isCallActive]);

  const latest = [...transcripts].reverse().find((t) => t.speaker !== 'system');
  const status = statusText(props);
  const live = isCallActive && !props.isMuted;

  const send = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    props.onSendText(text.trim());
    setText('');
  };

  return (
    <section
      id="call-panel"
      aria-label="Call"
      className="fixed bottom-5 right-5 z-40 w-[340px] max-w-[calc(100vw-2.5rem)] rounded-2xl bg-white border border-[#e2e2e6] shadow-[0_8px_30px_rgba(24,24,28,0.08)] text-[#18181c] font-body"
    >
      <header className="flex items-center justify-between px-4 pt-3 pb-2">
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className={`w-2 h-2 rounded-full ${
              !isCallActive ? 'bg-[#d4d4d8]' : props.isAiSpeaking || props.isAiDrawing ? 'bg-[#18181c]' : live ? 'bg-[#059669]' : 'bg-[#a1a0a8]'
            }`}
          />
          <h2 className="text-sm font-semibold">{status}</h2>
        </div>
        <div className="flex items-center gap-1">
          {isCallActive && <span className="text-xs tabular-nums text-[#87868e] mr-1">{formatDuration(seconds)}</span>}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className={quiet}
            aria-label={collapsed ? 'Expand' : 'Collapse'}
            aria-expanded={!collapsed}
          >
            {collapsed ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </header>

      {!collapsed && (
        <div className="px-4 pb-3 space-y-3">
          {props.statusMessage && <p className="text-xs text-[#5a5a62]">{props.statusMessage}</p>}
          {props.steps && isCallActive && <DesignSteps steps={props.steps} />}

          {!isCallActive && (
            <>
              <BriefFields brief={brief} onChange={props.onBriefChange} />
              {!brief.goal.trim() && (
                <p className="text-xs text-[#87868e]">Without a goal, the coach asks for one before it builds anything.</p>
              )}
              <div>
                <button
                  onClick={() => setShowDocument(!showDocument)}
                  className="text-xs text-[#5a5a62] hover:text-[#18181c] underline underline-offset-2"
                  aria-expanded={showDocument || !!props.document.text}
                >
                  {props.document.text ? 'Transcript or notes added' : 'Add a transcript or notes'}
                </button>
                {(showDocument || !!props.document.text) && (
                  <div className="mt-2">
                    <DocumentFields doc={props.document} onChange={props.onDocumentChange} />
                  </div>
                )}
              </div>
              {props.recentBriefs.length > 0 && (
                <div>
                  <div className={label}>Recent</div>
                  <ul className="space-y-0.5">
                    {props.recentBriefs.map((b) => (
                      <li key={b.goal}>
                        <button
                          onClick={() => props.onBriefChange(b)}
                          title={b.goal}
                          className="w-full text-left truncate px-2 py-1 -mx-2 rounded-md text-xs text-[#5a5a62] hover:text-[#18181c] hover:bg-[#f0f0f2]"
                        >
                          {b.goal}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}

          {isCallActive && !editing && (
            <div className="space-y-2">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm text-[#18181c] line-clamp-2">
                  {brief.goal || <span className="text-[#87868e]">No brief yet. The coach will ask for the goal.</span>}
                </p>
                <button
                  onClick={() => {
                    setDraft(brief);
                    setEditing(true);
                  }}
                  className="shrink-0 text-xs text-[#5a5a62] hover:text-[#18181c] underline underline-offset-2"
                >
                  {brief.goal ? 'Edit' : 'Write'}
                </button>
              </div>
              {latest && (
                <p className="text-xs text-[#5a5a62] line-clamp-2">
                  <span className="font-medium text-[#18181c]">{latest.speaker === 'ai' ? 'Coach' : 'You'}:</span> {latest.text}
                </p>
              )}
            </div>
          )}

          {isCallActive && editing && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const b = normalizeBrief(draft);
                if (!b.goal) return;
                props.onSaveBrief(b);
                setEditing(false);
              }}
              className="space-y-3"
            >
              <BriefFields brief={draft} onChange={setDraft} autoFocus />
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setEditing(false)} className="px-3 py-1.5 rounded-lg text-xs text-[#5a5a62] hover:bg-[#f0f0f2]">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!draft.goal.trim()}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[#18181c] text-white disabled:opacity-40"
                >
                  Save brief
                </button>
              </div>
            </form>
          )}

          {isCallActive && pasting && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!callDoc.text.trim()) return;
                props.onSendDocument({ title: callDoc.title.trim(), text: callDoc.text.trim() });
                setCallDoc({ title: '', text: '' });
                setPasting(false);
              }}
              className="space-y-2"
            >
              <DocumentFields doc={callDoc} onChange={setCallDoc} autoFocus />
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setPasting(false)} className="px-3 py-1.5 rounded-lg text-xs text-[#5a5a62] hover:bg-[#f0f0f2]">
                  Cancel
                </button>
                <button type="submit" disabled={!callDoc.text.trim()} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[#18181c] text-white disabled:opacity-40">
                  Give to the coach
                </button>
              </div>
            </form>
          )}

          {isCallActive && typing && (
            <form onSubmit={send} className="flex gap-2">
              <input
                autoFocus
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Type instead of speaking"
                className={field}
                aria-label="Message to the coach"
              />
              <button type="submit" disabled={!text.trim()} className={quiet} aria-label="Send">
                <Send className="w-4 h-4" />
              </button>
            </form>
          )}
        </div>
      )}

      <footer className="flex items-center gap-1 px-3 py-2.5 border-t border-[#f0f0f2]">
        {isCallActive ? (
          <>
            <button onClick={props.onToggleMute} className={quiet} aria-label={props.isMuted ? 'Unmute' : 'Mute'} title={props.isMuted ? 'Unmute' : 'Mute'}>
              {props.isMuted ? <MicOff className="w-4 h-4 text-[#b91c1c]" /> : <Mic className="w-4 h-4" />}
            </button>
            <button
              onClick={() => setTyping(!typing)}
              className={`${quiet} ${typing ? 'bg-[#f0f0f2] text-[#18181c]' : ''}`}
              aria-label="Type a message"
              title="Type a message"
            >
              <Keyboard className="w-4 h-4" />
            </button>
            <button
              onClick={() => setPasting(!pasting)}
              className={`${quiet} ${pasting ? 'bg-[#f0f0f2] text-[#18181c]' : ''}`}
              aria-label="Paste a transcript or notes"
              title="Paste a transcript or notes"
            >
              <ClipboardPaste className="w-4 h-4" />
            </button>
          </>
        ) : (
          <button onClick={props.onOpenHistory} className={`${quiet} relative`} aria-label="Saved sessions" title="Saved sessions">
            <History className="w-4 h-4" />
            {props.savedCount > 0 && <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-[#18181c]" />}
          </button>
        )}
        <button
          onClick={props.onToggleSpec}
          className={`${quiet} flex items-center gap-1 ${props.specOpen ? 'bg-[#f0f0f2] text-[#18181c]' : ''}`}
          aria-label="Functional specification"
          title="Functional specification"
          aria-pressed={props.specOpen}
        >
          <ListChecks className="w-4 h-4" />
          {props.requirementCount > 0 && <span className="text-xs tabular-nums">{props.requirementCount}</span>}
        </button>
        <div className="flex-1" />
        {isCallActive ? (
          <button
            onClick={props.onEndCall}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border border-[#e2e2e6] text-[#b91c1c] hover:bg-[#fef2f2] transition-colors"
          >
            <PhoneOff className="w-4 h-4" /> End call
          </button>
        ) : (
          <button
            onClick={props.onStartCall}
            disabled={isConnecting}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-[#18181c] text-white hover:bg-black disabled:opacity-60 transition-colors"
          >
            <Phone className="w-4 h-4" /> {isConnecting ? 'Connecting' : 'Start call'}
          </button>
        )}
      </footer>
    </section>
  );
};
