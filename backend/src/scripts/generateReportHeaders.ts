/**
 * Reads a product's "AA_<Product> Components" Excel report and writes what the page needs to look
 * and total exactly like it:
 *
 *  frontend/src/config/<headers file>: per page column →
 *    [Part No, Group, Label, Supplier, partFill, groupFill, labelFill, redIfBlank, dataRule]
 *    (fills as hex, '' = white; redIfBlank '1' where the report's conditional format turns a blank Part No red;
 *     dataRule 'gt|3295|#FFC7CE' where the report highlights data cells, e.g. lengths over 3295)
 *
 *  backend/<summary file>: { columns: per page column → [divider, kanban, installBookedDecimals, totalRequiredDecimals],
 *                            highlight: { ib, total } }
 *    row 5 Install Booked = SUMIF(Dispatch Action = "Confirmed") / divider, row 6 Total Required = SUM / divider,
 *    row 7 Kanban Minimum Stock Level; decimals from each cell's number format (null = General);
 *    highlight = the report's conditional-format fill for "Install Booked > Kanban" / "Total Required > Kanban".
 *
 * Report columns are matched to the job sheet Components columns (the product's positional mapping)
 * at a fixed offset, found from the labels (e.g. the Roller Shutter report has no base columns: offset -9).
 *   npx tsx src/scripts/generateReportHeaders.ts <table> "<report.xlsx>"
 */
import ExcelJS from 'exceljs';
import fs from 'fs';
import { PRODUCTS_BY_TABLE } from '../services/jobsheet/products.js';
import { getProductMapping } from '../services/jobsheet/ProductJobSheet.js';

/** Summary row positions in the report (most reports: 5 Install Booked, 6 Total Required, 7 Kanban) */
interface SummaryRows { ib?: number; total: number; kanban?: number }
const OUTPUTS: Record<string, { headers: string; summary: string; rows?: SummaryRows; noSupplierRow?: boolean }> = {
  roller_blind_components: { headers: 'rollerBlindHeaders.json', summary: 'ROLLERBLINDS_REPORT_SUMMARY.json' },
  roller_shutter_components: { headers: 'rollerShutterHeaders.json', summary: 'ROLLERSHUTTERS_REPORT_SUMMARY.json' },
  external_blinds_components: { headers: 'externalBlindsHeaders.json', summary: 'EXTERNALBLINDS_REPORT_SUMMARY.json' },
  // Squalonet's report has one summary row: Total Required on row 4 (no Install Booked / Kanban rows)
  squalonet_retractable_screens: { headers: 'squalonetHeaders.json', summary: 'SQUALONET_REPORT_SUMMARY.json', rows: { total: 4 }, noSupplierRow: true },
  // Panel Glides' report: summary formulas on row 7 (labelled Kanban, but SUM of all rows = Total Required), no Supplier row
  panel_glides: { headers: 'panelGlidesHeaders.json', summary: 'PANELGLIDES_REPORT_SUMMARY.json', rows: { total: 7 }, noSupplierRow: true },
  // Curtain Tracks' report ("Curtain Tracks Live"): 5 Kanban, 6 Total Required, 7 Install Booked
  curtain_tracks: { headers: 'curtainTracksHeaders.json', summary: 'CURTAINTRACKS_REPORT_SUMMARY.json', rows: { kanban: 5, total: 6, ib: 7 } },
};

const [table, REPORT] = process.argv.slice(2);
const product = PRODUCTS_BY_TABLE[table]?.[0];
const out = OUTPUTS[table];
const ROWS: SummaryRows = out?.rows ?? { ib: 5, total: 6, kanban: 7 };
if (!product || !out || !REPORT) throw new Error(`usage: generateReportHeaders.ts <${Object.keys(OUTPUTS).join('|')}> <report.xlsx>`);

const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(REPORT);
const s = wb.worksheets[0];

// ---- theme colours, in Excel's theme index order (lt1, dk1, lt2, dk2, accent1..6) ----
const themeXml: string = (wb as any)._themes?.theme1 ?? '';
const themeColour = (name: string) => themeXml.match(new RegExp(`<a:${name}>\\s*<a:(?:sysClr[^>]*lastClr|srgbClr val)="([0-9A-Fa-f]{6})"`))?.[1]?.toUpperCase() ?? 'FFFFFF';
const THEME = ['lt1', 'dk1', 'lt2', 'dk2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6'].map(themeColour);

