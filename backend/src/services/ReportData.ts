import { getConnection, getBraxConnection } from '../db.js';
import { getDoorScreenPage } from './jobsheet/DoorScreenReport.js';

/**
 * Rows for each Components Report table, exactly as the page shows them.
 * Shared by /api/data, /api/summary and the Data Analyst so they always agree.
 *  - door_screen_components: calculated from braxreportsDB (dbsproduction + SalesOrderOptions_DASON)
 *  - other tables: their current ComponentsReport tables, until each product's engine is built
 */

export const VALID_TABLES = [
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

export function sanitizeTableName(table: string): string {
  if (!VALID_TABLES.includes(table)) {
    return 'door_screen_components';
  }
  return table;
}

/** Rows for a report table, as the page shows them (job tracking merged in). */
export async function fetchTableData(table: string, skip: number, take: number, search: string): Promise<{ data: any[]; total: number }> {
  let data: any[];
  let total: number;

  if (table === 'door_screen_components') {
    // Calculated from BUZ (SalesOrderOptions_DASON) via the job sheet engine, refreshed on each load
    ({ data, total } = await getDoorScreenPage(await getBraxConnection(), { skip, take, search }));
  } else {
    const pool = await getConnection();

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
    total = countResult.recordset[0]?.total || 0;

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

    data = finalResult.recordset;
  }

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

  return { data, total };
}
