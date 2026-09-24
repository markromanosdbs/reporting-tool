/**
 * Dry run (no writes): calculate every SECD/GRIL line in SalesOrderOptions_DASON and
 * report parse warnings, formula errors and empty results.
 *   npx tsx src/scripts/dryRunDoorScreen.ts
 */
import 'dotenv/config';
import { getBraxConnection } from '../db.js';
import { calculateDoorScreenLine } from '../services/jobsheet/DoorScreenJobSheet.js';

const pool = await getBraxConnection();
const rows = (await pool.request().query(`
  SELECT * FROM SalesOrderOptions_DASON
  WHERE InvGrpCode IN ('SECD','GRIL') OR LEFT(InventoryDescn,4) IN ('SECD','GRIL')`)).recordset;

const byLine = new Map<string, any[]>();
for (const r of rows) {
  const k = String(r.OrderItemPkId);
  if (!byLine.has(k)) byLine.set(k, []);
  byLine.get(k)!.push(r);
}

let ok = 0, warned = 0, emptyLines = 0, failed = 0;
const t0 = Date.now();
for (const [pk, lineRows] of byLine) {
  const f = lineRows[0];
  const label = `${f.DBSBuzNo || f.OrderNo + '.' + f.OrderRev} line ${f.FixedLine} (${f.InventoryDescn}, ${f.ItemWidth}x${f.ItemHeight})`;
  try {
    const res = await calculateDoorScreenLine(pool, lineRows);
    const n = Object.keys(res.components).length;
    if (res.warnings.length) { warned++; console.log(`WARN  ${label}: ${res.warnings.join('; ')}`); }
    else if (n === 0) { emptyLines++; console.log(`EMPTY ${label}: no component values`); }
    else ok++;
  } catch (e) {
    failed++; console.log(`FAIL  ${label}: ${e}`);
  }
}
console.log(`\n${byLine.size} lines in ${((Date.now() - t0) / 1000).toFixed(1)}s: ${ok} ok, ${warned} with warnings, ${emptyLines} empty, ${failed} failed`);
await pool.close();