/** Excel's theme tint (HLS lightness) → hex. */
function tint(hex: string, t: number): string {
  let [r, g, b] = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b); let h = 0, sat = 0; let l = (max + min) / 2;
  if (max !== min) { const d = max - min; sat = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4; h /= 6; }
  l = t < 0 ? l * (1 + t) : l * (1 - t) + t;
  const q = l < 0.5 ? l * (1 + sat) : l + sat - l * sat, p = 2 * l - q;
  const f = (x: number) => { if (x < 0) x += 1; if (x > 1) x -= 1; return x < 1 / 6 ? p + (q - p) * 6 * x : x < 1 / 2 ? q : x < 2 / 3 ? p + (q - p) * (2 / 3 - x) * 6 : p; };
  [r, g, b] = sat === 0 ? [l, l, l] : [f(h + 1 / 3), f(h), f(h - 1 / 3)];
  return '#' + [r, g, b].map(x => Math.round(x * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
}
function colourOf(c: any): string {
  if (!c) return '';
  const hex = c.argb ? '#' + String(c.argb).slice(-6).toUpperCase() : c.theme !== undefined ? tint(THEME[c.theme], c.tint || 0) : '';
  return hex === '#FFFFFF' ? '' : hex;
}
const fill = (cell: ExcelJS.Cell) => { const f = cell.fill as any; return !f || f.type !== 'pattern' || f.pattern === 'none' ? '' : colourOf(f.fgColor); };
const text = (cell: ExcelJS.Cell) => { const x: any = cell.value; const v = x && typeof x === 'object' ? (x.result ?? x.richText?.map((t: any) => t.text).join('')) : x; return String(v ?? '').trim(); };
const norm = (v: string) => v.toLowerCase().replace(/[^a-z0-9]+/g, '');
const colNum = (c: string) => [...c].reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0);

