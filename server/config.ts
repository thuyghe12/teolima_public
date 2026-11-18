/**
 * Runtime configuration, read once from the environment.
 * Every limit has a safe default so a fresh clone runs without extra setup.
 */

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
    live: process.env.GEMINI_LIVE_MODEL || 'gemini-3.1-flash-live-preview',
    text: process.env.GEMINI_TEXT_MODEL || 'gemini-3.7-flash',
    image: process.env.GEMINI_IMAGE_MODEL || 'gemini-3.1-flash-image',
    imageLite: process.env.GEMINI_IMAGE_LITE_MODEL || 'gemini-3.1-flash-lite-image',
  },
  allowedOrigins: (process.env.ALLOWED_ORIGINS || `http://localhost:${port},http://127.0.0.1:${port}`)
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  accessToken: process.env.ACCESS_TOKEN || '',
  maxConnections: int('MAX_CONNECTIONS', 20),
  sessionMaxMs: int('SESSION_MAX_MINUTES', 15) * 60_000,
  idleTimeoutMs: int('IDLE_TIMEOUT_SECONDS', 120) * 1000,
  wsMaxPayloadBytes: 4 * 1024 * 1024,
  httpBodyLimit: '200kb',
  sketchRateLimit: { windowMs: 60_000, max: int('SKETCH_RATE_LIMIT_PER_MINUTE', 10) },
} as const;
