import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import sql from 'mssql';
import { getBraxConnection, asDbo } from '../../db.js';
import { runExclusive } from './ProductJobSheet.js';
import { TEMPLATE_DIR, UPDATES_DIR, setTemplateSource, templateSourcePath, templateSourceRef } from './templateSources.js';
import { TEMPLATE_TARGETS, targetFor, LineValues, TemplateTarget } from './templateTargets.js';
import type { CheckOutput } from './templateCheckCli.js';

/**
 * "Upload job sheet templates": every change is a numbered update (update-0001, ...) in braxreportsDB
 * (dbo.template_updates, with the job sheets in dbo.template_files). An upload is checked, then anyone
 * can apply or discard it; the latest applied update of a template can be rolled back, which is recorded
 * as an update of its own. Each server only sees its own updates (TEMPLATE_UPDATES_ENV: live / local),
 * so testing on a PC never changes the live reports.
 */

export const ENVIRONMENT = (process.env.TEMPLATE_UPDATES_ENV || 'live').toLowerCase();
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const here = path.dirname(fileURLToPath(import.meta.url));
const CHECK_SCRIPT = path.join(here, 'templateCheckCli' + path.extname(fileURLToPath(import.meta.url)));

export const refOf = (n: number) => `update-${String(n).padStart(4, '0')}`;
const cachePath = (ref: string, templateFile: string) => path.join(UPDATES_DIR, `${ref}__${templateFile}`);

interface UpdateRow {
  id: number; ref_no: number; report_table: string; product: string; template_file: string; kind: 'upload' | 'rollback';
  source_file_name: string | null; order_no: string | null; status: string; check_result: string | null;
  rollback_of: number | null; replaced_id: number | null; file_id: number | null;
  uploaded_by: string | null; uploaded_at: Date | null; applied_by: string | null; applied_at: Date | null;
  discarded_by: string | null; discarded_at: Date | null; rolled_back_by: string | null; rolled_back_at: Date | null;
}

export class TemplateUpdateError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

// --------------------------------------------------------------------------------------------------
// Which job sheet each template uses (the Applied update, or the go-live template from git)
// --------------------------------------------------------------------------------------------------

async function fileContent(pool: sql.ConnectionPool, fileId: number): Promise<Buffer> {
  const r = await pool.request().input('id', sql.Int, fileId).query('SELECT content FROM dbo.template_files WHERE id = @id');
  if (!r.recordset[0]) throw new Error(`Template file ${fileId} not found`);
  return r.recordset[0].content as Buffer;
}

/** Point every template at its applied update. Runs at start-up, every minute, and after each change. */
export async function refreshTemplateSources(): Promise<void> {
  const pool = await getBraxConnection();
  const rows: UpdateRow[] = (await pool.request().input('env', sql.NVarChar, ENVIRONMENT).query(`
    SELECT id, ref_no, template_file, file_id, applied_at FROM dbo.template_updates
    WHERE environment = @env AND status = 'Applied'`)).recordset;
  for (const r of rows) {
    const ref = refOf(r.ref_no);
    let source: string | null = null;
    if (r.file_id != null) {
      source = cachePath(ref, r.template_file);
      if (!fs.existsSync(source)) {           // e.g. a new VM, or the folder was cleared: restore it from the database
        fs.mkdirSync(UPDATES_DIR, { recursive: true });
        fs.writeFileSync(source, await fileContent(pool, r.file_id));
      }
    }
    setTemplateSource(r.template_file, source, new Date(r.applied_at!).getTime(), ref);
  }
}

/** A check still running when the server stopped can never finish. */
export async function failInterruptedChecks(): Promise<void> {
  const pool = await getBraxConnection();
  const result = JSON.stringify({ problems: [{ severity: 'error', text: 'The check was interrupted because the server restarted. Upload the job sheet again.' }] });
  await pool.request().input('env', sql.NVarChar, ENVIRONMENT).input('res', sql.NVarChar(sql.MAX), result)
    .query(asDbo(`UPDATE dbo.template_updates SET status = 'Failed', check_result = @res WHERE environment = @env AND status = 'Checking';`));
}