/** Decimal places of a number format ("0.0" → 1, "0" → 0, General → null). */
function decimals(fmt: string | undefined): number | null {
  if (!fmt || /general/i.test(fmt)) return null;
  const section = fmt.split(';')[0].replace(/"[^"]*"|\[[^\]]*\]/g, '');
  const dec = section.match(/[0#]\.([0#]+)/);
  if (dec) return dec[1].length;
  return /[0#]/.test(section) ? 0 : null;
}
/** Formula of a cell, following a shared formula to its master (the divider is the same across the range). */
function formula(cell: ExcelJS.Cell): string {
  const v: any = cell.value;
  if (!v || typeof v !== 'object') return '';
  if (v.formula) return v.formula;
  if (v.sharedFormula) return String((s.getCell(v.sharedFormula).value as any)?.formula ?? '');
  return '';
}
const divider = (f: string) => { const m = f.match(/\/\s*([\d.]+)\s*$/); return m ? Number(m[1]) : 1; };

// ---- report column = job sheet column + offset (found from the labels) ----
const mapping = getProductMapping(product);
let offset = 0, best = -1;
for (let o = -30; o <= 30; o++) {
  let hits = 0;
  for (const m of mapping) if (m.excelCol + o >= 1 && norm(text(s.getRow(3).getCell(m.excelCol + o))) === norm(m.header)) hits++;
  if (hits > best) { best = hits; offset = o; }
}
console.log(`report column = job sheet column ${offset >= 0 ? '+' : ''}${offset} (${best}/${mapping.length} labels match)`);

// ---- conditional formats: blank Part No → red; summary rows above Kanban → highlight ----
const cfs: any[] = (s as any).conditionalFormattings ?? [];
const redColumns = new Set<number>();
const highlight: { ib: string; total: string; op: '>' | '>='; zeroFill: string } = { ib: '', total: '', op: '>', zeroFill: '' };
const dataRules = new Map<number, string>(); // report column → 'gt|3295|#FFC7CE'
const CELL_IS: Record<string, string> = { greaterThan: 'gt', greaterThanOrEqual: 'ge', lessThan: 'lt', lessThanOrEqual: 'le', equal: 'eq' };
for (const cf of cfs) for (const rule of cf.rules ?? []) {
  const f = String(rule.formulae?.[0] ?? '').replace(/\$/g, '');
  const ranges = String(cf.ref).split(/\s+/).map(r => r.match(/^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/)).filter(Boolean) as RegExpMatchArray[];
  if (/^LEN\(TRIM\([A-Z]+1\)\)=0$/.test(f)) {
    for (const r of ranges) if (r[2] === '1') for (let c = colNum(r[1]); c <= colNum(r[3] ?? r[1]); c++) redColumns.add(c);
  }
  // data cells compared with a fixed value (rows 8+), e.g. lengths "greater than 3295" → light red
  if (rule.type === 'cellIs' && CELL_IS[rule.operator] && /^-?[\d.]+$/.test(f)) {
    const colour = colourOf(rule.style?.fill?.bgColor ?? rule.style?.fill?.fgColor);
    for (const r of ranges) if (Number(r[2]) >= 8) for (let c = colNum(r[1]); c <= colNum(r[3] ?? r[1]); c++) dataRules.set(c, `${CELL_IS[rule.operator]}|${f}|${colour}`);
  }
  const m = f.match(/^[A-Z]+(\d+)(>=|>)[A-Z]+(\d+)$/);
  const colour = colourOf(rule.style?.fill?.bgColor ?? rule.style?.fill?.fgColor);
  if (m && ROWS.kanban && Number(m[3]) === ROWS.kanban) {
    if (ROWS.ib && Number(m[1]) === ROWS.ib) highlight.ib = colour;
    if (Number(m[1]) === ROWS.total) { highlight.total = colour; highlight.op = m[2] as '>' | '>='; }
  }
  // "cell value between 0 and 0" on the totals row (Curtain Tracks: zero totals grey, over any other rule)
  if (rule.type === 'cellIs' && rule.operator === 'between' && rule.formulae?.[0] === '0' && rule.formulae?.[1] === '0'
      && ranges.some(r => Number(r[2]) === ROWS.total)) highlight.zeroFill = colour;
}

// ---- headers ----
const headers: Record<string, string[]> = {};
for (const m of mapping) {
  const rc = m.excelCol + offset;
  if (rc < 1) continue;
  const c = (r: number) => s.getRow(r).getCell(rc);
  const supplier = out.noSupplierRow ? '' : text(c(4)); // Squalonet's row 4 is its totals row
  headers[m.legacy] = [text(c(1)), text(c(2)), text(c(3)), supplier, fill(c(1)), fill(c(2)), fill(c(3)), redColumns.has(rc) ? '1' : '', dataRules.get(rc) ?? ''];
}
// Group names are written once per merged block; carry them across the block's columns
let lastGroup = ''; let lastGroupFill = '';
for (const m of mapping) {
  const h = headers[m.legacy]; if (!h) continue;
  const cell = s.getRow(2).getCell(m.excelCol + offset);
  if (h[1]) { lastGroup = h[1]; lastGroupFill = h[5]; }
  else if (cell.isMerged) { h[1] = lastGroup; h[5] = h[5] || lastGroupFill; }
}
fs.writeFileSync(`../frontend/src/config/${out.headers}`, JSON.stringify(headers));

// ---- summary ----
const columns: Record<string, [number, number, number | null, number | null]> = {};
for (const m of mapping) {
  const rc = m.excelCol + offset;
  if (rc < 1) continue;
  const c = (r: number) => s.getRow(r).getCell(rc);
  const f6 = formula(c(ROWS.total));
  if (!f6) continue; // no Total Required (e.g. Roller Blind fabric columns)
  const f5 = ROWS.ib ? formula(c(ROWS.ib)) : '';
  if (f5 && divider(f5) !== divider(f6)) console.warn(`${m.legacy}: Install Booked divides by ${divider(f5)} but Total Required by ${divider(f6)}`);
  const k: any = ROWS.kanban ? c(ROWS.kanban).value : 0;
  const kanban = Number(k && typeof k === 'object' ? k.result : k) || 0;
  // No Install Booked formula in the report (e.g. Roller Shutters): show it like Total Required
  const totalDecimals = decimals(c(ROWS.total).numFmt);
  columns[m.legacy] = [divider(f6), kanban, f5 && ROWS.ib ? decimals(c(ROWS.ib).numFmt) : totalDecimals, totalDecimals];
}
fs.writeFileSync(out.summary, JSON.stringify({ columns, highlight }));

console.log(`${Object.keys(headers).length} header columns → frontend/src/config/${out.headers}; ` +
  `${Object.values(headers).filter(h => !h[0]).length} without a Part No, ${redColumns.size} red-if-blank report columns, ${dataRules.size} with a data highlight`);
console.log(`${Object.keys(columns).length} summary columns → ${out.summary}: ${Object.values(columns).filter(v => v[0] !== 1).length} with a divider, ` +
  `${Object.values(columns).filter(v => v[1]).length} with a Kanban minimum; highlight ${JSON.stringify(highlight)}`);
