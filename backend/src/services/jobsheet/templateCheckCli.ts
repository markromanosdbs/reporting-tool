/**
 * Checks an uploaded job sheet before it can replace a template ("Upload job sheet templates").
 * Runs in its own process (reading an .xlsm takes a lot of memory), started by templateUpdates.ts:
 *
 *   node templateCheckCli.js <job.json>     job = { product, newPath, currentPath, outPath }
 *
 * Prints "PROGRESS <stage> <done> <total>" lines while it works and writes the result to outPath.
 * The live-report comparison is finished by the server, which has the report's current values.
 */
import 'dotenv/config';
import fs from 'fs';
import ExcelJS from 'exceljs';
import sql from 'mssql';
import { getBraxConnection } from '../../db.js';
import { JobSheetEngine, PreparedTemplate, CellInput } from './JobSheetEngine.js';
import { loadPrepared, savePrepared } from './preparedTemplates.js';
import { setTemplateSource } from './templateSources.js';
import { targetFor, LineValues } from './templateTargets.js';
import { getDasonLineSummary, getOptionRows } from './DoorScreenSync.js';

export interface CheckOutput {
  orderNo: string | null;
  problems: { severity: 'error' | 'warning'; text: string }[];
  layout: { columns: number; currentColumns: number; lines: number; lineCodes: string[] };
  columns: { added: { col: number; heading: string }[]; removed: { col: number; heading: string }[]; renamed: { col: number; from: string; to: string }[]; safe: boolean };
  formulas: { changed: number; bySheet: { sheet: string; cells: number }[]; componentsColumns: { col: number; heading: string; cells: number }[]; unusedSheets: string[] };
  values: { changed: number; bySheet: { sheet: string; cells: number }[] };
  sheets: { added: string[]; removed: string[] };
  jobSheet: { lines: number; checked: number; exact: number; notInDason: number; differences: { line: number; heading: string; excel: unknown; engine: unknown }[] };
  live: { lines: number; calculated: number; failed: number; results: { lineKey: string; pkId: string; values: LineValues }[] };
}

