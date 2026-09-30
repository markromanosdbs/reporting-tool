import crypto from 'crypto';
import sql from 'mssql';
import type { Request, Response, NextFunction } from 'express';
import { getBraxConnection, asDbo } from './db.js';

/**
 * Microsoft sign-in (Entra ID). The web app signs people in with their company Microsoft account and
 * sends the ID token with every API request; this checks the token really comes from our Microsoft
 * tenant (signature, issuer, audience, expiry), then looks the person up in braxreportsDB.dbo.app_users.
 * People who aren't in app_users get no access - an Admin adds them on Settings → Users.
 *
 * Needs AUTH_TENANT_ID and AUTH_CLIENT_ID (from the app registration). Without them sign-in is off and
 * everyone is treated as an Admin - the way the app worked before - with a warning at start-up.
 */

export type Role = 'Admin' | 'Viewer';
export interface AppUser { id: number; email: string; name: string; role: Role }

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express { interface Request { user?: AppUser } }
}

const TENANT = process.env.AUTH_TENANT_ID?.trim() || '';
const CLIENT = process.env.AUTH_CLIENT_ID?.trim() || '';
export const AUTH_ENABLED = !!(TENANT && CLIENT);

export class AuthError extends Error {
  constructor(message: string, public status: number, public code: string) { super(message); }
}

// ---- token check ----------------------------------------------------------------------------------

interface Jwk { kid: string; kty: string; n: string; e: string }
let keys: { at: number; byKid: Map<string, crypto.KeyObject> } | null = null;

async function signingKey(kid: string): Promise<crypto.KeyObject | undefined> {
  const stale = !keys || Date.now() - keys.at > 12 * 3600_000 || !keys.byKid.has(kid);
  if (stale && (!keys || Date.now() - keys.at > 60_000)) {     // Microsoft rotates keys: refetch, at most once a minute
    const r = await fetch(`https://login.microsoftonline.com/${TENANT}/discovery/v2.0/keys`);
    if (!r.ok) throw new AuthError('Microsoft sign-in keys could not be loaded. Try again shortly.', 503, 'keys-unavailable');
    const body = await r.json() as { keys: Jwk[] };
    keys = { at: Date.now(), byKid: new Map(body.keys.map(k => [k.kid, crypto.createPublicKey({ key: { kty: k.kty, n: k.n, e: k.e }, format: 'jwk' })])) };
  }
  return keys?.byKid.get(kid);
}

const b64 = (s: string) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

async function verifyIdToken(token: string): Promise<{ email: string; name: string }> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new AuthError('Sign in again.', 401, 'bad-token');
  let header: any, claims: any;
  try {
    header = JSON.parse(b64(parts[0]).toString('utf8'));
    claims = JSON.parse(b64(parts[1]).toString('utf8'));
  } catch {
    throw new AuthError('Sign in again.', 401, 'bad-token');
  }
  if (header.alg !== 'RS256') throw new AuthError('Sign in again.', 401, 'bad-token');
  const key = await signingKey(header.kid);
  if (!key || !crypto.verify('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`), key, b64(parts[2]))) {
    throw new AuthError('Sign in again.', 401, 'bad-token');
  }
  const now = Date.now() / 1000;
  if (claims.iss !== `https://login.microsoftonline.com/${TENANT}/v2.0` || claims.tid !== TENANT || claims.aud !== CLIENT) {
    throw new AuthError('Sign in with your Davidsons Microsoft account.', 401, 'wrong-tenant');
  }
  if (typeof claims.exp !== 'number' || claims.exp < now - 60 || (claims.nbf && claims.nbf > now + 60)) {
    throw new AuthError('Your sign-in has expired. Sign in again.', 401, 'expired');
  }
  const email = String(claims.preferred_username || claims.email || '').trim().toLowerCase();
  if (!email) throw new AuthError('Your Microsoft account has no email address.', 401, 'no-email');
  return { email, name: String(claims.name || email) };
}

// ---- users --------------------------------------------------------------------------------------

const cache = new Map<string, { at: number; user: AppUser | null }>();
export const forgetUser = (email?: string) => (email ? cache.delete(email.toLowerCase()) : cache.clear());

async function lookUp(email: string, name: string): Promise<AppUser | null> {
  const hit = cache.get(email);
  if (hit && Date.now() - hit.at < 60_000) return hit.user;
  const pool = await getBraxConnection();
  const row = (await pool.request().input('email', sql.NVarChar, email)
    .query('SELECT id, email, name, role, last_sign_in_at FROM dbo.app_users WHERE email = @email')).recordset[0];
  let user: AppUser | null = null;
  if (row) {
    user = { id: row.id, email: row.email, name, role: row.role };
    // name from Microsoft, and when they last used the app (at most every 10 minutes)
    if (row.name !== name || !row.last_sign_in_at || Date.now() - new Date(row.last_sign_in_at).getTime() > 10 * 60_000) {
      await pool.request().input('id', sql.Int, row.id).input('name', sql.NVarChar, name).query(asDbo(`
        UPDATE dbo.app_users SET name = @name, last_sign_in_at = SYSUTCDATETIME(), first_sign_in_at = ISNULL(first_sign_in_at, SYSUTCDATETIME())
        WHERE id = @id;`));
    }
  }
  cache.set(email, { at: Date.now(), user });
  return user;
}

const LOCAL_USER: AppUser = { id: 0, email: 'local', name: 'Local (sign-in off)', role: 'Admin' };

/** Every /api request except /api/health: signed in with Microsoft, and in app_users. */
export async function requireUser(req: Request, res: Response, next: NextFunction) {
  if (req.path === '/health' || req.path === '/auth-config') return next();
  if (!AUTH_ENABLED) { req.user = LOCAL_USER; return next(); }
  try {
    const m = String(req.headers.authorization || '').match(/^Bearer (.+)$/);
    if (!m) throw new AuthError('Sign in with your Microsoft account.', 401, 'signed-out');
    const who = await verifyIdToken(m[1]);
    const user = await lookUp(who.email, who.name);
    if (!user) throw new AuthError(`${who.email} doesn't have access yet. Ask an Admin to add you in Settings → Users.`, 403, 'no-access');
    req.user = user;
    next();
  } catch (e) {
    if (e instanceof AuthError) return res.status(e.status).json({ error: e.message, code: e.code });
    console.error('[auth]', e);
    res.status(500).json({ error: 'Sign-in could not be checked. Try again.' });
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role === 'Admin') return next();
  res.status(403).json({ error: 'Only Admins can do this.', code: 'admin-only' });
}
