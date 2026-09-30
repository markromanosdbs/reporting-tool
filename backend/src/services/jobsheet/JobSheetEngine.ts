import ExcelJS from 'exceljs';
import { HyperFormula, FunctionPlugin, FunctionArgumentType, CellError, ErrorType, SimpleRangeValue, EmptyValue } from 'hyperformula';

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

  /**
   * Excel's CHOOSE, which can also pick a range: e.g. Roller Shutters look a motor up with
   * INDEX(CHOOSE(n, MotorTableA, MotorTableB, ...), row, col). The engine's own CHOOSE accepts
   * single values only, so every CHOOSE is rewritten to this one when a template loads.
   * An option that isn't picked may be an error (e.g. a named range missing from the workbook) -
   * like Excel, that only matters if it is the one chosen.
   */
  xlchoose(ast: any, state: any) {
    // Evaluate only the selector and the chosen option, as Excel does
    if (ast.args.length < 2) return new CellError(ErrorType.NA);
    const selector: any = this.evaluateAst(ast.args[0], state);
    if (selector instanceof CellError) return selector;
    const n = Math.trunc(Number(typeof selector === 'object' && selector !== null && 'val' in selector ? selector.val : selector));
    if (!(n >= 1 && n < ast.args.length)) return new CellError(ErrorType.VALUE);
    return this.evaluateAst(ast.args[n], state);
  }

  /**
   * Excel's AND / OR. Text and blank cells reached through a reference (A1, A1:B2, a named range) are
   * skipped, as Excel does: e.g. Curtain Tracks (CTRA) has AND(Assembly!C11="...", 'Tube Cutting'!E11="White",
   * 'Tube Cutting'!E11), where E11 holds the colour - Excel ignores that text, the engine's own AND gives #VALUE!.
   * Text typed or calculated in the formula itself is still #VALUE! unless it is "TRUE"/"FALSE", like Excel.
   * Every argument is evaluated (no short-circuit), so an error anywhere still shows.
   */
  private logical(ast: any, state: any, isAnd: boolean) {
    let seen = false, acc = isAnd;
    const take = (v: any, fromRef: boolean): CellError | undefined => {
      if (v instanceof CellError) return v;
      if (v !== null && typeof v === 'object' && 'val' in v) v = v.val;       // rich numbers (dates, %, ...)
      if (v === EmptyValue || v == null) { if (fromRef) return; v = false; }  // omitted argument: FALSE
      if (typeof v === 'string') {
        if (fromRef) return;
        const u = v.toUpperCase();
        if (u !== 'TRUE' && u !== 'FALSE') return new CellError(ErrorType.VALUE);
        v = u === 'TRUE';
      }
      const b = typeof v === 'number' ? v !== 0 : Boolean(v);
      seen = true;
      acc = isAnd ? acc && b : acc || b;
    };
    for (const arg of ast.args) {
      const isRef = ['CELL_REFERENCE', 'CELL_RANGE', 'COLUMN_RANGE', 'ROW_RANGE', 'NAMED_EXPRESSION'].includes(arg?.type);
      if (arg?.type === 'EMPTY') { const e = take(false, false); if (e) return e; continue; }
      const v: any = this.evaluateAst(arg, state);
      if (v instanceof SimpleRangeValue) {
        for (const x of v.valuesFromTopLeftCorner()) { const e = take(x, true); if (e) return e; }
      } else {
        const e = take(v, isRef); if (e) return e;
      }
    }
    return seen ? acc : new CellError(ErrorType.VALUE);
  }
  xland(ast: any, state: any) { return this.logical(ast, state, true); }
  xlor(ast: any, state: any) { return this.logical(ast, state, false); }

  static implementedFunctions = {
    XLAND: { method: 'xland', parameters: [{ argumentType: FunctionArgumentType.ANY }], repeatLastArgs: 1 },
    XLOR: { method: 'xlor', parameters: [{ argumentType: FunctionArgumentType.ANY }], repeatLastArgs: 1 },
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
    XLCHOOSE: {
      method: 'xlchoose',
      parameters: [
        { argumentType: FunctionArgumentType.ANY },
        { argumentType: FunctionArgumentType.ANY },
      ],
      repeatLastArgs: 1,
    },
  };
}
HyperFormula.registerFunctionPlugin(BuzFunctions as any, { enGB: { BPLOOKUP: 'BPLOOKUP', BARCODEVALUE: 'BARCODEVALUE', XLCHOOSE: 'XLCHOOSE', XLAND: 'XLAND', XLOR: 'XLOR' } });

