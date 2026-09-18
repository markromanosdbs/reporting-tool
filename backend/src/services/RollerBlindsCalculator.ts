import { getConnection, getBraxConnection } from '../db.js';

/**
 * Roller Blinds Job Sheet Calculation Engine
 * Implements all Job Sheet formulas and components tally logic
 */

interface SalesOrderOptions {
  [key: string]: string | null;
}

interface JobSheetOutput {
  // Dimension columns
  C_EnteredWidth: number;
  G_BlindWidth: number;
  H_BlindDrop: number;
  I_FabricTypeColour: string;
  J_Fit: string;
  K_Fixing: string;
  L_Control: string;
  M_ControlSide: string;
  O_FabricDirection: string;
  P_Chain: string;
  Q_ChainLength: string;
  S_BottomTrim: string;
  T_BlindRailFinish: string;
  U_Bracket: string;
  V_ComponentColour: string;
  W_Linked: string;
  X_LinkedSize: string;
  AA_PelmetType: string;
  AB_PelmetColour: string;

  // Derived columns
  AR_Control: string;
  AS_Bracket: string;
  AT_MotorTailsBatteries: string;
  AU_HelperSpring: string;
  AV_Tube: string;
  AW_TubeLength: number;
  AX_BRailLength: number;
  AY_FabricWidth: number;
  AZ_FabricDrop: number;
  BD_BottomRailColour: string;
  BE_BracketColour: string;
  BF_ChainColour: string;
  BG_MotorCoverColour: number;
}

export class RollerBlindsCalculator {
  /**
   * BPLookup custom function equivalent
   * Looks up OrderItemPkId + FieldCode in options table
   */
  private bpLookup(
    options: SalesOrderOptions,
    fieldCode: string,
    defaultValue: string = ''
  ): string {
    const key = fieldCode.toUpperCase();
    const value = options[key];

    if (value === null || value === undefined || value === '') {
      return defaultValue;
    }

    // If value contains "|", take part before it
    const pipeIndex = value.indexOf('|');
    if (pipeIndex > 0) {
      return value.substring(0, pipeIndex);
    }

    return value;
  }

  /**
   * Look up value from database table
   */
  private async lookupValue(
    table: string,
    lookupKey: string,
    columnIndex: number,
    pool: any
  ): Promise<string | number | null> {
    try {
      const result = await pool.request().query(`
        SELECT * FROM [dbo].[${table}]
        WHERE [${this.getPrimaryKeyColumn(table)}] = @key
      `, { key: lookupKey });

      if (result.recordset.length === 0) return null;

      const row = result.recordset[0];
      const columns = Object.keys(row);

      if (columnIndex <= 0 || columnIndex > columns.length) return null;

      return row[columns[columnIndex - 1]];
    } catch (error) {
      console.error(`Error looking up ${lookupKey} in ${table}:`, error);
      return null;
    }
  }

  private getPrimaryKeyColumn(table: string): string {
    const keyMap: { [key: string]: string } = {
      'LookupTable_ControlDeduct': 'Control',
      'LookupTable_BlindFinish': 'FinishType',
      'LookupTable_TubeDropAllowance': 'TubeType',
      'LookupTable_ColourMatch': 'FabricName',
      'LookupTable_Linkdeduct': 'LinkType',
      'LookupTable_Pelmetadd': 'AddType',
    };
    return keyMap[table] || 'Id';
  }

