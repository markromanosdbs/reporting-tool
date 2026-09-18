import fs from 'fs';
import path from 'path';
import csv from 'csv-parse/sync';

/**
 * Generate SQL INSERT statements from lookup CSV files
 * Run: npx ts-node backend/src/scripts/generateLookupDataSQL.ts
 * Output: lookup_data_inserts.sql (copy into SSMS)
 */

const lookupTablesDir = path.join(process.cwd(), 'calculation_logic/RollerBlinds/lookup_tables');

interface CSVMapping {
  filename: string;
  tableName: string;
  columnMappings: string[]; // Maps CSV column index to SQL column name
}

// Define how to map each critical CSV to its SQL table
const csvMappings: CSVMapping[] = [
  {
    filename: 'ControlDeduct.csv',
    tableName: 'LookupTable_ControlDeduct',
    columnMappings: ['Control', 'TubeDeduction', 'HasMotor', 'MotorExtras']
  },
  {
    filename: 'BlindFinish.csv',
    tableName: 'LookupTable_BlindFinish',
    columnMappings: ['FinishType', 'DropAllowance']
  },
  {
    filename: 'TubeDropAllowance.csv',
    tableName: 'LookupTable_TubeDropAllowance',
    columnMappings: ['TubeType', 'DropAllowance']
  },
  {
    filename: 'ColourMatch.csv',
    tableName: 'LookupTable_ColourMatch',
    columnMappings: ['FabricName', 'IsStockFabric', 'BottomRailColour', 'RailBracketColour',
                     'ChainColour', 'ColourReference', 'Reserved1', 'MatchFlag',
                     'ProductCode1', 'ProductCode2', 'Reserved2', 'Reserved3']
  },
  {
    filename: 'Linkdeduct.csv',
    tableName: 'LookupTable_Linkdeduct',
    columnMappings: ['LinkType', 'Deduction']
  },
  {
    filename: 'Pelmetadd.csv',
    tableName: 'LookupTable_Pelmetadd',
    columnMappings: ['AddType', 'WidthAddition']
  },
  {
    filename: 'HelperSpring.csv',
    tableName: 'LookupTable_HelperSpring',
    columnMappings: ['Config', 'SpringRequired']
  },
  {
    filename: 'Spring.csv',
    tableName: 'LookupTable_Spring',
    columnMappings: ['SpringType', 'Col2']
  }
];

function sqlEscape(value: any): string {
  if (value === null || value === undefined || value === '') {
    return 'NULL';
  }

  const str = String(value).trim();

  if (str === '') return 'NULL';
  if (str === 'True' || str === 'true') return '1';
  if (str === 'False' || str === 'false') return '0';

  // Try to parse as number
  const num = Number(str);
  if (!isNaN(num) && str !== '') {
    return str;
  }

  // Escape single quotes
  return `'${str.replace(/'/g, "''")}'`;
}

function generateInsertSQL(csvMapping: CSVMapping): string[] {
  const csvPath = path.join(lookupTablesDir, csvMapping.filename);

  if (!fs.existsSync(csvPath)) {
    console.warn(`⚠️  File not found: ${csvPath}`);
    return [];
  }

  const fileContent = fs.readFileSync(csvPath, 'utf-8');
  const records = csv.parse(fileContent, {
    columns: false,
    skip_empty_lines: true,
    trim: true
  });

  const inserts: string[] = [];

  // Build column list
  const columnList = csvMapping.columnMappings.map(col => `[${col}]`).join(', ');

  for (const record of records) {
    // Filter out completely empty rows
    if (!record || record.every((v: any) => !v || v === '')) {
      continue;
    }

    // Build values list
    const values = csvMapping.columnMappings
      .map((_, idx) => sqlEscape(record[idx]))
      .join(', ');

    inserts.push(`INSERT INTO [dbo].[${csvMapping.tableName}] (${columnList}) VALUES (${values})`);
  }

  return inserts;
}

async function main() {
  console.log('📝 Generating SQL INSERT statements from lookup CSVs...\n');

  const allInserts: string[] = [];
  let totalRows = 0;

  for (const mapping of csvMappings) {
    console.log(`📄 Processing ${mapping.filename}...`);
    const inserts = generateInsertSQL(mapping);
    console.log(`   ✓ Generated ${inserts.length} INSERT statements`);
    allInserts.push(`-- ${mapping.filename} -> ${mapping.tableName}`);
    allInserts.push(...inserts);
    allInserts.push('');
    totalRows += inserts.length;
  }

  // Write to output file
  const outputPath = path.join(process.cwd(), 'lookup_data_inserts.sql');
  const header = `-- Lookup table data imports for Roller Blinds calculation engine
-- Generated automatically from CSV files
-- Paste into SSMS against braxreportsDB

SET IDENTITY_INSERT OFF
GO

`;

  const sqlContent = header + allInserts.join('\n') + '\n\nPRINT \'Lookup data imported successfully - ' + totalRows + ' rows\'';

  fs.writeFileSync(outputPath, sqlContent, 'utf-8');

  console.log(`\n✅ Complete! Generated ${totalRows} INSERT statements`);
  console.log(`📂 Output file: ${outputPath}`);
  console.log('\n📋 Next: Copy the contents of lookup_data_inserts.sql into SSMS and execute');
}

main().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