// --------------------------------------------------------------------------------------------------
// Reading
// --------------------------------------------------------------------------------------------------

export async function listTargets() {
  const pool = await getBraxConnection();
  const applied: UpdateRow[] = (await pool.request().input('env', sql.NVarChar, ENVIRONMENT).query(`
    SELECT * FROM dbo.template_updates WHERE environment = @env AND status = 'Applied'`)).recordset;
  return TEMPLATE_TARGETS.map(t => {
    const a = applied.find(r => r.template_file === t.templateFile);
    return {
      product: t.product, reportTable: t.reportTable, reportLabel: t.reportLabel, codes: t.codes, templateFile: t.templateFile,
      current: a
        ? { ref: refOf(a.ref_no), sourceFileName: a.source_file_name, orderNo: a.order_no, appliedBy: a.applied_by, appliedAt: a.applied_at }
        : { ref: null, sourceFileName: 'Go-live template', orderNo: null, appliedBy: null, appliedAt: null },
    };
  });
}

const progressOf = new Map<number, { stage: string; done: number; total: number }>();

function summary(r: UpdateRow, refs: Map<number, number>) {
  const t = targetFor(r.product);
  return {
    id: r.id, ref: refOf(r.ref_no), kind: r.kind, status: r.status,
    reportLabel: t?.reportLabel ?? r.report_table, product: r.product, codes: t?.codes ?? [], templateFile: r.template_file,
    sourceFileName: r.source_file_name, orderNo: r.order_no, hasFile: r.file_id != null || r.kind === 'rollback',
    rollbackOf: r.rollback_of != null && refs.has(r.rollback_of) ? refOf(refs.get(r.rollback_of)!) : null,
    uploadedBy: r.uploaded_by, uploadedAt: r.uploaded_at, appliedBy: r.applied_by, appliedAt: r.applied_at,
    discardedBy: r.discarded_by, discardedAt: r.discarded_at, rolledBackBy: r.rolled_back_by, rolledBackAt: r.rolled_back_at,
    canRollback: r.status === 'Applied',
    noChanges: r.status === 'Discarded' && r.discarded_by === NO_CHANGES_BY,
  };
}

export async function listUpdates() {
  const pool = await getBraxConnection();
  const rows: UpdateRow[] = (await pool.request().input('env', sql.NVarChar, ENVIRONMENT).query(`
    SELECT id, ref_no, report_table, product, template_file, kind, source_file_name, order_no, status, rollback_of, replaced_id, file_id,
           uploaded_by, uploaded_at, applied_by, applied_at, discarded_by, discarded_at, rolled_back_by, rolled_back_at
    FROM dbo.template_updates WHERE environment = @env ORDER BY ref_no DESC`)).recordset;
  const refs = new Map(rows.map(r => [r.id, r.ref_no]));
  return rows.map(r => summary(r, refs));
}

async function getRow(pool: sql.ConnectionPool, id: number): Promise<UpdateRow> {
  const r = (await pool.request().input('id', sql.Int, id).input('env', sql.NVarChar, ENVIRONMENT)
    .query('SELECT * FROM dbo.template_updates WHERE id = @id AND environment = @env')).recordset[0];
  if (!r) throw new TemplateUpdateError('That update does not exist.', 404);
  return r;
}

export async function getUpdate(id: number) {
  const pool = await getBraxConnection();
  const r = await getRow(pool, id);
  const refs = new Map<number, number>();
  if (r.rollback_of != null) refs.set(r.rollback_of, (await getRow(pool, r.rollback_of)).ref_no);
  return { ...summary(r, refs), check: r.check_result ? JSON.parse(r.check_result) : null, progress: progressOf.get(id) ?? null };
}

