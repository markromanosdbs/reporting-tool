import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sql from 'mssql';
import { JobSheetEngine, CellInput, CycleBreak, DataSheetInput, ErrorSource, excelErrorName } from './JobSheetEngine.js';
import type { OrderInfo } from './DoorScreenJobSheet.js';
import { loadTemplateEngine } from './preparedTemplates.js';

/**
 * Components for one product from SalesOrderOptions_DASON, calculated with that product's real BUZ
 * job sheet formulas. Everything product-specific lives in a ProductConfig (see products.ts):
 * the template workbook, the Data!AX/BM labels, how Inventory.Descn splits into Data!BN/BO/BP,
 * and the positional mapping Excel Components column → ComponentsReport_* column → page column.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE_DIR = path.resolve(here, '../../../templates');
const BACKEND_DIR = path.resolve(here, '../../..');


/** Data!BN / BO / BP as the job sheet expects them (split out of BUZ Inventory.Descn) */
export interface DescnParts { BN: string; BO: string; BP: string; warnings: string[] }

export interface ProductColumn {
  excelCol: number;   // Components column in the job sheet
  header: string;     // job sheet heading (row 3)
  sqlColumn: string;  // ComponentsReport_* column
  legacy: string;     // page column (name used by the old manual-upload table)
}

export interface ProductConfig {
  table: string;            // page table, e.g. 'roller_shutter_components' (several configs may share one)
  label: string;            // unique name, for logs and caches, e.g. 'roller-shutters'
  groups: string[];         // BUZ inventory group codes, e.g. ['RLSH']
  template: string;         // file in backend/templates
  mappingFile: string;      // file in backend/, list of ProductColumn (component columns)
  cycleBreaks?: CycleBreak[];
  lineAX: string;           // Data!AX on the line, e.g. 'Roller Shutters'
  lineBM: string;           // Data!BM on the line, e.g. 'Production - Roller Shutters'
  parseDescn: (descn: string) => DescnParts;
  textColumns?: string[];   // component columns that hold text (everything else is a number)
  /** Base fields → Components column (1-based), e.g. { Quote_No: 4, Line_No: 5, ... } */
  baseColumns: Record<string, number>;
  /** .env switch: the page uses these calculated rows only when it is 'true' (default: old table) */
  envFlag: string;
  /** Components row driven by Data row 11, and its heading row (default 5 and 3; Squalonet 3 and 2) */
  componentsRow?: number;
  componentsHeadingRow?: number;
  /** Excel-style array evaluation inside formulas, e.g. SUMPRODUCT(--(LEN(A1:D1)>0)) (Squalonet) */
  arrayArithmetic?: boolean;
  /**
   * Where the page's jobs come from (default dbsproduction). Curtain Tracks uses dbswip: most curtains are
   * ordered made-up from a supplier ("Finished Product Ordered ...") and are not in dbsproduction.
   */
  jobsView?: 'dbsproduction' | 'dbswip';
  /** Only jobs with one of these ProductionStatus values (default: all) */
  jobStatuses?: string[];
  /** Leave out jobs with these ProductionStatus values, e.g. ['Completed', 'Cancelled'] */
  excludeStatuses?: string[];
}

export interface ProductResult {
  orderItemPkId: string;
  base: Record<string, string>;
  components: Record<string, number | string>;
  /** Components cells whose job sheet formula gives an error (Excel shows e.g. #N/A); left blank on the page */
  errors: { sqlColumn: string; value: string }[];
  /** Where those errors start in the job sheet (e.g. a lookup that finds nothing) */
  errorSources: ErrorSource[];
  warnings: string[];
}

const mappings = new Map<string, ProductColumn[]>();
export function getProductMapping(p: ProductConfig): ProductColumn[] {
  if (!mappings.has(p.mappingFile)) mappings.set(p.mappingFile, JSON.parse(fs.readFileSync(path.join(BACKEND_DIR, p.mappingFile), 'utf8')));
  return mappings.get(p.mappingFile)!;
}

export function productTemplateModifiedAt(p: ProductConfig): number {
  return fs.statSync(path.join(TEMPLATE_DIR, p.template)).mtimeMs;
}

const engines = new Map<string, Promise<JobSheetEngine>>();
export function getProductEngine(p: ProductConfig): Promise<JobSheetEngine> {
  // one engine per template: a page can have several (e.g. External Blinds: AUTO and FGSUN job sheets)
  if (!engines.has(p.template)) engines.set(p.template, loadTemplateEngine(p.template, { cycleBreaks: p.cycleBreaks ?? [], arrayArithmetic: p.arrayArithmetic }));
  return engines.get(p.template)!;
}

let engineQueue: Promise<unknown> = Promise.resolve();
/**
 * Run a batch of calculations with p's template loaded, then free it. Batches run one at a time, so
 * only one template is in memory at once: all 14 loaded together take ~540 MB (the VM allows the
 * backend 600 MB). Loading takes 2-6 s, and is only needed when there are new or changed lines.
 */
export function withProductEngine<T>(p: ProductConfig, fn: () => Promise<T>): Promise<T> {
  const run = engineQueue.then(fn).finally(async () => {
    const eng = engines.get(p.template);
    engines.delete(p.template);
    if (eng) (await eng.catch(() => null))?.dispose();
  });
  engineQueue = run.catch(() => undefined);
  return run;
}

/** Excel's display rounding: 2.5 → 3, -2.5 → -3 (JS Math.round would give -2). */
function roundHalfAwayFromZero(n: number, decimals = 0): number {
  const f = 10 ** decimals;
  return Math.sign(n) * Math.round(Math.abs(n) * f + 1e-9) / f;
}

