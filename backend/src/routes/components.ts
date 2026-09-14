import { Router, Request, Response } from 'express';
import { getConnection, getBraxConnection } from '../db.js';

const router = Router();

const VALID_TABLES = [
  'door_screen_components',
  'curtain_tracks',
  'external_blinds_components',
  'panel_glides',
  'roller_blind_components',
  'roller_shutter_components',
  'squalonet_retractable_screens',
];

// Tables that need job tracking data from braxreportsDB
const TABLES_WITH_JOB_TRACKING = [
  'door_screen_components',
  'curtain_tracks',
  'external_blinds_components',
  'panel_glides',
  'roller_blind_components',
  'roller_shutter_components',
  'squalonet_retractable_screens',
];

interface QueryParams {
  skip?: number;
  take?: number;
  search?: string;
  product?: string;
  customer?: string;
  table?: string;
}

function sanitizeTableName(table: string): string {
  if (!VALID_TABLES.includes(table)) {
    return 'door_screen_components';
  }
  return table;
}

router.get('/data', async (req: Request, res: Response) => {
  try {
    const pool = await getConnection();

    const skip = parseInt(req.query.skip as string) || 0;
    const take = parseInt(req.query.take as string) || 1000;
    const table = sanitizeTableName((req.query.table as string) || 'door_screen_components');
    const search = (req.query.search as string) || '';

    // Build WHERE clause - search by quote_no
    let whereClause = 'WHERE 1=1';

    if (search) {
      whereClause += ` AND quote_no LIKE @search`;
    }

    // Count total records with filters
    const countRequest = pool.request();
    if (search) countRequest.input('search', `%${search}%`);

    const countResult = await countRequest.query(
      `SELECT COUNT(*) as total FROM [${table}] ${whereClause}`
    );
    const total = countResult.recordset[0]?.total || 0;

    // Fetch paginated data with filters
    const dataQuery = `
      SELECT * FROM [${table}]
      ${whereClause}
      ORDER BY 1
      OFFSET @skip ROWS
      FETCH NEXT @take ROWS ONLY
    `;

    const dataRequest = pool.request()
      .input('skip', skip)
      .input('take', take);

    if (search) dataRequest.input('search', `%${search}%`);

    const finalResult = await dataRequest.query(dataQuery);

    let data: any[] = finalResult.recordset;

    // For tables with job tracking, fetch and merge tracking data
    if (TABLES_WITH_JOB_TRACKING.includes(table) && data.length > 0) {
      try {
        // Build list of quote_no + line_no combinations to query
        const lookupKeys = data.map((row: any) => `'${row.quote_no} ${row.line_no}'`).join(',');

        console.log(`[DEBUG] Looking up ${data.length} records from braxreportsDB`);
        console.log(`[DEBUG] Sample lookup keys: ${lookupKeys.substring(0, 200)}`);

        // Get separate connection to braxreportsDB
        const braxPool = await getBraxConnection();

        // Query job tracking data from braxreportsDB
        // Use dbswip for curtain_tracks, dbsproduction for other tables
        const viewName = table === 'curtain_tracks' ? '[dbo].[dbswip]' : '[dbo].[dbsproduction]';
        const trackingQuery = `
          SELECT
            [Buz and Line No.],
            [ProductionStatus],
            [InstallationStatus],
            [DateScheduled]
          FROM ${viewName}
          WHERE [Buz and Line No.] IN (${lookupKeys})
        `;

        const trackingResult = await braxPool.request().query(trackingQuery);

        console.log(`[DEBUG] Found ${trackingResult.recordset.length} matching records in braxreportsDB`);

        // Create lookup map for tracking data
        const trackingMap = new Map();
        trackingResult.recordset.forEach((row: any) => {
          trackingMap.set(row['Buz and Line No.'], {
            job_tracking_action: row.ProductionStatus || '',
            dispatch_action: row.InstallationStatus || '',
            dispatch_date: row.DateScheduled || null,
          });
        });

        // Merge tracking data into component data
        data = data.map((row: any) => ({
          ...row,
          job_tracking_action: trackingMap.get(`${row.quote_no} ${row.line_no}`)?.job_tracking_action || '',
          dispatch_action: trackingMap.get(`${row.quote_no} ${row.line_no}`)?.dispatch_action || '',
          dispatch_date: trackingMap.get(`${row.quote_no} ${row.line_no}`)?.dispatch_date || null,
        }));
      } catch (trackingError) {
        console.error('[ERROR] Error fetching tracking data:', trackingError);
        // Continue without tracking data if there's an error
        data = data.map((row: any) => ({
          ...row,
          job_tracking_action: '',
          dispatch_action: '',
          dispatch_date: null,
        }));
      }
    } else if (!TABLES_WITH_JOB_TRACKING.includes(table)) {
      // For Curtain Tracks, add empty tracking fields
      data = data.map((row: any) => ({
        ...row,
        job_tracking_action: '',
        dispatch_action: '',
        dispatch_date: null,
      }));
    }

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
