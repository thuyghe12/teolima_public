/**
 * The azd schema with the Foundry extension schemas it references, from
 * vendor/azd-schemas, resolved the way azd resolves them.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import Ajv2019, { type ValidateFunction } from 'ajv/dist/2019';
import draft7 from 'ajv/dist/refs/json-schema-draft-07.json';

const DIR = join(process.cwd(), 'vendor', 'azd-schemas');
const BASE = 'https://raw.githubusercontent.com/Azure/azure-dev/main/cli/azd/extensions';
const FOLDER: Record<string, string> = {
  'azure.ai.agent.json': 'azure.ai.agents', 'microsoft.foundry.json': 'azure.ai.agents', 'Agent.json': 'azure.ai.agents', 'Connection.json': 'azure.ai.agents',
  'Deployment.json': 'azure.ai.agents', 'Routine.json': 'azure.ai.agents', 'Skill.json': 'azure.ai.agents', 'Toolbox.json': 'azure.ai.agents', 'FileRef.json': 'azure.ai.agents',
  'azure.ai.project.json': 'azure.ai.projects', 'azure.ai.connection.json': 'azure.ai.connections', 'azure.ai.routine.json': 'azure.ai.routines',
  'azure.ai.eval.json': 'azure.ai.evaluations', 'azure.ai.skill.json': 'azure.ai.skills', 'azure.ai.toolbox.json': 'azure.ai.toolboxes',
};

let cached: ValidateFunction | null = null;

/** Validates a parsed azure.yaml against the azd and Foundry extension schemas. */
export function azdValidator(): ValidateFunction {
  if (cached) return cached;
  const ajv = new Ajv2019({ strict: false, allErrors: true });
  ajv.addMetaSchema(draft7);
  for (const name of readdirSync(join(DIR, 'extensions'))) {
    const schema = JSON.parse(readFileSync(join(DIR, 'extensions', name), 'utf8'));
    delete schema.$id;
    ajv.addSchema(schema, `${BASE}/${FOLDER[name]}/schemas/${name}`);
  }
  cached = ajv.compile(JSON.parse(readFileSync(join(DIR, 'azure.yaml.json'), 'utf8')));
  return cached;
}
