import sql from 'mssql';
import { calculateProductLine, getProductMapping, ProductConfig, ProductResult, productTemplateModifiedAt, withProductEngine } from './ProductJobSheet.js';
import { getDasonLineSummary, getOptionRows, trackingFields, ProductionLine } from './DoorScreenSync.js';
import { BACKGROUND_REFRESH_MS } from './DoorScreenReport.js';

/**
 * Serves a product's page with components calculated from the database: current jobs from
 * dbsproduction, options from SalesOrderOptions_DASON. Read-only: calculated in memory,
 * nothing is written to SQL. Rows use the column names of the product's old manual-upload
 * table, so the page's header rows, comments and totals keep working unchanged.
 */

/** Switch: the page uses the calculated rows only when the product's .env flag is 'true' (default: old table). */
export function productFromEngine(p: ProductConfig): boolean {
  return String(process.env[p.envFlag]).toLowerCase() === 'true';
}

/**
 * Current lines of the product (read fresh on every call): from dbsproduction, or dbswip for products
 * whose report also follows jobs outside production (Curtain Tracks), optionally only some statuses.
 */
async function getProductionLines(p: ProductConfig, pool: sql.ConnectionPool): Promise<ProductionLine[]> {
  const req = pool.request();
  p.groups.forEach((g, i) => req.input(`g${i}`, sql.VarChar(20), g));
  (p.jobStatuses ?? []).forEach((s, i) => req.input(`s${i}`, sql.NVarChar(100), s));
  (p.excludeStatuses ?? []).forEach((s, i) => req.input(`x${i}`, sql.NVarChar(100), s));
  const wip = p.jobsView === 'dbswip';
  const statusFilter = [
    p.jobStatuses?.length ? `AND [ProductionStatus] IN (${p.jobStatuses.map((_, i) => `@s${i}`).join(',')})` : '',
    p.excludeStatuses?.length ? `AND ISNULL([ProductionStatus], '') NOT IN (${p.excludeStatuses.map((_, i) => `@x${i}`).join(',')})` : '',
  ].join(' ');
  return (await req.query(`
    SELECT [Buz and Line No.] AS lineKey, ${wip ? '[Buz No]' : '[DBS Buz No.]'} AS buzNo, [InventoryItem], [Descn], [CustomerGroup], [SalesRep], [Installer],
           [ProductionStatus], [InstallationStatus], [DateScheduled]
    FROM [dbo].[${wip ? 'dbswip' : 'dbsproduction'}]
    WHERE LEFT([InventoryItem], CHARINDEX(' ', [InventoryItem] + ' ') - 1) IN (${p.groups.map((_, i) => `@g${i}`).join(',')})
    ${statusFilter}
  `)).recordset;
}

function toPageRow(p: ProductConfig, id: number, r: ProductResult) {
  const b = r.base;
  const out: Record<string, any> = {
    id,
    job_tracking_action: b.Job_Tracking_Action ?? '',
    dispatch_action: b.Dispatch_Action ?? '',
    dispatch_date: b.Dispatch_Date || null,
  };
  for (const field of Object.keys(p.baseColumns)) {
    const key = field.toLowerCase();
    out[key] = key === 'line_no' ? (b[field] === '' || b[field] == null ? null : Number(b[field])) : b[field];
  }
  const textColumns = new Set(p.textColumns ?? []);
  for (const m of getProductMapping(p)) {
    const v = r.components[m.sqlColumn];
    out[m.legacy] = v === null || v === undefined ? null : (textColumns.has(m.sqlColumn) ? v : Number(v));
  }
  return out;
}

/** Dispatch Date oldest → newest (no date last), then Quote No., then Line No. */
function byDispatchDate(a: ProductResult, b: ProductResult): number {
  const da = a.base.Dispatch_Date || '9999-12-31', db = b.base.Dispatch_Date || '9999-12-31';
  return da.localeCompare(db)
    || (a.base.Quote_No || '').localeCompare(b.base.Quote_No || '')
    || Number(a.base.Line_No) - Number(b.base.Line_No);
}

interface CachedLine { editedAt: number; templateTime: number; result: ProductResult }
interface ProductState {
  lineCache: Map<string, CachedLine>;
  liveRows: ProductResult[];
  liveAt: number;
  inFlight: Promise<ProductResult[]> | null;
}
const states = new Map<string, ProductState>();
function stateOf(p: ProductConfig): ProductState {
  if (!states.has(p.label)) states.set(p.label, { lineCache: new Map(), liveRows: [], liveAt: 0, inFlight: null });
  return states.get(p.label)!;
}

