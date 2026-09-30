import sql from 'mssql';
import { ComponentsMapper } from '../ComponentsMapper.js';
import { calculateDoorScreenLine, DoorScreenResult, templatesModifiedAt } from './DoorScreenJobSheet.js';
import {
  syncDoorScreen, doorScreenWritesEnabled, getProductionLines, getDasonLineSummary, getOptionRows, trackingFields,
} from './DoorScreenSync.js';

/**
 * Serves the Door Screen page with components calculated from the database on every load:
 * current SECD/GRIL jobs from dbsproduction, options from SalesOrderOptions_DASON.
 *
 *  - DOORSCREEN_WRITE_TO_SQL off (default, development): calculated in memory, nothing is written.
 *  - DOORSCREEN_WRITE_TO_SQL=true (go-live): changes are saved to ComponentsReport_DoorScreen
 *    and the page reads that table.
 *
 * Rows are returned in the column layout of the old manual table (door_screen_components:
 * "section__colour" names) so the page's Part Number / Group / Supplier header rows,
 * comments and totals keep working unchanged.
 */

const TABLE = '[dbo].[ComponentsReport_DoorScreen]';
const REFRESH_MIN_INTERVAL_MS = 10_000; // a page load requests data twice (table + totals)
// How often the in-memory rows are re-checked against dbsproduction + DASON (COMPONENTS_REFRESH_SECONDS, default 60)
export const BACKGROUND_REFRESH_MS = (Number(process.env.COMPONENTS_REFRESH_SECONDS) || 60) * 1000;

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

/** SQL column → old page column, e.g. Paperbark_10 → f_frame__paperbark (all 1,011, in Excel order). */
let legacyColumns: { sqlColumn: string; legacy: string }[] | null = null;
function getLegacyColumns() {
  legacyColumns ??= ComponentsMapper.getMapping().map(m => ({ sqlColumn: m.sqlColumn, legacy: `${norm(m.section)}__${norm(m.header)}` }));
  return legacyColumns;
}

function toPageRow(id: number, base: Record<string, any>, value: (sqlColumn: string) => any) {
  const out: Record<string, any> = {
    id,
    job_tracking_action: base.Job_Tracking_Action ?? '',
    dispatch_action: base.Dispatch_Action ?? '',
    dispatch_date: base.Dispatch_Date || null,
    quote_no: base.Quote_No,
    line_no: base.Line_No == null || base.Line_No === '' ? null : Number(base.Line_No),
    order_item_code: base.Order_Item_Code,
    product: base.Product,
    business_name: base.Business_Name,
    quote_ref: base.Quote_Ref,
  };
  for (const c of getLegacyColumns()) {
    const v = value(c.sqlColumn);
    out[c.legacy] = v === null || v === undefined ? null : (ComponentsMapper.isTextColumn(c.sqlColumn) ? v : Number(v));
  }
  return out;
}

/** Dispatch Date oldest → newest (no date last), then Quote No., then Line No. */
function byDispatchDate(a: DoorScreenResult, b: DoorScreenResult): number {
  const da = a.base.Dispatch_Date || '9999-12-31', db = b.base.Dispatch_Date || '9999-12-31';
  return da.localeCompare(db)
    || (a.base.Quote_No || '').localeCompare(b.base.Quote_No || '')
    || Number(a.base.Line_No) - Number(b.base.Line_No);
}

// ---------------------------------------------------------------------------
// In-memory mode: calculate from the database, cache per line, write nothing
// ---------------------------------------------------------------------------
interface CachedLine { editedAt: number; templateTime: number; result: DoorScreenResult }
const lineCache = new Map<string, CachedLine>();
let liveRows: DoorScreenResult[] = [];
let liveAt = 0;
let liveInFlight: Promise<DoorScreenResult[]> | null = null;

/** The page's current result for a line (template update checks compare against it). */
export function cachedDoorScreenResult(pkId: string): DoorScreenResult | undefined {
  return lineCache.get(pkId)?.result;
}

async function calculateLiveRows(pool: sql.ConnectionPool): Promise<DoorScreenResult[]> {
  const t0 = Date.now();
  const prod = await getProductionLines(pool);
  const lineInfo = await getDasonLineSummary(pool, [...new Set(prod.map(p => String(p.buzNo)))]);
  const templateTime = templatesModifiedAt();

  const todo: { lineKey: string; pkId: string; editedAt: number; prod: (typeof prod)[number] }[] = [];
  const notInDason: string[] = [];
  for (const p of prod) {
    const info = lineInfo.get(p.lineKey);
    if (!info) { notInDason.push(p.lineKey); continue; }
    const c = lineCache.get(info.pkId);
    if (!c || c.editedAt < info.editedAt || c.templateTime < templateTime) {
      todo.push({ lineKey: p.lineKey, pkId: info.pkId, editedAt: info.editedAt, prod: p });
    }
  }

  const optionRows = await getOptionRows(pool, todo.map(t => t.pkId));
  let failed = 0;
  for (const t of todo) {
    try {
      const result = await calculateDoorScreenLine(pool, optionRows.get(t.pkId) || [], {
        Descn: t.prod.Descn, CustomerGroup: t.prod.CustomerGroup, SalesRep: t.prod.SalesRep, Installer: t.prod.Installer,
      });
      lineCache.set(t.pkId, { editedAt: t.editedAt, templateTime, result });
    } catch (e) {
      failed++;
      console.error(`[door-screen] could not calculate ${t.lineKey}:`, e);
    }
  }

  // Only lines currently in production, in quote/line order
  const rows: DoorScreenResult[] = [];
  for (const p of prod) {
    const info = lineInfo.get(p.lineKey);
    const c = info && lineCache.get(info.pkId);
    // job tracking is re-read from dbsproduction on every refresh, even for cached lines
    if (c) rows.push({ ...c.result, base: { ...c.result.base, ...trackingFields(p) } });
  }
  rows.sort(byDispatchDate);

  if (todo.length || notInDason.length || failed) {
    console.log(`[door-screen] ${prod.length} jobs in dbsproduction: ${todo.length - failed} calculated, ` +
      `${prod.length - todo.length - notInDason.length} unchanged, ${notInDason.length} not in DASON yet, ` +
      `${failed} failed (${((Date.now() - t0) / 1000).toFixed(1)}s, nothing written to SQL)`);
  }
  return rows;
}

