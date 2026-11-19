/**
 * The agents' code, for hosted agents and self-hosted orchestration: one
 * deployable unit per team, running its Agent Framework orchestration, and one
 * per agent outside a team. Prompt agents need no code; they are declared in
 * azure.yaml.
 *
 * Every API used here is Microsoft's, as documented on Microsoft Learn:
 * FoundryChatClient and ResponsesHostServer ("Host Microsoft Agent Framework
 * agents as Foundry hosted agents"), chat_client.as_agent and
 * @tool(approval_mode="always_require") (Handoff orchestration), and the
 * Sequential, Concurrent, Handoff, GroupChat and Magentic builders of
 * agent_framework.orchestrations. A built workflow becomes one agent with
 * workflow.as_agent(name=...).
 *
 * Tool bodies cannot be compiled from a design: each tool is a typed function
 * that raises until the agent team connects it, and the report lists them.
 */
import type { Board, Component, Team } from '../../shared/board/schema';
import { slug } from '../../shared/board/schema';

type Agent = Extract<Component, { kind: 'agent' }>;

/** A deployable unit of agent code: a team, or an agent outside every team. */
export interface Unit {
  id: string;
  /** The azure.yaml service name and source folder. */
  service: string;
  name: string;
  team?: Team;
  agents: Agent[];
}

export function units(board: Pick<Board, 'components' | 'teams'>): Unit[] {
  const agents = board.components.filter((c): c is Agent => c.kind === 'agent');
  const inTeam = new Set(board.teams.flatMap((t) => t.members));
  return [
    ...board.teams.map((t) => ({ id: t.id, service: slug(t.name), name: t.name, team: t, agents: t.members.map((m) => agents.find((a) => a.id === m)!).filter(Boolean) })),
    ...agents.filter((a) => !inTeam.has(a.id)).map((a) => ({ id: a.id, service: slug(a.name), name: a.name, agents: [a] })),
  ];
}

/** A Python identifier from a name. */
const py = (name: string) => slug(name).replace(/-/g, '_').replace(/^(\d)/, '_$1');
const str = (s: string) => JSON.stringify(s);

/** The tools, knowledge and memory an agent reaches, resolved to board components. */
function reach(board: Pick<Board, 'components'>, agent: Agent) {
  const byId = (ids: string[]) => ids.map((id) => board.components.find((c) => c.id === id)).filter((c): c is Component => !!c);
  return { tools: byId(agent.tools), knowledge: byId(agent.knowledge), memory: byId(agent.memory) };
}

/** Function tools for everything the unit's agents reach, each a stub to connect. */
function toolsModule(board: Pick<Board, 'components'>, unit: Unit): { code: string; stubs: string[] } {
  const gated = new Set(board.components.flatMap((c) => (c.kind === 'approval' ? [c.gates] : [])));
  const seen = new Set<string>();
  const stubs: string[] = [];
  const out = [
    '"""Tools of this unit, one function per tool or knowledge source on the board.',
    '',
    'Each raises NotImplementedError until it is connected to the system it reaches.',
    'Tools that need a person to approve are marked approval_mode="always_require".',
    '"""',
    '',
    'from typing import Annotated',
    '',
    'from agent_framework import tool',
    '',
  ];
  for (const a of unit.agents) {
    const r = reach(board, a);
    for (const c of [...r.tools, ...r.knowledge]) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      const fn = c.kind === 'knowledge' ? `search_${py(c.name)}` : py(c.name);
      const approval = gated.has(c.id) ? board.components.find((x) => x.kind === 'approval' && x.gates === c.id) : undefined;
      const param = c.kind === 'knowledge' ? 'query: Annotated[str, "What to look up"]' : 'request: Annotated[str, "What to do, with the details it needs"]';
      out.push(
        '',
        approval ? `@tool(approval_mode="always_require")  # ${approval.name}${approval.kind === 'approval' && approval.condition !== 'always' ? `: ${approval.condition}` : ''}` : '@tool',
        `def ${fn}(${param}) -> str:`,
        `    """${(c.description || c.name).replace(/"""/g, "'")}"""`,
        `    raise NotImplementedError(${str(`Connect ${c.name} (${c.id}) to the system it reaches.`)})`,
        '',
      );
      stubs.push(`${unit.service}/tools.py: ${fn} (${c.name})`);
    }
  }
  return { code: `${out.join('\n').replace(/\n{3,}/g, '\n\n\n').trimEnd()}\n`, stubs };
}

/** The orchestration of a team, with the builder for its pattern. */
function workflow(unit: Unit): string[] {
  const t = unit.team!;
  const v = (id: string) => py(unit.agents.find((a) => a.id === id)?.name ?? id);
  const participants = `[${unit.agents.map((a) => py(a.name)).join(', ')}]`;
  switch (t.pattern) {
    case 'sequential':
      return [`workflow = SequentialBuilder(participants=${participants}).build()`];
    case 'concurrent':
      return [`workflow = ConcurrentBuilder(participants=${participants}).build()`];
    case 'handoff':
      return [
        'workflow = (',
        `    HandoffBuilder(name=${str(unit.service)}, participants=${participants})`,
        `    .with_start_agent(${t.startAgent ? v(t.startAgent) : py(unit.agents[0].name)})`,
        '    .build()',
        ')',
      ];
    case 'group_chat': {
      const others = unit.agents.filter((a) => a.id !== t.manager).map((a) => py(a.name));
      return [
        'workflow = GroupChatBuilder(',
        `    participants=[${others.join(', ')}],`,
        `    orchestrator_agent=${t.manager ? v(t.manager) : py(unit.agents[0].name)},`,
        '    termination_condition=lambda messages: sum(1 for msg in messages if msg.role == "assistant") >= MAX_TURNS,',
        ').build()',
      ];
    }
    case 'magentic': {
      const others = unit.agents.filter((a) => a.id !== t.manager).map((a) => py(a.name));
      return [
        'workflow = MagenticBuilder(',
        `    participants=[${others.join(', ')}],`,
        `    manager_agent=${t.manager ? v(t.manager) : py(unit.agents[0].name)},`,
        '    max_round_count=10,',
        '    max_stall_count=3,',
        '    max_reset_count=2,',
        ').build()',
      ];
    }
  }
}