async function calculateLiveRows(p: ProductConfig, pool: sql.ConnectionPool): Promise<ProductResult[]> {
  const st = stateOf(p);
  const t0 = Date.now();
  const prod = await getProductionLines(p, pool);
  const lineInfo = await getDasonLineSummary(pool, [...new Set(prod.map(x => String(x.buzNo)))]);
  const templateTime = productTemplateModifiedAt(p);

  const todo: { lineKey: string; pkId: string; editedAt: number; prod: ProductionLine }[] = [];
  const notInDason: string[] = [];
  for (const x of prod) {
    const info = lineInfo.get(x.lineKey);
    if (!info) { notInDason.push(x.lineKey); continue; }
    const c = st.lineCache.get(info.pkId);
    if (!c || c.editedAt < info.editedAt || c.templateTime < templateTime) {
      todo.push({ lineKey: x.lineKey, pkId: info.pkId, editedAt: info.editedAt, prod: x });
    }
  }

  const optionRows = await getOptionRows(pool, todo.map(t => t.pkId));
  let failed = 0;
  // the template is loaded for this batch only, and freed afterwards
  if (todo.length) await withProductEngine(p, async () => {
    for (const t of todo) {
      // A line takes up to ~1s of pure calculation: let the server answer requests between lines,
      // or the whole site stops responding while hundreds of lines calculate at start-up
      await new Promise(resolve => setImmediate(resolve));
      try {
        const result = await calculateProductLine(p, pool, optionRows.get(t.pkId) || [], {
          Descn: t.prod.Descn, CustomerGroup: t.prod.CustomerGroup, SalesRep: t.prod.SalesRep, Installer: t.prod.Installer,
          DateScheduled: t.prod.DateScheduled,
        });
        st.lineCache.set(t.pkId, { editedAt: t.editedAt, templateTime, result });
      } catch (e) {
        failed++;
        console.error(`[${p.label}] could not calculate ${t.lineKey}:`, e);
      }
    }
  });

  const rows: ProductResult[] = [];
  let notOnComponents = 0;
  for (const x of prod) {
    const info = lineInfo.get(x.lineKey);
    const c = info && st.lineCache.get(info.pkId);
    if (!c) continue;
    // The job sheet leaves a line off its Components tab (no Quote No.) when we don't make it,
    // e.g. a Roller Shutter bought made-up from CW Products - so it isn't on the report either
    if (!c.result.base.Quote_No) { notOnComponents++; continue; }
    // job tracking is re-read from dbsproduction on every refresh, even for cached lines
    rows.push({ ...c.result, base: { ...c.result.base, ...trackingFields(x) } });
  }
  rows.sort(byDispatchDate);

  if (todo.length || notInDason.length || failed) {
    console.log(`[${p.label}] ${prod.length} jobs in ${p.jobsView ?? 'dbsproduction'}: ${todo.length - failed} calculated, ` +
      `${prod.length - todo.length - notInDason.length} unchanged, ${notInDason.length} not in DASON yet, ` +
      `${failed} failed, ${notOnComponents} not on the job sheet's Components tab ` +
      `(${((Date.now() - t0) / 1000).toFixed(1)}s, nothing written to SQL)`);
  }
  return rows;
}

/** Re-read dbsproduction + DASON and recalculate changed lines (one run at a time; keeps the last rows on failure). */
function startLiveRefresh(p: ProductConfig, pool: sql.ConnectionPool): Promise<ProductResult[]> {
  const st = stateOf(p);
  st.inFlight ??= calculateLiveRows(p, pool)
    .then(rows => { st.liveRows = rows; st.liveAt = Date.now(); return rows; })
    .catch(e => {
      if (!st.liveAt) throw e; // nothing calculated yet: let the page show the error
      console.error(`[${p.label}] background refresh failed, serving last calculated rows:`, e);
      return st.liveRows;
    })
    .finally(() => { st.inFlight = null; });
  return st.inFlight;
}

