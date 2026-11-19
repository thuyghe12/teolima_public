import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, ChevronRight, Download, FileText, Folder, Loader2, Plus, X } from 'lucide-react';
import type { Board } from '../../shared/board/schema';
import { DOMAINS, emptySettings, type CheckReport, type CustomRule, type Domain, type RubricSettings, type RuleResult } from '../../shared/compile/rubric';
import { dilemmas as askDilemmas, type CompileAnswers, type Dilemma, type ModelAnswer } from '../../shared/compile/wizard';
import { getAccessToken } from '../lib/access';

/** What the server's compiler returns (server/compile). */
type Origin = 'landing-zone' | 'parameters' | 'generated' | 'document';
interface CompiledFile {
  path: string;
  content: string;
  origin: Origin;
  serves: string[];
}
interface CompiledParameter {
  name: string;
  value: unknown;
  because: string;
  serves: string[];
  edited: boolean;
}
type Result =
  | { ok: true; files: CompiledFile[]; dilemmas: Dilemma[]; todo: string[]; parameters: CompiledParameter[]; report: CheckReport }
  | { ok: false; reason: string; dilemmas: Dilemma[] };

interface CompileStudioProps {
  board: Board;
  onClose: () => void;
}

/** The origin colours: where every file and line comes from. */
const ORIGIN: Record<Origin | 'edited', { label: string; line: string; dot: string }> = {
  'landing-zone': { label: 'AI Landing Zone, unchanged', line: 'bg-[#f6f6f8] text-[#6b6b73]', dot: 'bg-[#c4c4ca]' },
  parameters: { label: "The design's choice", line: 'bg-[rgba(200,241,58,0.28)] text-[#18181c]', dot: 'bg-[#c8f13a]' },
  edited: { label: 'Changed in review', line: 'bg-[rgba(236,72,153,0.14)] text-[#18181c]', dot: 'bg-[#ec4899]' },
  generated: { label: 'Compiled from the board', line: 'bg-white text-[#18181c]', dot: 'bg-[#18181c]' },
  document: { label: 'Documentation', line: 'bg-[#f3f4ff] text-[#18181c]', dot: 'bg-[#a5b4fc]' },
};

const api = async (path: string, body: unknown) => {
  const token = getAccessToken();
  return fetch(`${path}${token ? `?token=${encodeURIComponent(token)}` : ''}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
};

/** The lines of main.parameters.json each parameter occupies, so its lines take its colour. */
function parameterLines(content: string, params: CompiledParameter[]): Map<number, CompiledParameter> {
  const lines = content.split('\n');
  const out = new Map<number, CompiledParameter>();
  for (const p of params) {
    const start = lines.findIndex((l) => l.startsWith(`    "${p.name}": {`));
    if (start < 0) continue;
    let end = start;
    while (end < lines.length && !/^ {4}\}/.test(lines[end])) end++;
    for (let i = start; i <= end; i++) out.set(i, p);
  }
  return out;
}

/** A tree of paths: folders first, then files. */
interface Node {
  name: string;
  path: string;
  file?: CompiledFile;
  children: Node[];
}
function tree(files: CompiledFile[]): Node {
  const root: Node = { name: '', path: '', children: [] };
  for (const f of files) {
    const parts = f.path.split('/');
    let n = root;
    parts.forEach((part, i) => {
      const path = parts.slice(0, i + 1).join('/');
      let child = n.children.find((c) => c.name === part);
      if (!child) {
        child = { name: part, path, children: [], ...(i === parts.length - 1 ? { file: f } : {}) };
        n.children.push(child);
      }
      n = child;
    });
  }
  const sort = (n: Node) => {
    n.children.sort((a, b) => (a.file ? 1 : 0) - (b.file ? 1 : 0) || a.name.localeCompare(b.name));
    n.children.forEach(sort);
  };
  sort(root);
  return root;
}

const originOfFolder = (n: Node): Origin | 'mixed' => {
  const all = new Set<Origin>();
  const walk = (x: Node) => (x.file ? all.add(x.file.origin) : x.children.forEach(walk));
  walk(n);
  return all.size === 1 ? [...all][0] : 'mixed';
};

const Tree: React.FC<{ node: Node; depth: number; open: Set<string>; toggle: (p: string) => void; selected: string; select: (p: string) => void; edited: boolean }> = ({ node, depth, open, toggle, selected, select, edited }) => (
  <ul>
    {node.children.map((c) => {
      const o = c.file ? (c.file.path === 'infra/main.parameters.json' && edited ? 'edited' : c.file.origin) : originOfFolder(c);
      return (
        <li key={c.path}>
          <button
            onClick={() => (c.file ? select(c.path) : toggle(c.path))}
            className={`w-full flex items-center gap-1.5 py-[3px] pr-2 text-left text-[12px] rounded ${selected === c.path ? 'bg-[#18181c] text-white' : 'hover:bg-[#f0f0f2]'}`}
            style={{ paddingLeft: 8 + depth * 12 }}
          >
            {c.file ? <FileText className="w-3.5 h-3.5 shrink-0 opacity-60" /> : <ChevronRight className={`w-3.5 h-3.5 shrink-0 opacity-60 transition-transform ${open.has(c.path) ? 'rotate-90' : ''}`} />}
            {!c.file && <Folder className="w-3.5 h-3.5 shrink-0 opacity-60" />}
            <span className="flex-1 truncate font-mono-code">{c.name}</span>
            {o !== 'mixed' && <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${ORIGIN[o].dot}`} aria-label={ORIGIN[o].label} />}
          </button>
          {!c.file && open.has(c.path) && <Tree node={c} depth={depth + 1} open={open} toggle={toggle} selected={selected} select={select} edited={edited} />}
        </li>
      );
    })}
  </ul>
);

