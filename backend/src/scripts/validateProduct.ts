/**
 * Validates a product end-to-end: DASON → engine → Components, compared column-by-column with the
 * Components tab of real BUZ job sheets (only lines whose order is in DASON). Also checks that the
 * Inventory.Descn split matches the job sheet's own Data!BN/BO/BP. Read-only.
 *   npx tsx src/scripts/validateProduct.ts <table> <jobsheet.xlsm> [...]
 *   e.g. npx tsx src/scripts/validateProduct.ts roller_shutter_components Jobsheet_RLSH_..._11804.C.xlsm
 */
import 'dotenv/config';
import ExcelJS from 'exceljs';
import sql from 'mssql';
import { getBraxConnection } from '../db.js';
import { calculateProductLine, getProductMapping } from '../services/jobsheet/ProductJobSheet.js';
import { PRODUCTS_BY_TABLE, productForGroup } from '../services/jobsheet/products.js';

const [table, ...files] = process.argv.slice(2);
if (!PRODUCTS_BY_TABLE[table]) throw new Error(`Unknown product table "${table}" (known: ${Object.keys(PRODUCTS_BY_TABLE).join(', ')})`);

const val = (x: any) => (x && typeof x === 'object' ? ('result' in x ? x.result : x.richText ? x.richText.map((t: any) => t.text).join('') : null) : x);
/** Value as the job sheet displays it, using the cell's number format (values are stored that way). */
function displayed(v: number, fmt?: string): number {
  if (!fmt || /general/i.test(fmt)) return v;
  const sec = fmt.split(';')[0].replace(/"[^"]*"|\[[^\]]*\]/g, '');
  const d = sec.match(/[0#]\.([0#]+)/); const dec = d ? d[1].length : (/[0#]/.test(sec) ? 0 : null);
  if (dec === null) return v;
  const f = 10 ** dec; return Math.sign(v) * Math.round(Math.abs(v) * f + 1e-9) / f;
}
const empty = (v: any) => v === null || v === undefined || v === '' || v === 0 || v === false;
const pool = await getBraxConnection();
let totalLines = 0, perfectLines = 0, splitChecked = 0, splitBad = 0;

for (const file of files) {
  const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(file);
  const data = wb.getWorksheet('Data')!, comps = wb.getWorksheet('Components')!;
  console.log(`\n=== ${file.split(/[\\/]/).pop()}`);
  for (let i = 0; i < 80; i++) {
    const dataRow = data.getRow(11 + i);
    const pk = val(dataRow.getCell('AV').value); if (!pk) break;

    const descn = String(val(dataRow.getCell('BE').value) ?? '');
    // the template for this line's product code (e.g. AUTO / FGSUN on the External Blinds page)
    const product = productForGroup(descn.split(' ')[0]);
    if (!product || product.table !== table) { console.log(`  line ${i + 1}: no template for "${descn}" on ${table}`); continue; }
    const parts = product.parseDescn(descn);
    const want = ['BN', 'BO', 'BP'].map(c => String(val(dataRow.getCell(c).value) ?? ''));
    splitChecked++;
    if (parts.BN !== want[0] || parts.BO !== want[1] || parts.BP !== want[2]) {
      splitBad++;
      console.log(`  SPLIT "${descn}": got ${JSON.stringify([parts.BN, parts.BO, parts.BP])}, job sheet ${JSON.stringify(want)}`);
    }

    const rows = (await pool.request().input('pk', sql.UniqueIdentifier, pk).query('SELECT * FROM SalesOrderOptions_DASON WHERE OrderItemPkId = @pk')).recordset;
    if (!rows.length) { console.log(`  line ${i + 1}: not in DASON`); continue; }
    const res = await calculateProductLine(product, pool, rows);
    const excelRow = comps.getRow((product.componentsRow ?? 5) + i); const diffs: string[] = []; let n = 0;
    for (const m of getProductMapping(product)) {
      let ex: any = val(excelRow.getCell(m.excelCol).value); const got = res.components[m.sqlColumn];
      if (typeof ex === 'number') { ex = displayed(ex, excelRow.getCell(m.excelCol).numFmt); if (ex === 0) ex = null; } // compare as displayed
      if (!empty(ex)) n++;
      const same = (empty(ex) && got === undefined) || (typeof ex === 'number' && typeof got === 'number' && Math.abs(ex - got) < 1e-6) || String(ex) === String(got);
      if (!same) diffs.push(`col ${m.excelCol} ${m.header} [${m.sqlColumn}] excel=${JSON.stringify(ex)} engine=${JSON.stringify(got)}`);
    }
    for (const [field, c] of Object.entries(product.baseColumns)) {
      const ex = String(val(excelRow.getCell(c).value) ?? ''); if (ex !== res.base[field]) diffs.push(`base ${field} excel=${JSON.stringify(ex)} engine=${JSON.stringify(res.base[field])}`);
    }
    totalLines++; if (!diffs.length) perfectLines++;
    console.log(`  line ${i + 1} (${rows[0].InventoryDescn}, ${rows[0].ItemWidth}x${rows[0].ItemHeight}): ${n} values, ${diffs.length} differences${res.warnings.length ? ' | warnings: ' + res.warnings.join('; ') : ''}`);
    diffs.slice(0, 8).forEach(d => console.log('     ', d));
  }
}
console.log(`\nDescription split: ${splitChecked - splitBad}/${splitChecked} lines match the job sheets' Data!BN/BO/BP`);
console.log(`${perfectLines}/${totalLines} lines match Excel exactly`);
await pool.close();
