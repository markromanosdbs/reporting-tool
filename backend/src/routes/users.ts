import { Router, Request, Response } from 'express';
import sql from 'mssql';
import { getBraxConnection, asDbo } from '../db.js';
import { AUTH_ENABLED, forgetUser, requireAdmin } from '../auth.js';

// Microsoft sign-in settings for the web app, the signed-in user, and Settings → Users (Admins only)
const router = Router();

router.get('/auth-config', (_req, res) => {
  res.json({ enabled: AUTH_ENABLED, tenantId: process.env.AUTH_TENANT_ID?.trim() || null, clientId: process.env.AUTH_CLIENT_ID?.trim() || null });
});

router.get('/me', (req, res) => res.json({ ...req.user, signInEnabled: AUTH_ENABLED }));

const fail = (res: Response, status: number, error: string) => res.status(status).json({ error });
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.get('/users', requireAdmin, async (_req, res) => {
  try {
    const pool = await getBraxConnection();
    const r = await pool.request().query(`
      SELECT id, email, name, role, added_by, added_at, first_sign_in_at, last_sign_in_at FROM dbo.app_users ORDER BY role, ISNULL(name, email)`);
    res.json({ users: r.recordset });
  } catch (e) { console.error('[users]', e); fail(res, 500, 'The users could not be loaded. Try again.'); }
});

router.post('/users', requireAdmin, async (req: Request, res: Response) => {
  const email = String(req.body?.email ?? '').trim().toLowerCase();
  const role = req.body?.role === 'Admin' ? 'Admin' : 'Viewer';
  if (!EMAIL.test(email)) return fail(res, 400, 'Enter the person\'s Microsoft email address, e.g. name@davidsonsblinds.com.au.');
  try {
    const pool = await getBraxConnection();
    const r = await pool.request().input('email', sql.NVarChar, email).input('role', sql.NVarChar, role).input('by', sql.NVarChar, req.user!.name)
      .query(asDbo(`
        IF EXISTS (SELECT 1 FROM dbo.app_users WHERE email = @email) SELECT 0 AS added;
        ELSE BEGIN
          INSERT dbo.app_users (email, role, added_by) VALUES (@email, @role, @by);
          SELECT 1 AS added;
        END`));
    if (!r.recordset[0]?.added) return fail(res, 409, `${email} is already on the list.`);
    forgetUser(email);
    res.status(201).json({ ok: true });
  } catch (e) { console.error('[users]', e); fail(res, 500, 'The user could not be added. Try again.'); }
});

// There must always be at least one Admin, or nobody could manage users any more
async function adminsLeftWithout(pool: sql.ConnectionPool, id: number): Promise<number> {
  return (await pool.request().input('id', sql.Int, id).query(`SELECT COUNT(*) AS n FROM dbo.app_users WHERE role = 'Admin' AND id <> @id`)).recordset[0].n;
}

router.patch('/users/:id', requireAdmin, async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  const role = req.body?.role;
  if (role !== 'Admin' && role !== 'Viewer') return fail(res, 400, 'Choose Admin or Viewer.');
  try {
    const pool = await getBraxConnection();
    const u = (await pool.request().input('id', sql.Int, id).query('SELECT email, role FROM dbo.app_users WHERE id = @id')).recordset[0];
    if (!u) return fail(res, 404, 'That user is no longer on the list. Refresh the page.');
    if (u.role === 'Admin' && role === 'Viewer' && await adminsLeftWithout(pool, id) === 0) return fail(res, 409, 'There must be at least one Admin. Make someone else an Admin first.');
    await pool.request().input('id', sql.Int, id).input('role', sql.NVarChar, role).query(asDbo('UPDATE dbo.app_users SET role = @role WHERE id = @id;'));
    forgetUser(u.email);
    res.json({ ok: true });
  } catch (e) { console.error('[users]', e); fail(res, 500, 'The role could not be changed. Try again.'); }
});

router.delete('/users/:id', requireAdmin, async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  try {
    const pool = await getBraxConnection();
    const u = (await pool.request().input('id', sql.Int, id).query('SELECT email, role FROM dbo.app_users WHERE id = @id')).recordset[0];
    if (!u) return fail(res, 404, 'That user is no longer on the list. Refresh the page.');
    if (u.email === req.user!.email) return fail(res, 409, "You can't remove yourself. Ask another Admin.");
    if (u.role === 'Admin' && await adminsLeftWithout(pool, id) === 0) return fail(res, 409, 'There must be at least one Admin.');
    await pool.request().input('id', sql.Int, id).query(asDbo('DELETE FROM dbo.app_users WHERE id = @id;'));
    forgetUser(u.email);
    res.json({ ok: true });
  } catch (e) { console.error('[users]', e); fail(res, 500, 'The user could not be removed. Try again.'); }
});

export default router;
