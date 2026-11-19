/**
 * The rubric the compiled project is checked against before it can leave
 * Teolima: narrow rules, each owning one signal, each deterministic. A rule
 * names its domain, what it looks at, how it decides (a schema, code or a
 * regular expression), how severe a failure is, its threshold where it has
 * one, and the source it rests on. The user sees every rule and its result,
 * can turn a rule off (recorded), adjust a threshold, and add regex rules of
 * their own. Model judges and people are the escalation, not the default.
 */

export type Domain = 'azd' | 'infrastructure' | 'security' | 'agents' | 'traceability' | 'evaluation' | 'documentation' | 'custom';
export const DOMAINS: Record<Domain, string> = {
  azd: 'Azure Developer CLI',
  infrastructure: 'Infrastructure',
  security: 'Security',
  agents: 'Agents',
  traceability: 'Traceability',
  evaluation: 'Evaluation',
  documentation: 'Documentation',
  custom: 'Your rules',
};

export type Method = 'schema' | 'code' | 'regex';
/** A blocking failure stops the export until it is fixed or the rule is turned off. */
export type Severity = 'block' | 'warn';

export interface Rule {
  id: string;
  domain: Domain;
  /** What the rule looks at, e.g. "azure.yaml" or "infra/main.parameters.json". */
  signal: string;
  /** What must hold, in one sentence. */
  check: string;
  method: Method;
  severity: Severity;
  threshold?: { label: string; value: number; min: number; max: number };
  source: string;
}

/** A rule the user adds: a pattern that must, or must not, appear in files under a path. */
export interface CustomRule {
  id: string;
  check: string;
  /** Path prefix, e.g. "src/agents/" or "azure.yaml". */
  path: string;
  pattern: string;
  expect: 'present' | 'absent';
  severity: Severity;
}

export interface RubricSettings {
  off: string[];
  thresholds: Record<string, number>;
  custom: CustomRule[];
}
export const emptySettings = (): RubricSettings => ({ off: [], thresholds: {}, custom: [] });

export interface Finding {
  path?: string;
  line?: number;
  message: string;
}

export interface RuleResult {
  rule: Rule;
  status: 'pass' | 'fail' | 'off' | 'skipped';
  findings: Finding[];
}

export interface CheckReport {
  results: RuleResult[];
  /** Blocking failures: the export waits for these. */
  blocking: RuleResult[];
}