/** Page loads get the last calculated rows straight away; the database check runs in the background. */
async function getLiveRows(p: ProductConfig, pool: sql.ConnectionPool): Promise<ProductResult[]> {
  const st = stateOf(p);
  if (!st.liveAt) return startLiveRefresh(p, pool);
  if (Date.now() - st.liveAt > BACKGROUND_REFRESH_MS) void startLiveRefresh(p, pool);
  return st.liveRows;
}

/** Calculate all current jobs at start-up (read-only), then keep them fresh in the background. */
export function warmUpProductPage(p: ProductConfig, pool: sql.ConnectionPool): Promise<unknown> {
  setInterval(() => void startLiveRefresh(p, pool).catch(() => {}), BACKGROUND_REFRESH_MS).unref();
  return startLiveRefresh(p, pool);
}

/**
 * All current rows of a page table, from every job sheet template that feeds it (e.g. External Blinds:
 * AUTO and FGSUN lines, each calculated with its own job sheet), in page order.
 */
async function getTableRows(products: ProductConfig[], pool: sql.ConnectionPool): Promise<{ p: ProductConfig; r: ProductResult }[]> {
  const all: { p: ProductConfig; r: ProductResult }[] = [];
  for (const p of products) for (const r of await getLiveRows(p, pool)) all.push({ p, r });
  return all.sort((a, b) => byDispatchDate(a.r, b.r));
}

export async function getProductPage(
  products: ProductConfig[],
  pool: sql.ConnectionPool,
  opts: { skip: number; take: number; search: string },
): Promise<{ data: any[]; total: number }> {
  const all = await getTableRows(products, pool);
  const s = opts.search.toLowerCase();
  const matching = s ? all.filter(x => (x.r.base.Quote_No || '').toLowerCase().includes(s)) : all;
  const page = matching.slice(opts.skip, opts.skip + opts.take);
  return { data: page.map((x, i) => toPageRow(x.p, opts.skip + i + 1, x.r)), total: matching.length };
}

export interface CalculationIssue {
  id: number;            // the row's id on the page (position in the current list, oldest dispatch first)
  quote_no: string;
  line_no: number | null;
  quote_ref: string;
  business_name: string;
  dispatch_date: string | null;
  columns: { column: string; header: string; value: string }[];
  /** Why: each failed job sheet lookup, with the job sheet columns it breaks */
  causes: { message: string; lookupValue: string; lookupTable: string; jobSheetColumns: string[] }[];
}

function describeCauses(r: ProductResult): CalculationIssue['causes'] {
  const byLookup = new Map<string, CalculationIssue['causes'][number]>();
  for (const s of r.errorSources) {
    const key = s.lookupTable ? `${s.lookupTable}|${s.lookupValue}` : `${s.sheet}!${s.address}`;
    const label = s.label || `${s.sheet} ${s.address}`;
    const existing = byLookup.get(key);
    if (existing) { if (!existing.jobSheetColumns.includes(label)) existing.jobSheetColumns.push(label); continue; }
    byLookup.set(key, {
      message: s.lookupTable
        ? `"${s.lookupValue}" is not in the job sheet's ${s.lookupTable} list`
        : `${label} gives ${s.error} in the job sheet itself - a formula problem in the job sheet, not the BUZ order`,
      lookupValue: s.lookupValue ?? '',
      lookupTable: s.lookupTable ?? '',
      jobSheetColumns: [label],
    });
  }
  return [...byLookup.values()];
}

/** Current lines whose job sheet formulas give #N/A (or another Excel error) in any Components column. */
export async function getProductIssues(products: ProductConfig[], pool: sql.ConnectionPool): Promise<CalculationIssue[]> {
  return (await getTableRows(products, pool))
    .map((x, i) => ({ ...x, id: i + 1 })) // same numbering as the page's id column (unfiltered list)
    .filter(({ r }) => r.errors.length)
    .map(({ p, r, id }) => {
      const bySql = new Map(getProductMapping(p).map(m => [m.sqlColumn, m]));
      return {
      id,
      quote_no: r.base.Quote_No,
      line_no: r.base.Line_No === '' ? null : Number(r.base.Line_No),
      quote_ref: r.base.Quote_Ref,
      business_name: r.base.Business_Name,
      dispatch_date: r.base.Dispatch_Date || null,
      columns: r.errors.map(e => ({ column: bySql.get(e.sqlColumn)?.legacy ?? e.sqlColumn, header: bySql.get(e.sqlColumn)?.header ?? e.sqlColumn, value: e.value })),
      causes: describeCauses(r),
      };
    });
}
