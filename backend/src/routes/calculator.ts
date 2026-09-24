import { Router, Request, Response } from 'express';
import sql from 'mssql';
import { getConnection, getBraxConnection } from '../db.js';
import { RollerBlindsCalculator } from '../services/RollerBlindsCalculator.js';
import { CurtainTracksCalculator } from '../services/CurtainTracksCalculator.js';
import { ExternalBlindsCalculator } from '../services/ExternalBlindsCalculator.js';
import { RollerShuttersCalculator } from '../services/RollerShuttersCalculator.js';
import { SqualonetCalculator } from '../services/SqualonetCalculator.js';
import { PanelGlidesCalculator } from '../services/PanelGlidesCalculator.js';
import { ComponentsMapper } from '../services/ComponentsMapper.js';
import { calculateDoorScreenLine } from '../services/jobsheet/DoorScreenJobSheet.js';
import { persistDoorScreen, syncDoorScreen, doorScreenWritesEnabled } from '../services/jobsheet/DoorScreenSync.js';

const router = Router();

let doorScreenSyncRunning = false;

/**
 * POST /api/sync/door-screen
 * Calculate every SECD/GRIL line in dbsproduction into ComponentsReport_DoorScreen
 * and remove rows for lines no longer in production.
 */
router.post('/sync/door-screen', async (_req: Request, res: Response) => {
  if (!doorScreenWritesEnabled()) {
    return res.status(403).json({ error: 'Door Screen SQL writes are disabled (DOORSCREEN_WRITE_TO_SQL is not true)' });
  }
  if (doorScreenSyncRunning) return res.status(409).json({ error: 'Door Screen sync already running' });
  doorScreenSyncRunning = true;
  try {
    const report = await syncDoorScreen(await getBraxConnection(), s => console.log(`[door-screen sync] ${s}`));
    res.json(report);
  } catch (error) {
    console.error('Door Screen sync failed:', error);
    res.status(500).json({ error: 'Door Screen sync failed', details: String(error) });
  } finally {
    doorScreenSyncRunning = false;
  }
});

// Product code to table and calculator mapping
const PRODUCT_MAPPING: { [key: string]: { table: string; productType: string } } = {
  'ROLL': { table: 'ComponentsReport_RollerBlinds', productType: 'roller_blind_components' },
  'CURT': { table: 'ComponentsReport_CurtainTracks', productType: 'curtain_tracks' },
  'CTRA': { table: 'ComponentsReport_CurtainTracks', productType: 'curtain_tracks' },
  'SQNT': { table: 'ComponentsReport_SqualonetScreens', productType: 'squalonet_retractable_screens' },
  'PANG': { table: 'ComponentsReport_PanelGlides', productType: 'panel_glides' },
  'AUTO': { table: 'ComponentsReport_ExternalBlinds', productType: 'external_blinds_components' },
  'SDPB': { table: 'ComponentsReport_ExternalBlinds', productType: 'external_blinds_components' },
  'FGSUN': { table: 'ComponentsReport_ExternalBlinds', productType: 'external_blinds_components' },
  'VERTC': { table: 'ComponentsReport_ExternalBlinds', productType: 'external_blinds_components' },
  'PAAW': { table: 'ComponentsReport_ExternalBlinds', productType: 'external_blinds_components' },
  'WIRG': { table: 'ComponentsReport_ExternalBlinds', productType: 'external_blinds_components' },
  'RLSH': { table: 'ComponentsReport_RollerShutters', productType: 'roller_shutter_components' },
  'SECD': { table: 'ComponentsReport_DoorScreen', productType: 'door_screen_components' },
  'GRIL': { table: 'ComponentsReport_DoorScreen', productType: 'door_screen_components' },
};

/**
 * Determine product type from inventory description
 * Product code is first 4 characters (e.g., "ROLL Texstyle..." → "ROLL")
 */
function getProductCode(inventoryDescn: string): string | null {
  if (!inventoryDescn) return null;
  const code = inventoryDescn.substring(0, 4).toUpperCase();
  return PRODUCT_MAPPING[code] ? code : null;
}

/**
 * POST /api/calculate
 * Calculate components for any order line (routes to product-specific calculator)
 */