/** The job sheet an update put in place (a rollback to the go-live template gives that file). */
export async function getUpdateFile(id: number): Promise<{ name: string; content: Buffer }> {
  const pool = await getBraxConnection();
  const r = await getRow(pool, id);
  const ref = refOf(r.ref_no);
  if (r.file_id != null) return { name: `${ref}__${r.source_file_name ?? r.template_file}`, content: await fileContent(pool, r.file_id) };
  return { name: `${ref}__go-live__${r.template_file}`, content: fs.readFileSync(path.join(TEMPLATE_DIR, r.template_file)) };
}

// --------------------------------------------------------------------------------------------------
// Upload and check
// --------------------------------------------------------------------------------------------------

const cleanName = (s: unknown) => String(s ?? '').trim().slice(0, 100);

export async function createUpload(product: string, fileName: string, by: string, content: Buffer) {
  const target = targetFor(product);
  if (!target) throw new TemplateUpdateError('Pick a report and product code.');
  if (!cleanName(by)) throw new TemplateUpdateError('Enter your name first (top of the page), so the history shows who uploaded it.');
  if (!content.length) throw new TemplateUpdateError('The file is empty.');
  if (content.length > MAX_UPLOAD_BYTES) throw new TemplateUpdateError('The file is over 25 MB. BUZ job sheets are usually under 1 MB.');
  if (content[0] !== 0x50 || content[1] !== 0x4b || !/\.xls[xm]$/i.test(fileName)) throw new TemplateUpdateError('Upload the BUZ job sheet as an .xlsm file.');

  const sha = crypto.createHash('sha256').update(content).digest('hex');
  const pool = await getBraxConnection();
  const r = await pool.request()
    .input('env', sql.NVarChar, ENVIRONMENT).input('sha', sql.Char(64), sha).input('size', sql.Int, content.length)
    .input('content', sql.VarBinary(sql.MAX), content).input('table', sql.NVarChar, target.reportTable)
    .input('product', sql.NVarChar, target.product).input('file', sql.NVarChar, target.templateFile)
    .input('name', sql.NVarChar, path.basename(fileName).slice(0, 260)).input('by', sql.NVarChar, cleanName(by))
    .query(asDbo(`
      SET XACT_ABORT ON;
      BEGIN TRAN;
      DECLARE @fid INT = (SELECT id FROM dbo.template_files WITH (UPDLOCK, HOLDLOCK) WHERE sha256 = @sha);
      IF @fid IS NULL BEGIN
        INSERT dbo.template_files (sha256, size_bytes, content) VALUES (@sha, @size, @content);
        SET @fid = SCOPE_IDENTITY();
      END
      DECLARE @n INT = (SELECT ISNULL(MAX(ref_no), 0) + 1 FROM dbo.template_updates WITH (UPDLOCK, HOLDLOCK) WHERE environment = @env);
      INSERT dbo.template_updates (environment, ref_no, report_table, product, template_file, kind, source_file_name, status, file_id, uploaded_by, uploaded_at)
      VALUES (@env, @n, @table, @product, @file, 'upload', @name, 'Checking', @fid, @by, SYSUTCDATETIME());
      SELECT CAST(SCOPE_IDENTITY() AS INT) AS id, @n AS ref_no;
      COMMIT;
    `));
  const { id, ref_no } = r.recordset[0];
  const ref = refOf(ref_no);
  fs.mkdirSync(UPDATES_DIR, { recursive: true });
  fs.writeFileSync(cachePath(ref, target.templateFile), content);
  progressOf.set(id, { stage: 'waiting', done: 0, total: 1 });
  void runCheck(id, ref, target);
  return { id, ref };
}

