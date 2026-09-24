import { BaseCalculator, JobSheetOutput, CalculatorOptions } from './BaseCalculator.js';

export class CurtainTracksCalculator extends BaseCalculator {
  async calculate(
    orderItemPkId: string,
    options: CalculatorOptions,
    itemWidth: number,
    itemHeight: number,
    fabricName: string
  ): Promise<JobSheetOutput> {
    const trackType = this.bpLookup(options, 'TRACKTYPE', 'Cornice');
    const material = this.bpLookup(options, 'MATERIAL', 'Aluminium');
    const color = this.bpLookup(options, 'COLOR', 'White');
    const drapes = this.bpLookup(options, 'DRAPES', 'Single');

    const trackWidth = itemWidth + 50;
    const numBrackets = Math.ceil((trackWidth + 50) / 400);

    return {
      A_OrderItemPkId: orderItemPkId,
      B_FabricName: fabricName,
      C_EnteredWidth: itemWidth,
      D_EnteredHeight: itemHeight,
      E_TrackType: trackType,
      F_Material: material,
      G_Color: color,
      H_Drapes: drapes,
      K_TrackWidth: trackWidth,
      M_NumberOfBrackets: numBrackets,
      P_CurtainDrop: itemHeight,
      Q_Status: 'Complete'
    };
  }
}