router.post('/calculate', async (req: Request, res: Response) => {
  try {
    const { orderItemPkId } = req.body;

    if (!orderItemPkId) {
      return res.status(400).json({ error: 'orderItemPkId is required' });
    }

    const braxPool = await getBraxConnection();

    // Debug: Check who's actually connected
    const whoAmIResult = await braxPool.request().query('SELECT CURRENT_USER as CurrentUser, SYSTEM_USER as SystemUser, USER_NAME() as UserName');
    console.log('🔐 Connected as:', whoAmIResult.recordset[0]);

    // Fetch order options from SalesOrderOptions_DASON
    const optionsResult = await braxPool.request()
      .input('pkId', sql.VarChar, orderItemPkId)
      .query(`
        SELECT * FROM [dbo].[SalesOrderOptions_DASON]
        WHERE [OrderItemPkId] = @pkId
      `);

    if (optionsResult.recordset.length === 0) {
      return res.status(404).json({ error: 'Order item not found' });
    }

    // Build options map from the result set
    const optionsData = optionsResult.recordset;
    const optionsMap: { [key: string]: string | null } = {};

    for (const row of optionsData) {
      const optionCode = row.OptionCode?.toUpperCase();
      const optionValue = row.OptionValue;

      if (optionCode) {
        optionsMap[optionCode] = optionValue;
      }
    }

    // Extract dimensions and product info from first row
    const firstRow = optionsData[0];
    const itemWidth = parseInt(firstRow?.ItemWidth || '0', 10);
    const itemHeight = parseInt(firstRow?.ItemHeight || '0', 10);
    const fabricName = firstRow?.InventoryDescn || 'Unknown Fabric';

    // Determine product type from Item Code
    const productCode = getProductCode(fabricName);
    if (!productCode || !PRODUCT_MAPPING[productCode]) {
      return res.status(400).json({ error: 'Unknown product type from Item Code' });
    }

    const { table: componentsTable, productType } = PRODUCT_MAPPING[productCode];

    // Door & Screen: calculated with the real BUZ job sheet formulas (see services/jobsheet)
    if (productCode === 'SECD' || productCode === 'GRIL') {
      const result = await calculateDoorScreenLine(braxPool, optionsData);
      const persisted = doorScreenWritesEnabled();
      if (persisted) await persistDoorScreen(braxPool, orderItemPkId, result);
      return res.json({
        success: true,
        orderItemPkId,
        productCode,
        productType,
        componentsTable,
        base: result.base,
        componentCount: Object.keys(result.components).length,
        components: result.components,
        warnings: result.warnings,
        persisted,
        message: persisted ? 'Calculation completed and persisted' : 'Calculation completed (not saved: SQL writes disabled)',
      });
    }

    // Route to appropriate calculator based on product type
    let jobSheetOutput: any;

    try {
      switch (productCode) {
        case 'ROLL':
          jobSheetOutput = await new RollerBlindsCalculator().calculate(
            orderItemPkId, optionsMap, itemWidth, itemHeight, fabricName
          );
          break;
        case 'CTRA':
        case 'CURT':
          jobSheetOutput = await new CurtainTracksCalculator().calculate(
            orderItemPkId, optionsMap, itemWidth, itemHeight, fabricName
          );
          break;
        case 'AUTO':
        case 'SDPB':
        case 'FGSUN':
        case 'VERTC':
        case 'PAAW':
        case 'WIRG':
          jobSheetOutput = await new ExternalBlindsCalculator().calculate(
            orderItemPkId, optionsMap, itemWidth, itemHeight, fabricName
          );
          break;
        case 'RLSH':
          jobSheetOutput = await new RollerShuttersCalculator().calculate(
            orderItemPkId, optionsMap, itemWidth, itemHeight, fabricName
          );
          break;
        case 'SQNT':
          jobSheetOutput = await new SqualonetCalculator().calculate(
            orderItemPkId, optionsMap, itemWidth, itemHeight, fabricName
          );
          break;
        case 'PANG':
          jobSheetOutput = await new PanelGlidesCalculator().calculate(
            orderItemPkId, optionsMap, itemWidth, itemHeight, fabricName
          );
          break;
        default:
          return res.status(400).json({
            error: 'Unknown product type',
            productCode,
            orderItemPkId
          });
      }
    } catch (calcError) {
      console.error(`Error in ${productCode} calculator:`, calcError);
      throw calcError;
    }

    // Other products: their job sheet engines aren't built yet, so nothing is saved.
    // Each product gets saving (behind its own write switch) when it is rebuilt.

    res.json({
      success: true,
      orderItemPkId,
      productCode,
      productType,
      componentsTable,
      jobSheet: jobSheetOutput,
      persisted: false,
      message: 'Calculation completed (not saved: engine for this product not built yet)'
    });

  } catch (error) {
    console.error('Error calculating components:', error);
    res.status(500).json({ error: 'Calculation failed', details: String(error) });
  }
});

/**
 * DEBUG: GET /api/persisted/:orderId
 * Returns persisted data for an order
 */
router.get('/persisted/:orderId', async (req: Request, res: Response) => {
  try {
    const braxPool = await getBraxConnection();
    const { orderId } = req.params;

    const result = await braxPool.request()
      .input('pkId', sql.UniqueIdentifier, orderId)
      .query(`
        SELECT * FROM ComponentsReport_DoorScreen
        WHERE OrderItemPkId = @pkId
      `);

    if (result.recordset.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const record = result.recordset[0];
    const allColumns = Object.keys(record);
    const nonZeroValues = Object.entries(record)
      .filter(([key, val]) => val !== null && val !== 0 && val !== '')
      .reduce((acc, [key, val]) => { acc[key] = val; return acc; }, {} as any);

    res.json({
      orderId,
      totalColumns: allColumns.length,
      nonZeroCount: Object.keys(nonZeroValues).length,
      nonZeroValues: nonZeroValues
    });

  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

/**
 * DEBUG: GET /api/schema/door-screen
 * Returns all column names in ComponentsReport_DoorScreen table
 */
router.get('/schema/door-screen', async (req: Request, res: Response) => {
  try {
    const braxPool = await getBraxConnection();

    const result = await braxPool.request().query(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'ComponentsReport_DoorScreen'
      AND TABLE_SCHEMA = 'dbo'
      ORDER BY ORDINAL_POSITION
    `);

    const columns = result.recordset.map(r => r.COLUMN_NAME);

    // Analyze patterns
    const colorColumns = columns.filter(c =>
      /paperbark|white|black|monument|dune|surfmist|grey|brown|ocean|jasper|eucalypt|primrose|silver|powdercoat/i.test(c)
    );

    res.json({
      totalColumns: columns.length,
      colorRelatedColumns: colorColumns.length,
      allColumns: columns,
      colorColumns: colorColumns
    });

  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

export default router;
