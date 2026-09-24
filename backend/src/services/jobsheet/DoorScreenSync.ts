import sql from 'mssql';
import { asDbo } from '../../db.js';
import { calculateDoorScreenLine, DoorScreenResult, OrderInfo, templatesModifiedAt } from './DoorScreenJobSheet.js';
import { ComponentsMapper } from '../ComponentsMapper.js';

/**
 * Keeps ComponentsReport_DoorScreen in line with dbsproduction:
 * every SECD/GRIL line in dbsproduction is calculated from SalesOrderOptions_DASON
 * and written; rows for lines no longer in dbsproduction are removed.
 */

const TABLE = '[dbo].[ComponentsReport_DoorScreen]';

/**
 * Safety switch: nothing writes to the shared SQL table unless DOORSCREEN_WRITE_TO_SQL=true
 * is set in .env. Keeps local development from touching live data until the feature is ready.
 */
export function doorScreenWritesEnabled(): boolean {
  return String(process.env.DOORSCREEN_WRITE_TO_SQL).toLowerCase() === 'true';
}

function assertWritesEnabled() {
  if (!doorScreenWritesEnabled()) {
    throw new Error('Writing to ComponentsReport_DoorScreen is disabled (set DOORSCREEN_WRITE_TO_SQL=true to enable)');
  }
}
const GROUPS = ['SECD', 'GRIL'];

/** Replace the line's row in ComponentsReport_DoorScreen with freshly calculated values. */
export async function persistDoorScreen(pool: sql.ConnectionPool, orderItemPkId: string, result: DoorScreenResult) {
  assertWritesEnabled();
  let request = pool.request().input('pkId', sql.UniqueIdentifier, orderItemPkId);
  const cols: string[] = ['[OrderItemPkId]', '[LastCalculatedDate]'];
  const vals: string[] = ['@pkId', 'SYSUTCDATETIME()'];

  Object.entries(result.base).forEach(([col, val], i) => {
    request = request.input(`b${i}`, sql.NVarChar(200), val || null);
    cols.push(`[${col}]`); vals.push(`@b${i}`);
  });
  Object.entries(result.components).forEach(([col, val], j) => {
    request = ComponentsMapper.isTextColumn(col)
      ? request.input(`p${j}`, sql.NVarChar(200), String(val))
      : request.input(`p${j}`, sql.Numeric(18, 4), val as number); // table columns are decimal(9,4)
    cols.push(`[${col}]`); vals.push(`@p${j}`);
  });

  await request.query(asDbo(`
    DELETE FROM ${TABLE} WHERE OrderItemPkId = @pkId;
    INSERT INTO ${TABLE} (${cols.join(',')}) VALUES (${vals.join(',')});
  `));
}

export interface ProductionLine {
  lineKey: string;      // "<BuzNo> <FixedLine>", e.g. "12201.A 1"
  buzNo: string;
  InventoryItem: string;
  Descn: string;
  CustomerGroup: string;
  SalesRep: string;
  Installer: string;
  ProductionStatus: string | null;
  InstallationStatus: string | null;
  DateScheduled: Date | null;
}

/** Job tracking columns, straight from dbsproduction (Dispatch_Date as YYYY-MM-DD). */
export function trackingFields(p: ProductionLine): { Job_Tracking_Action: string; Dispatch_Action: string; Dispatch_Date: string } {
  const d = p.DateScheduled ? new Date(p.DateScheduled) : null;
  return {
    Job_Tracking_Action: p.ProductionStatus ?? '',
    Dispatch_Action: p.InstallationStatus ?? '',
    Dispatch_Date: d && !isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : '',
  };
}

/** Current SECD/GRIL lines from the dbsproduction view (read fresh on every call). */
export async function getProductionLines(pool: sql.ConnectionPool): Promise<ProductionLine[]> {
  return (await pool.request().query(`
    SELECT [Buz and Line No.] AS lineKey, [DBS Buz No.] AS buzNo, [InventoryItem], [Descn], [CustomerGroup], [SalesRep], [Installer],
           [ProductionStatus], [InstallationStatus], [DateScheduled]
    FROM [dbo].[dbsproduction]
    WHERE LEFT([InventoryItem], CHARINDEX(' ', [InventoryItem] + ' ') - 1) IN (${GROUPS.map(g => `'${g}'`).join(',')})
  `)).recordset;
}

