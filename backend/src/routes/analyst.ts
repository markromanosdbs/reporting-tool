import { Router, Request, Response } from 'express';
import { getConnection, getBraxConnection } from '../db.js';

const router = Router();

// Product code mappings for each table
const PRODUCT_CODE_MAP: { [key: string]: string[] } = {
  'curtain_tracks': ['CTRA', 'CURT'],
  'squalonet_retractable_screens': ['SQNT'],
  'panel_glides': ['PANG'],
  'external_blinds_components': ['AUTO', 'SDPB', 'FGSUN', 'VERTC', 'PAAW', 'WIRG'],
  'roller_shutter_components': ['RLSH'],
  'door_screen_components': ['SECD', 'GRIL'],
  'roller_blind_components': ['ROLL'],
};

interface AnalysisResult {
  table: string;
  missingJobs: Array<{
    buzNo: string;
    lineNo: number;
    inventoryItem: string;
    message: string;
  }>;
  completedJobs: Array<{
    buzNo: string;
    lineNo: number;
    inventoryItem: string;
    productionStatus: string;
    message: string;
  }>;
  totalIssues: number;
}

// Check if InventoryItem contains any of the product codes
function hasProductCode(inventoryItem: string, productCodes: string[]): boolean {
  return productCodes.some(code => inventoryItem.includes(code));
}

// Analyze a specific table for data quality issues
router.post('/analyst/analyze', async (req: Request, res: Response) => {
  try {
    const { table } = req.body;

    if (!Object.keys(PRODUCT_CODE_MAP).includes(table)) {
      return res.status(400).json({ error: 'Invalid table name' });
    }

    const pool = await getConnection();
    const braxPool = await getBraxConnection();

    // Get all records from current table
    const tableQuery = `SELECT quote_no, line_no FROM ${table}`;
    const tableResult = await pool.request().query(tableQuery);
    const currentTableRecords = tableResult.recordset || [];

    // Get all records from dbsproduction view
    const inventoryQuery = `
      SELECT DISTINCT [Buz and Line No.], [InventoryItem], [ProductionStatus]
      FROM [dbsproduction]
      WHERE [Buz and Line No.] IS NOT NULL AND [InventoryItem] IS NOT NULL
    `;
    const inventoryResult = await braxPool.request().query(inventoryQuery);
    const inventoryRecords = inventoryResult.recordset || [];

    const productCodes = PRODUCT_CODE_MAP[table];
    const missingJobs: AnalysisResult['missingJobs'] = [];
    const completedJobs: AnalysisResult['completedJobs'] = [];

    // Check for missing jobs and completed jobs
    inventoryRecords.forEach((inv: any) => {
      // Only process records with matching product codes
      if (!hasProductCode(inv.InventoryItem, productCodes)) {
        return;
      }

      // Parse "Buz and Line No." format: "40426.A 1" -> buzNo: "40426.A", lineNo: 1
      const buzAndLineStr = String(inv['Buz and Line No.']).trim();
      const parts = buzAndLineStr.split(/\s+/);
      const buzNo = parts[0]; // e.g., "40426.A"
      const lineNo = parseInt(parts[1] || '0', 10); // e.g., 1

      const existsInTable = currentTableRecords.some(
        (record: any) =>
          String(record.quote_no).trim() === buzNo &&
          record.line_no === lineNo
      );

      if (!existsInTable) {
        // Missing job
        missingJobs.push({
          buzNo: buzNo,
          lineNo: lineNo,
          inventoryItem: inv.InventoryItem,
          message: `Hey, this job is missing here. Need uploading?`,
        });
      } else if (inv.ProductionStatus === 'Completed') {
        // Completed job still in table
        completedJobs.push({
          buzNo: buzNo,
          lineNo: lineNo,
          inventoryItem: inv.InventoryItem,
          productionStatus: inv.ProductionStatus,
          message: `Hey, this job is already completed, the auto update didn't work?`,
        });
      }
    });

    const result: AnalysisResult = {
      table,
      missingJobs,
      completedJobs,
      totalIssues: missingJobs.length + completedJobs.length,
    };

    res.json(result);
  } catch (error) {
    console.error('Error analyzing table:', error);
    res.status(500).json({ error: 'Failed to analyze table' });
  }
});

export default router;
