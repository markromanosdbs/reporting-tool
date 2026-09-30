import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sql from 'mssql';
import { JobSheetEngine, CellInput, DataSheetInput } from './JobSheetEngine.js';
import { loadTemplateEngine } from './preparedTemplates.js';
import { templateModifiedAt, onTemplateSourceChange } from './templateSources.js';
import { ComponentsMapper } from '../ComponentsMapper.js';

/**
 * Door & Screen components from SalesOrderOptions_DASON, calculated with the
 * real BUZ job sheet formulas (SECD and GRIL each have their own template).
 * Output goes to ComponentsReport_DoorScreen via the verified positional mapping.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE_DIR = path.resolve(here, '../../../templates');

export const DOOR_SCREEN_TEMPLATES: Record<string, string> = {
  SECD: 'DoorScreen_SECD_Template.xlsm',
  GRIL: 'DoorScreen_GRIL_Template.xlsm',
};
const TEMPLATES = DOOR_SCREEN_TEMPLATES;

// Data!AX on each line (BUZ InventoryGroup.Descn)
const GROUP_DESCN: Record<string, string> = { SECD: 'Doors', GRIL: 'Screens & Grills' };

// Values BUZ uses in Inventory.Descn = "<GROUP> <Material> <MaterialType> <Colour>".
// Colours are the exact spellings the templates compare Data!BP against.
const MATERIALS = ['Barrier Door', 'Security Door', 'Invisi-Screen', 'Invisi-Scape', 'Screen', 'Flyscreen', 'Grill'];
const COLOURS = [
  'APO Grey', 'Apo Grey', 'White Birch', 'Birch White', 'Black', 'Brown', 'Deep Ocean', 'Jasper',
  'Paperbark', 'Mist Green', 'Pale Eucalypt', 'Primrose', 'Ultra Silver', 'Woodland Grey(Green Tone)',
  'Woodland Grey (Dulux)', 'Pearl White', 'Monument', 'Surfmist', 'Dune', 'Custom Powdercoat', 'Powdercoat',
];

const COMPONENTS_ROW = 5; // Components row driven by Data row 11

/** Excel's display rounding: 2.5 → 3, -2.5 → -3 (JS Math.round would give -2). */
function roundHalfAwayFromZero(n: number, decimals = 0): number {
  const f = 10 ** decimals;
  return Math.sign(n) * Math.round(Math.abs(n) * f + 1e-9) / f;
}

/** Latest modification time of the job sheet templates (ms) — lines calculated before it are recalculated. */
export function templatesModifiedAt(): number {
  return Math.max(...Object.values(TEMPLATES).map(templateModifiedAt));
}

/** Load both templates up front so the first page load doesn't pay the ~5s start-up. */
export function warmUpDoorScreenEngines(): Promise<unknown> {
  return Promise.all(Object.keys(TEMPLATES).map(getEngine));
}

const engines: Record<string, Promise<JobSheetEngine>> = {};
// Door Screen keeps its two engines loaded; a template update or rollback replaces the one it affects
onTemplateSourceChange(file => {
  for (const [group, f] of Object.entries(TEMPLATES)) {
    if (f !== file || !engines[group]) continue;
    const old = engines[group];
    delete engines[group];
    old.then(e => e.dispose(), () => undefined);
  }
});
function getEngine(group: string): Promise<JobSheetEngine> {
  const file = TEMPLATES[group];
  if (!file) throw new Error(`No Door Screen template for group ${group}`);
  engines[group] ??= loadTemplateEngine(file);
  return engines[group];
}

/** Split "SECD Barrier Door Alu-Gard Perforated Aluminium Paperbark" into Data!BN/BO/BP. */
export function parseInventoryDescn(descn: string): { material: string; materialType: string; colour: string; warnings: string[] } {
  const warnings: string[] = [];
  let rest = descn.trim().replace(/^\S+\s+/, '');
  const byLength = (a: string, b: string) => b.length - a.length;

  const material = [...MATERIALS].sort(byLength).find(m => rest.toLowerCase().startsWith(m.toLowerCase() + ' ') || rest.toLowerCase() === m.toLowerCase());
  if (material) rest = rest.slice(material.length).trim();
  else warnings.push(`Unknown material in "${descn}"`);

  const colour = [...COLOURS].sort(byLength).find(c => rest.toLowerCase().endsWith(c.toLowerCase()));
  if (colour) rest = rest.slice(0, rest.length - colour.length).trim();
  else warnings.push(`Unknown colour in "${descn}"`);

  return { material: material ?? '', materialType: rest, colour: colour ?? '', warnings };
}