const progress = (stage: string, done: number, total: number) => console.log(`PROGRESS ${stage} ${done} ${total}`);
const heading = (v: unknown) => String(v ?? '').replace(/^'/, '').trim();
const empty = (v: unknown) => v === null || v === undefined || v === '' || v === 0 || v === false;
/** A cell's saved value: formula cells give their cached result (blank when Excel saved none) */
function cellValue(v: any): unknown {
  if (v && typeof v === 'object') {
    if ('formula' in v || 'sharedFormula' in v || 'result' in v) return cellValue(v.result ?? null);
    if (v.error) return v.error;
    if (v.richText) return v.richText.map((t: any) => t.text).join('');
    if (v instanceof Date) return v;
  }
  return v;
}

/** Value as the job sheet displays it (its number format's decimals) */
function displayed(v: number, fmt?: string): number {
  if (!fmt || /general/i.test(fmt)) return v;
  const sec = fmt.split(';')[0].replace(/"[^"]*"|\[[^\]]*\]/g, '');
  const d = sec.match(/[0#]\.([0#]+)/); const dec = d ? d[1].length : (/[0#]/.test(sec) ? 0 : null);
  if (dec === null) return v;
  const f = 10 ** dec; return Math.sign(v) * Math.round(Math.abs(v) * f + 1e-9) / f;
}

function headingsOf(t: PreparedTemplate, row: number): string[] {
  const out = (t.sheets['Components']?.[row - 1] ?? []).map(heading);
  while (out.length && !out[out.length - 1]) out.pop();
  return out;
}

function compareHeadings(cur: string[], next: string[], firstComponentCol: number): CheckOutput['columns'] {
  const renamed: CheckOutput['columns']['renamed'] = [];
  const added: CheckOutput['columns']['added'] = [];
  const removed: CheckOutput['columns']['removed'] = [];
  const common = Math.min(cur.length, next.length);
  let shiftedAt = -1;
  for (let i = firstComponentCol - 1; i < common; i++) {
    if (cur[i] === next[i]) continue;
    // an insert/delete shows up as the rest of the row sliding along; a rename changes one heading
    if (next[i + 1] === cur[i] || cur[i + 1] === next[i]) { shiftedAt = i; break; }
    renamed.push({ col: i + 1, from: cur[i], to: next[i] });
  }
  const curSet = new Set(cur), nextSet = new Set(next);
  if (shiftedAt >= 0 || cur.length !== next.length) {
    next.forEach((h, i) => { if (h && !curSet.has(h) && i >= firstComponentCol - 1) added.push({ col: i + 1, heading: h }); });
    cur.forEach((h, i) => { if (h && !nextSet.has(h) && i >= firstComponentCol - 1) removed.push({ col: i + 1, heading: h }); });
  }
  // The report maps job sheet columns by position: columns added at the end are safe (not on the report
  // yet); anything that moves existing columns would put values under the wrong headings
  const safe = shiftedAt < 0 && next.length >= cur.length && removed.length === 0;
  return { added, removed, renamed: shiftedAt < 0 ? renamed : [], safe };
}

/** Column letters → number (A = 1) */
function colNumber(letters: string): number {
  let n = 0;
  for (const ch of letters) n = n * 26 + ch.charCodeAt(0) - 64;
  return n;
}

// Cell references outside string literals: optional sheet, then $A$1 style (a range is two of these)
const REF = /((?:'[^']+'|[A-Za-z0-9_.]+)!)?(\$?)([A-Z]{1,3})(\$?)(\d+)(?![A-Za-z0-9_(])/g;

/**
 * A formula with its references made relative to its own cell (A1 in C3 → R[-2]C[-2]). Every line of
 * an order repeats the same formula a row further down, so in this form they are all the same - and
 * a job sheet exported for a 1-line order compares equal to one for a 12-line order.
 */
function relativeFormula(f: string, row: number, col: number): string {
  return f.split(/("(?:[^"]|"")*")/).map((part, i) => i % 2 ? part : part.replace(REF, (m, sheet, colAbs, letters, rowAbs, digits, offset, whole) => {
    const before = whole[offset - 1];
    if (before && /[A-Za-z0-9_.]/.test(before) && !sheet) return m;   // part of a name, e.g. NR_COPEN100
    const c = colAbs ? `C${colNumber(letters)}` : `C[${colNumber(letters) - col}]`;
    const r = rowAbs ? `R${digits}` : `R[${Number(digits) - row}]`;
    return `${sheet ?? ''}${r}${c}`;
  })).join('');
}

/** Sheets whose formulas the Components tab depends on, directly or through other sheets and named ranges */
function sheetsUsedByComponents(t: PreparedTemplate): Set<string> {
  const names = t.names.map(n => ({ name: t.renamed[n.name] || n.name, sheet: n.ref.match(/^'?([^'!]+)'?!/)?.[1] }));
  const used = new Set(['Components', 'Data']);
  const queue = ['Components'];
  while (queue.length) {
    const sheet = t.sheets[queue.shift()!] ?? [];
    for (const row of sheet) for (const v of row ?? []) {
      if (typeof v !== 'string' || !v.startsWith('=')) continue;
      const found = new Set<string>();
      for (const m of v.matchAll(/'([^']+)'!|(?<![A-Za-z0-9_.'])([A-Za-z0-9_.]+)!/g)) found.add(m[1] ?? m[2]);
      for (const n of names) if (n.sheet && v.includes(n.name)) found.add(n.sheet);
      for (const f of found) if (t.sheets[f] && !used.has(f)) { used.add(f); queue.push(f); }
    }
  }
  return used;
}

/**
 * What changed between two job sheets. Formulas are compared per column as the set of distinct
 * (relative) formulas, so the number of order lines doesn't matter. Values are compared cell by cell
 * on the lookup sheets (fabric lists, deductions, prices) - not the Data sheet, which holds the order.
 * Sheets the Components tab doesn't use (labels, order forms) are listed apart.
 */
