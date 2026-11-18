/**
 * How tool calls are declared to the Live model and answered.
 *
 * Narration and drawing should happen together. Live models that support
 * asynchronous function calling keep talking while a call runs, if the
 * function is declared NON_BLOCKING. Each response then carries a
 * scheduling hint:
 *
 * - drawing tools answer SILENT: the result goes into the context and the
 *   model carries on with what it was saying, so a finished drawing never
 *   starts a new turn
 * - documentation search answers WHEN_IDLE: the model uses the result once
 *   it has finished its current sentence
 *
 * Models without asynchronous function calling get plain blocking
 * declarations and responses without scheduling.
 */
import { Behavior, FunctionResponseScheduling, type FunctionDeclaration } from '@google/genai';

/** Tools whose results the model should take in when it next pauses. */
const WHEN_IDLE_TOOLS = new Set(['search_microsoft_docs']);

/** Live models documented as supporting synchronous function calling only. */
const SYNC_ONLY_MODELS = [/gemini-3\.1-flash-live/];

export function supportsAsyncTools(model: string): boolean {
  return !SYNC_ONLY_MODELS.some((re) => re.test(model));
}

export function declareTools(declarations: FunctionDeclaration[], asyncTools: boolean): FunctionDeclaration[] {
  if (!asyncTools) return declarations;
  return declarations.map((d) => ({ ...d, behavior: Behavior.NON_BLOCKING }));
}

export type ToolResponse = {
  id?: string;
  name?: string;
  response: Record<string, unknown>;
  scheduling?: FunctionResponseScheduling;
};

export function toolResponse(
  call: { id?: string; name?: string },
  output: Record<string, unknown>,
  asyncTools: boolean,
): ToolResponse {
  const response: ToolResponse = { id: call.id, name: call.name, response: { output } };
  if (asyncTools) {
    response.scheduling = WHEN_IDLE_TOOLS.has(call.name ?? '')
      ? FunctionResponseScheduling.WHEN_IDLE
      : FunctionResponseScheduling.SILENT;
  }
  return response;
}