/**
 * Named ranges that look like cell addresses - letters then digits, e.g. FDEDUCT2 (Door Screen),
 * COPEN100 (Curtains) - are invalid names for the engine; they are renamed NR_<name> in the names
 * and in every formula that uses them.
 */
function renamesFor(names: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const n of names) if (/^[A-Za-z]+\d+$/.test(n) || /^R\d+C\d+$/i.test(n)) out[n] = `NR_${n}`;
  return out;
}

/** Excel → engine formula dialect fixes, applied outside string literals only. */
function translateFormula(f: string, renamed: Record<string, string> = {}): string {
  f = f.replace(/_xlfn\.|_xlws\./g, '');
  return f.split(/("(?:[^"]|"")*")/).map((part, i) => {
    if (i % 2) return part;
    let p = part.replace(/(?<![A-Za-z0-9_.!'$])(TRUE|FALSE)(?![A-Za-z0-9_(!])/gi, m => m.toUpperCase() + '()');
    p = p.replace(/(?<![A-Za-z0-9_.!'$])CHOOSE\(/gi, 'XLCHOOSE(');
    p = p.replace(/(?<![A-Za-z0-9_.!'$])(AND|OR)\(/gi, (_m, fn) => `XL${fn.toUpperCase()}(`);
    for (const [from, to] of Object.entries(renamed)) {
      p = p.replace(new RegExp(`(?<![A-Za-z0-9_.!'$])${from}(?![A-Za-z0-9_(!])`, 'g'), to);
    }
    return p;
  }).join('');
}

/**
 * A shared formula (one formula filled across a range) as it reads in another cell of that range:
 * relative references move by the offset from the master cell, like Excel. ExcelJS's own version also
 * moves "references" inside text - e.g. Roller Shutters' motor grid "L10 ODS Motor" became "L23 ODS
 * Motor" 13 rows down - so this one leaves string literals alone.
 */
export function slideSharedFormula(formula: string, fromCell: string, toCell: string): string {
  const [, fromCol, fromRow] = fromCell.match(/^([A-Z]+)(\d+)$/)!;
  const [, toCol, toRow] = toCell.match(/^([A-Z]+)(\d+)$/)!;
  const dCol = colToNum(toCol) - colToNum(fromCol), dRow = Number(toRow) - Number(fromRow);
  return formula.split(/("(?:[^"]|"")*")/).map((part, i) => i % 2 ? part : part.replace(
    /((?:'[^']+'|[A-Za-z_][A-Za-z0-9_.]*)!)?(\$?)([A-Za-z]{1,3})(\$?)(\d+)(?![A-Za-z0-9_(])/g,
    (ref, sheet, colAbs, col, rowAbs, row, offset, whole) => {
      // part of a longer name (e.g. a named range like FDEDUCT2) or a function call: leave it
      const before = whole[offset - 1];
      if (before && /[A-Za-z0-9_.$]/.test(before)) return ref;
      const colNum = colToNum(col.toUpperCase());
      if (colNum > 16384) return ref;
      const c = colAbs ? colNum : colNum + dCol;
      const r = rowAbs ? Number(row) : Number(row) + dRow;
      return `${sheet ?? ''}${colAbs}${numToCol(c)}${rowAbs}${r}`;
    },
  )).join('');
}

function numToCol(n: number): string {
  let s = '';
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

/** Excel's name for an error, e.g. NA → "#N/A", VALUE → "#VALUE!", DIV_BY_ZERO → "#DIV/0!". */
export function excelErrorName(type: string | undefined): string {
  const names: Record<string, string> = { NA: '#N/A', VALUE: '#VALUE!', REF: '#REF!', DIV_BY_ZERO: '#DIV/0!', NAME: '#NAME?', NUM: '#NUM!', CYCLE: '#CYCLE!' };
  return names[type ?? ''] ?? `#${type ?? 'ERROR'}`;
}

export function colToNum(col: string): number {
  let n = 0;
  for (const ch of col.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

export type CellInput = string | number | boolean | null;

/**
 * Splits the arguments of a function call at top-level separators, starting just after its "(" and
 * stopping at the matching ")". Quotes and nested brackets are respected.
 */
function splitTopLevel(text: string, sep: ',' | '&'): string[] {
  const parts: string[] = [];
  let depth = 0, inQuote = false, cur = '';
  for (const ch of text) {
    if (ch === '"') inQuote = !inQuote;
    if (!inQuote) {
      if (ch === '(') depth++;
      if (ch === ')') { if (depth === 0) { parts.push(cur); return parts; } depth--; }
      if (ch === sep && depth === 0) { parts.push(cur); cur = ''; continue; }
    }
    cur += ch;
  }
  parts.push(cur);
  return parts;
}

/**
 * Keep text as text, like Excel. The engine would otherwise turn number-looking text
 * ("1000", "2.5") into numbers, and formulas that compare text (e.g. Roller Blinds
 * chain length ="1000") would then disagree with Excel. A leading apostrophe marks text.
 */
function asText(v: string): CellInput {
  return v === '' ? null : "'" + v;
}

/** Excel date serial (days since 1899-12-30), as Excel stores dates. */
function toExcelSerial(d: Date): number {
  return (d.getTime() - Date.UTC(1899, 11, 30)) / 86_400_000;
}

/** A value from BUZ or a job sheet, stored the way Excel holds it. */
function toCell(v: CellInput | Date | undefined): CellInput {
  if (v === undefined) return null;
  if (v instanceof Date) return toExcelSerial(v);
  return typeof v === 'string' ? asText(v) : v;
}

export interface DataSheetInput {
  /** Data row 5 (order header), keyed by column letter */
  header: Record<string, CellInput>;
  /** Data row 11 (the order line), keyed by column letter */
  line: Record<string, CellInput>;
  /** CustOrdOpt rows written from Data!CE11 down: [key, id, id, orderItemPkId, code, value] */
  options: CellInput[][];
}

/**
 * A circular reference that Excel resolves because only one side of an IF is ever
 * used (e.g. Roller Blinds: Blind Width → pelmet deduction → Control, and
 * Control → motor grid → Blind Width). In `sheet`, formulas in `column` read
 * `refColumn` of the same row from a helper cell instead; calculate() then copies
 * refColumn into the helper and recalculates until nothing changes.
 */
export interface CycleBreak {
  sheet: string;
  column: string;       // column whose formulas are rewritten, e.g. 'G'
  refColumn: string;    // the same-row reference that closes the loop, e.g. 'AR'
  helperColumn: string; // an unused column to hold refColumn's last value, e.g. 'ZZ'
}

/** A cell where an Excel error starts (see JobSheetEngine.errorSources). */
export interface ErrorSource {
  sheet: string;
  address: string;
  label: string;         // job sheet column heading above the cell
  error: string;         // e.g. "#N/A"
  lookupValue?: string;  // for a VLOOKUP that finds nothing: what it looked for
  lookupTable?: string;  // ...and the list it looked in
}

export interface TemplateOptions {
  cycleBreaks?: CycleBreak[];
  /**
   * Evaluate functions over ranges element by element inside formulas, as Excel does in e.g.
   * SUMPRODUCT(--(LEN(A1:D1)>0)) (Squalonet). Off by default: the templates verified so far don't need it.
   */
  arrayArithmetic?: boolean;
}

// Data sheet regions holding order-specific input (everything else is template)
const HEADER_ROW = 5;
const LINE_FIRST_ROW = 11;
const LINE_COLS = [colToNum('AV'), colToNum('BW')];
const HEADER_COLS = [colToNum('AV'), colToNum('DW')];
const OPT_COLS = [colToNum('CE'), colToNum('CJ')];
const MAX_ROWS = 2000;

/** A template workbook as plain data: JSON-safe, so it can be saved and loaded without ExcelJS */
export interface PreparedTemplate {
  sheets: Record<string, CellInput[][]>;
  names: { name: string; ref: string }[];
  renamed: Record<string, string>;
  arrayArithmetic: boolean;
  cycleBreaks: (CycleBreak & { rows: number[] })[];
  numFmts: [string, string][];
}

export class JobSheetEngine {
  private hf: HyperFormula;
  private dataSheet: number;
  private dataRowsInUse = 0;
  private cycleBreaks: (CycleBreak & { rows: number[] })[] = [];
  /** Template number formats, keyed "Sheet!row,col" (1-based) */
  private numFmts = new Map<string, string>();

  private constructor(sheets: Record<string, CellInput[][]>, names: { name: string; ref: string }[], arrayArithmetic = false, renamed: Record<string, string> = {}) {
    this.hf = HyperFormula.buildFromSheets(sheets as any, {
      useArrayArithmetic: arrayArithmetic,
      licenseKey: 'gpl-v3',
      evaluateNullToZero: true,
      leapYear1900: true,
      nullDate: { year: 1899, month: 12, day: 30 },
      useColumnIndex: true,
    });
    for (const { name, ref } of names) {
      this.hf.addNamedExpression(renamed[name] || name, '=' + ref);
    }
    this.dataSheet = this.hf.getSheetId('Data')!;
    this.clearDataInputs(MAX_ROWS);
  }

  static async fromTemplate(templatePath: string, options: TemplateOptions = {}): Promise<JobSheetEngine> {
    return JobSheetEngine.fromPrepared(await JobSheetEngine.prepareTemplate(templatePath, options));
  }

  /**
   * Read a template workbook into plain data (cells, formulas, names, number formats). Reading an .xlsm
   * with ExcelJS briefly takes up to ~450 MB, and Node keeps that memory afterwards - so the server
   * builds engines from this prepared form (see preparedTemplates.ts) instead of opening the workbook.
   */
  static async prepareTemplate(templatePath: string, options: TemplateOptions = {}): Promise<PreparedTemplate> {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(templatePath);
    return JobSheetEngine.prepareWorkbook(wb, options);
  }

  /** prepareTemplate for a workbook that is already open (the upload check reads it once for everything). */
  static prepareWorkbook(wb: ExcelJS.Workbook, options: TemplateOptions = {}): PreparedTemplate {

    const definedNames = (wb.definedNames as any).model as { name: string; ranges: string[] }[];
    const renamed = renamesFor(definedNames.map(n => n.name));

    const sheets: Record<string, CellInput[][]> = {};
    const numFmts = new Map<string, string>();
    for (const ws of wb.worksheets) {
      const arr: CellInput[][] = [];
      ws.eachRow({ includeEmpty: false }, (row, r) => row.eachCell({ includeEmpty: false }, (cell, c) => {
        if (cell.numFmt) numFmts.set(`${ws.name}!${r},${c}`, cell.numFmt);
        const v: any = cell.value;
        let out: CellInput;
        if (v && typeof v === 'object' && (v.formula || v.sharedFormula)) {
          const master = v.sharedFormula ? (ws.getCell(v.sharedFormula).value as any)?.formula : undefined;
          let f = translateFormula(v.formula
            ?? (master ? slideSharedFormula(master, v.sharedFormula, cell.address) : cell.formula), renamed);
          for (const b of options.cycleBreaks ?? []) {
            if (b.sheet === ws.name && c === colToNum(b.column)) {
              // same-row, relative reference only (e.g. AR11, not $AR$11 or Data!AR11)
              f = f.replace(new RegExp(`(?<![A-Za-z0-9_$!'])${b.refColumn}${r}(?![0-9])`, 'g'), `${b.helperColumn}${r}`);
            }
          }
          out = '=' + f;
        }
        else if (v && typeof v === 'object' && v.richText) out = asText(v.richText.map((t: any) => t.text).join(''));
        else if (v && typeof v === 'object' && v.error) out = v.error;
        else if (v instanceof Date) out = toExcelSerial(v);
        else if (v && typeof v === 'object') out = asText(String(v.text ?? v));
        else out = typeof v === 'string' ? asText(v) : v;
        (arr[r - 1] ??= [])[c - 1] = out;
      }));
      for (let i = 0; i < arr.length; i++) arr[i] ??= [];
      sheets[ws.name] = arr;
    }

    const names: { name: string; ref: string }[] = [];
    for (const n of definedNames) {
      const ref = n.ranges[0];
      if (!ref || ref.includes('#REF')) continue; // AdjustableHighKits/LowKits are broken in the source workbook
      // BUZ sizes CustOrdOpt to the order it exported; size it for any order
      names.push({ name: n.name, ref: n.name === 'CustOrdOpt' ? `Data!$CE$10:$CK$${MAX_ROWS}` : ref });
    }
    const cycleBreaks = (options.cycleBreaks ?? []).map(b => ({
      ...b,
      rows: (sheets[b.sheet] ?? []).flatMap((row, i) => {
        const cell = row?.[colToNum(b.column) - 1];
        return typeof cell === 'string' && cell.startsWith('=') ? [i + 1] : [];
      }),
    }));
    return { sheets, names, renamed, arrayArithmetic: options.arrayArithmetic ?? false, cycleBreaks, numFmts: [...numFmts] };
  }

  static fromPrepared(t: PreparedTemplate): JobSheetEngine {
    const engine = new JobSheetEngine(t.sheets, t.names, t.arrayArithmetic, t.renamed);
    engine.cycleBreaks = t.cycleBreaks;
    engine.numFmts = new Map(t.numFmts);
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
        this.hf.setCellContents({ sheet: s, row: HEADER_ROW - 1, col: colToNum(col) - 1 }, toCell(v));
      }
      for (const [col, v] of Object.entries(input.line)) {
        this.hf.setCellContents({ sheet: s, row: LINE_FIRST_ROW - 1, col: colToNum(col) - 1 }, toCell(v));
      }
      if (input.options.length) {
        this.hf.setCellContents({ sheet: s, row: LINE_FIRST_ROW - 1, col: OPT_COLS[0] - 1 }, input.options.map(r => r.map(toCell)));
      }
    });
    this.dataRowsInUse = rowsNeeded;
    this.resolveCycleBreaks();
  }

  /** Copy each loop-closing value into its helper cell and recalculate until stable. */
  private resolveCycleBreaks(maxPasses = 5): void {
    if (!this.cycleBreaks.length) return;
    // Start every helper empty, as Excel would see the untaken branch
    this.hf.batch(() => {
      for (const b of this.cycleBreaks) {
        const sheet = this.hf.getSheetId(b.sheet)!;
        for (const r of b.rows) this.hf.setCellContents({ sheet, row: r - 1, col: colToNum(b.helperColumn) - 1 }, null);
      }
    });
    for (let pass = 0; pass < maxPasses; pass++) {
      const updates: { sheet: number; row: number; col: number; value: CellInput }[] = [];
      for (const b of this.cycleBreaks) {
        const sheet = this.hf.getSheetId(b.sheet)!;
        for (const r of b.rows) {
          const ref: any = this.hf.getCellValue({ sheet, row: r - 1, col: colToNum(b.refColumn) - 1 });
          const helper: any = this.hf.getCellValue({ sheet, row: r - 1, col: colToNum(b.helperColumn) - 1 });
          const value: CellInput = ref && typeof ref === 'object' ? null : ref;
          if ((value ?? null) !== (helper ?? null)) updates.push({ sheet, row: r - 1, col: colToNum(b.helperColumn) - 1, value });
        }
      }
      if (!updates.length) return;
      this.hf.batch(() => { for (const u of updates) this.hf.setCellContents({ sheet: u.sheet, row: u.row, col: u.col }, toCell(u.value)); });
    }
  }

  /** Cell value by sheet name and 1-based row/column. Errors come back as '#ERROR' strings. */
  /**
   * Where an Excel error starts: traces back from the given cells (1-based) through their formulas and returns
   * the cells that produce an error themselves rather than passing one on - e.g. a VLOOKUP that finds nothing.
   * `label` is the text in the row above the cell (the job sheet column heading), when there is one.
   */
  errorSources(sheetName: string, row: number, cols: number[], componentsHeadingRow = 3): ErrorSource[] {
    const isError = (v: any) => v && typeof v === 'object' && 'type' in v;
    const start = this.hf.getSheetId(sheetName);
    if (start === undefined) return [];
    const seen = new Set<string>();
    const found = new Map<string, ErrorSource>();
    const queue = cols.map(c => ({ sheet: start, row: row - 1, col: c - 1 }));
    while (queue.length) {
      const cell = queue.pop()!;
      const key = `${cell.sheet}:${cell.row}:${cell.col}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const erroredInputs = this.hf.getCellPrecedents(cell)
        .filter((p: any) => !('start' in p) && this.hf.getSheetName(p.sheet) !== undefined && isError(this.hf.getCellValue(p))) as any[];
      if (erroredInputs.length) { queue.push(...erroredInputs); continue; }
      const name = this.hf.getSheetName(cell.sheet)!;
      // column heading: its heading row on the Components tab (row 3 for most products),
      // otherwise the row above the cell (the job sheet's column heading)
      const headingRow = name === 'Components' ? componentsHeadingRow - 1 : cell.row - 1;
      const above = headingRow >= 0 ? this.hf.getCellValue({ ...cell, row: headingRow }) : null;
      const v: any = this.hf.getCellValue(cell);
      found.set(key, {
        sheet: name,
        address: this.hf.simpleCellAddressToString(cell, cell.sheet)?.replace(/^.*!/, '') ?? '',
        label: typeof above === 'string' ? above.trim() : '',
        error: excelErrorName(v?.type),
        ...this.failedLookup(cell),
      });
    }
    return [...found.values()];
  }

  /** For a cell whose VLOOKUP finds nothing: the value it looked for (parts joined with " + ") and the list name. */
  private failedLookup(cell: { sheet: number; row: number; col: number }): { lookupValue?: string; lookupTable?: string } {
    const formula = this.hf.getCellFormula(cell);
    if (!formula) return {};
    const evalText = (expr: string) => {
      const r: any = this.hf.calculateFormula('=' + expr, cell.sheet);
      return r && typeof r === 'object' ? null : String(r ?? '');
    };
    for (const m of formula.matchAll(/VLOOKUP\(/gi)) {
      const args = splitTopLevel(formula.slice(m.index! + m[0].length), ',');
      if (args.length < 2) continue;
      const [keyExpr, table] = args;
      const missing: any = this.hf.calculateFormula(`=ISNA(VLOOKUP(${keyExpr},${table},1,FALSE()))`, cell.sheet);
      if (missing !== true) continue;
      const inner = keyExpr.trim().match(/^CONCATENATE\((.*)\)$/i);
      const parts = inner ? splitTopLevel(inner[1] + ')', ',') : splitTopLevel(keyExpr + ')', '&');
      const values = parts.map(evalText).filter((x): x is string => x !== null && x !== '');
      return { lookupValue: values.join(' + ') || (evalText(keyExpr) ?? ''), lookupTable: table.trim() };
    }
    return {};
  }

  /** Free the workbook (a template holds 30-80 MB while loaded) */
  dispose(): void {
    this.hf.destroy();
  }

  getValue(sheetName: string, row: number, col: number): CellInput {
    const sheet = this.hf.getSheetId(sheetName);
    if (sheet === undefined) throw new Error(`Sheet not found: ${sheetName}`);
    const v: any = this.hf.getCellValue({ sheet, row: row - 1, col: col - 1 });
    if (v && typeof v === 'object') return '#' + (v.type || 'ERROR');
    return v;
  }
}