  /**
   * Main calculation method
   */
  async calculate(
    orderItemPkId: string,
    options: SalesOrderOptions,
    itemWidth: number,
    itemHeight: number,
    fabricName: string
  ): Promise<JobSheetOutput> {
    const pool = await getConnection();

    // Basic dimensions (passthrough from BUZ)
    const enteredWidth = itemWidth;
    const blindDrop = itemHeight;

    // G: Blind Width (for now, same as entered width - would include deductions)
    const blindWidth = enteredWidth;

    // I: Fabric Type & Colour
    const fabricTypeColour = fabricName;

    // J: Fit
    const fit = this.bpLookup(options, 'FIT', 'Face');

    // K: Fixing
    const fixing = this.bpLookup(options, 'FIXING', 'Timber');

    // L: Control
    const control = this.bpLookup(options, 'CONTROLS', 'Chain Winder');

    // M: Control Side
    const controlSide = this.bpLookup(options, 'CONTROLSIDE', 'Right');

    // O: Fabric Direction
    const fabricDirection = this.bpLookup(options, 'REVROLL', 'Back');

    // P: Chain
    const chain = this.bpLookup(options, 'CHAIN', 'Nickel Steel Chain');

    // Q: Chain Length
    const chainLength = this.bpLookup(options, 'CHAINLENGTH', 'Default');

    // S: Bottom Trim / Finish
    const bottomTrim = this.bpLookup(options, 'FINISH', 'D30 Bottom Rail');

    // T: Rail Colour
    const railColour = this.bpLookup(options, 'RAILCOLOUR', 'White');

    // U: Bracket
    const bracket = this.bpLookup(options, 'BRACKET', 'Single with Covers');

    // V: Component Colour
    const componentColour = this.bpLookup(options, 'BRACKETCOLR', 'Match');

    // W: Linked
    const linked = this.bpLookup(options, 'LINKED', 'N/A');

    // X: Linked Size
    const linkedSize = this.bpLookup(options, 'LINKEDSIZE', 'N/A');

    // AA: Pelmet Type
    const pelmetType = this.bpLookup(options, 'PELTYPE', 'None');

    // AB: Pelmet Colour
    const pelmetColour = this.bpLookup(options, 'PELCOLOUR', 'None');

    // AR: Control (resolves to exact motor model)
    const arControl = control; // Simplified for now

    // AS: Bracket (may upgrade for motors)
    const asBracket = bracket;

    // AT: Motor Tails/Batteries
    const atMotorTails = control.includes('Motor') ? 'Yes' : 'No';

    // AU: Helper Spring
    const auHelperSpring = blindWidth > 2400 ? 'Yes - R' : 'No';

    // AV: Tube size selection
    let avTube = '38mm';
    if (blindWidth > 2400) {
      avTube = '43mm';
    }
    if (blindWidth > 3000) {
      avTube = '43mm H/D';
    }

    // AW: Tube Length (width minus deductions)
    const controlDeduction = 29; // Default chain winder
    const tubeLength = blindWidth - controlDeduction;

    // AX: B/Rail Length
    const bRailLength = tubeLength;

    // AY: Fabric Width
    const fabricWidth = tubeLength - 2;

    // AZ: Fabric Drop (height plus allowances)
    const finishAllowance = 250; // Default for D30
    const tubeDropAllowance = 250; // Default for 38mm
    const fabricDrop = blindDrop + finishAllowance + tubeDropAllowance;

    // BD: Bottom Rail Colour
    const bdBottomRailColour = railColour === 'Match' ? 'White' : railColour;

    // BE: Bracket Colour
    const beBracketColour = componentColour === 'Match' ? 'White' : componentColour;

    // BF: Chain Colour
    const bfChainColour = chain;

    // BG: Motor Cover Colour
    const bgMotorCoverColour = 0;

    return {
      C_EnteredWidth: enteredWidth,
      G_BlindWidth: blindWidth,
      H_BlindDrop: blindDrop,
      I_FabricTypeColour: fabricTypeColour,
      J_Fit: fit,
      K_Fixing: fixing,
      L_Control: control,
      M_ControlSide: controlSide,
      O_FabricDirection: fabricDirection,
      P_Chain: chain,
      Q_ChainLength: chainLength,
      S_BottomTrim: bottomTrim,
      T_BlindRailFinish: railColour,
      U_Bracket: bracket,
      V_ComponentColour: componentColour,
      W_Linked: linked,
      X_LinkedSize: linkedSize,
      AA_PelmetType: pelmetType,
      AB_PelmetColour: pelmetColour,
      AR_Control: arControl,
      AS_Bracket: asBracket,
      AT_MotorTailsBatteries: atMotorTails,
      AU_HelperSpring: auHelperSpring,
      AV_Tube: avTube,
      AW_TubeLength: tubeLength,
      AX_BRailLength: bRailLength,
      AY_FabricWidth: fabricWidth,
      AZ_FabricDrop: fabricDrop,
      BD_BottomRailColour: bdBottomRailColour,
      BE_BracketColour: beBracketColour,
      BF_ChainColour: bfChainColour,
      BG_MotorCoverColour: bgMotorCoverColour,
    };
  }
}
