/**
 * Sync ComponentsReport_DoorScreen with dbsproduction (all SECD/GRIL lines).
 *   npx tsx src/scripts/syncDoorScreen.ts
 */
import 'dotenv/config';
import { getBraxConnection } from '../db.js';
import { syncDoorScreen } from '../services/jobsheet/DoorScreenSync.js';

const pool = await getBraxConnection();
const report = await syncDoorScreen(pool, s => console.log(s));
if (report.notInDason.length) console.log('Not in DASON yet:', report.notInDason.join(', '));
if (report.failed.length) console.log('Failed:', report.failed);
await pool.close();
process.exit(report.failed.length ? 1 : 0);
