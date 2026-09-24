import { BaseCalculator, JobSheetOutput, CalculatorOptions } from './BaseCalculator.js';

export class SqualonetCalculator extends BaseCalculator {
  async calculate(
    orderItemPkId: string,
    options: CalculatorOptions,
    itemWidth: number,
    itemHeight: number,
    fabricName: string
  ): Promise<JobSheetOutput> {
    const screenType = this.bpLookup(options, 'SCREENTYPE', 'Retractable');
    const color = this.bpLookup(options, 'COLOR', 'White');
    const fabric = this.bpLookup(options, 'FABRIC', 'Fiberglass');
    const motorized = this.bpLookup(options, 'MOTORIZED', 'No');

    // Frame deductions (standard: 80mm width, 60mm height)
    const screenWidth = itemWidth - 160; // 80mm each side
    const screenHeight = itemHeight - 120; // 60mm top and bottom

    // Fabric dimensions (with 10mm seam allowance)
    const fabricWidth = screenWidth + 20;
    const fabricHeight = screenHeight + 20;

    // Roller dimensions for retractable systems
    const rollerDiameter = motorized === 'Yes' ? 76 : 60;

    return {
      A_OrderItemPkId: orderItemPkId,
      B_FabricName: fabricName,
      C_EnteredWidth: itemWidth,
      D_EnteredHeight: itemHeight,
      E_ScreenType: screenType,
      F_Color: color,
      G_Fabric: fabric,
      H_Motorized: motorized,
      J_ScreenWidth: screenWidth,
      K_ScreenHeight: screenHeight,
      L_FabricWidth: fabricWidth,
      M_FabricHeight: fabricHeight,
      N_RollerDiameter: rollerDiameter,
      O_Status: 'Complete'
    };
  }
}