function runCheckProcess(job: object, onProgress: (p: { stage: string; done: number; total: number }) => void): Promise<void> {
  const jobPath = path.join(os.tmpdir(), `template-check-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  fs.writeFileSync(jobPath, JSON.stringify(job));
  return new Promise((resolve, reject) => {
    // own heap limit: the check reads the whole workbook, and must stay well inside the service's memory
    const execArgv = [...process.execArgv.filter(a => !a.startsWith('--max-old-space-size')), '--max-old-space-size=384'];
    const child = spawn(process.execPath, [...execArgv, CHECK_SCRIPT, jobPath], { stdio: ['ignore', 'pipe', 'pipe'] });
    let failure = '';
    const timer = setTimeout(() => { failure = 'The check took longer than 20 minutes and was stopped.'; child.kill(); }, 20 * 60 * 1000);
    child.stdout.on('data', (d: Buffer) => {
      for (const line of d.toString().split('\n')) {
        const m = line.match(/^PROGRESS (\S+) (\d+) (\d+)/);
        if (m) onProgress({ stage: m[1], done: Number(m[2]), total: Number(m[3]) });
        const f = line.match(/^CHECK FAILED (.*)/);
        if (f) failure = f[1];
      }
    });
    child.stderr.on('data', (d: Buffer) => { const s = d.toString(); if (/CHECK FAILED/.test(s)) failure = s.replace(/[\s\S]*CHECK FAILED /, '').trim(); else if (!/Deprecation|trace-deprecation/.test(s)) console.error('[template check]', s.trim()); });
    child.on('error', reject);
    child.on('exit', code => {
      clearTimeout(timer);
      fs.rm(jobPath, () => undefined);
      code === 0 ? resolve() : reject(new Error(failure || `The check stopped unexpectedly (exit ${code}).`));
    });
  });
}

const sameValue = (a: unknown, b: unknown) =>
  (a === undefined && b === undefined) || (typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) < 1e-9) || (a !== undefined && b !== undefined && String(a).trim() === String(b).trim());

/** What would change on the live report: the check's new values against what the report shows now. */
function liveImpact(target: TemplateTarget, results: { lineKey: string; pkId: string; values: LineValues }[]) {
  const headers = new Map(target.mapping().map(m => [m.sqlColumn, m.header]));
  const byColumn = new Map<string, { heading: string; lines: number; examples: { lineKey: string; before: unknown; after: unknown }[] }>();
  let changedLines = 0, changedCells = 0, notOnReport = 0;
  for (const r of results) {
    const before = target.current(r.pkId);
    if (!before) { notOnReport++; continue; }
    let lineChanged = false;
    for (const col of new Set([...Object.keys(before), ...Object.keys(r.values)])) {
      if (sameValue(before[col], r.values[col])) continue;
      lineChanged = true; changedCells++;
      const c = byColumn.get(col) ?? { heading: headers.get(col) ?? col, lines: 0, examples: [] };
      c.lines++;
      if (c.examples.length < 3) c.examples.push({ lineKey: r.lineKey, before: before[col] ?? null, after: r.values[col] ?? null });
      byColumn.set(col, c);
    }
    if (lineChanged) changedLines++;
  }
  return {
    changedLines, changedCells, notOnReport,
    columns: [...byColumn.values()].sort((a, b) => b.lines - a.lines).slice(0, 40),
    moreColumns: Math.max(0, byColumn.size - 40),
  };
}

const NO_CHANGES_BY = 'Automatic (no changes needed)';

async function saveCheck(id: number, status: 'Checked' | 'Failed' | 'Discarded', result: object, orderNo: string | null) {
  const pool = await getBraxConnection();
  await pool.request().input('id', sql.Int, id).input('status', sql.NVarChar, status)
    .input('res', sql.NVarChar(sql.MAX), JSON.stringify(result)).input('order', sql.NVarChar, orderNo).input('auto', sql.NVarChar, NO_CHANGES_BY)
    .query(asDbo(`
      UPDATE dbo.template_updates SET status = @status, check_result = @res, order_no = @order,
             discarded_by = CASE WHEN @status = 'Discarded' THEN @auto END,
             discarded_at = CASE WHEN @status = 'Discarded' THEN SYSUTCDATETIME() END
      WHERE id = @id AND status = 'Checking';`));
}

/** The upload is the same as the template in use, in everything the report uses */
function changesNothing(out: CheckOutput, live: { changedCells: number; notOnReport: number }): boolean {
  return !out.problems.some(p => p.severity === 'error')
    && out.formulas.changed === 0 && out.values.changed === 0
    && out.columns.added.length + out.columns.removed.length + out.columns.renamed.length === 0
    && out.sheets.added.length + out.sheets.removed.length === 0
    // every open line was compared (none still waiting for the report's first calculation)
    && live.changedCells === 0 && live.notOnReport === 0 && out.live.failed === 0;
}

async function runCheck(id: number, ref: string, target: TemplateTarget) {
  const outPath = path.join(os.tmpdir(), `template-check-${ref}-${Date.now()}.json`);
  const checkedAgainst = templateSourceRef(target.templateFile);
  const t0 = Date.now();
  try {
    // waits for any calculation batch to finish, and holds new ones back, so only one heavy job runs at a time
    await runExclusive(() => runCheckProcess(
      { product: target.product, newPath: cachePath(ref, target.templateFile), currentPath: templateSourcePath(target.templateFile), outPath },
      p => progressOf.set(id, p),
    ));
    const out: CheckOutput = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    const { results, ...liveCounts } = out.live;
    const live = { ...liveCounts, ...liveImpact(target, results) };
    const noChanges = changesNothing(out, live);
    const result = {
      ...out, live, noChanges,
      checkedAgainst, checkedAt: new Date().toISOString(), seconds: Math.round((Date.now() - t0) / 1000),
    };
    await saveCheck(id, noChanges ? 'Discarded' : out.problems.some(p => p.severity === 'error') ? 'Failed' : 'Checked', result, out.orderNo);
    if (noChanges) fs.rm(cachePath(ref, target.templateFile), { force: true }, () => undefined);
    console.log(`[template-updates] ${ref} ${target.product} checked in ${result.seconds}s${noChanges ? ' - no changes needed' : ''}`);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`[template-updates] ${ref} check failed:`, message);
    await saveCheck(id, 'Failed', { problems: [{ severity: 'error', text: `The job sheet could not be checked: ${message}` }], checkedAgainst }, null).catch(() => undefined);
  } finally {
    progressOf.delete(id);
    fs.rm(outPath, () => undefined);
  }
}

// --------------------------------------------------------------------------------------------------
// Apply, discard, roll back
// --------------------------------------------------------------------------------------------------

export async function applyUpdate(id: number, by: string, confirmWarnings: boolean) {
  if (!cleanName(by)) throw new TemplateUpdateError('Enter your name first (top of the page), so the history shows who applied it.');
  const pool = await getBraxConnection();
  const r = await getRow(pool, id);
  if (r.kind !== 'upload' || r.status !== 'Checked') {
    throw new TemplateUpdateError(r.status === 'Failed' ? 'This upload failed its checks, so it can\'t be applied.' : `This update is ${r.status.toLowerCase()}, so it can't be applied.`);
  }
  const check = r.check_result ? JSON.parse(r.check_result) : {};
  if ((check.checkedAgainst ?? null) !== templateSourceRef(r.template_file)) {
    throw new TemplateUpdateError('The template changed after this upload was checked. Upload the job sheet again to check it against the current template.', 409);
  }
  if ((check.problems ?? []).some((p: any) => p.severity === 'warning') && !confirmWarnings) {
    throw new TemplateUpdateError('This upload has warnings. Confirm them to apply it.', 409);
  }
  const res = await pool.request().input('id', sql.Int, id).input('env', sql.NVarChar, ENVIRONMENT)
    .input('file', sql.NVarChar, r.template_file).input('by', sql.NVarChar, cleanName(by))
    .query(asDbo(`
      SET XACT_ABORT ON;
      BEGIN TRAN;
      DECLARE @prev INT = (SELECT id FROM dbo.template_updates WITH (UPDLOCK, HOLDLOCK)
                           WHERE environment = @env AND template_file = @file AND status = 'Applied');
      UPDATE dbo.template_updates SET status = 'Replaced' WHERE id = @prev;
      UPDATE dbo.template_updates SET status = 'Applied', applied_by = @by, applied_at = SYSUTCDATETIME(), replaced_id = @prev
      WHERE id = @id AND status = 'Checked';
      SELECT @@ROWCOUNT AS n;
      COMMIT;
    `));
  if (!res.recordset[0]?.n) throw new TemplateUpdateError('This update was changed by someone else. Refresh the page.', 409);
  await refreshTemplateSources();
  console.log(`[template-updates] ${refOf(r.ref_no)} applied to ${r.template_file} by ${cleanName(by)}`);
  return getUpdate(id);
}

