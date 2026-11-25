import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { db } from './db.ts';

export interface AuthUser {
  id: string;
  username: string;
  displayName: string;
  email: string;
  bio: string;
  avatarUrl: string;
  verified: boolean;
}

export interface AuthedRequest extends Request {
  authUser?: AuthUser | null;
  authToken?: string | null;
}

const SESSION_COOKIE = 'velo_session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!cookieHeader) return out;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    out[key] = decodeURIComponent(val);
  }
  return out;
}

export function createSession(res: Response, userId: string): string {
  const token = crypto.randomBytes(32).toString('hex');
  const now = Date.now();
  const expiresAt = now + SESSION_TTL_MS;

  db.prepare(
    'INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)'
  ).run(token, userId, now, expiresAt);

  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    partitioned: true,
    maxAge: SESSION_TTL_MS,
    path: '/',
  });

  return token;
}

export function clearSession(req: AuthedRequest, res: Response): void {
  if (req.authToken) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(req.authToken);
  }
  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    partitioned: true,
    path: '/',
  });
}

function isSameOriginMutation(req: Request): boolean {
  const xrw = req.headers['x-requested-with'];
  if (xrw === 'XMLHttpRequest') return true;
  const origin = req.headers.origin;
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  if (!origin || !host) return false;
  try {
    const parsedOrigin = new URL(origin);
    const expectedHost = Array.isArray(host) ? host[0] : host;
    return parsedOrigin.host === expectedHost;
  } catch {
    return false;
  }
}

export function attachAuth(req: AuthedRequest, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  let token: string | null = null;
  let usedCookie = false;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  } else {
    const cookies = parseCookies(req.headers.cookie);
    if (cookies[SESSION_COOKIE]) {
      token = cookies[SESSION_COOKIE];
      usedCookie = true;
    }
  }

  req.authUser = null;
  req.authToken = null;

  if (!token) {
    next();
    return;
  }

  // Enforce CSRF check on cookie-authenticated mutations
  const isMutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method.toUpperCase());
  if (usedCookie && isMutation && !isSameOriginMutation(req)) {
    next();
    return;
  }

  const now = Date.now();
  const row = db
    .prepare(
      `SELECT u.id, u.username, u.display_name, u.email, u.bio, u.avatar_url, u.verified, s.expires_at
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token = ?`
    )
    .get(token) as
    | {
        id: string;
        username: string;
        display_name: string;
        email: string;
        bio: string;
        avatar_url: string;
        verified: number;
        expires_at: number;
      }
    | undefined;

  if (!row || row.expires_at < now) {
    if (row) {
      db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    }
    next();
    return;
  }

  req.authToken = token;
  req.authUser = {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    email: row.email,
    bio: row.bio,
    avatarUrl: row.avatar_url,
    verified: row.verified === 1,
  };

  next();
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  if (!req.authUser) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  next();
}
