/**
 * Calls POST /api/calculate for every line of the given job sheets, then compares the
 * persisted ComponentsReport_DoorScreen row with the job sheet's Components tab.
 *   npx tsx src/scripts/verifyDoorScreenPersisted.ts <jobsheet.xlsm> [...]
 */
import 'dotenv/config';
import ExcelJS from 'exceljs';
import sql from 'mssql';
import { getBraxConnection } from '../db.js';
import { ComponentsMapper } from '../services/ComponentsMapper.js';

const API = process.env.VERIFY_API || 'http://localhost:3001/api';
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
let total = 0, perfect = 0;
for (const file of process.argv.slice(2)) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const data = wb.getWorksheet('Data')!, comps = wb.getWorksheet('Components')!;
  for (let i = 0; i < 60; i++) {
    const pk = val(data.getRow(11 + i).getCell('AV').value);
    if (!pk) break;
    const t0 = Date.now();
    const resp = await fetch(`${API}/calculate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderItemPkId: pk }) });
    const body: any = await resp.json();
    const ms = Date.now() - t0;
    const row = (await pool.request().input('pk', sql.UniqueIdentifier, pk)
      .query('SELECT * FROM ComponentsReport_DoorScreen WHERE OrderItemPkId = @pk')).recordset[0];
    let bad = 0;
    for (const m of ComponentsMapper.getMapping()) {
      let ex: any = val(comps.getRow(5 + i).getCell(m.excelCol).value);
      if (typeof ex === 'string' && !ComponentsMapper.isTextColumn(m.sqlColumn) && ex.trim() !== '' && !isNaN(Number(ex))) ex = Number(ex);
      if (typeof ex === 'number') { ex = displayed(ex, comps.getRow(5 + i).getCell(m.excelCol).numFmt); if (ex === 0) ex = null; } // compare as displayed
      const db = row?.[m.sqlColumn] ?? null;
      const same = (empty(ex) && db === null) ||
        (typeof ex === 'number' && db !== null && Math.abs(Number(db) - ex) < 0.00005) ||
        (typeof ex === 'string' && String(db) === ex);
      if (!same) { bad++; if (bad <= 5) console.log(`    DIFF ${m.sqlColumn} excel=${JSON.stringify(ex)} db=${JSON.stringify(db)}`); }
    }
    total++; if (!bad && row) perfect++;
    console.log(`${row?.Quote_No} line ${row?.Line_No} [${body.productCode}] api=${resp.status} ${ms}ms, ${body.componentCount} values, ${bad} differences in DB` +
      ` | ${row?.Product} | ${row?.Business_Name} | ${row?.Quote_Ref}`);
  }
}
console.log(`\n${perfect}/${total} persisted rows match Excel exactly`);
await pool.close();
