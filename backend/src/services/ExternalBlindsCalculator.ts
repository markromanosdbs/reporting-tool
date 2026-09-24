import { BaseCalculator, JobSheetOutput, CalculatorOptions } from './BaseCalculator.js';

export class ExternalBlindsCalculator extends BaseCalculator {
  async calculate(
    orderItemPkId: string,
    options: CalculatorOptions,
    itemWidth: number,
    itemHeight: number,
    fabricName: string
  ): Promise<JobSheetOutput> {
    const blindType = this.bpLookup(options, 'BLINDTYPE', 'Roller');
    const motorized = this.bpLookup(options, 'MOTORIZED', 'No');
    const color = this.bpLookup(options, 'COLOR', 'White');
    const mesh = this.bpLookup(options, 'MESH', 'No');
    const mounting = this.bpLookup(options, 'MOUNTING', 'Face');

    // Blade width calculation (standard: 25mm per blade)
    const bladeWidth = 25;
    const numBlades = Math.floor(itemWidth / bladeWidth);

    // Slat spacing (for adjustable systems)
    const slatSpacing = blindType === 'Venetian' ? 16 : 0;

    // Motor cover dimensions (if motorized)
    const motorCoverWidth = motorized === 'Yes' ? itemWidth + 50 : 0;

    return {
      A_OrderItemPkId: orderItemPkId,
      B_FabricName: fabricName,
      C_EnteredWidth: itemWidth,
      D_EnteredHeight: itemHeight,
      E_BlindType: blindType,
      F_Motorized: motorized,
      G_Color: color,
      H_Mesh: mesh,
      I_Mounting: mounting,
      K_BladeWidth: bladeWidth,
      L_NumberOfBlades: numBlades,
      M_SlatSpacing: slatSpacing,
      N_MotorCoverWidth: motorCoverWidth,
      O_Status: 'Complete'
    };
  }
}