/** The value of an azd environment reference, ${NAME=default}. */
const envRef = (v: unknown) => (typeof v === 'string' ? /^\$\{([A-Z_]+)=(.*)\}$/.exec(v) : null);

const ParameterEditor: React.FC<{ p: CompiledParameter; name: (id: string) => string; onChange: (value: unknown) => void; onReset: () => void }> = ({ p, name, onChange, onReset }) => {
  const ref = envRef(p.value);
  const [draft, setDraft] = useState(ref ? ref[2] : '');
  useEffect(() => setDraft(ref ? ref[2] : ''), [p.value]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="mx-3 mb-2 rounded-lg border border-[#e2e2e6] bg-white p-3 text-xs space-y-1.5 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="font-mono-code font-semibold">{p.name}</span>
        <span className={`px-1.5 py-0.5 rounded ${p.edited ? 'bg-[rgba(236,72,153,0.14)]' : 'bg-[rgba(200,241,58,0.4)]'}`}>{p.edited ? 'Changed in review' : "The design's choice"}</span>
      </div>
      <p className="text-[#5a5a62]">{p.because}</p>
      {!!p.serves.length && <p className="text-[#87868e]">Serves {p.serves.map(name).join(' · ')}</p>}
      {ref ? (
        <div className="flex items-center gap-2 pt-1">
          <span className="font-mono-code text-[#87868e]">{ref[1]} =</span>
          {draft === 'true' || draft === 'false' ? (
            <select value={draft} onChange={(e) => onChange(`\${${ref[1]}=${e.target.value}}`)} className="bg-[#f0f0f2] rounded px-1.5 py-1 font-mono-code" aria-label={`${p.name} value`}>
              <option value="true">true</option>
              <option value="false">false</option>
            </select>
          ) : (
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => draft !== ref[2] && onChange(`\${${ref[1]}=${draft}}`)}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              className="flex-1 bg-[#f0f0f2] rounded px-1.5 py-1 font-mono-code focus:outline-none"
              aria-label={`${p.name} value`}
            />
          )}
          {p.edited && (
            <button onClick={onReset} className="text-[#87868e] hover:text-[#18181c]">
              Use the design's value
            </button>
          )}
        </div>
      ) : (
        <p className="text-[#87868e]">A list: it follows the design. Change the design, or this file after export.</p>
      )}
      <p className="text-[#a1a0a8]">Each environment can still override it with azd env set.</p>
    </div>
  );
};