export async function discardUpdate(id: number, by: string) {
  if (!cleanName(by)) throw new TemplateUpdateError('Enter your name first (top of the page).');
  const pool = await getBraxConnection();
  const r = await getRow(pool, id);
  if (r.status !== 'Checked' && r.status !== 'Failed') throw new TemplateUpdateError(`This update is ${r.status.toLowerCase()}, so it can't be discarded.`);
  await pool.request().input('id', sql.Int, id).input('by', sql.NVarChar, cleanName(by))
    .query(asDbo(`UPDATE dbo.template_updates SET status = 'Discarded', discarded_by = @by, discarded_at = SYSUTCDATETIME() WHERE id = @id AND status IN ('Checked', 'Failed');`));
  fs.rm(cachePath(refOf(r.ref_no), r.template_file), { force: true }, () => undefined);
  return getUpdate(id);
}

export async function rollbackUpdate(id: number, by: string) {
  if (!cleanName(by)) throw new TemplateUpdateError('Enter your name first (top of the page), so the history shows who rolled it back.');
  const pool = await getBraxConnection();
  const r = await getRow(pool, id);
  if (r.status !== 'Applied') throw new TemplateUpdateError('Only the update in use for a template can be rolled back. Roll back the newer update first.');
  const res = await pool.request().input('id', sql.Int, id).input('env', sql.NVarChar, ENVIRONMENT).input('by', sql.NVarChar, cleanName(by))
    .query(asDbo(`
      SET XACT_ABORT ON;
      BEGIN TRAN;
      DECLARE @prev INT, @file NVARCHAR(200), @table NVARCHAR(100), @product NVARCHAR(100);
      SELECT @prev = replaced_id, @file = template_file, @table = report_table, @product = product
      FROM dbo.template_updates WITH (UPDLOCK, HOLDLOCK) WHERE id = @id AND status = 'Applied';
      DECLARE @n INT = NULL, @new INT = NULL;
      -- no RETURN in here: asDbo's REVERT must always run
      IF @file IS NOT NULL BEGIN
        SET @n = (SELECT ISNULL(MAX(ref_no), 0) + 1 FROM dbo.template_updates WITH (UPDLOCK, HOLDLOCK) WHERE environment = @env);
        INSERT dbo.template_updates (environment, ref_no, report_table, product, template_file, kind, source_file_name, order_no, status,
                                     rollback_of, replaced_id, file_id, applied_by, applied_at)
        SELECT @env, @n, @table, @product, @file, 'rollback',
               ISNULL(p.source_file_name, 'Go-live template'), p.order_no, 'Applied', @id, @id, p.file_id, @by, SYSUTCDATETIME()
        FROM (SELECT 1 AS one) x LEFT JOIN dbo.template_updates p ON p.id = @prev;
        SET @new = SCOPE_IDENTITY();
        UPDATE dbo.template_updates SET status = 'Rolled back', rolled_back_by = @by, rolled_back_at = SYSUTCDATETIME() WHERE id = @id;
      END
      COMMIT;
      SELECT @new AS id, @n AS ref_no;
    `));
  const created = res.recordset[0];
  if (!created?.id) throw new TemplateUpdateError('This update was changed by someone else. Refresh the page.', 409);
  await refreshTemplateSources();
  console.log(`[template-updates] ${refOf(created.ref_no)}: rolled back ${refOf(r.ref_no)} (${r.template_file}) by ${cleanName(by)}`);
  return getUpdate(created.id);
}
