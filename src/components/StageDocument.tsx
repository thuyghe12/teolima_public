import React, { useMemo, useRef, useState } from 'react';
import { Check, ChevronRight, Copy, Download, FileText, Lock, Mic, PenLine, Plus, Trash2, Type as TypeIcon, X } from 'lucide-react';
import type { ChangeBody } from '../../shared/board/changes';
import type { Board, SpecItem, StageId } from '../../shared/board/schema';
import { CHAPTERS, CONSTRAINT_CATEGORIES, DECISION_TOPICS, QUALITY_ATTRIBUTES, type ItemType } from '../../shared/board/arc42';
import { discovery } from '../../shared/board/discovery';
import { itemLabel, itemName, itemRef, KIND_LABELS, scenarioSteps, servedBy, sourceLabel, stageDocument, stageMarkdown, traceTargets, type DocSection } from '../../shared/board/spec-document';
import { stageOf, traceability } from '../../shared/board/stages';

interface StageDocumentProps {
  board: Board;
  stage: StageId;
  /** The stages reached so far that have a document, for the tabs. */
  stages: StageId[];
  onSelectStage: (stage: StageId) => void;
  /** Titles of pasted documents, by id. */
  documents: Record<string, string>;
  /** Sends a change as the user's; undefined when the document cannot be edited right now. */
  onEdit?: (body: ChangeBody) => void;
  /** Why it cannot be edited, when onEdit is undefined. */
  readOnlyReason?: string;
  onClose: () => void;
}

const NOTE: ItemType = { id: 'note', label: '', placeholder: 'Write something' };

const SourceIcon: React.FC<{ item: SpecItem }> = ({ item }) => {
  const Icon = item.source.kind === 'document' ? FileText : item.source.kind === 'brief' ? PenLine : item.source.kind === 'typed' ? TypeIcon : Mic;
  return <Icon className="w-3.5 h-3.5" aria-hidden />;
};

const field = 'bg-transparent text-sm text-[#18181c] placeholder:text-[#b4b4ba] focus:outline-none';
const input = `w-full ${field}`;

