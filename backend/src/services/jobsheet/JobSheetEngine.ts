import ExcelJS from 'exceljs';
import { HyperFormula, FunctionPlugin, FunctionArgumentType } from 'hyperformula';

/**
 * Runs a BUZ Job Sheet workbook's own formulas (Job Sheet → cutting/assembly
 * sheets → Components) in-process, so the web app gets exactly the numbers
 * Excel would produce. The workbook is loaded once as a template; per
 * calculation only the Data sheet inputs (order header, line row, CustOrdOpt)
 * are replaced and the engine recalculates.
 *
 * Verified against 16 real SECD/GRIL job sheets: every current-version sheet
 * reproduces its Components values exactly.
 */

// ---- bpLOOKUP: port of the workbook's BPLookup VBA function ----
class BuzFunctions extends FunctionPlugin {
  bplookup(ast: any, state: any) {
    return this.runFunction(ast.args, state, this.metadata('BPLOOKUP'),
      (pkId: any, text: any, range: any, col: number, _exact: any, defaultValue: any) => {
        const key = ((pkId === '' || pkId == null) ? '' : String(pkId) + '|') + String(text).toUpperCase();
        const k = key.toLowerCase();
        for (const row of range.data) {
          const c0 = row[0];
          if (typeof c0 !== 'string' || c0.toLowerCase() !== k) continue;
          let v = row[col - 1];
          if (typeof v === 'symbol' || v == null) v = '';
          if (typeof v === 'string') { const p = v.indexOf('|'); if (p >= 0) v = v.slice(0, p); }
          if (v === '') return defaultValue ?? '';
          if (v === '0') return Number(defaultValue) || 0;
          return v;
        }
        return '';
      });
  }

  // Label-printing add-in function; not needed for any calculation
  barcodevalue() { return ''; }

  static implementedFunctions = {
    BPLOOKUP: {
      method: 'bplookup',
      parameters: [
        { argumentType: FunctionArgumentType.SCALAR },
        { argumentType: FunctionArgumentType.SCALAR },
        { argumentType: FunctionArgumentType.RANGE },
        { argumentType: FunctionArgumentType.NUMBER },
        { argumentType: FunctionArgumentType.SCALAR },
        { argumentType: FunctionArgumentType.SCALAR, optionalArg: true, defaultValue: '' },
      ],
    },
    BARCODEVALUE: {
      method: 'barcodevalue',
      parameters: [{ argumentType: FunctionArgumentType.ANY, optionalArg: true }],
      repeatLastArgs: 1,
    },
  };
}
HyperFormula.registerFunctionPlugin(BuzFunctions as any, { enGB: { BPLOOKUP: 'BPLOOKUP', BARCODEVALUE: 'BARCODEVALUE' } });

// Named ranges that look like cell addresses (e.g. FDEDUCT2) are invalid names for the engine
const RENAMED_NAMES: Record<string, string> = { FDEDUCT2: 'NR_FDEDUCT2' };