const BUILDER: Record<Team['pattern'], string> = {
  sequential: 'SequentialBuilder',
  concurrent: 'ConcurrentBuilder',
  handoff: 'HandoffBuilder',
  group_chat: 'GroupChatBuilder',
  magentic: 'MagenticBuilder',
};

/** main.py of a unit: the agents, the orchestration of a team, and the Responses host. */
function mainModule(board: Pick<Board, 'components'>, unit: Unit, model: (a: Agent) => string): string {
  const models = [...new Set(unit.agents.map(model))];
  const clientOf = (m: string) => (models.length === 1 ? 'client' : `client_${py(m)}`);
  const lines = [
    `"""${unit.name}: ${unit.team ? `${unit.team.pattern.replace('_', ' ')} team of ${unit.agents.length} agents` : 'one agent'}, hosted with the Foundry Responses protocol.`,
    '',
    'Compiled by Teolima from the approved design. Agents, instructions, tools and',
    'the orchestration pattern come from the board; see docs/architecture.md.',
    '"""',
    '',
    'import os',
    '',
    'from agent_framework.foundry import FoundryChatClient',
    'from agent_framework_foundry_hosting import ResponsesHostServer',
    ...(unit.team ? [`from agent_framework.orchestrations import ${BUILDER[unit.team.pattern]}`] : []),
    'from azure.identity import DefaultAzureCredential',
    'from dotenv import load_dotenv',
    '',
  ];
  const toolNames = (a: Agent) => {
    const r = reach(board, a);
    return [...r.tools.map((c) => py(c.name)), ...r.knowledge.map((c) => `search_${py(c.name)}`)];
  };
  const used = [...new Set(unit.agents.flatMap(toolNames))];
  if (used.length) lines.push(`from tools import ${used.join(', ')}`, '');
  lines.push('load_dotenv()', '');
  if (unit.team && (unit.team.pattern === 'group_chat')) lines.push('MAX_TURNS = int(os.environ.get("MAX_TURNS", "8"))', '');
  lines.push('', 'def main() -> None:', '    credential = DefaultAzureCredential()');
  for (const m of models) {
    lines.push(
      `    ${clientOf(m)} = FoundryChatClient(`,
      '        project_endpoint=os.environ["FOUNDRY_PROJECT_ENDPOINT"],',
      `        model=os.environ.get(${str(models.length === 1 ? 'AZURE_AI_MODEL_DEPLOYMENT_NAME' : `${py(m).toUpperCase()}_DEPLOYMENT_NAME`)}, ${str(m)}),`,
      '        credential=credential,',
      '    )',
    );
  }
  for (const a of unit.agents) {
    const tools = toolNames(a);
    lines.push(
      `    ${py(a.name)} = ${clientOf(model(a))}.as_agent(`,
      `        name=${str(py(a.name))},`,
      `        description=${str(a.description || a.name)},`,
      `        instructions=${str(a.instructions || `You are ${a.name}. ${a.description}`.trim())},`,
      ...(tools.length ? [`        tools=[${tools.join(', ')}],`] : []),
      '    )',
    );
  }
  if (unit.team) {
    lines.push('', ...workflow(unit).map((l) => `    ${l}`), `    agent = workflow.as_agent(name=${str(unit.service)})`);
  } else {
    lines.push(`    agent = ${py(unit.agents[0].name)}`);
  }
  lines.push('', '    ResponsesHostServer(agent).run()', '', '', 'if __name__ == "__main__":', '    main()', '');
  return lines.join('\n');
}

export interface UnitFiles {
  unit: Unit;
  files: Map<string, string>;
  /** Tool functions the agent team still connects. */
  stubs: string[];
}

/** Source, dependencies and container for each unit. */
export function agentSources(board: Pick<Board, 'components' | 'teams'>, model: (a: Agent) => string): UnitFiles[] {
  return units(board).map((unit) => {
    const tools = toolsModule(board, unit);
    const files = new Map<string, string>([
      ['main.py', mainModule(board, unit, model)],
      ['requirements.txt', ['agent-framework', 'agent-framework-foundry-hosting==1.0.0b260918', 'azure-identity', 'python-dotenv', ''].join('\n')],
      [
        'Dockerfile',
        ['FROM python:3.12-slim', 'WORKDIR /app', 'ENV PYTHONNOUSERSITE=1', 'COPY requirements.txt .', 'RUN pip install --no-cache-dir -r requirements.txt', 'COPY . .', 'EXPOSE 8088', 'CMD ["python", "main.py"]', ''].join('\n'),
      ],
    ]);
    if (tools.stubs.length) files.set('tools.py', tools.code);
    return { unit, files, stubs: tools.stubs };
  });
}
