/**
 * Reads the values a BUZ job sheet saved on its Components tab, line by line, for "Reconcile a job
 * sheet with the report". Runs in its own process (reading an .xlsm takes a lot of memory):
 *
 *   node jobSheetReadCli.js <job.json>     job = { path, outPath }
 *
 * Writes { orderNo, lines: [{ line, pkId, code, descn, lineNo, values: { sqlColumn: value } }] } to outPath.
 * Values are as the job sheet displays them (rounded to the cell's number format); errors as '#N/A' etc.
 */
import fs from 'fs';
import ExcelJS from 'exceljs';
import { TEMPLATE_TARGETS } from './templateTargets.js';

function cellValue(v: any): unknown {
  if (v && typeof v === 'object') {
    if ('formula' in v || 'sharedFormula' in v || 'result' in v) return cellValue(v.result ?? null);
    if (v.error) return v.error;
    if (v.richText) return v.richText.map((t: any) => t.text).join('');
  }
  return v;
}

function displayed(v: number, fmt?: string): number {
  if (!fmt || /general/i.test(fmt)) return v;
  const sec = fmt.split(';')[0].replace(/"[^"]*"|\[[^\]]*\]/g, '');
  const d = sec.match(/[0#]\.([0#]+)/); const dec = d ? d[1].length : (/[0#]/.test(sec) ? 0 : null);
  if (dec === null) return v;
  const f = 10 ** dec; return Math.sign(v) * Math.round(Math.abs(v) * f + 1e-9) / f;
}

async function main() {
  const job = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')) as { path: string; outPath: string };
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(job.path);
  const data = wb.getWorksheet('Data'), comps = wb.getWorksheet('Components');
  if (!data || !comps) throw new Error('This file has no Data or Components sheet, so it is not a BUZ job sheet.');

  const bc = cellValue(data.getRow(5).getCell('BC').value), bd = cellValue(data.getRow(5).getCell('BD').value);
  const orderNo = bc ? `${bc}${bd ? '.' + bd : ''}` : null;
  const lines = [];
  for (let i = 0; i < 80; i++) {
    const row = data.getRow(11 + i);
    const pkId = String(cellValue(row.getCell('AV').value) ?? '').trim().toLowerCase();
    if (!pkId) break;
    const descn = String(cellValue(row.getCell('BE').value) ?? '');
    const code = descn.split(' ')[0].toUpperCase();
    const target = TEMPLATE_TARGETS.find(t => t.codes.includes(code));
    const values: Record<string, unknown> = {};
    if (target) {
      const comp = comps.getRow(target.componentsRow + i);
      for (const m of target.mapping()) {
        const c = comp.getCell(m.excelCol);
        let v = cellValue(c.value);
        if (typeof v === 'number') v = displayed(v, c.numFmt);
        if (v === null || v === undefined || v === '' || v === 0 || v === false) continue;
        values[m.sqlColumn] = typeof v === 'string' ? v.trim() : v;
      }
    }
    lines.push({ line: i + 1, pkId, code, descn, lineNo: cellValue(row.getCell('AW').value) ?? null, product: target?.product ?? null, values });
  }
  fs.writeFileSync(job.outPath, JSON.stringify({ orderNo, lines }));
}

main().then(() => process.exit(0), e => { console.error(`READ FAILED ${e instanceof Error ? e.message : e}`); process.exit(1); });