/** One entry per DASON line of the given orders: its OrderItemPkId and last option edit time. */
export async function getDasonLineSummary(pool: sql.ConnectionPool, buzNos: string[]) {
  const lineInfo = new Map<string, { pkId: string; editedAt: number }>();
  for (let i = 0; i < buzNos.length; i += 200) {
    const chunk = buzNos.slice(i, i + 200);
    let req = pool.request();
    chunk.forEach((b, j) => { req = req.input(`z${j}`, sql.VarChar(50), b); });
    const rows = (await req.query(`
      SELECT [DBSBuzNo], [FixedLine], [OrderItemPkId], MAX([LastEditDate]) AS editedAt
      FROM [dbo].[SalesOrderOptions_DASON]
      WHERE [DBSBuzNo] IN (${chunk.map((_, j) => `@z${j}`).join(',')})
      GROUP BY [DBSBuzNo], [FixedLine], [OrderItemPkId]
    `)).recordset;
    for (const r of rows) {
      lineInfo.set(`${r.DBSBuzNo} ${r.FixedLine}`, {
        pkId: String(r.OrderItemPkId).toLowerCase(),
        editedAt: r.editedAt ? new Date(r.editedAt).getTime() : 0,
      });
    }
  }
  return lineInfo;
}

/** Full DASON option rows for the given lines, grouped by OrderItemPkId (lower-case). */
export async function getOptionRows(pool: sql.ConnectionPool, pkIds: string[]) {
  const optionRows = new Map<string, any[]>();
  for (let i = 0; i < pkIds.length; i += 200) {
    const chunk = pkIds.slice(i, i + 200);
    let req = pool.request();
    chunk.forEach((pk, j) => { req = req.input(`k${j}`, sql.UniqueIdentifier, pk); });
    const rows = (await req.query(`
      SELECT * FROM [dbo].[SalesOrderOptions_DASON]
      WHERE [OrderItemPkId] IN (${chunk.map((_, j) => `@k${j}`).join(',')})
    `)).recordset;
    for (const r of rows) {
      const k = String(r.OrderItemPkId).toLowerCase();
      if (!optionRows.has(k)) optionRows.set(k, []);
      optionRows.get(k)!.push(r);
    }
  }
  return optionRows;
}

export interface SyncReport {
  mode: 'full' | 'changed';
  startedAt: string;
  unchanged: number;
  trackingUpdated: number;
  seconds: number;
  inProduction: number;
  written: number;
  removed: string[];
  notInDason: string[];
  failed: { line: string; error: string }[];
  warnings: { line: string; warnings: string[] }[];
}

/**
 * mode 'full': recalculate every production line.
 * mode 'changed': only lines that are new, edited in DASON since they were last calculated,
 * or calculated before the job sheet template was last replaced (fast — used on page load).
 */