/** One line: its label, its text (click to edit), and on hover its source and a delete button. */
const Row: React.FC<{ board: Board; section: DocSection; item: SpecItem; documents: Record<string, string>; onEdit?: (b: ChangeBody) => void }> = ({ board, section, item, documents, onEdit }) => {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(item.text);
  const [showSource, setShowSource] = useState(false);
  const label = item.topic ? DECISION_TOPICS[item.topic].label : itemLabel(section, item);
  const save = () => {
    setEditing(false);
    const t = text.trim();
    if (!t || t === item.text || !onEdit) return setText(item.text);
    onEdit({ op: 'record_item', id: item.id, section: item.section, type: item.type, text: t });
  };
  return (
    <li className="group relative -mx-2 px-2 py-1.5 rounded-md hover:bg-[#f7f7f8]">
      <div className="flex items-start gap-3">
        {label && <span className="w-24 shrink-0 pt-0.5 text-[11px] uppercase tracking-wide text-[#87868e]">{label}</span>}
        <div className="flex-1 min-w-0">
          {item.name && <span className="text-sm font-medium mr-1.5">{item.name}</span>}
          {editing ? (
            <input
              autoFocus
              value={text}
              maxLength={300}
              onChange={(e) => setText(e.target.value)}
              onBlur={save}
              onKeyDown={(e) => {
                if (e.key === 'Enter') save();
                if (e.key === 'Escape') {
                  setText(item.text);
                  setEditing(false);
                }
              }}
              className={input}
              aria-label="Edit item"
            />
          ) : (
            <span
              onClick={() => onEdit && setEditing(true)}
              className={`text-sm leading-snug ${item.name ? 'text-[#5a5a62]' : ''} ${onEdit ? 'cursor-text' : ''}`}
            >
              {item.text}
            </span>
          )}
          {item.type === 'quality_approach' && !!item.serves?.length && (
            <p className="mt-0.5 text-xs text-[#87868e]">Meets {item.serves.map((id) => itemName(board, id)).join(' · ')}</p>
          )}
          {item.type === 'decision' && (
            <div className="mt-1 space-y-1">
              {!!item.options?.length && (
                <div className="flex flex-wrap gap-1" aria-label="Options considered">
                  {item.options.map((o) => (
                    <span key={o} className={`text-[11px] px-1.5 py-0.5 rounded ${o.toLowerCase() === item.name?.toLowerCase() ? 'bg-[#18181c] text-white' : 'bg-[#f0f0f2] text-[#5a5a62]'}`}>
                      {o}
                    </span>
                  ))}
                </div>
              )}
              {item.consequences && <p className="text-xs text-[#5a5a62]">{item.consequences}</p>}
            </div>
          )}
          {showSource && (
            <p className="mt-1 text-xs text-[#87868e]">
              {item.source.quote ? `"${item.source.quote}" · ` : ''}
              {sourceLabel(item, documents)}
            </p>
          )}
        </div>
        <div className="flex items-center gap-0.5 pt-0.5 text-[#b4b4ba]">
          <button onClick={() => setShowSource(!showSource)} className="p-0.5 hover:text-[#18181c]" aria-label="Show source" title={sourceLabel(item, documents)}>
            <SourceIcon item={item} />
          </button>
          {onEdit && (
            <button onClick={() => onEdit({ op: 'remove_item', ref: item.id })} className="p-0.5 opacity-0 group-hover:opacity-100 hover:text-[#b91c1c]" aria-label="Delete item">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </li>
  );
};

/** The inline composer: choose the type if the section has several, then name, attribute or category if it needs one, then the text. */
const Composer: React.FC<{ board: Board; section: DocSection; onAdd: (b: ChangeBody) => void; onDone: () => void }> = ({ board, section, onAdd, onDone }) => {
  const types = section.custom ? [NOTE] : section.def!.types;
  const [type, setType] = useState(types[0]);
  const [name, setName] = useState('');
  const [text, setText] = useState('');
  const [attribute, setAttribute] = useState<keyof typeof QUALITY_ATTRIBUTES>('reliability');
  const [category, setCategory] = useState<keyof typeof CONSTRAINT_CATEGORIES>('regulatory');
  const qualityGoals = board.spec.items.filter((i) => i.section === '1.2');
  const [goal, setGoal] = useState(qualityGoals[0]?.id ?? '');
  const [topic, setTopic] = useState<keyof typeof DECISION_TOPICS>('platform');
  const [others, setOthers] = useState('');
  const [consequences, setConsequences] = useState('');
  const textRef = useRef<HTMLInputElement>(null);
  const ready = text.trim() && (!type.named || name.trim()) && (type.id !== 'quality_approach' || goal);
  const options = () => {
    const rest = others.split(',').map((o) => o.trim()).filter((o) => o && o.toLowerCase() !== name.trim().toLowerCase());
    return rest.length ? [name.trim(), ...rest] : undefined;
  };
  const submit = () => {
    if (!ready) return;
    onAdd({
      op: 'record_item',
      section: section.id,
      type: type.id,
      text: text.trim(),
      ...(type.named ? { name: name.trim() } : {}),
      ...(type.id === 'quality' ? { attribute } : {}),
      ...(type.id === 'constraint' ? { category } : {}),
      ...(type.id === 'quality_approach' ? { serves: [goal] } : {}),
      ...(type.id === 'decision' ? { topic, options: options(), ...(consequences.trim() ? { consequences: consequences.trim() } : {}) } : {}),
    });
    setText('');
    setName('');
    setOthers('');
    setConsequences('');
    textRef.current?.focus();
  };
  const select = 'text-xs bg-[#f0f0f2] rounded-md px-1.5 py-1 text-[#18181c] focus:outline-none';
  return (
    <div className="mt-1 -mx-2 px-2 py-2 rounded-lg bg-[#f7f7f8] space-y-2">
      {types.length > 1 && (
        <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Type">
          {types.map((t) => (
            <button
              key={t.id}
              role="radio"
              aria-checked={t.id === type.id}
              onClick={() => setType(t)}
              className={`text-xs px-2 py-0.5 rounded-full ${t.id === type.id ? 'bg-[#18181c] text-white' : 'bg-white text-[#5a5a62] hover:text-[#18181c]'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2">
        {type.id === 'quality' && (
          <select value={attribute} onChange={(e) => setAttribute(e.target.value as never)} className={select} aria-label="Quality attribute">
            {Object.entries(QUALITY_ATTRIBUTES).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
        )}
        {type.id === 'constraint' && (
          <select value={category} onChange={(e) => setCategory(e.target.value as never)} className={select} aria-label="Constraint category">
            {Object.entries(CONSTRAINT_CATEGORIES).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        )}
        {type.id === 'quality_approach' && (
          <select value={goal} onChange={(e) => setGoal(e.target.value)} className={`${select} max-w-36`} aria-label="Quality goal">
            {qualityGoals.length === 0 && <option value="">No quality goals in 1.2</option>}
            {qualityGoals.map((q) => (
              <option key={q.id} value={q.id}>{q.text}</option>
            ))}
          </select>
        )}
        {type.id === 'decision' && (
          <select value={topic} onChange={(e) => setTopic(e.target.value as never)} className={select} aria-label="Decision topic">
            {Object.entries(DECISION_TOPICS).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
        )}
        {type.named && (
          <input
            autoFocus
            value={name}
            maxLength={40}
            onChange={(e) => setName(e.target.value)}
            placeholder={type.id === 'decision' ? 'Chosen option' : 'Name'}
            className={`${field} w-28 shrink-0 font-medium`}
            aria-label={type.id === 'decision' ? 'Chosen option' : 'Name'}
          />
        )}
        <input
          ref={textRef}
          autoFocus={!type.named}
          value={text}
          maxLength={300}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
            if (e.key === 'Escape') onDone();
          }}
          placeholder={type.placeholder}
          className={`${field} flex-1 min-w-0`}
          aria-label="Text"
        />
      </div>
      {type.id === 'decision' && (
        <div className="space-y-1.5">
          <input value={others} maxLength={200} onChange={(e) => setOthers(e.target.value)} placeholder="Other options weighed, separated by commas" className={input} aria-label="Other options" />
          <input value={consequences} maxLength={300} onChange={(e) => setConsequences(e.target.value)} placeholder="Consequences, good and bad" className={input} aria-label="Consequences" />
        </div>
      )}
      <div className="flex justify-end gap-1">
        <button onClick={onDone} className="text-xs px-2 py-1 rounded-md text-[#5a5a62] hover:bg-white">Done</button>
        <button onClick={submit} disabled={!ready} className="text-xs px-2 py-1 rounded-md bg-[#18181c] text-white disabled:opacity-30">Add</button>
      </div>
    </div>
  );
};

/** arc42 5: the building blocks on the board with what they serve, and the coverage of every flow, rule and external system. */
const BuildingBlocks: React.FC<{ board: Board }> = ({ board }) => {
  const targets = traceTargets(board);
  if (!board.components.length) return <p className="mt-1 text-xs text-[#a1a0a8]">The blocks appear here as they are drawn on the board.</p>;
  return (
    <div className="mt-1 space-y-3">
      <ul>
        {board.components.map((c) => (
          <li key={c.id} className="flex items-start gap-3 py-1">
            <span className="w-24 shrink-0 pt-0.5 text-[11px] uppercase tracking-wide text-[#87868e]">{KIND_LABELS[c.kind]}</span>
            <div className="flex-1 min-w-0 text-sm leading-snug">
              <span className="font-medium mr-1.5">{c.name}</span>
              <span className="text-[#5a5a62]">{c.description}</span>
              {!!c.serves.length && <p className="text-xs text-[#87868e]">Serves {c.serves.map((id) => itemName(board, id)).join(' · ')}</p>}
            </div>
          </li>
        ))}
      </ul>
      {!!targets.length && (
        <div>
          <p className="text-[11px] uppercase tracking-wide text-[#a1a0a8] mb-1">Traceability</p>
          <ul className="space-y-0.5">
            {targets.map((t) => {
              const by = servedBy(board, t.id);
              return (
                <li key={t.id} className="text-xs flex gap-2">
                  <span className={by.length ? 'text-[#18181c]' : 'text-[#b91c1c]'}>{by.length ? '✓' : '○'}</span>
                  <span className="flex-1 min-w-0">
                    {itemRef(board, t.id)}
                    <span className="text-[#87868e]"> · {by.length ? by.join(', ') : 'not covered'}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
};

/** arc42 6: the runtime scenario of each user flow, numbered. */
const Runtime: React.FC<{ board: Board; onEdit?: (b: ChangeBody) => void }> = ({ board, onEdit }) => {
  const flows = board.spec.items.filter((i) => i.type === 'flow');
  return (
    <div className="mt-1 space-y-3">
      {flows.map((f) => {
        const sc = board.spec.scenarios.find((x) => x.flow === f.id);
        return (
          <div key={f.id} className="group">
            <div className="flex items-center gap-2">
              <p className="flex-1 text-sm font-medium">{sc ? sc.title : f.text}</p>
              {sc && onEdit && (
                <button onClick={() => onEdit({ op: 'remove_scenario', ref: sc.id })} className="p-0.5 text-[#b4b4ba] opacity-0 group-hover:opacity-100 hover:text-[#b91c1c]" aria-label="Delete scenario">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <p className="text-xs text-[#87868e]">Realises {itemRef(board, f.id)}</p>
            {sc ? (
              <ol className="mt-1 space-y-0.5">
                {scenarioSteps(board, sc).map((line) => (
                  <li key={line} className="text-xs text-[#18181c] tabular-nums">{line}</li>
                ))}
              </ol>
            ) : (
              <p className="mt-1 text-xs text-[#b91c1c]">No scenario yet. Ask the coach to walk through this flow.</p>
            )}
          </div>
        );
      })}
    </div>
  );
};

const SectionTitle: React.FC<{ section: DocSection; onEdit?: (b: ChangeBody) => void }> = ({ section, onEdit }) => {
  const [title, setTitle] = useState(section.title);
  if (!section.custom) {
    return (
      <h3 className="text-sm font-semibold">
        <span className="text-[#a1a0a8] font-normal tabular-nums mr-2">{section.number}</span>
        {section.title}
      </h3>
    );
  }
  return (
    <div className="group flex items-center gap-2">
      <input
        value={title}
        disabled={!onEdit}
        maxLength={80}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={() => onEdit && title.trim() && title.trim() !== section.title && onEdit({ op: 'rename_section', ref: section.id, title: title.trim() })}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        className="flex-1 bg-transparent text-sm font-semibold focus:outline-none disabled:text-[#18181c]"
        aria-label="Section title"
      />
      {onEdit && (
        <button onClick={() => onEdit({ op: 'remove_section', ref: section.id })} className="p-0.5 text-[#b4b4ba] opacity-0 group-hover:opacity-100 hover:text-[#b91c1c]" aria-label="Delete section">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
};

/** A stage document as an editable page: arc42 sections, items one line each, add and edit inline. */
export const StageDocument: React.FC<StageDocumentProps> = ({ board, stage, stages, onSelectStage, documents, onEdit, readOnlyReason, onClose }) => {
  const sections = useMemo(() => stageDocument(board, stage), [board, stage]);
  const d = useMemo(() => discovery(board), [board]);
  const st = stageOf(stage);
  const approval = board.stage.approvals.find((a) => a.stage === stage);
  const [adding, setAdding] = useState<string | null>(null);
  const [newSection, setNewSection] = useState<string | null>(null);
  const [showTopics, setShowTopics] = useState(false);
  const [copied, setCopied] = useState(false);
  const gaps = useMemo(() => (stage === 'solution' ? traceability(board) : []), [board, stage]);
  const [showGaps, setShowGaps] = useState(false);
  const required = d.topics.filter((t) => t.topic.required);
  const covered = required.filter((t) => t.covered).length;
  const markdown = () => stageMarkdown(board, stage, documents);

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
    a.download = `${(board.title || 'architecture').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${stage}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  let chapter = '';
  return (
    <aside
      aria-label={`${st.title} document`}
      className="fixed top-[150px] left-5 bottom-5 z-20 w-[440px] max-w-[calc(100vw-2.5rem)] flex flex-col rounded-2xl bg-white border border-[#e2e2e6] shadow-[0_8px_30px_rgba(24,24,28,0.06)] text-[#18181c] font-body"
    >
      <header className="flex items-start justify-between pl-5 pr-2 pt-3 pb-2.5 border-b border-[#f0f0f2]">
        <div>
          <h2 className="text-sm font-semibold">{stage === 'discovery' ? 'Functional specification' : st.title}</h2>
          <p className="text-xs text-[#87868e]">
            arc42 {sections.filter((s) => !s.custom).map((s) => s.number)[0]} to {sections.filter((s) => !s.custom).at(-1)?.number}
            {approval ? ` · Approved by ${approval.by}` : ''}
          </p>
        </div>
        <div className="flex items-center">
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

      {stages.length > 1 && (
        <div className="flex gap-1 px-4 py-1.5 border-b border-[#f0f0f2]" role="tablist" aria-label="Stage documents">
          {stages.map((id) => (
            <button
              key={id}
              role="tab"
              aria-selected={id === stage}
              onClick={() => onSelectStage(id)}
              className={`text-xs px-2 py-1 rounded-md ${id === stage ? 'bg-[#f0f0f2] text-[#18181c]' : 'text-[#87868e] hover:text-[#18181c]'}`}
            >
              {stageOf(id).n} · {stageOf(id).title}
            </button>
          ))}
        </div>
      )}

      {stage === 'discovery' && !approval && (
        <div className="px-5 py-2 border-b border-[#f0f0f2]">
          <button onClick={() => setShowTopics(!showTopics)} className="w-full flex items-center justify-between text-xs text-[#5a5a62]" aria-expanded={showTopics}>
            <span>{covered} of {required.length} topics needed for approval</span>
            <ChevronRight className={`w-3.5 h-3.5 transition-transform ${showTopics ? 'rotate-90' : ''}`} />
          </button>
          {showTopics && (
            <ul className="mt-2 space-y-1">
              {d.topics.map(({ topic, covered: c }) => (
                <li key={topic.id} className={`text-xs ${c ? 'text-[#18181c]' : topic.required ? 'text-[#5a5a62]' : 'text-[#a1a0a8]'}`}>
                  {c ? '✓' : topic.required ? '○' : '·'} {topic.title}
                  {!c && <span className="text-[#a1a0a8]"> · {topic.records}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {stage === 'solution' && !approval && (
        <div className="px-5 py-2 border-b border-[#f0f0f2]">
          <button onClick={() => setShowGaps(!showGaps)} disabled={!gaps.length} className="w-full flex items-center justify-between text-xs text-[#5a5a62]" aria-expanded={showGaps}>
            <span>{gaps.length ? `${gaps.length} open before approval` : 'Everything traces to the specification'}</span>
            {!!gaps.length && <ChevronRight className={`w-3.5 h-3.5 transition-transform ${showGaps ? 'rotate-90' : ''}`} />}
          </button>
          {showGaps && (
            <ul className="mt-2 space-y-1">
              {gaps.map((g) => (
                <li key={g} className="text-xs text-[#5a5a62]">○ {g}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {!onEdit && readOnlyReason && (
        <p className="flex items-center gap-1.5 px-5 py-2 text-xs text-[#87868e] border-b border-[#f0f0f2]">
          <Lock className="w-3 h-3" /> {readOnlyReason}
        </p>
      )}

      <div className="flex-1 overflow-y-auto px-5 py-3 space-y-5">
        {sections.map((s) => {
          const c = s.custom ? '' : s.number.split('.')[0];
          const showChapter = !s.custom && s.number.includes('.') && c !== chapter;
          if (!s.custom) chapter = c;
          return (
            <section key={s.id}>
              {showChapter && (
                <p className="mb-2 text-[11px] uppercase tracking-wide text-[#a1a0a8]">
                  {c}. {CHAPTERS[c]}
                </p>
              )}
              <SectionTitle section={s} onEdit={onEdit} />
              {s.id === '5' && <BuildingBlocks board={board} />}
              {s.id === '6' && <Runtime board={board} onEdit={onEdit} />}
              {s.items.length === 0 && s.hint && adding !== s.id && s.id !== '5' && s.id !== '6' && <p className="mt-1 text-xs text-[#a1a0a8]">{s.hint}</p>}
              {s.items.length > 0 && (
                <ul className="mt-1">
                  {s.items.map((i) => (
                    <Row key={`${i.id}:${i.text}`} board={board} section={s} item={i} documents={documents} onEdit={onEdit} />
                  ))}
                </ul>
              )}
              {onEdit && adding === s.id && <Composer board={board} section={s} onAdd={onEdit} onDone={() => setAdding(null)} />}
              {onEdit && adding !== s.id && (s.custom || !!s.def?.types.length) && (
                <button onClick={() => setAdding(s.id)} className="mt-1 flex items-center gap-1 text-xs text-[#a1a0a8] hover:text-[#18181c]">
                  <Plus className="w-3.5 h-3.5" /> Add
                </button>
              )}
            </section>
          );
        })}

        {onEdit &&
          (newSection === null ? (
            <button onClick={() => setNewSection('')} className="flex items-center gap-1 text-xs text-[#5a5a62] hover:text-[#18181c]">
              <Plus className="w-3.5 h-3.5" /> Section
            </button>
          ) : (
            <input
              autoFocus
              value={newSection}
              maxLength={80}
              onChange={(e) => setNewSection(e.target.value)}
              onBlur={() => setNewSection(null)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newSection.trim()) {
                  onEdit({ op: 'add_section', title: newSection.trim() });
                  setNewSection(null);
                }
                if (e.key === 'Escape') setNewSection(null);
              }}
              placeholder="Section title"
              className={`${input} font-semibold`}
              aria-label="New section title"
            />
          ))}
      </div>
    </aside>
  );
};
