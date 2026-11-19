/**
 * The compile wizard: only the questions the stage documents leave open, or
 * that are hard or impossible to change after deployment (ADR 0003). Each is
 * prefilled from technical design where it can be, so most are confirmed,
 * not answered. Everything else is in the files, as parameters.
 */
import { DEPLOYMENT_SETTINGS } from '../board/arc42';
import { setting } from '../board/deployment';
import type { Board } from '../board/schema';

/** A model deployment, as the AI Landing Zone's modelDeploymentList and azd's azure.ai.project take it. */
export interface ModelAnswer {
  /** The model's version, e.g. "2025-04-14". The compiler never guesses it. */
  version: string;
  sku: 'GlobalStandard' | 'Standard' | 'DataZoneStandard';
  /** Capacity in thousands of tokens per minute. */
  capacity: number;
}

export interface CompileAnswers {
  /** Azure region name, e.g. "swedencentral". */
  region?: string;
  networkIsolation?: boolean;
  landingZone?: 'standalone' | 'ailz-integrated';
  /** With an existing platform landing zone: the hub virtual network to peer with. */
  hubVnetResourceId?: string;
  /** A model for each agent the design left without one, by agent id. */
  agentModels?: Record<string, string>;
  /** Version, SKU and capacity of each model, by model name. */
  models?: Record<string, ModelAnswer>;
}

export type DilemmaId = 'region' | 'network' | 'landing_zone' | 'hub_vnet' | `agent_model:${string}` | `model:${string}`;

export interface Dilemma {
  id: DilemmaId;
  question: string;
  /** Why it is asked now: it is hard to change later, or no stage decides it. */
  why: string;
  /** The value technical design recorded, to confirm. */
  prefill?: string;
  /** Still needs an answer before compiling. */
  open: boolean;
}

/** "Sweden Central" or "swedencentral" to the Azure region name. */
export const regionName = (s: string) => s.trim().toLowerCase().replace(/[\s_-]+/g, '');

/** The model names the agents use, after the answers fill the gaps. */
export function modelsOf(board: Pick<Board, 'components'>, answers: CompileAnswers): string[] {
  const names = board.components.flatMap((c) => (c.kind === 'agent' ? [c.model || answers.agentModels?.[c.id] || ''] : []));
  return [...new Set(names.filter(Boolean))];
}

/** The settings technical design recorded, with the answers on top. */
export function resolved(board: Pick<Board, 'spec'>, answers: CompileAnswers) {
  const region = answers.region ?? (setting(board, 'region') ? regionName(setting(board, 'region')!) : undefined);
  const iso = setting(board, 'network_isolation');
  const networkIsolation = answers.networkIsolation ?? (iso ? iso === DEPLOYMENT_SETTINGS.network_isolation.values[0] : undefined);
  const lz = setting(board, 'landing_zone');
  const landingZone = answers.landingZone ?? (lz ? (lz === DEPLOYMENT_SETTINGS.landing_zone.values[1] ? 'ailz-integrated' : 'standalone') : undefined);
  return { region, networkIsolation, landingZone };
}

export function dilemmas(board: Pick<Board, 'spec' | 'components'>, answers: CompileAnswers = {}): Dilemma[] {
  const r = resolved(board, answers);
  const out: Dilemma[] = [
    {
      id: 'region',
      question: 'Which Azure region?',
      why: 'Resources cannot move region after deployment; data residency constraints bind it.',
      prefill: setting(board, 'region'),
      open: !r.region,
    },
    {
      id: 'network',
      question: 'Private networking or public endpoints?',
      why: 'Network isolation is set when the Foundry account and its dependencies are created.',
      prefill: setting(board, 'network_isolation'),
      open: r.networkIsolation === undefined,
    },
    {
      id: 'landing_zone',
      question: 'Deploy standalone, or into an existing platform landing zone?',
      why: 'Standalone creates its own network, firewall and DNS; integrated reuses the hub.',
      prefill: setting(board, 'landing_zone'),
      open: !r.landingZone,
    },
  ];
  if (r.landingZone === 'ailz-integrated') {
    out.push({ id: 'hub_vnet', question: 'Which hub virtual network (resource ID)?', why: 'The spoke peers with it and reuses its firewall and DNS.', open: !answers.hubVnetResourceId });
  }
  for (const a of board.components) {
    if (a.kind === 'agent' && !a.model) {
      out.push({ id: `agent_model:${a.id}`, question: `Which model for "${a.name}"?`, why: 'No stage chose it; it becomes a model deployment.', open: !answers.agentModels?.[a.id] });
    }
  }
  for (const m of modelsOf(board, answers)) {
    const capacity = setting(board, 'model_capacity');
    out.push({
      id: `model:${m}`,
      question: `${m}: which version, SKU and capacity?`,
      why: 'The deployment needs an exact model version, and capacity is quota in the region.',
      ...(capacity ? { prefill: capacity } : {}),
      open: !answers.models?.[m]?.version || !answers.models?.[m]?.capacity,
    });
  }
  return out;
}
