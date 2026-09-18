import { Router, Request, Response } from 'express';
import { getConnection, getBraxConnection } from '../db.js';
import { RollerBlindsCalculator } from '../services/RollerBlindsCalculator.js';

const router = Router();

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

    const pool = await getConnection();
    const braxPool = await getBraxConnection();

    // Fetch order options from SalesOrderOptions_DASON
    const optionsResult = await braxPool.request().query(`
      SELECT * FROM [dbo].[SalesOrderOptions_DASON]
      WHERE [OrderItemPkId] = @pkId
    `, { pkId: orderItemPkId });

    if (optionsResult.recordset.length === 0) {
      return res.status(404).json({ error: 'Order item not found' });
    }

    // Build options map from the result set
    const optionsData = optionsResult.recordset;
    const optionsMap: { [key: string]: string | null } = {};

    for (const row of optionsData) {
      const fieldCode = row.FieldCode?.toUpperCase();
      const value = row.FieldValue || row.StrValue;

      if (fieldCode) {
        optionsMap[fieldCode] = value;
      }
    }

    // Extract dimensions and product info
    const itemWidth = parseInt(optionsMap['ITEMWIDTH'] || '0', 10);
    const itemHeight = parseInt(optionsMap['ITEMHEIGHT'] || '0', 10);
    const fabricName = optionsMap['INVENTORYDESCN'] || 'Unknown Fabric';

    // Determine product type from Item Code
    const productCode = getProductCode(fabricName);
    if (!productCode || !PRODUCT_MAPPING[productCode]) {
      return res.status(400).json({ error: 'Unknown product type from Item Code' });
    }

    const { table: componentsTable, productType } = PRODUCT_MAPPING[productCode];

    // Route to appropriate calculator based on product type
    let jobSheetOutput: any;

    if (productCode === 'ROLL') {
      // Roller Blinds calculator
      const calculator = new RollerBlindsCalculator();
      jobSheetOutput = await calculator.calculate(
        orderItemPkId,
        optionsMap,
        itemWidth,
        itemHeight,
        fabricName
      );
    } else {
      // Other product types not yet implemented
      return res.status(501).json({
        error: 'Not yet implemented',
        message: `Calculation engine for ${productType} (${productCode}) is not yet available`,
        orderItemPkId,
        productCode,
      });
    }

    // Insert/update in the appropriate ComponentsReport table
    const now = new Date();
    await pool.request().query(`
      IF EXISTS (SELECT 1 FROM [dbo].[${componentsTable}] WHERE [OrderItemPkId] = @pkId)
      BEGIN
        UPDATE [dbo].[${componentsTable}]
        SET [LastCalculatedDate] = @now
        WHERE [OrderItemPkId] = @pkId
      END
      ELSE
      BEGIN
        INSERT INTO [dbo].[${componentsTable}] ([OrderItemPkId], [LastCalculatedDate])
        VALUES (@pkId, @now)
      END
    `, { pkId: orderItemPkId, now });

    res.json({
      success: true,
      orderItemPkId,
      productCode,
      productType,
      componentsTable,
      jobSheet: jobSheetOutput,
      message: 'Calculation completed successfully'
    });

  } catch (error) {
    console.error('Error calculating components:', error);
    res.status(500).json({ error: 'Calculation failed', details: String(error) });
  }
});

export default router;