/** The file view: line numbers, every line coloured by origin, markers for what is still to connect. */
const FileView: React.FC<{ file: CompiledFile; params: CompiledParameter[]; name: (id: string) => string; focusLine?: number; onEdit: (name: string, value: unknown) => void; onReset: (name: string) => void }> = ({ file, params, name, focusLine, onEdit, onReset }) => {
  const lines = useMemo(() => file.content.replace(/\n$/, '').split('\n'), [file.content]);
  const paramAt = useMemo(() => (file.path === 'infra/main.parameters.json' ? parameterLines(file.content, params) : new Map<number, CompiledParameter>()), [file, params]);
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => setActive(null), [file.path]);
  useEffect(() => {
    if (focusLine) document.getElementById(`line-${focusLine}`)?.scrollIntoView({ block: 'center' });
  }, [focusLine, file.path]);
  const activeParam = params.find((p) => p.name === active);
  const base = ORIGIN[file.origin];
  return (
    <div className="flex-1 min-h-0 overflow-auto">
      {activeParam && <div className="sticky top-0 z-10 pt-2 bg-gradient-to-b from-white"><ParameterEditor p={activeParam} name={name} onChange={(v) => onEdit(activeParam.name, v)} onReset={() => onReset(activeParam.name)} /></div>}
      <pre className="text-[12px] leading-[19px] font-mono-code">
        {lines.map((l, i) => {
          const p = paramAt.get(i);
          const style = p ? (p.edited ? ORIGIN.edited : ORIGIN.parameters) : file.path === 'infra/main.parameters.json' ? ORIGIN['landing-zone'] : base;
          const mark = /NotImplementedError/.test(l) ? 'to connect' : /approval_mode="always_require"/.test(l) ? 'approval' : '';
          return (
            <div
              key={i}
              id={`line-${i + 1}`}
              onClick={() => p && setActive(p.name)}
              className={`flex ${style.line} ${p ? 'cursor-pointer hover:brightness-95' : ''} ${focusLine === i + 1 ? 'outline outline-1 outline-[#18181c]' : ''}`}
            >
              <span className={`w-12 shrink-0 select-none text-right pr-3 text-[#b4b4ba] ${mark === 'to connect' ? 'bg-[#fef3c7] text-[#92400e]' : mark === 'approval' ? 'bg-[#c8f13a] text-[#18181c]' : ''}`} title={mark}>
                {i + 1}
              </span>
              <span className="pl-2 pr-6 whitespace-pre">{l || ' '}</span>
            </div>
          );
        })}
      </pre>
    </div>
  );
};

const STATUS_STYLE: Record<RuleResult['status'], string> = {
  pass: 'bg-[#18181c] text-white',
  fail: 'bg-[#fee2e2] text-[#991b1b]',
  off: 'bg-[#f0f0f2] text-[#87868e]',
  skipped: 'bg-[#f0f0f2] text-[#87868e]',
};

