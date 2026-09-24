/**
 * Validates the Door Screen engine end-to-end: DASON → engine → Components,
 * compared column-by-column with the Components tab of real BUZ job sheets.
 *   npx tsx src/scripts/validateDoorScreen.ts <jobsheet.xlsm> [...]
 */
import 'dotenv/config';
import ExcelJS from 'exceljs';
import sql from 'mssql';
import { getBraxConnection } from '../db.js';
import { calculateDoorScreenLine } from '../services/jobsheet/DoorScreenJobSheet.js';
import { ComponentsMapper } from '../services/ComponentsMapper.js';

const val = (x: any) => (x && typeof x === 'object' ? ('result' in x ? x.result : null) : x);
/** Value as Excel displays it, using the cell's number format. */
function displayed(v: number, fmt?: string): number {
  if (!fmt || /general/i.test(fmt)) return v;
  const s = fmt.split(';')[0].replace(/"[^"]*"|\[[^\]]*\]/g, '');
  const d = s.match(/[0#]\.([0#]+)/); const dec = d ? d[1].length : (/[0#]/.test(s) ? 0 : null);
  if (dec === null) return v;
  const f = 10 ** dec; return Math.sign(v) * Math.round(Math.abs(v) * f + 1e-9) / f;
}
const empty = (v: any) => v === null || v === undefined || v === '' || v === 0 || v === false;

const pool = await getBraxConnection();
let totalLines = 0, perfectLines = 0;

for (const file of process.argv.slice(2)) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const data = wb.getWorksheet('Data')!;
  const comps = wb.getWorksheet('Components')!;
  console.log(`\n=== ${file.split(/[\\/]/).pop()}`);

  for (let i = 0; i < 60; i++) {
    const pk = val(data.getRow(11 + i).getCell('AV').value);
    if (!pk) break;
    const rows = (await pool.request().input('pk', sql.UniqueIdentifier, pk)
      .query('SELECT * FROM SalesOrderOptions_DASON WHERE OrderItemPkId = @pk')).recordset;
    if (!rows.length) { console.log(`  line ${i + 1}: not in DASON`); continue; }

    const res = await calculateDoorScreenLine(pool, rows);
    const excelRow = comps.getRow(5 + i);
    const diffs: string[] = [];
    let n = 0;
    for (const m of ComponentsMapper.getMapping()) {
      let ex: any = val(excelRow.getCell(m.excelCol).value);
      if (typeof ex === 'string' && !ComponentsMapper.isTextColumn(m.sqlColumn) && ex.trim() !== '' && !isNaN(Number(ex))) ex = Number(ex);
      if (typeof ex === 'number') { ex = displayed(ex, excelRow.getCell(m.excelCol).numFmt); if (ex === 0) ex = null; } // compare as displayed
      const got = res.components[m.sqlColumn];
      if (!empty(ex)) n++;
      const same = (empty(ex) && got === undefined) ||
        (typeof ex === 'number' && typeof got === 'number' && Math.abs(ex - got) < 1e-6) ||
        (typeof ex === 'string' && String(got) === ex);
      if (!same) diffs.push(`${m.section} / ${m.header} [${m.sqlColumn}] excel=${JSON.stringify(ex)} engine=${JSON.stringify(got)}`);
    }
    totalLines++;
    if (!diffs.length) perfectLines++;
    console.log(`  line ${i + 1} (${res.group}, ${rows[0].InventoryDescn}): ${n} values, ${diffs.length} differences` +
      (res.warnings.length ? ` | warnings: ${res.warnings.join('; ')}` : ''));
    diffs.slice(0, 8).forEach(d => console.log('     ', d));
    console.log('      base:', JSON.stringify(res.base));
  }
}
console.log(`\n${perfectLines}/${totalLines} lines match Excel exactly across all 1,011 columns`);
await pool.close();
