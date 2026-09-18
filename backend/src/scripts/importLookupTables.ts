import fs from 'fs';
import path from 'path';
import csv from 'csv-parse/sync';
import { getConnection } from '../db.js';

interface LookupTableConfig {
  csvPath: string;
  tableName: string;
  description: string;
}

/**
 * Import all lookup tables from CSVs to Azure SQL
 * Run: npx ts-node backend/src/scripts/importLookupTables.ts
 */

const lookupTablesDir = path.join(process.cwd(), 'calculation_logic/RollerBlinds/lookup_tables');

async function inferColumnTypes(data: any[]): Promise<{ name: string; type: string }[]> {
  if (!data || data.length === 0) return [];

  const firstRow = data[0];
  const columns: { name: string; type: string }[] = [];

  Object.keys(firstRow).forEach((key, index) => {
    const values = data.map(row => row[key]).filter(v => v !== null && v !== undefined && v !== '');

    let type = 'NVARCHAR(MAX)'; // default

    if (values.length > 0) {
      // Try to infer type
      const firstNonNull = values.find(v => v !== null && v !== undefined && v !== '');

      if (firstNonNull !== undefined) {
        if (firstNonNull === 'True' || firstNonNull === 'False' || firstNonNull === 'true' || firstNonNull === 'false') {
          type = 'BIT';
        } else if (!isNaN(Number(firstNonNull)) && firstNonNull !== '') {
          // Check if it's a decimal
          if (firstNonNull.includes('.')) {
            type = 'DECIMAL(10,4)';
          } else {
            type = 'INT';
          }
        } else if (firstNonNull.length < 100) {
          type = 'NVARCHAR(255)';
        }
      }
    }

    columns.push({
      name: `Col${index + 1}`,
      type
    });
  });

  return columns;
}

async function importCSV(csvFile: string): Promise<void> {
  const csvPath = path.join(lookupTablesDir, csvFile);
  const tableName = `LookupTable_${path.basename(csvFile, '.csv')}`;

  console.log(`\n📥 Importing ${csvFile}...`);

  try {
    // Read and parse CSV
    const fileContent = fs.readFileSync(csvPath, 'utf-8');
    const records = csv.parse(fileContent, {
      columns: false,
      skip_empty_lines: true,
      trim: true
    });

    if (records.length === 0) {
      console.log(`⏭️  Skipping ${csvFile} (no data)`);
      return;
    }

    // Convert array of arrays to objects
    const data = records.map((row: any[], idx: number) => {
      const obj: any = {};
      row.forEach((val, colIdx) => {
        obj[`Col${colIdx + 1}`] = val || null;
      });
      return obj;
    });

    // Infer column types
    const columns = await inferColumnTypes(data);

    // Connect to database
    const pool = await getConnection();

    // Drop table if exists
    await pool.request().query(`
      IF OBJECT_ID('dbo.[${tableName}]', 'U') IS NOT NULL
      DROP TABLE [dbo].[${tableName}]
    `);

    // Create table
    const createTableSQL = `
      CREATE TABLE [dbo].[${tableName}] (
        [Id] INT PRIMARY KEY IDENTITY(1,1),
        ${columns.map(col => `[${col.name}] ${col.type} NULL`).join(',\n        ')}
      )
    `;

    await pool.request().query(createTableSQL);
    console.log(`✓ Created table: ${tableName}`);

    // Insert data
    let insertCount = 0;
    for (const row of data) {
      const columns_list = Object.keys(row).map(k => `[${k}]`).join(',');
      const values_list = Object.values(row).map(v => {
        if (v === null || v === undefined || v === '') return 'NULL';
        if (v === 'True' || v === 'true') return '1';
        if (v === 'False' || v === 'false') return '0';
        return `'${String(v).replace(/'/g, "''")}'`;
      }).join(',');

      await pool.request().query(`INSERT INTO [dbo].[${tableName}] (${columns_list}) VALUES (${values_list})`);
      insertCount++;
    }

    console.log(`✓ Imported ${insertCount} rows into ${tableName}`);
  } catch (error) {
    console.error(`✗ Error importing ${csvFile}:`, error);
    throw error;
  }
}

async function main() {
  console.log('🚀 Starting lookup table import...');
  console.log(`📁 Reading from: ${lookupTablesDir}`);

  try {
    const csvFiles = fs.readdirSync(lookupTablesDir).filter(f => f.endsWith('.csv'));
    console.log(`\n📊 Found ${csvFiles.length} CSV files to import\n`);

    for (const csvFile of csvFiles) {
      await importCSV(csvFile);
    }

    console.log('\n✅ Import completed successfully!');
  } catch (error) {
    console.error('\n❌ Import failed:', error);
    process.exit(1);
  }
}

main();