/** Date → Excel serial day number (null when there is no date) */
function excelDate(d: Date | string | null | undefined): number | null {
  if (d == null || d === '') return null;
  const t = new Date(d).getTime();
  return Number.isNaN(t) ? null : Math.round(t / 86400000) + 25569;
}

/** Calculate one line. `lineRows` are all SalesOrderOptions_DASON rows for that OrderItemPkId. */
export async function calculateProductLine(
  p: ProductConfig,
  pool: sql.ConnectionPool,
  lineRows: any[],
  orderInfo?: OrderInfo,
): Promise<ProductResult> {
  const first = lineRows[0];
  const pkId = String(first.OrderItemPkId).toLowerCase();

  // Order description (Data!AX5 → Quote Ref) comes from the WIP view, unless the caller has it
  let w: OrderInfo = orderInfo || {};
  if (!orderInfo) {
    const buzNo = first.DBSBuzNo || `${first.OrderNo}.${first.OrderRev}`;
    const wip = await pool.request()
      .input('buz', sql.NVarChar, buzNo)
      .query(`SELECT TOP 1 [Descn], [CustomerGroup], [SalesRep], [Installer], [DateScheduled] FROM [dbo].[dbswip] WHERE [Buz No] = @buz`)
      .catch(() => ({ recordset: [] as any[] }));
    w = wip.recordset[0] || {};
  }

  const parts = p.parseDescn(String(first.InventoryDescn || ''));
  const warnings = [...parts.warnings];

  const header: Record<string, CellInput> = {
    AV: String(first.OrderPkId || '').toLowerCase(),
    AW: String(first.CustomerPkId || '').toLowerCase(),
    AX: w.Descn ?? '',
    BC: Number(first.OrderNo),
    BD: first.OrderRev ?? '',
    BE: first.CustomerCode ?? '',
    BF: first.CustomerName ?? '',
    CE: w.SalesRep ?? '',
    CZ: w.CustomerGroup ?? '',
    DS: w.Installer ?? '',
  };

  const line: Record<string, CellInput> = {
    AV: pkId,
    AW: first.FixedLine ?? null,
    AX: p.lineAX,
    AY: first.ItemDescn ?? '',
    AZ: first.ItemQty ?? 1,
    BA: first.ItemWidth == null ? null : Number(first.ItemWidth),
    BB: first.ItemHeight == null ? null : Number(first.ItemHeight),
    BD: first.InventoryCode ?? '',
    BE: first.InventoryDescn ?? '',
    // Production.DateSched: BUZ's per-line date is not in DASON or the WIP view, so the job's scheduled date
    // stands in (only CTRA reads it, and only to check it is not blank)
    BF: excelDate(w.DateScheduled),
    BM: p.lineBM,
    BN: parts.BN,
    BO: parts.BO,
    BP: parts.BP,
  };

  // CustOrdOpt: key | id | id | orderItemPkId | code | value — values stay text, as BUZ exports them
  const options: CellInput[][] = [...lineRows]
    .sort((a, b) => (a.SeqNo ?? 0) - (b.SeqNo ?? 0))
    .filter(r => r.OptionCode)
    .map(r => {
      const code = String(r.OptionCode).toUpperCase();
      const id = String(r.Id || '').toLowerCase();
      return [`${pkId}|${code}`, id, id, pkId, code, r.OptionValue == null ? '' : String(r.OptionValue)];
    });

  const input: DataSheetInput = { header, line, options };
  const eng = await getProductEngine(p);
  eng.calculate(input);
  const COMPONENTS_ROW = p.componentsRow ?? 5;

  const textColumns = new Set(p.textColumns ?? []);
  const components: Record<string, number | string> = {};
  const errors: { sqlColumn: string; value: string }[] = [];
  for (const m of getProductMapping(p)) {
    const v = eng.getValue('Components', COMPONENTS_ROW, m.excelCol);
    if (v === null || v === '' || v === 0 || v === false) continue;
    if (typeof v === 'string' && v.startsWith('#')) {
      warnings.push(`${m.sqlColumn}: ${v}`);
      errors.push({ sqlColumn: m.sqlColumn, value: excelErrorName(v.slice(1)) });
      continue;
    }
    // Stored as the job sheet displays it: rounded to the cell's number format
    let num: number | null = null;
    // text trimmed: e.g. VERTC's Fabric = MID(description, 6, …) keeps the space after "VERTC" (invisible in Excel)
    if (textColumns.has(m.sqlColumn)) components[m.sqlColumn] = String(v).trim();
    else if (typeof v === 'number') num = v;
    else if (typeof v === 'string' && v.trim() !== '' && !isNaN(Number(v))) num = Number(v);
    else components[m.sqlColumn] = String(v);
    if (num !== null) {
      const decimals = eng.getDisplayDecimals('Components', COMPONENTS_ROW, m.excelCol);
      const shown = decimals === null ? num : roundHalfAwayFromZero(num, decimals);
      if (shown !== 0) components[m.sqlColumn] = shown;
    }
  }

  const errorColumns = new Set(errors.map(e => e.sqlColumn));
  const errorSources = errors.length
    ? eng.errorSources('Components', COMPONENTS_ROW, getProductMapping(p).filter(m => errorColumns.has(m.sqlColumn)).map(m => m.excelCol), p.componentsHeadingRow ?? 3)
    : [];

  const text = (c: number) => { const v = eng.getValue('Components', COMPONENTS_ROW, c); return v == null || v === false ? '' : String(v); };
  const base: Record<string, string> = {};
  for (const [field, col] of Object.entries(p.baseColumns)) base[field] = text(col);

  return { orderItemPkId: pkId, base, components, errors, errorSources, warnings };
}
