import { Router, Request, Response } from 'express';
import { getConnection, getBraxConnection } from '../db.js';
import { VALID_TABLES, sanitizeTableName, fetchTableData } from '../services/ReportData.js';
import { calculateSummary } from '../services/SummaryCalculator.js';
import { getProductIssues, productFromEngine } from '../services/jobsheet/ProductReport.js';
import { PRODUCTS_BY_TABLE } from '../services/jobsheet/products.js';

const router = Router();


router.get('/data', async (req: Request, res: Response) => {
  try {
    const skip = parseInt(req.query.skip as string) || 0;
    const take = parseInt(req.query.take as string) || 1000;
    const table = sanitizeTableName((req.query.table as string) || 'door_screen_components');
    const search = (req.query.search as string) || '';

    const { data, total } = await fetchTableData(table, skip, take, search);

    res.json({
      data,
      total,
      skip,
      take,
      table,
    });
  } catch (error) {
    console.error('Error fetching data:', error);
    res.status(500).json({ error: 'Failed to fetch data', details: (error as any).message });
  }
});

/**
 * GET /api/issues?table=...
 * Lines whose calculated components hit a job sheet formula error (#N/A etc.), for the page's warning flag.
 * Only tables calculated from BUZ data have these; others return an empty list.
 */
router.get('/issues', async (req: Request, res: Response) => {
  try {
    const table = sanitizeTableName((req.query.table as string) || 'door_screen_components');
    const products = PRODUCTS_BY_TABLE[table] ?? [];
    const issues = products.length && productFromEngine(products[0])
      ? await getProductIssues(products, await getBraxConnection())
      : [];
    res.json({ table, issues });
  } catch (error) {
    console.error('Error fetching calculation issues:', error);
    res.status(500).json({ error: 'Failed to fetch calculation issues', details: (error as any).message });
  }
});

/**
 * GET /api/summary?table=...
 * Summary rows (Total Required, Install Booked, Install Booked next 7 days, Kanban)
 * over all rows of the table — calculated here rather than in the browser.
 */
router.get('/summary', async (req: Request, res: Response) => {
  try {
    const table = sanitizeTableName((req.query.table as string) || 'door_screen_components');
    const { data } = await fetchTableData(table, 0, 50000, '');
    res.json({ table, rows: data.length, sums: calculateSummary(table, data) });
  } catch (error) {
    console.error('Error calculating summary:', error);
    res.status(500).json({ error: 'Failed to calculate summary', details: (error as any).message });
  }
});

router.get('/tables', async (req: Request, res: Response) => {
  res.json({
    tables: VALID_TABLES.map((table) => ({
      name: table,
      label: table
        .split('_')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' '),
    })),
  });
});

// Get summary totals for roller blind components
router.get('/roller-blind-summary', async (req: Request, res: Response) => {
  try {
    const pool = await getConnection();

    const result = await pool.request().query(`
      SELECT col_name, display_name, total, ib_total, ib7_total, kanban_min
      FROM dbo.tbl_roller_blind_summary
      ORDER BY sort_order
    `);

    const summary: { [key: string]: any } = {};

    result.recordset.forEach((row: any) => {
      summary[row.col_name] = {
        total: row.total || 0,
        ib_total: row.ib_total || 0,
        ib7_total: row.ib7_total || 0,
        kanban_min: row.kanban_min || 0,
        display_name: row.display_name,
      };
    });

    res.json(summary);
  } catch (error) {
    console.error('Error fetching roller blind summary:', error);
    res.status(500).json({ error: 'Failed to fetch summary data', details: (error as any).message });
  }
});

export default router;
