import { BaseCalculator, JobSheetOutput, CalculatorOptions } from './BaseCalculator.js';

export class RollerShuttersCalculator extends BaseCalculator {
  async calculate(
    orderItemPkId: string,
    options: CalculatorOptions,
    itemWidth: number,
    itemHeight: number,
    fabricName: string
  ): Promise<JobSheetOutput> {
    const shutterType = this.bpLookup(options, 'SHUTTERTYPE', 'Security');
    const material = this.bpLookup(options, 'MATERIAL', 'Aluminium');
    const color = this.bpLookup(options, 'COLOR', 'White');
    const slats = this.bpLookup(options, 'SLATS', 'Solid');
    const motor = this.bpLookup(options, 'MOTOR', 'Manual');

    // Shutter blade width (standard: 77mm)
    const bladeWidth = 77;
    const numBlades = Math.floor(itemHeight / bladeWidth);

    // Deduction for tracks (left and right: 114mm total)
    const shutterWidth = itemWidth - 114;
    const shutterHeight = itemHeight - 50; // Top and bottom clearance

    // Tube diameter (standard: 76mm for standard shutters)
    const tubeDiameter = shutterType === 'Security' ? 89 : 76;

    return {
      A_OrderItemPkId: orderItemPkId,
      B_FabricName: fabricName,
      C_EnteredWidth: itemWidth,
      D_EnteredHeight: itemHeight,
      E_ShutterType: shutterType,
      F_Material: material,
      G_Color: color,
      H_Slats: slats,
      I_Motor: motor,
      K_BladeWidth: bladeWidth,
      L_NumberOfBlades: numBlades,
      M_ShutterWidth: shutterWidth,
      N_ShutterHeight: shutterHeight,
      O_TubeDiameter: tubeDiameter,
      P_Status: 'Complete'
    };
  }
}