export interface DoorScreenResult {
  orderItemPkId: string;
  group: string;
  base: Record<string, string>;
  components: Record<string, number | string>;
  warnings: string[];
}

/**
 * Calculate one Door Screen line. `lineRows` are all SalesOrderOptions_DASON
 * rows for that OrderItemPkId (one per OptionCode).
 */
export interface OrderInfo {
  Descn?: string;
  CustomerGroup?: string;
  SalesRep?: string;
  Installer?: string;
  DateScheduled?: Date | string | null;   // WIP schedule date: Data!BF on the line (CTRA shows the colour only when it is set)
}

export async function calculateDoorScreenLine(
  pool: sql.ConnectionPool,
  lineRows: any[],
  orderInfo?: OrderInfo,
): Promise<DoorScreenResult> {
  const first = lineRows[0];
  const group = String(first.InvGrpCode || String(first.InventoryDescn).split(' ')[0]).toUpperCase();
  const pkId = String(first.OrderItemPkId).toLowerCase();

  // Order description (Data!AX5 → Quote Ref) comes from the WIP view, unless the caller has it
  let w: OrderInfo = orderInfo || {};
  if (!orderInfo) {
    const buzNo = first.DBSBuzNo || `${first.OrderNo}.${first.OrderRev}`;
    const wip = await pool.request()
      .input('buz', sql.NVarChar, buzNo)
      .query(`SELECT TOP 1 [Descn], [CustomerGroup], [SalesRep], [Installer] FROM [dbo].[dbswip] WHERE [Buz No] = @buz`)
      .catch(() => ({ recordset: [] as any[] }));
    w = wip.recordset[0] || {};
  }

  const inv = parseInventoryDescn(String(first.InventoryDescn || ''));

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
    AX: GROUP_DESCN[group] ?? '',
    AY: first.ItemDescn ?? '',
    AZ: first.ItemQty ?? 1,
    BA: first.ItemWidth == null ? null : Number(first.ItemWidth),
    BB: first.ItemHeight == null ? null : Number(first.ItemHeight),
    BD: first.InventoryCode ?? '',
    BE: first.InventoryDescn ?? '',
    BM: 'Production - Sercurity Products',
    BN: inv.material,
    BO: inv.materialType,
    BP: inv.colour,
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

  const engine = await getEngine(group);
  engine.calculate(input);

  const components: Record<string, number | string> = {};
  for (const m of ComponentsMapper.getMapping()) {
    const v = engine.getValue('Components', COMPONENTS_ROW, m.excelCol);
    if (v === null || v === '' || v === 0 || v === false) continue;
    if (typeof v === 'string' && v.startsWith('#')) {
      inv.warnings.push(`${m.sqlColumn}: ${v}`);
      continue;
    }
    // Store the value exactly as the job sheet displays it: rounded to the cell's
    // number format (e.g. "0": Cover Strip 2.0578 → 2; "0.00": Insulator 0.05094 → 0.05).
    let num: number | null = null;
    if (ComponentsMapper.isTextColumn(m.sqlColumn)) components[m.sqlColumn] = String(v);
    else if (typeof v === 'number') num = v;
    else if (typeof v === 'string' && v.trim() !== '' && !isNaN(Number(v))) num = Number(v);
    if (num !== null) {
      const decimals = engine.getDisplayDecimals('Components', COMPONENTS_ROW, m.excelCol);
      const shown = decimals === null ? num : roundHalfAwayFromZero(num, decimals);
      if (shown !== 0) components[m.sqlColumn] = shown;
    }
  }

  // Components A–I: base columns (A–C job tracking come from dbsproduction elsewhere)
  const text = (c: number) => { const v = engine.getValue('Components', COMPONENTS_ROW, c); return v == null || v === false ? '' : String(v); };
  const base = {
    Quote_No: text(4),
    Line_No: text(5),
    Order_Item_Code: text(6),
    Product: text(7),
    Business_Name: text(8),
    Quote_Ref: text(9),
  };

  return { orderItemPkId: pkId, group, base, components, warnings: inv.warnings };
}
