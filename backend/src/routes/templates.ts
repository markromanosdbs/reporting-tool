import express, { Router, Request, Response } from 'express';
import {
  applyUpdate, createUpload, discardUpdate, getUpdate, getUpdateFile, listTargets, listUpdates, rollbackUpdate, TemplateUpdateError,
} from '../services/jobsheet/templateUpdates.js';
import { reconcileJobSheet } from '../services/jobsheet/jobSheetReconcile.js';
import { requireAdmin } from '../auth.js';

// "Upload job sheet templates" (see services/jobsheet/templateUpdates.ts)
const router = Router();

function fail(res: Response, e: unknown) {
  if (e instanceof TemplateUpdateError) return res.status(e.status).json({ error: e.message });
  console.error('[template-updates]', e);
  res.status(500).json({ error: 'Something went wrong on the server. Try again, and check the server log if it keeps happening.' });
}

const idOf = (req: Request) => Number.parseInt(req.params.id, 10);
// who did it: the signed-in person (the typed name only when sign-in is off)
const byOf = (req: Request, typed: unknown) => req.user && req.user.id ? req.user.name : String(typed ?? '');

router.get('/template-updates/targets', requireAdmin, async (_req, res) => {
  try { res.json({ targets: await listTargets() }); } catch (e) { fail(res, e); }
});

router.get('/template-updates', requireAdmin, async (_req, res) => {
  try { res.json({ updates: await listUpdates() }); } catch (e) { fail(res, e); }
});

router.get('/template-updates/:id', requireAdmin, async (req, res) => {
  try { res.json(await getUpdate(idOf(req))); } catch (e) { fail(res, e); }
});

// The job sheet is sent as the raw request body; product, file name and uploader go in the query string
router.post('/template-updates', requireAdmin, express.raw({ type: '*/*', limit: '26mb' }), async (req, res) => {
  try {
    const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    res.status(201).json(await createUpload(String(req.query.product ?? ''), String(req.query.fileName ?? ''), byOf(req, req.query.by), body));
  } catch (e) { fail(res, e); }
});

router.post('/template-updates/:id/apply', requireAdmin, async (req, res) => {
  try { res.json(await applyUpdate(idOf(req), byOf(req, req.body?.by), req.body?.confirmWarnings === true)); } catch (e) { fail(res, e); }
});

router.post('/template-updates/:id/discard', requireAdmin, async (req, res) => {
  try { res.json(await discardUpdate(idOf(req), byOf(req, req.body?.by))); } catch (e) { fail(res, e); }
});

router.post('/template-updates/:id/rollback', requireAdmin, async (req, res) => {
  try { res.json(await rollbackUpdate(idOf(req), byOf(req, req.body?.by))); } catch (e) { fail(res, e); }
});

router.get('/template-updates/:id/file', requireAdmin, async (req, res) => {
  try {
    const f = await getUpdateFile(idOf(req));
    res.setHeader('Content-Type', 'application/vnd.ms-excel.sheet.macroEnabled.12');
    res.setHeader('Content-Disposition', `attachment; filename="${f.name.replace(/[^\w.\- ()]/g, '_')}"`);
    res.send(f.content);
  } catch (e) { fail(res, e); }
});

// Reconcile a job sheet with the live report: checking only, nothing is stored
router.post('/reconcile-jobsheet', express.raw({ type: '*/*', limit: '26mb' }), async (req, res) => {
  try {
    const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    res.json(await reconcileJobSheet(String(req.query.fileName ?? ''), body));
  } catch (e) { fail(res, e); }
});

export default router;
