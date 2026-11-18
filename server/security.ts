import type { IncomingMessage } from 'http';
import type { Request, Response, NextFunction } from 'express';
import { config } from './config';

/** True when the request's Origin header is on the allowlist. */
export function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return false;
  return config.allowedOrigins.includes(origin);
}

/** True when no access token is configured, or the request carries the right one. */
export function hasValidToken(token: string | null | undefined): boolean {
  if (!config.accessToken) return true;
  return typeof token === 'string' && token === config.accessToken;
}

export function tokenFromUpgrade(req: IncomingMessage): string | null {
  try {
    const url = new URL(req.url || '', 'http://localhost');
    return url.searchParams.get('token');
  } catch {
    return null;
  }
}

/**
 * Fixed-window rate limiter keyed by client IP. In memory, which is enough
 * for a single instance; a shared store is needed once there is more than one.
 */
export function createRateLimiter(windowMs: number, max: number) {
  const hits = new Map<string, { count: number; resetAt: number }>();

  return function check(key: string, now = Date.now()): boolean {
    const entry = hits.get(key);
    if (!entry || now >= entry.resetAt) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      return true;
    }
    entry.count += 1;
    return entry.count <= max;
  };
}

const sketchLimiter = createRateLimiter(config.sketchRateLimit.windowMs, config.sketchRateLimit.max);

/** Express middleware for the paid image endpoint: token, origin and rate limit. */
export function guardSketchEndpoint(req: Request, res: Response, next: NextFunction) {
  if (!hasValidToken(req.get('x-access-token'))) {
    return res.status(401).json({ error: 'Missing or invalid access token' });
  }
  const origin = req.get('origin');
  if (origin && !isAllowedOrigin(origin)) {
    return res.status(403).json({ error: 'Origin not allowed' });
  }
  if (!sketchLimiter(req.ip || 'unknown')) {
    return res.status(429).json({ error: 'Too many requests, try again in a minute' });
  }
  next();
}