/** Excel → engine formula dialect fixes, applied outside string literals only. */
function translateFormula(f: string): string {
  f = f.replace(/_xlfn\.|_xlws\./g, '');
  return f.split(/("(?:[^"]|"")*")/).map((part, i) => {
    if (i % 2) return part;
    let p = part.replace(/(?<![A-Za-z0-9_.!'$])(TRUE|FALSE)(?![A-Za-z0-9_(!])/gi, m => m.toUpperCase() + '()');
    for (const [from, to] of Object.entries(RENAMED_NAMES)) {
      p = p.replace(new RegExp(`(?<![A-Za-z0-9_.!'$])${from}(?![A-Za-z0-9_(!])`, 'g'), to);
    }
    return p;
  }).join('');
}

export function colToNum(col: string): number {
  let n = 0;
  for (const ch of col.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

export type CellInput = string | number | boolean | null;

export interface DataSheetInput {
  /** Data row 5 (order header), keyed by column letter */
  header: Record<string, CellInput>;
  /** Data row 11 (the order line), keyed by column letter */
  line: Record<string, CellInput>;
  /** CustOrdOpt rows written from Data!CE11 down: [key, id, id, orderItemPkId, code, value] */
  options: CellInput[][];
}

// Data sheet regions holding order-specific input (everything else is template)
const HEADER_ROW = 5;
const LINE_FIRST_ROW = 11;
const LINE_COLS = [colToNum('AV'), colToNum('BW')];
const HEADER_COLS = [colToNum('AV'), colToNum('DW')];
const OPT_COLS = [colToNum('CE'), colToNum('CJ')];
const MAX_ROWS = 2000;

export class JobSheetEngine {
  private hf: HyperFormula;
  private dataSheet: number;
  private dataRowsInUse = 0;
  /** Template number formats, keyed "Sheet!row,col" (1-based) */
  private numFmts = new Map<string, string>();

  private constructor(sheets: Record<string, CellInput[][]>, names: { name: string; ref: string }[]) {
    this.hf = HyperFormula.buildFromSheets(sheets as any, {
      licenseKey: 'gpl-v3',
      evaluateNullToZero: true,
      leapYear1900: true,
      nullDate: { year: 1899, month: 12, day: 30 },
      useColumnIndex: true,
    });
    for (const { name, ref } of names) {
      this.hf.addNamedExpression(RENAMED_NAMES[name] || name, '=' + ref);
    }
    this.dataSheet = this.hf.getSheetId('Data')!;
    this.clearDataInputs(MAX_ROWS);
  }

  static async fromTemplate(templatePath: string): Promise<JobSheetEngine> {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(templatePath);

    const sheets: Record<string, CellInput[][]> = {};
    const numFmts = new Map<string, string>();
    for (const ws of wb.worksheets) {
      const arr: CellInput[][] = [];
      ws.eachRow({ includeEmpty: false }, (row, r) => row.eachCell({ includeEmpty: false }, (cell, c) => {
        if (cell.numFmt) numFmts.set(`${ws.name}!${r},${c}`, cell.numFmt);
        const v: any = cell.value;
        let out: CellInput;
        if (v && typeof v === 'object' && (v.formula || v.sharedFormula)) out = '=' + translateFormula(cell.formula || v.formula);
        else if (v && typeof v === 'object' && v.richText) out = v.richText.map((t: any) => t.text).join('');
        else if (v && typeof v === 'object' && v.error) out = v.error;
        else if (v instanceof Date) out = v.toISOString();
        else if (v && typeof v === 'object') out = v.text ?? String(v);
        else out = v;
        (arr[r - 1] ??= [])[c - 1] = out;
      }));
      for (let i = 0; i < arr.length; i++) arr[i] ??= [];
      sheets[ws.name] = arr;
    }

    const names: { name: string; ref: string }[] = [];
    for (const n of (wb.definedNames as any).model as { name: string; ranges: string[] }[]) {
      const ref = n.ranges[0];
      if (!ref || ref.includes('#REF')) continue; // AdjustableHighKits/LowKits are broken in the source workbook
      // BUZ sizes CustOrdOpt to the order it exported; size it for any order
      names.push({ name: n.name, ref: n.name === 'CustOrdOpt' ? `Data!$CE$10:$CK$${MAX_ROWS}` : ref });
    }
    const engine = new JobSheetEngine(sheets, names);
    engine.numFmts = numFmts;
    return engine;
  }

  /**
   * Decimal places the template displays for a cell (from its number format):
   * "0" → 0, "0.00" → 2, "#,##0.0" → 1. null = General / no fixed precision.
   */
  getDisplayDecimals(sheetName: string, row: number, col: number): number | null {
    const fmt = this.numFmts.get(`${sheetName}!${row},${col}`);
    if (!fmt || /general/i.test(fmt)) return null;
    const section = fmt.split(';')[0].replace(/"[^"]*"|\[[^\]]*\]/g, '');
    const dec = section.match(/[0#]\.([0#]+)/);
    if (dec) return dec[1].length;
    return /[0#]/.test(section) ? 0 : null;
  }

  private clearDataInputs(rows: number) {
    const s = this.dataSheet;
    this.hf.batch(() => {
      this.hf.setCellContents({ sheet: s, row: HEADER_ROW - 1, col: HEADER_COLS[0] - 1 },
        [Array(HEADER_COLS[1] - HEADER_COLS[0] + 1).fill(null)]);
      const lineBlank = Array(LINE_COLS[1] - LINE_COLS[0] + 1).fill(null);
      const optBlank = Array(OPT_COLS[1] - OPT_COLS[0] + 1).fill(null);
      for (let r = 0; r < rows; r++) {
        const row = LINE_FIRST_ROW - 1 + r;
        if (row >= MAX_ROWS) break;
        this.hf.setCellContents({ sheet: s, row, col: LINE_COLS[0] - 1 }, [lineBlank]);
        this.hf.setCellContents({ sheet: s, row, col: OPT_COLS[0] - 1 }, [optBlank]);
      }
    });
  }

  /** Replace the Data sheet inputs and recalculate. Synchronous: read results before the next call. */
  calculate(input: DataSheetInput): void {
    const s = this.dataSheet;
    const rowsNeeded = Math.max(1, input.options.length);
    this.clearDataInputs(Math.max(this.dataRowsInUse, rowsNeeded));
    this.hf.batch(() => {
      for (const [col, v] of Object.entries(input.header)) {
        this.hf.setCellContents({ sheet: s, row: HEADER_ROW - 1, col: colToNum(col) - 1 }, v);
      }
      for (const [col, v] of Object.entries(input.line)) {
        this.hf.setCellContents({ sheet: s, row: LINE_FIRST_ROW - 1, col: colToNum(col) - 1 }, v);
      }
      if (input.options.length) {
        this.hf.setCellContents({ sheet: s, row: LINE_FIRST_ROW - 1, col: OPT_COLS[0] - 1 }, input.options);
      }
    });
    this.dataRowsInUse = rowsNeeded;
  }

  /** Cell value by sheet name and 1-based row/column. Errors come back as '#ERROR' strings. */
  getValue(sheetName: string, row: number, col: number): CellInput {
    const sheet = this.hf.getSheetId(sheetName);
    if (sheet === undefined) throw new Error(`Sheet not found: ${sheetName}`);
    const v: any = this.hf.getCellValue({ sheet, row: row - 1, col: col - 1 });
    if (v && typeof v === 'object') return '#' + (v.type || 'ERROR');
    return v;
  }
}
