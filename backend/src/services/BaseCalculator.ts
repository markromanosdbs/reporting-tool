export interface JobSheetOutput {
  [key: string]: any;
}

export interface CalculatorOptions {
  [key: string]: string | null;
}

export abstract class BaseCalculator {
  abstract calculate(
    orderItemPkId: string,
    options: CalculatorOptions,
    itemWidth: number,
    itemHeight: number,
    fabricName: string
  ): Promise<JobSheetOutput>;

  protected bpLookup(
    options: CalculatorOptions,
    fieldCode: string,
    defaultValue: string = ''
  ): string {
    const key = fieldCode.toUpperCase();
    const value = options[key];

    if (value === null || value === undefined || value === '') {
      return defaultValue;
    }

    const pipeIndex = value.indexOf('|');
    if (pipeIndex > 0) {
      return value.substring(0, pipeIndex);
    }

    return value;
  }
}
