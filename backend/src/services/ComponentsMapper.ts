import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * Maps the Door Screen Excel "Components" sheet to ComponentsReport_DoorScreen.
 *
 * Verified 1:1 positional mapping (1,011 of 1,011 columns, 0 mismatches):
 *   Excel Components column c (J=10 .. AMF=1020)  ->  SQL component column (c - 10)
 * SQL column names are the row-3 headers with SQL Server's per-name occurrence
 * suffix (Black, Black_2 ... Black_59) - the suffix is NOT a section number.
 * The mapping table lives in DOORSCREEN_POSITIONAL_MAPPING.json (generated from
 * the workbook + INFORMATION_SCHEMA).
 */
export interface ComponentColumnMapping {
  excelCol: number;
  section: string;
  header: string;
  supplier: string;
  sqlColumn: string;
}

const TEXT_COLUMNS = new Set(['Screen_Mesh_Size', 'Screen_Mesh_Type']);

export class ComponentsMapper {
  private static mapping: ComponentColumnMapping[] | null = null;

  static getMapping(): ComponentColumnMapping[] {
    if (!this.mapping) {
      const here = path.dirname(fileURLToPath(import.meta.url));
      const file = path.resolve(here, '../../DOORSCREEN_POSITIONAL_MAPPING.json');
      this.mapping = JSON.parse(fs.readFileSync(file, 'utf8'));
    }
    return this.mapping!;
  }

  static isTextColumn(sqlColumn: string): boolean {
    return TEXT_COLUMNS.has(sqlColumn);
  }
}
