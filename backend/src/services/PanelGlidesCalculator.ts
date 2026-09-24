import { BaseCalculator, JobSheetOutput, CalculatorOptions } from './BaseCalculator.js';

export class PanelGlidesCalculator extends BaseCalculator {
  async calculate(
    orderItemPkId: string,
    options: CalculatorOptions,
    itemWidth: number,
    itemHeight: number,
    fabricName: string
  ): Promise<JobSheetOutput> {
    const numPanels = parseInt(this.bpLookup(options, 'NUMPANELS', '2'), 10) || 2;
    const fabric = this.bpLookup(options, 'FABRIC', 'Sheer');
    const color = this.bpLookup(options, 'COLOR', 'White');
    const trackColor = this.bpLookup(options, 'TRACKCOLOR', 'Chrome');

    // Panel width calculation (divide total width by number of panels)
    const panelWidth = itemWidth / numPanels;

    // Deductions: track brackets and hardware
    const trackDeduction = 50; // 50mm total for brackets and hardware
    const finalPanelWidth = Math.round(panelWidth - (trackDeduction / numPanels));

    // Fabric height (drop) with 50mm deduction for track
    const panelDrop = itemHeight - 50;

    // Track configuration: needs one track for every 2 panels
    const numTracks = Math.ceil(numPanels / 2);

    return {
      A_OrderItemPkId: orderItemPkId,
      B_FabricName: fabricName,
      C_EnteredWidth: itemWidth,
      D_EnteredHeight: itemHeight,
      E_NumberOfPanels: numPanels,
      F_Fabric: fabric,
      G_Color: color,
      H_TrackColor: trackColor,
      J_PanelWidth: Math.round(panelWidth),
      K_FinalPanelWidth: finalPanelWidth,
      L_PanelDrop: panelDrop,
      M_NumberOfTracks: numTracks,
      N_TrackLength: itemWidth,
      O_Status: 'Complete'
    };
  }
}