export async function syncDoorScreen(
  pool: sql.ConnectionPool,
  log: (s: string) => void = () => {},
  mode: 'full' | 'changed' = 'full',
): Promise<SyncReport> {
  assertWritesEnabled();
  const t0 = Date.now();
  const report: SyncReport = {
    mode, startedAt: new Date(t0).toISOString(), unchanged: 0, trackingUpdated: 0, seconds: 0, inProduction: 0, written: 0,
    removed: [], notInDason: [], failed: [], warnings: [],
  };

  // 1. SECD/GRIL lines in production, 2. their DASON lines
  const prod = await getProductionLines(pool);
  report.inProduction = prod.length;
  if (mode === 'full') log(`${prod.length} SECD/GRIL lines in dbsproduction`);
  const lineInfo = await getDasonLineSummary(pool, [...new Set(prod.map(p => String(p.buzNo)))]);

  // 3. Decide which lines need calculating ('changed' mode skips lines calculated after their
  //    last DASON edit and after the job sheet template was last replaced)
  const lastCalc = new Map<string, number>();
  const existingTracking = new Map<string, string>();
  if (mode === 'changed') {
    const rows = (await pool.request().query(`SELECT OrderItemPkId, LastCalculatedDate, Job_Tracking_Action, Dispatch_Action, Dispatch_Date FROM ${TABLE}`)).recordset;
    for (const r of rows) {
      const pk = String(r.OrderItemPkId).toLowerCase();
      lastCalc.set(pk, new Date(r.LastCalculatedDate).getTime());
      existingTracking.set(pk, [r.Job_Tracking_Action ?? '', r.Dispatch_Action ?? '', r.Dispatch_Date ?? ''].join('|'));
    }
  }
  const trackingUpdates: { pkId: string; t: ReturnType<typeof trackingFields> }[] = [];
  const templateTime = templatesModifiedAt();

  const current = new Set<string>();
  const todo: any[] = [];
  for (const p of prod) {
    const info = lineInfo.get(p.lineKey);
    if (!info) { report.notInDason.push(p.lineKey); continue; }
    current.add(info.pkId);
    const calcAt = lastCalc.get(info.pkId);
    if (mode === 'changed' && calcAt !== undefined && calcAt >= info.editedAt && calcAt >= templateTime) {
      report.unchanged++;
      // Components unchanged, but job tracking status may have moved on
      const t = trackingFields(p);
      if (existingTracking.get(info.pkId) !== [t.Job_Tracking_Action, t.Dispatch_Action, t.Dispatch_Date].join('|')) {
        trackingUpdates.push({ pkId: info.pkId, t });
      }
      continue;
    }
    todo.push({ ...p, pkId: info.pkId });
  }

  // 4. Fetch full option rows only for those lines, then calculate + write
  const optionRows = await getOptionRows(pool, todo.map(t => t.pkId));

  for (const t of todo) {
    try {
      const info: OrderInfo = { Descn: t.Descn, CustomerGroup: t.CustomerGroup, SalesRep: t.SalesRep, Installer: t.Installer };
      const result = await calculateDoorScreenLine(pool, optionRows.get(t.pkId) || [], info);
      Object.assign(result.base, trackingFields(t));
      await persistDoorScreen(pool, t.pkId, result);
      report.written++;
      if (result.warnings.length) report.warnings.push({ line: t.lineKey, warnings: result.warnings });
      log(`✅ ${t.lineKey} (${Object.keys(result.components).length} values)`);
    } catch (e) {
      report.failed.push({ line: t.lineKey, error: String(e) });
      log(`❌ ${t.lineKey}: ${e}`);
    }
  }

  // Job tracking changes on lines whose components didn't need recalculating
  for (const u of trackingUpdates) {
    await pool.request()
      .input('pk', sql.UniqueIdentifier, u.pkId)
      .input('jta', sql.NVarChar(100), u.t.Job_Tracking_Action || null)
      .input('da', sql.NVarChar(100), u.t.Dispatch_Action || null)
      .input('dd', sql.NVarChar(100), u.t.Dispatch_Date || null)
      .query(asDbo(`
        UPDATE ${TABLE} SET Job_Tracking_Action = @jta, Dispatch_Action = @da, Dispatch_Date = @dd WHERE OrderItemPkId = @pk;
      `));
  }
  report.trackingUpdated = trackingUpdates.length;

  // 5. Remove rows for lines no longer in production. Lines that are in production but
  //    couldn't be matched/calculated keep their existing row. Never wipe on an empty read.
  if (prod.length > 0) {
    const existing = (await pool.request().query(`SELECT OrderItemPkId, Quote_No, Line_No FROM ${TABLE}`)).recordset;
    const keep = new Set([...current]);
    const prodKeys = new Set(prod.map(p => p.lineKey));
    for (const e of existing) {
      const pk = String(e.OrderItemPkId).toLowerCase();
      const label = `${e.Quote_No} ${e.Line_No}`;
      if (keep.has(pk) || prodKeys.has(label)) continue;
      await pool.request().input('pk', sql.UniqueIdentifier, pk)
        .query(asDbo(`DELETE FROM ${TABLE} WHERE OrderItemPkId = @pk;`));
      report.removed.push(label);
      log(`🗑  removed ${label} (no longer in dbsproduction)`);
    }
  }

  report.seconds = Math.round((Date.now() - t0) / 100) / 10;
  log(`Done (${mode}) in ${report.seconds}s: ${report.written} written, ${report.unchanged} unchanged, ${report.removed.length} removed, ` +
    `${report.notInDason.length} not in DASON yet, ${report.failed.length} failed`);
  return report;
}
