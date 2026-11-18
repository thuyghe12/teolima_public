import type { IncomingMessage } from 'http';
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
