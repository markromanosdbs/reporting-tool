import sql from 'mssql';
import { TemplateOptions } from './JobSheetEngine.js';
import { PRODUCTS } from './products.js';
import { calculateProductLine, getProductMapping, ProductConfig } from './ProductJobSheet.js';
import { cachedProductResult, getProductionLines as getProductLines } from './ProductReport.js';
import { calculateDoorScreenLine, DOOR_SCREEN_TEMPLATES, OrderInfo } from './DoorScreenJobSheet.js';
import { cachedDoorScreenResult } from './DoorScreenReport.js';
import { getProductionLines as getDoorScreenLines, ProductionLine } from './DoorScreenSync.js';
import { ComponentsMapper } from '../ComponentsMapper.js';

/**
 * Every job sheet template that can be replaced through "Upload job sheet templates": which report
 * and product code it belongs to, and how to calculate its lines (for the checks before applying).
 */

export interface TemplateTarget {
  templateFile: string;          // e.g. ExternalBlinds_FGSUN_Template.xlsm
  product: string;               // e.g. external-blinds-fgsun
  reportTable: string;           // e.g. external_blinds_components
  reportLabel: string;           // e.g. External Blinds
  codes: string[];               // BUZ product codes, e.g. ['FGSUN']
  options: TemplateOptions;
  componentsRow: number;         // Components row of line 1
  componentsHeadingRow: number;
  mapping: () => { excelCol: number; header: string; sqlColumn: string }[];
  /** A line's values by SQL column; job sheet errors are included as their Excel name (e.g. '#VALUE!') */
  calculate: (pool: sql.ConnectionPool, rows: any[], info?: OrderInfo) => Promise<LineValues>;
  openLines: (pool: sql.ConnectionPool) => Promise<ProductionLine[]>;
  /** What the live report has for a line right now (same form as calculate), if it has calculated it */
  current: (pkId: string) => LineValues | undefined;
}

export type LineValues = Record<string, number | string>;

function withErrors(components: LineValues, errors: { sqlColumn: string; value: string }[]): LineValues {
  const out = { ...components };
  for (const e of errors) out[e.sqlColumn] = e.value.startsWith('#') ? e.value : `#${e.value}`;
  return out;
}

// Door Screen keeps errors as warnings: "Column_Name: #N/A"
function doorScreenValues(r: { components: LineValues; warnings: string[] }): LineValues {
  const errors = r.warnings.map(w => w.match(/^([A-Za-z0-9_]+): (#[A-Z0-9\/!?]+)/)).filter(Boolean).map(m => ({ sqlColumn: m![1], value: m![2] }));
  return withErrors(r.components, errors);
}

const REPORT_LABELS: Record<string, string> = {
  door_screen_components: 'Door Screen',
  roller_blind_components: 'Roller Blinds',
  roller_shutter_components: 'Roller Shutters',
  external_blinds_components: 'External Blinds',
  squalonet_retractable_screens: 'Squalonet',
  panel_glides: 'Panel Glides',
  curtain_tracks: 'Curtain Tracks',
};

const codeOf = (inventoryItem: string) => String(inventoryItem || '').split(' ')[0].toUpperCase();

function productTarget(p: ProductConfig): TemplateTarget {
  return {
    templateFile: p.template,
    product: p.label,
    reportTable: p.table,
    reportLabel: REPORT_LABELS[p.table] ?? p.table,
    codes: p.groups,
    options: { cycleBreaks: p.cycleBreaks ?? [], arrayArithmetic: p.arrayArithmetic },
    componentsRow: p.componentsRow ?? 5,
    componentsHeadingRow: p.componentsHeadingRow ?? 3,
    mapping: () => getProductMapping(p),
    calculate: async (pool, rows, info) => { const r = await calculateProductLine(p, pool, rows, info); return withErrors(r.components, r.errors); },
    openLines: pool => getProductLines(p, pool),
    current: pkId => { const r = cachedProductResult(p, pkId); return r && withErrors(r.components, r.errors); },
  };
}

function doorScreenTarget(code: string, file: string): TemplateTarget {
  return {
    templateFile: file,
    product: `door-screen-${code.toLowerCase()}`,
    reportTable: 'door_screen_components',
    reportLabel: 'Door Screen',
    codes: [code],
    options: {},
    componentsRow: 5,
    componentsHeadingRow: 3,
    mapping: () => ComponentsMapper.getMapping(),
    calculate: async (pool, rows, info) => doorScreenValues(await calculateDoorScreenLine(pool, rows, info)),
    openLines: async pool => (await getDoorScreenLines(pool)).filter(l => codeOf(l.InventoryItem) === code),
    current: pkId => { const r = cachedDoorScreenResult(pkId); return r && doorScreenValues(r); },
  };
}

export const TEMPLATE_TARGETS: TemplateTarget[] = [
  ...Object.entries(DOOR_SCREEN_TEMPLATES).map(([code, file]) => doorScreenTarget(code, file)),
  ...PRODUCTS.map(productTarget),
];

export function targetFor(product: string): TemplateTarget | undefined {
  return TEMPLATE_TARGETS.find(t => t.product === product);
}
