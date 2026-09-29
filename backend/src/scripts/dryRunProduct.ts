/**
 * Dry run (no writes): calculate every line in SalesOrderOptions_DASON of each job sheet template that
 * feeds a page, and report parse warnings, formula errors and empty results.
 *   npx tsx src/scripts/dryRunProduct.ts <table>     e.g. external_blinds_components (AUTO + FGSUN)
 */
import 'dotenv/config';
import { getBraxConnection } from '../db.js';
import { calculateProductLine } from '../services/jobsheet/ProductJobSheet.js';
import { PRODUCTS_BY_TABLE } from '../services/jobsheet/products.js';

const products = PRODUCTS_BY_TABLE[process.argv[2]];
if (!products) throw new Error(`Unknown product table "${process.argv[2]}" (known: ${Object.keys(PRODUCTS_BY_TABLE).join(', ')})`);

const pool = await getBraxConnection();
for (const product of products) {
  console.log(`\n### ${product.label} (${product.groups.join(', ')}, template ${product.template})`);
  const groupList = product.groups.map(g => `'${g.replace(/'/g, "''")}'`).join(',');
  const rows = (await pool.request().query(`
    SELECT * FROM SalesOrderOptions_DASON
    WHERE InvGrpCode IN (${groupList}) OR LEFT(InventoryDescn, CHARINDEX(' ', InventoryDescn + ' ') - 1) IN (${groupList})`)).recordset;

  const byLine = new Map<string, any[]>();
  for (const r of rows) {
    const k = String(r.OrderItemPkId);
    if (!byLine.has(k)) byLine.set(k, []);
    byLine.get(k)!.push(r);
  }

  let ok = 0, warned = 0, emptyLines = 0, failed = 0;
  const t0 = Date.now();
  for (const [, lineRows] of byLine) {
    const f = lineRows[0];
    const label = `${f.DBSBuzNo || f.OrderNo + '.' + f.OrderRev} line ${f.FixedLine} (${f.InventoryDescn}, ${f.ItemWidth}x${f.ItemHeight})`;
    try {
      const res = await calculateProductLine(product, pool, lineRows);
      const n = Object.keys(res.components).length;
      if (res.warnings.length) { warned++; console.log(`WARN  ${label}: ${res.warnings.join('; ')}`); }
      else if (n === 0) { emptyLines++; console.log(`EMPTY ${label}: no component values`); }
      else ok++;
    } catch (e) {
      failed++; console.log(`FAIL  ${label}: ${e}`);
    }
  }
  console.log(`${byLine.size} lines in ${((Date.now() - t0) / 1000).toFixed(1)}s: ${ok} ok, ${warned} with warnings, ${emptyLines} empty, ${failed} failed`);
}
await pool.close();