/** Re-read dbsproduction + DASON and recalculate changed lines (one run at a time; keeps the last rows on failure). */
function startLiveRefresh(pool: sql.ConnectionPool): Promise<DoorScreenResult[]> {
  liveInFlight ??= calculateLiveRows(pool)
    .then(rows => { liveRows = rows; liveAt = Date.now(); return rows; })
    .catch(e => {
      if (!liveAt) throw e; // nothing calculated yet: let the page show the error
      console.error('[door-screen] background refresh failed, serving last calculated rows:', e);
      return liveRows;
    })
    .finally(() => { liveInFlight = null; });
  return liveInFlight;
}

/**
 * Page loads get the last calculated rows straight away; the database check runs in the background
 * (every BACKGROUND_REFRESH_MS, or on a page load if the rows are older than that).
 * Only the very first load waits for the calculation.
 */
async function getLiveRows(pool: sql.ConnectionPool): Promise<DoorScreenResult[]> {
  if (!liveAt) return startLiveRefresh(pool);
  if (Date.now() - liveAt > BACKGROUND_REFRESH_MS) void startLiveRefresh(pool);
  return liveRows;
}

/** Calculate all current jobs at start-up (read-only), then keep them fresh in the background. */
export function warmUpDoorScreenPage(pool: sql.ConnectionPool): Promise<unknown> {
  if (doorScreenWritesEnabled()) return refreshDoorScreen(pool);
  setInterval(() => void startLiveRefresh(pool).catch(() => {}), BACKGROUND_REFRESH_MS).unref();
  return startLiveRefresh(pool);
}

// ---------------------------------------------------------------------------
// Go-live mode: save changes to ComponentsReport_DoorScreen, page reads the table
// ---------------------------------------------------------------------------
let inFlight: Promise<void> | null = null;
let lastRefresh = 0;

export async function refreshDoorScreen(pool: sql.ConnectionPool): Promise<void> {
  if (!doorScreenWritesEnabled()) return;
  if (inFlight) return inFlight;
  if (Date.now() - lastRefresh < REFRESH_MIN_INTERVAL_MS) return;
  inFlight = (async () => {
    try {
      const r = await syncDoorScreen(pool, () => {}, 'changed');
      if (r.written || r.removed.length || r.failed.length || r.notInDason.length) {
        console.log(`[door-screen refresh] ${r.written} recalculated, ${r.removed.length} removed, ` +
          `${r.notInDason.length} not in DASON, ${r.failed.length} failed (${r.seconds}s)`);
      }
    } catch (e) {
      console.error('[door-screen refresh] failed, serving last calculated data:', e);
    } finally {
      lastRefresh = Date.now();
      inFlight = null;
    }
  })();
  return inFlight;
}

async function getTablePage(pool: sql.ConnectionPool, opts: { skip: number; take: number; search: string }) {
  await refreshDoorScreen(pool);
  const where = opts.search ? 'WHERE [Quote_No] LIKE @search' : '';
  const countReq = pool.request();
  if (opts.search) countReq.input('search', sql.NVarChar, `%${opts.search}%`);
  const total = (await countReq.query(`SELECT COUNT(*) AS total FROM ${TABLE} ${where}`)).recordset[0]?.total || 0;

  const req = pool.request().input('skip', sql.Int, opts.skip).input('take', sql.Int, opts.take);
  if (opts.search) req.input('search', sql.NVarChar, `%${opts.search}%`);
  const rows = (await req.query(`
    SELECT * FROM ${TABLE} ${where}
    ORDER BY CASE WHEN NULLIF([Dispatch_Date], '') IS NULL THEN 1 ELSE 0 END, [Dispatch_Date], [Quote_No], TRY_CAST([Line_No] AS int)
    OFFSET @skip ROWS FETCH NEXT @take ROWS ONLY
  `)).recordset;
  return { data: rows.map((r: any, i: number) => toPageRow(opts.skip + i + 1, r, c => r[c])), total };
}

// ---------------------------------------------------------------------------

export async function getDoorScreenPage(
  pool: sql.ConnectionPool,
  opts: { skip: number; take: number; search: string },
): Promise<{ data: any[]; total: number }> {
  if (doorScreenWritesEnabled()) return getTablePage(pool, opts);

  const all = await getLiveRows(pool);
  const s = opts.search.toLowerCase();
  const matching = s ? all.filter(r => (r.base.Quote_No || '').toLowerCase().includes(s)) : all;
  const page = matching.slice(opts.skip, opts.skip + opts.take);
  return {
    data: page.map((r, i) => toPageRow(opts.skip + i + 1, r.base, c => r.components[c])),
    total: matching.length,
  };
}
