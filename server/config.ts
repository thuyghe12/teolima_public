/**
 * Runtime configuration, read once from the environment.
 * Every limit has a safe default so a fresh clone runs without extra setup.
 *
 * `.env` is loaded here, before anything is read. ES module imports are
 * evaluated before the importing module's own code runs, so loading it in
 * server.ts after the imports would leave this module reading an empty
 * environment.
 */
import 'dotenv/config';

function int(name: string, fallback: number): number {
  const raw = process.env[name];
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const port = int('PORT', 3000);

export const config = {
  port,
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  models: {
    live: process.env.GEMINI_LIVE_MODEL || 'gemini-3.8-live',
    /** Tried when the primary Live model cannot be reached. */
    liveFallback: process.env.GEMINI_LIVE_FALLBACK_MODEL || 'gemini-3.1-flash-live-preview',
  },
  allowedOrigins: (process.env.ALLOWED_ORIGINS || `http://localhost:${port},http://127.0.0.1:${port}`)
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  accessToken: process.env.ACCESS_TOKEN || '',
  /** Microsoft Learn MCP server for documentation grounding. Set to "off" to disable. */
  microsoftDocsUrl: process.env.MICROSOFT_DOCS_MCP_URL ?? 'https://learn.microsoft.com/api/mcp?maxTokenBudget=3000',
  maxConnections: int('MAX_CONNECTIONS', 20),
  sessionMaxMs: int('SESSION_MAX_MINUTES', 15) * 60_000,
  idleTimeoutMs: int('IDLE_TIMEOUT_SECONDS', 120) * 1000,
  wsMaxPayloadBytes: 4 * 1024 * 1024,
  httpBodyLimit: '200kb',
} as const;
