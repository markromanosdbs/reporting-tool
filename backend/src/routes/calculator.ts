import { Router, Request, Response } from 'express';
import { getConnection, getBraxConnection } from '../db.js';
import { RollerBlindsCalculator } from '../services/RollerBlindsCalculator.js';

const router = Router();

/**
 * POST /api/calculator/roller-blinds
 * Calculate components for a Roller Blinds order line
 */
router.post('/calculator/roller-blinds', async (req: Request, res: Response) => {
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

    // Extract dimensions
    const itemWidth = parseInt(optionsMap['ITEMWIDTH'] || '0', 10);
    const itemHeight = parseInt(optionsMap['ITEMHEIGHT'] || '0', 10);
    const fabricName = optionsMap['INVENTORYDESCN'] || 'Unknown Fabric';

    // Run calculation
    const calculator = new RollerBlindsCalculator();
    const jobSheetOutput = await calculator.calculate(
      orderItemPkId,
      optionsMap,
      itemWidth,
      itemHeight,
      fabricName
    );

    // Insert/update in ComponentsReport_RollerBlinds
    const now = new Date();
    await pool.request().query(`
      IF EXISTS (SELECT 1 FROM [dbo].[ComponentsReport_RollerBlinds] WHERE [OrderItemPkId] = @pkId)
      BEGIN
        UPDATE [dbo].[ComponentsReport_RollerBlinds]
        SET [LastCalculatedDate] = @now
        WHERE [OrderItemPkId] = @pkId
      END
      ELSE
      BEGIN
        INSERT INTO [dbo].[ComponentsReport_RollerBlinds] ([OrderItemPkId], [LastCalculatedDate])
        VALUES (@pkId, @now)
      END
    `, { pkId: orderItemPkId, now });

    res.json({
      success: true,
      orderItemPkId,
      jobSheet: jobSheetOutput,
      message: 'Calculation completed successfully'
    });

  } catch (error) {
    console.error('Error calculating roller blinds:', error);
    res.status(500).json({ error: 'Calculation failed', details: String(error) });
  }
});

export default router;
