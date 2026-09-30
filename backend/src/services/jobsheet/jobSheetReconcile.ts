import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import { runExclusive } from './ProductJobSheet.js';
import { targetFor } from './templateTargets.js';
import { TemplateUpdateError } from './templateUpdates.js';

/**
 * "Reconcile a job sheet with the report": compares the values a BUZ job sheet saved on its Components
 * tab with what the live report shows for the same lines. Checking only - nothing is stored, and the
 * uploaded file is deleted straight away.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const READ_SCRIPT = path.join(here, 'jobSheetReadCli' + path.extname(fileURLToPath(import.meta.url)));
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

interface ReadLine { line: number; pkId: string; code: string; descn: string; lineNo: unknown; product: string | null; values: Record<string, unknown> }

function readJobSheet(filePath: string): Promise<{ orderNo: string | null; lines: ReadLine[] }> {
  const tmp = path.join(os.tmpdir(), `reconcile-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  fs.writeFileSync(`${tmp}.job.json`, JSON.stringify({ path: filePath, outPath: `${tmp}.out.json` }));
  return new Promise((resolve, reject) => {
    const execArgv = [...process.execArgv.filter(a => !a.startsWith('--max-old-space-size')), '--max-old-space-size=384'];
    const child = spawn(process.execPath, [...execArgv, READ_SCRIPT, `${tmp}.job.json`], { stdio: ['ignore', 'ignore', 'pipe'] });
    let failure = '';
    child.stderr.on('data', (d: Buffer) => { const m = d.toString().match(/READ FAILED (.*)/); if (m) failure = m[1].trim(); });
    child.on('error', reject);
    child.on('exit', code => {
      try {
        if (code !== 0) return reject(new TemplateUpdateError(failure || 'The job sheet could not be read.'));
        resolve(JSON.parse(fs.readFileSync(`${tmp}.out.json`, 'utf8')));
      } finally {
        fs.rm(`${tmp}.job.json`, () => undefined);
        fs.rm(`${tmp}.out.json`, () => undefined);
      }
    });
  });
}

const empty = (v: unknown) => v === null || v === undefined || v === '' || v === 0;
const same = (a: unknown, b: unknown) =>
  (empty(a) && empty(b)) || (typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) < 1e-9) || (!empty(a) && !empty(b) && String(a).trim() === String(b).trim());

export async function reconcileJobSheet(fileName: string, content: Buffer) {
  if (!content.length) throw new TemplateUpdateError('The file is empty.');
  if (content.length > MAX_UPLOAD_BYTES) throw new TemplateUpdateError('The file is over 25 MB. BUZ job sheets are usually under 1 MB.');
  if (content[0] !== 0x50 || content[1] !== 0x4b || !/\.xls[xm]$/i.test(fileName)) throw new TemplateUpdateError('Upload the BUZ job sheet as an .xlsm file.');

  const filePath = path.join(os.tmpdir(), `reconcile-${Date.now()}-${Math.random().toString(36).slice(2)}.xlsm`);
  fs.writeFileSync(filePath, content);
  const t0 = Date.now();
  let sheet: Awaited<ReturnType<typeof readJobSheet>>;
  try {
    // one heavy job at a time: waits for any calculation batch or template check to finish
    sheet = await runExclusive(() => readJobSheet(filePath));
  } finally {
    fs.rm(filePath, () => undefined);
  }

  const lines = sheet.lines.map(l => {
    const lineKey = `${sheet.orderNo ?? '?'} ${l.lineNo ?? l.line}`;
    const target = l.product ? targetFor(l.product) : undefined;
    const base = { line: l.line, lineKey, code: l.code, descn: l.descn, report: target ? `${target.reportLabel} · ${target.codes.join('/')}` : null };
    if (!target) return { ...base, result: 'not-supported' as const, differences: [], compared: 0, columns: 0 };
    const report = target.current(l.pkId);
    if (!report) return { ...base, result: 'not-on-report' as const, differences: [], compared: 0, columns: 0 };
    const headers = new Map(target.mapping().map(m => [m.sqlColumn, m.header]));
    const differences: { heading: string; jobSheet: unknown; report: unknown }[] = [];
    const columns = new Set([...Object.keys(l.values), ...Object.keys(report)]);
    for (const col of columns) {
      if (!headers.has(col)) continue;
      if (!same(l.values[col], report[col])) differences.push({ heading: headers.get(col)!, jobSheet: l.values[col] ?? null, report: report[col] ?? null });
    }
    const withData = [...columns].filter(c => headers.has(c)).length;
    return { ...base, result: differences.length ? 'different' as const : 'match' as const, differences, compared: withData, columns: headers.size };
  });

  return {
    fileName: path.basename(fileName), orderNo: sheet.orderNo, seconds: Math.round((Date.now() - t0) / 1000),
    summary: {
      lines: lines.length,
      match: lines.filter(l => l.result === 'match').length,
      different: lines.filter(l => l.result === 'different').length,
      notOnReport: lines.filter(l => l.result === 'not-on-report').length,
      notSupported: lines.filter(l => l.result === 'not-supported').length,
    },
    lines,
  };
}
