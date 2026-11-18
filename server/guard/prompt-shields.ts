/**
 * Prompt Shields in Azure AI Content Safety: detects attempts to override the
 * coach's rules in what the user says (user prompt attacks) and in text the
 * coach reads, such as documentation results (document attacks).
 *
 * POST {endpoint}/contentsafety/text:shieldPrompt?api-version=2024-09-01
 * with { userPrompt, documents } returns { userPromptAnalysis: { attackDetected },
 * documentsAnalysis: [{ attackDetected }] }. Each input is capped at 10,000
 * characters, the documented limit.
 *
 * Detection is probabilistic, so this is one layer: provenance, the change
 * log and the tool allowlist hold whether or not an attack is detected.
 */

export type ShieldResult = { userAttack: boolean; documentAttacks: boolean[] };
export type Shield = (input: { userPrompt?: string; documents?: string[] }) => Promise<ShieldResult>;

const MAX_CHARS = 10_000;
const API_VERSION = '2024-09-01';

type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal: AbortSignal }) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

/** A Prompt Shields client. Throws on a failed call; the guard decides what that means. */
export function promptShields(opts: { endpoint: string; key: string; timeoutMs?: number; fetch?: FetchLike }): Shield {
  const url = `${opts.endpoint.replace(/\/+$/, '')}/contentsafety/text:shieldPrompt?api-version=${API_VERSION}`;
  const doFetch: FetchLike = opts.fetch ?? (globalThis.fetch as unknown as FetchLike);

  return async ({ userPrompt = '', documents = [] }) => {
    const body = {
      userPrompt: userPrompt.slice(0, MAX_CHARS),
      documents: documents.map((d) => d.slice(0, MAX_CHARS)),
    };
    const res = await doFetch(url, {
      method: 'POST',
      headers: { 'Ocp-Apim-Subscription-Key': opts.key, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 3000),
    });
    if (!res.ok) throw new Error(`Prompt Shields returned ${res.status}`);
    const data = (await res.json()) as {
      userPromptAnalysis?: { attackDetected?: boolean };
      documentsAnalysis?: Array<{ attackDetected?: boolean }>;
    };
    return {
      userAttack: data.userPromptAnalysis?.attackDetected === true,
      documentAttacks: body.documents.map((_, i) => data.documentsAnalysis?.[i]?.attackDetected === true),
    };
  };
}