function compareSheets(cur: PreparedTemplate, next: PreparedTemplate, componentHeadings: string[]) {
  const used = sheetsUsedByComponents(next);
  const formulas = new Map<string, number>(), values = new Map<string, number>(), compCols = new Map<number, number>();
  const unused = new Set<string>();
  const norm = (v: CellInput | undefined) => (v === undefined || v === null || v === '') ? null : typeof v === 'string' ? v.replace(/^'/, '') : v;
  const patterns = (t: PreparedTemplate, name: string) => {
    const byCol = new Map<number, Set<string>>();
    (t.sheets[name] ?? []).forEach((row, r) => (row ?? []).forEach((v, c) => {
      if (typeof v !== 'string' || !v.startsWith('=')) return;
      if (!byCol.has(c)) byCol.set(c, new Set());
      byCol.get(c)!.add(relativeFormula(v, r + 1, c + 1));
    }));
    return byCol;
  };
  for (const name of Object.keys(next.sheets)) {
    if (!cur.sheets[name]) continue;
    const a = patterns(cur, name), b = patterns(next, name);
    let changes = 0;
    for (const c of new Set([...a.keys(), ...b.keys()])) {
      const pa = a.get(c) ?? new Set<string>(), pb = b.get(c) ?? new Set<string>();
      const n = Math.max([...pb].filter(x => !pa.has(x)).length, [...pa].filter(x => !pb.has(x)).length);
      if (!n) continue;
      changes += n;
      if (name === 'Components') compCols.set(c + 1, n);
    }
    if (name !== 'Data' && name !== 'Components') {
      const A = cur.sheets[name], B = next.sheets[name];
      for (let r = 0; r < Math.max(A.length, B.length); r++) for (let c = 0; c < Math.max((A[r] ?? []).length, (B[r] ?? []).length); c++) {
        const va = norm(A[r]?.[c]), vb = norm(B[r]?.[c]);
        if (va === vb || (typeof va === 'string' && va.startsWith('=')) || (typeof vb === 'string' && vb.startsWith('='))) continue;
        if (used.has(name)) values.set(name, (values.get(name) ?? 0) + 1); else unused.add(name);
      }
    }
    if (!changes) continue;
    if (used.has(name)) formulas.set(name, changes); else unused.add(name);
  }
  const bySheet = (m: Map<string, number>) => [...m].map(([sheet, cells]) => ({ sheet, cells })).sort((x, y) => y.cells - x.cells);
  const total = (m: Map<string, number>) => [...m.values()].reduce((s, n) => s + n, 0);
  return {
    formulas: {
      changed: total(formulas), bySheet: bySheet(formulas), unusedSheets: [...unused].sort(),
      componentsColumns: [...compCols].map(([col, cells]) => ({ col, heading: componentHeadings[col - 1] || `column ${col}`, cells })).sort((x, y) => x.col - y.col),
    },
    values: { changed: total(values), bySheet: bySheet(values) },
    sheets: { added: Object.keys(next.sheets).filter(s => !cur.sheets[s]), removed: Object.keys(cur.sheets).filter(s => !next.sheets[s]) },
  };
}

async function main() {
  const job = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')) as { product: string; newPath: string; currentPath: string; outPath: string };
  const target = targetFor(job.product);
  if (!target) throw new Error(`Unknown product ${job.product}`);
  const problems: CheckOutput['problems'] = [];

  // 1. Read the upload once: prepare it and keep what the checks need from its saved values
  progress('reading', 0, 1);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(job.newPath);
  const data = wb.getWorksheet('Data'), comps = wb.getWorksheet('Components');
  if (!data || !comps) throw new Error('This file has no Data or Components sheet, so it is not a BUZ job sheet.');
  const mapping = target.mapping();
  const lines: { pk: string; code: string; saved: Map<number, { v: unknown; fmt?: string }> }[] = [];
  for (let i = 0; i < 80; i++) {
    const pk = String(cellValue(data.getRow(11 + i).getCell('AV').value) ?? '').trim();
    if (!pk) break;
    const descn = String(cellValue(data.getRow(11 + i).getCell('BE').value) ?? '');
    const row = comps.getRow(target.componentsRow + i);
    const saved = new Map<number, { v: unknown; fmt?: string }>();
    for (const m of mapping) { const c = row.getCell(m.excelCol); saved.set(m.excelCol, { v: cellValue(c.value), fmt: c.numFmt }); }
    lines.push({ pk, code: descn.split(' ')[0].toUpperCase(), saved });
  }
  const bc = cellValue(data.getRow(5).getCell('BC').value), bd = cellValue(data.getRow(5).getCell('BD').value);
  const orderNo = bc ? `${bc}${bd ? '.' + bd : ''}` : null;
  const next = JobSheetEngine.prepareWorkbook(wb, target.options);
  savePrepared(job.newPath, target.options, next);
  progress('reading', 1, 1);

  // 2. Compare with the template in use
  const cur = await loadPrepared(job.currentPath, target.options);
  const curHeadings = headingsOf(cur, target.componentsHeadingRow), nextHeadings = headingsOf(next, target.componentsHeadingRow);
  const firstComponentCol = Math.min(...mapping.map(m => m.excelCol));
  const columns = compareHeadings(curHeadings, nextHeadings, firstComponentCol);
  const diff = compareSheets(cur, next, nextHeadings);
  const lineCodes = [...new Set(lines.map(l => l.code))];
  const wrong = lineCodes.filter(c => !target.codes.includes(c));
  if (!nextHeadings.length) problems.push({ severity: 'error', text: `The Components tab has no headings on row ${target.componentsHeadingRow}.` });
  if (wrong.length) problems.push({ severity: 'error', text: `This job sheet has ${wrong.join(', ')} lines, not ${target.codes.join('/')}. Pick the right product, or upload the ${target.codes.join('/')} job sheet.` });
  if (!columns.safe) problems.push({ severity: 'error', text: 'Components columns were inserted, removed or moved. The report reads columns by position, so its columns need updating before this template can be used.' });
  for (const a of columns.added) if (columns.safe) problems.push({ severity: 'warning', text: `New column ${a.col} "${a.heading}" is not on the report yet.` });
  for (const r of columns.renamed) problems.push({ severity: 'warning', text: `Column ${r.col} is renamed: "${r.from}" → "${r.to}". The report keeps its current heading.` });
  const usedNow = sheetsUsedByComponents(cur);
  const missingUsed = diff.sheets.removed.filter(s => usedNow.has(s)), missingOther = diff.sheets.removed.filter(s => !usedNow.has(s));
  if (missingUsed.length) problems.push({ severity: 'error', text: `Sheets the Components tab uses are missing from the upload: ${missingUsed.join(', ')}.` });
  if (missingOther.length) problems.push({ severity: 'warning', text: `Sheets missing from the upload (not used by the report): ${missingOther.join(', ')}.` });
  if (!lines.length) problems.push({ severity: 'warning', text: 'This job sheet has no order lines, so it could not be checked against saved values. A job sheet exported for a real order gives a full check.' });

  // 3 and 4 calculate with the upload
  setTemplateSource(target.templateFile, job.newPath, Date.now(), 'upload');
  const pool: sql.ConnectionPool = await getBraxConnection();

  // 3. Recalculate the job sheet's own lines from BUZ and compare with what Excel saved
  const jobSheet: CheckOutput['jobSheet'] = { lines: lines.length, checked: 0, exact: 0, notInDason: 0, differences: [] };
  const ownOptions = await getOptionRows(pool, lines.map(l => l.pk));
  for (const [i, l] of lines.entries()) {
    progress('jobsheet', i, lines.length);
    const rows = ownOptions.get(l.pk.toLowerCase()) ?? ownOptions.get(l.pk) ?? [];
    if (!rows.length) { jobSheet.notInDason++; continue; }
    if (!target.codes.includes(l.code)) continue;
    const got = await target.calculate(pool, rows);
    jobSheet.checked++;
    let same = true;
    for (const m of mapping) {
      const s = l.saved.get(m.excelCol)!;
      let ex: any = s.v;
      if (ex && typeof ex === 'object' && 'error' in ex) ex = ex.error;
      if (typeof ex === 'number') { ex = displayed(ex, s.fmt); if (ex === 0) ex = null; }
      const g = got[m.sqlColumn];
      const ok = (empty(ex) && g === undefined) || (typeof ex === 'number' && typeof g === 'number' && Math.abs(ex - g) < 1e-6) || String(ex).trim() === String(g ?? '').trim();
      if (!ok) { same = false; if (jobSheet.differences.length < 50) jobSheet.differences.push({ line: i + 1, heading: m.header, excel: ex ?? null, engine: g ?? null }); }
    }
    if (same) jobSheet.exact++;
  }
  progress('jobsheet', lines.length, lines.length);
  if (jobSheet.notInDason) problems.push({ severity: 'warning', text: `${jobSheet.notInDason} of the job sheet's lines are not in BUZ (DASON) any more, so they could not be checked.` });
  if (jobSheet.checked && jobSheet.exact < jobSheet.checked) problems.push({ severity: 'warning', text: `${jobSheet.checked - jobSheet.exact} of ${jobSheet.checked} job sheet lines don't match what Excel saved. The order may have changed in BUZ since the job sheet was exported, or the job sheet was edited by hand.` });

  // 4. Recalculate every open line of this product (the server compares with the live report)
  const open = await target.openLines(pool);
  const info = await getDasonLineSummary(pool, [...new Set(open.map(o => String(o.buzNo)))]);
  const todo = open.map(o => ({ o, i: info.get(o.lineKey) })).filter(x => x.i);
  const liveOptions = await getOptionRows(pool, todo.map(x => x.i!.pkId));
  const live: CheckOutput['live'] = { lines: open.length, calculated: 0, failed: 0, results: [] };
  for (const [n, { o, i }] of todo.entries()) {
    if (n % 5 === 0) progress('live', n, todo.length);
    try {
      const values = await target.calculate(pool, liveOptions.get(i!.pkId) || [], {
        Descn: o.Descn, CustomerGroup: o.CustomerGroup, SalesRep: o.SalesRep, Installer: o.Installer, DateScheduled: o.DateScheduled,
      });
      live.results.push({ lineKey: o.lineKey, pkId: i!.pkId, values });
      live.calculated++;
    } catch {
      live.failed++;
    }
  }
  progress('live', todo.length, todo.length);

  const out: CheckOutput = {
    orderNo, problems,
    layout: { columns: nextHeadings.length, currentColumns: curHeadings.length, lines: lines.length, lineCodes },
    columns, ...diff, jobSheet, live,
  };
  fs.writeFileSync(job.outPath, JSON.stringify(out));
}

main().then(() => process.exit(0), e => { console.error(`CHECK FAILED ${e instanceof Error ? e.message : e}`); process.exit(1); });