const Checks: React.FC<{ report: CheckReport; settings: RubricSettings; setSettings: (s: RubricSettings) => void; open: (path: string, line?: number) => void }> = ({ report, settings, setSettings, open }) => {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<Omit<CustomRule, 'id'>>({ check: '', path: '', pattern: '', expect: 'absent', severity: 'warn' });
  const domains = [...new Set(report.results.map((r) => r.rule.domain))] as Domain[];
  const count = (st: RuleResult['status']) => report.results.filter((r) => r.status === st).length;
  return (
    <div className="space-y-3">
      <p className="text-xs text-[#5a5a62]">
        {report.results.length} rules · {count('pass')} pass · {count('fail')} fail{report.blocking.length ? ` (${report.blocking.length} blocking)` : ''}
        {count('off') ? ` · ${count('off')} off` : ''}
      </p>
      {domains.map((d) => (
        <div key={d}>
          <p className="text-[11px] uppercase tracking-wide text-[#a1a0a8] mb-1">{DOMAINS[d]}</p>
          <ul className="space-y-1.5">
            {report.results
              .filter((r) => r.rule.domain === d)
              .map((r) => (
                <li key={r.rule.id} className="rounded-lg border border-[#f0f0f2] p-2">
                  <div className="flex items-start gap-2">
                    <span className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded font-mono-code ${STATUS_STYLE[r.status]}`}>{r.rule.id}</span>
                    <p className="flex-1 text-xs leading-snug">{r.rule.check}</p>
                    <label className="shrink-0 flex items-center gap-1 text-[10px] text-[#87868e]" title="Turn the rule off for this project; recorded in docs/checks.md">
                      <input
                        type="checkbox"
                        checked={!settings.off.includes(r.rule.id)}
                        onChange={(e) => setSettings({ ...settings, off: e.target.checked ? settings.off.filter((x) => x !== r.rule.id) : [...settings.off, r.rule.id] })}
                        aria-label={`${r.rule.id} on`}
                      />
                      on
                    </label>
                  </div>
                  <p className="mt-1 text-[10px] text-[#a1a0a8]">
                    {r.rule.signal} · {r.rule.method} · {r.rule.severity === 'block' ? 'blocks export' : 'warns'}
                    {r.rule.source && (
                      <>
                        {' · '}
                        <a href={r.rule.source} target="_blank" rel="noreferrer" className="hover:text-[#18181c] underline">source</a>
                      </>
                    )}
                  </p>
                  {r.rule.threshold && (
                    <label className="mt-1 flex items-center gap-2 text-[11px] text-[#5a5a62]">
                      {r.rule.threshold.label}
                      <input
                        type="number"
                        min={r.rule.threshold.min}
                        max={r.rule.threshold.max}
                        value={r.rule.threshold.value}
                        onChange={(e) => setSettings({ ...settings, thresholds: { ...settings.thresholds, [r.rule.id]: Number(e.target.value) } })}
                        className="w-16 bg-[#f0f0f2] rounded px-1 py-0.5 font-mono-code"
                      />
                    </label>
                  )}
                  {r.findings.map((f, i) => (
                    <button key={i} onClick={() => f.path && open(f.path, f.line)} className="mt-1 block text-left text-[11px] text-[#991b1b] hover:underline">
                      {f.path ? `${f.path}${f.line ? `:${f.line}` : ''}: ` : ''}
                      {f.message}
                    </button>
                  ))}
                  {r.rule.domain === 'custom' && (
                    <button onClick={() => setSettings({ ...settings, custom: settings.custom.filter((c) => c.id !== r.rule.id) })} className="mt-1 text-[10px] text-[#87868e] hover:text-[#b91c1c]">
                      Remove rule
                    </button>
                  )}
                </li>
              ))}
          </ul>
        </div>
      ))}
      {adding ? (
        <div className="rounded-lg border border-[#e2e2e6] p-2 space-y-1.5 text-xs">
          <input value={draft.check} onChange={(e) => setDraft({ ...draft, check: e.target.value })} placeholder="What must hold, e.g. Agents never print." className="w-full bg-[#f0f0f2] rounded px-1.5 py-1" aria-label="Rule" />
          <div className="flex gap-1.5">
            <input value={draft.path} onChange={(e) => setDraft({ ...draft, path: e.target.value })} placeholder="Path, e.g. src/agents/" className="flex-1 bg-[#f0f0f2] rounded px-1.5 py-1 font-mono-code" aria-label="Path" />
            <input value={draft.pattern} onChange={(e) => setDraft({ ...draft, pattern: e.target.value })} placeholder="Pattern, e.g. \bprint\(" className="flex-1 bg-[#f0f0f2] rounded px-1.5 py-1 font-mono-code" aria-label="Pattern" />
          </div>
          <div className="flex gap-1.5 items-center">
            <select value={draft.expect} onChange={(e) => setDraft({ ...draft, expect: e.target.value as CustomRule['expect'] })} className="bg-[#f0f0f2] rounded px-1 py-1" aria-label="Expect">
              <option value="absent">must not appear</option>
              <option value="present">must appear</option>
            </select>
            <select value={draft.severity} onChange={(e) => setDraft({ ...draft, severity: e.target.value as CustomRule['severity'] })} className="bg-[#f0f0f2] rounded px-1 py-1" aria-label="Severity">
              <option value="warn">warns</option>
              <option value="block">blocks export</option>
            </select>
            <span className="flex-1" />
            <button onClick={() => setAdding(false)} className="px-2 py-1 text-[#5a5a62]">Cancel</button>
            <button
              disabled={!draft.check.trim() || !draft.pattern.trim()}
              onClick={() => {
                setSettings({ ...settings, custom: [...settings.custom, { ...draft, id: `OWN-${settings.custom.length + 1}` }] });
                setDraft({ check: '', path: '', pattern: '', expect: 'absent', severity: 'warn' });
                setAdding(false);
              }}
              className="px-2 py-1 rounded bg-[#18181c] text-white disabled:opacity-30"
            >
              Add
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAdding(true)} className="flex items-center gap-1 text-xs text-[#5a5a62] hover:text-[#18181c]">
          <Plus className="w-3.5 h-3.5" /> Rule
        </button>
      )}
    </div>
  );
};

/** The few questions no stage settled, prefilled from technical design. */
const Wizard: React.FC<{ board: Board; answers: CompileAnswers; setAnswers: (a: CompileAnswers) => void }> = ({ board, answers, setAnswers }) => {
  const asked = askDilemmas(board, answers);
  const model = (m: string): ModelAnswer => answers.models?.[m] ?? { version: '', sku: 'GlobalStandard', capacity: 0 };
  const setModel = (m: string, a: Partial<ModelAnswer>) => setAnswers({ ...answers, models: { ...answers.models, [m]: { ...model(m), ...a } } });
  const field = 'w-full bg-[#f0f0f2] rounded px-1.5 py-1 text-xs focus:outline-none';
  return (
    <ul className="space-y-2.5">
      {asked.map((d) => (
        <li key={d.id} className="rounded-lg border border-[#f0f0f2] p-2.5">
          <div className="flex items-start gap-2">
            <span className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${d.open ? 'bg-[#f59e0b]' : 'bg-[#c8f13a]'}`} />
            <div className="flex-1 min-w-0 space-y-1.5">
              <p className="text-xs font-medium">{d.question}</p>
              <p className="text-[11px] text-[#87868e]">{d.why}</p>
              {d.id === 'region' && <input className={field} value={answers.region ?? ''} placeholder={d.prefill ? `${d.prefill} (from technical design)` : 'e.g. swedencentral'} onChange={(e) => setAnswers({ ...answers, region: e.target.value || undefined })} aria-label="Region" />}
              {d.id === 'network' && (
                <select className={field} value={answers.networkIsolation === undefined ? '' : String(answers.networkIsolation)} onChange={(e) => setAnswers({ ...answers, networkIsolation: e.target.value === '' ? undefined : e.target.value === 'true' })} aria-label="Network isolation">
                  <option value="">{d.prefill ? `${d.prefill} (from technical design)` : 'Choose'}</option>
                  <option value="true">Private networking</option>
                  <option value="false">Public endpoints</option>
                </select>
              )}
              {d.id === 'landing_zone' && (
                <select className={field} value={answers.landingZone ?? ''} onChange={(e) => setAnswers({ ...answers, landingZone: (e.target.value || undefined) as CompileAnswers['landingZone'] })} aria-label="Landing zone">
                  <option value="">{d.prefill ? `${d.prefill} (from technical design)` : 'Choose'}</option>
                  <option value="standalone">Standalone</option>
                  <option value="ailz-integrated">Existing platform landing zone</option>
                </select>
              )}
              {d.id === 'hub_vnet' && <input className={`${field} font-mono-code`} value={answers.hubVnetResourceId ?? ''} placeholder="/subscriptions/.../virtualNetworks/hub" onChange={(e) => setAnswers({ ...answers, hubVnetResourceId: e.target.value || undefined })} aria-label="Hub virtual network" />}
              {d.id.startsWith('agent_model:') && (
                <input className={field} value={answers.agentModels?.[d.id.slice(12)] ?? ''} placeholder="e.g. gpt-4.1" onChange={(e) => setAnswers({ ...answers, agentModels: { ...answers.agentModels, [d.id.slice(12)]: e.target.value } })} aria-label={d.question} />
              )}
              {d.id.startsWith('model:') && (
                <div className="grid grid-cols-3 gap-1.5">
                  <input className={`${field} font-mono-code`} value={model(d.id.slice(6)).version} placeholder="Version" onChange={(e) => setModel(d.id.slice(6), { version: e.target.value })} aria-label="Model version" />
                  <select className={field} value={model(d.id.slice(6)).sku} onChange={(e) => setModel(d.id.slice(6), { sku: e.target.value as ModelAnswer['sku'] })} aria-label="SKU">
                    <option>GlobalStandard</option>
                    <option>DataZoneStandard</option>
                    <option>Standard</option>
                  </select>
                  <input className={field} type="number" min={1} value={model(d.id.slice(6)).capacity || ''} placeholder="Capacity" onChange={(e) => setModel(d.id.slice(6), { capacity: Number(e.target.value) })} aria-label="Capacity" />
                </div>
              )}
              {d.id.startsWith('model:') && <p className="text-[11px] text-[#a1a0a8]">The version is never guessed: take it from the Foundry model catalog.</p>}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
};

/**
 * The compile stage: the project as a folder both teams review together, every
 * line coloured by where it comes from, the design's parameters editable in
 * place, and the rubric it is checked against. Export waits for every
 * blocking rule and a person's approval.
 */
export const CompileStudio: React.FC<CompileStudioProps> = ({ board, onClose }) => {
  const [answers, setAnswers] = useState<CompileAnswers>({});
  const [overrides, setOverrides] = useState<Record<string, unknown>>({});
  const [settings, setSettings] = useState<RubricSettings>(emptySettings());
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<'wizard' | 'checks'>('wizard');
  const [selected, setSelected] = useState('README.md');
  const [focusLine, setFocusLine] = useState<number | undefined>();
  const [open, setOpen] = useState<Set<string>>(new Set(['src', 'src/agents', 'docs']));
  const [by, setBy] = useState('');
  const [exportError, setExportError] = useState('');
  const pending = askDilemmas(board, answers).filter((d) => d.open);

  const run = useCallback(async () => {
    setBusy(true);
    try {
      const res = await api('/api/compile', { board, answers, overrides, settings });
      const r = (await res.json()) as Result;
      setResult(r);
      if (r.ok) setTab((t) => (t === 'wizard' ? 'checks' : t));
    } catch {
      setResult({ ok: false, reason: 'The server cannot be reached.', dilemmas: [] });
    } finally {
      setBusy(false);
    }
  }, [board, answers, overrides, settings]);

  // recompile and recheck when a parameter or a rule setting changes, once compiled
  useEffect(() => {
    if (result?.ok) void run();
  }, [overrides, settings]); // eslint-disable-line react-hooks/exhaustive-deps

  const download = async () => {
    setExportError('');
    const res = await api('/api/export', { board, answers, overrides, settings, by });
    if (!res.ok) return setExportError(((await res.json()) as { error: string }).error);
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(board.title || 'agent-system').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.zip`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const files = result?.ok ? result.files : [];
  /** A specification item or building block by its name, for people. */
  const nameOf = (id: string) => {
    const item = board.spec.items.find((i) => i.id === id);
    if (item) return item.type === 'setting' ? `${item.category?.replace('_', ' ')}: ${item.name}` : item.name ?? item.text;
    return board.components.find((c) => c.id === id)?.name ?? board.spec.items.find((i) => i.id === id)?.id ?? id;
  };
  const root = useMemo(() => tree(files), [files]);
  const file = files.find((f) => f.path === selected);
  const edited = Object.keys(overrides).length > 0;
  const openFile = (path: string, line?: number) => {
    setSelected(path);
    setFocusLine(line);
    const parts = path.split('/');
    setOpen((o) => new Set([...o, ...parts.slice(0, -1).map((_, i) => parts.slice(0, i + 1).join('/'))]));
  };

  return (
    <div role="dialog" aria-label="Compiled project" className="fixed inset-0 z-50 flex flex-col bg-[#fafafa] text-[#18181c] font-body">
      <header className="flex items-center gap-3 px-5 h-14 border-b border-[#e2e2e6] bg-white">
        <span className="text-sm font-semibold">4 · Compile</span>
        <span className="text-xs text-[#87868e]">{result?.ok ? `${files.length} files · an Azure Developer CLI project on the AI Landing Zone` : 'Answer the open questions, then compile'}</span>
        <span className="flex-1" />
        <div className="hidden md:flex items-center gap-3 text-[11px] text-[#5a5a62]">
          {(['landing-zone', 'parameters', 'edited', 'generated', 'document'] as const).map((o) => (
            <span key={o} className="flex items-center gap-1">
              <span className={`w-2 h-2 rounded-full ${ORIGIN[o].dot}`} />
              {ORIGIN[o].label}
            </span>
          ))}
        </div>
        <button onClick={onClose} className="p-2 rounded-lg hover:bg-[#f0f0f2]" aria-label="Close">
          <X className="w-4 h-4" />
        </button>
      </header>

      <div className="flex-1 min-h-0 flex">
        <nav aria-label="Files" className="w-[260px] shrink-0 overflow-auto border-r border-[#e2e2e6] bg-white py-2">
          {files.length ? (
            <Tree node={root} depth={0} open={open} toggle={(p) => setOpen((o) => { const n = new Set(o); if (n.has(p)) n.delete(p); else n.add(p); return n; })} selected={selected} select={(p) => openFile(p)} edited={edited} />
          ) : (
            <p className="px-4 text-xs text-[#a1a0a8]">The project appears here once it compiles.</p>
          )}
        </nav>

        <main className="flex-1 min-w-0 flex flex-col bg-white">
          {file ? (
            <>
              <div className="flex items-center gap-2 px-4 h-10 border-b border-[#f0f0f2] text-xs">
                <span className="font-mono-code">{file.path}</span>
                <span className={`px-1.5 py-0.5 rounded ${ORIGIN[file.path === 'infra/main.parameters.json' && edited ? 'edited' : file.origin].line}`}>{ORIGIN[file.path === 'infra/main.parameters.json' && edited ? 'edited' : file.origin].label}</span>
                {file.path === 'infra/main.parameters.json' && <span className="text-[#87868e]">Click a highlighted parameter to see why it is set, or change it.</span>}
                {!!file.serves.length && file.path !== 'infra/main.parameters.json' && <span className="truncate text-[#a1a0a8]">serves {file.serves.slice(0, 6).map(nameOf).join(' · ')}{file.serves.length > 6 ? '…' : ''}</span>}
              </div>
              <FileView
                file={file}
                params={result?.ok ? result.parameters : []}
                name={nameOf}
                focusLine={focusLine}
                onEdit={(name, value) => setOverrides((o) => ({ ...o, [name]: value }))}
                onReset={(name) => setOverrides((o) => Object.fromEntries(Object.entries(o).filter(([k]) => k !== name)))}
              />
            </>
          ) : (
            <div className="flex-1 grid place-items-center text-sm text-[#87868e]">{result && !result.ok ? result.reason : 'Compile to see the project.'}</div>
          )}
        </main>

        <aside className="w-[380px] shrink-0 flex flex-col border-l border-[#e2e2e6] bg-white">
          <div className="flex gap-1 px-3 pt-3" role="tablist">
            {(['wizard', 'checks'] as const).map((t) => (
              <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`text-xs px-2.5 py-1 rounded-md ${tab === t ? 'bg-[#f0f0f2]' : 'text-[#87868e] hover:text-[#18181c]'}`}>
                {t === 'wizard' ? `Questions${pending.length ? ` · ${pending.length} open` : ''}` : `Checks${result?.ok ? ` · ${result.report.blocking.length ? `${result.report.blocking.length} blocking` : 'clear'}` : ''}`}
              </button>
            ))}
          </div>
          <div className="flex-1 min-h-0 overflow-auto p-3">
            {tab === 'wizard' ? (
              <>
                <Wizard board={board} answers={answers} setAnswers={setAnswers} />
                <button onClick={run} disabled={busy || pending.length > 0} className="mt-3 w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-[#18181c] text-white text-sm disabled:opacity-30">
                  {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                  {result?.ok ? 'Compile again' : 'Compile'}
                </button>
              </>
            ) : result?.ok ? (
              <Checks report={result.report} settings={settings} setSettings={setSettings} open={openFile} />
            ) : (
              <p className="text-xs text-[#a1a0a8]">The checks run on every compile.</p>
            )}
          </div>
          {result?.ok && (
            <div className="border-t border-[#e2e2e6] p-3 space-y-2">
              {result.todo.length > 0 && <p className="text-[11px] text-[#87868e]">{result.todo.length} items for the teams before the first deploy, listed in README.md.</p>}
              <div className="flex gap-2">
                <input value={by} onChange={(e) => setBy(e.target.value)} placeholder="Approved by" className="flex-1 bg-[#f0f0f2] rounded-lg px-2 text-xs focus:outline-none" aria-label="Approved by" />
                <button onClick={download} disabled={!by.trim() || result.report.blocking.length > 0 || busy} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#18181c] text-white text-xs disabled:opacity-30">
                  {result.report.blocking.length ? <X className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5" />}
                  <Download className="w-3.5 h-3.5" /> Approve and download
                </button>
              </div>
              {result.report.blocking.length > 0 && <p className="text-[11px] text-[#991b1b]">Blocked by {result.report.blocking.map((b) => b.rule.id).join(', ')}.</p>}
              {exportError && <p className="text-[11px] text-[#991b1b]">{exportError}</p>}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
};
