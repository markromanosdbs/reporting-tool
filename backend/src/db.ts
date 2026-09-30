import sql from 'mssql';

// Brax Reports database config (for job tracking data)
const braxConfig: sql.config = {
  server: process.env.AZURE_SQL_SERVER || '',
  database: 'braxreportsDB',
  authentication: {
    type: 'default',
    options: {
      userName: process.env.AZURE_SQL_USERNAME || '',
      password: process.env.AZURE_SQL_PASSWORD || '',
    },
  },
  options: {
    encrypt: true,
    trustServerCertificate: false,
    connectTimeout: 30000,
    requestTimeout: 30000,
  },
};

let braxPool: sql.ConnectionPool | null = null;
// While a pool is connecting, other callers wait for that same pool. (Before, a second caller made a
// new pool and the first caller was handed that unconnected one → "Connection is closed" at start-up.)
let braxConnecting: Promise<sql.ConnectionPool> | null = null;

export async function getBraxConnection(): Promise<sql.ConnectionPool> {
  if (braxPool && braxPool.connected) {
    return braxPool;
  }
  braxConnecting ??= (async () => {
    const p = new sql.ConnectionPool(braxConfig);
    await p.connect();
    braxPool = p;
    console.log('✓ Connected to braxreportsDB database');
    return p;
  })().finally(() => { braxConnecting = null; });
  return braxConnecting;
}

/**
 * The old ComponentsReport database was deleted on 1 Oct 2026 - every report is now calculated from
 * braxreportsDB. Anything still asking for it (old calculators, lookup-table import) fails clearly.
 */
export async function getConnection(): Promise<sql.ConnectionPool> {
  throw new Error('The ComponentsReport database has been removed - reports are calculated from braxreportsDB');
}

export async function closeDB(): Promise<void> {
  if (braxPool) {
    await braxPool.close();
    console.log('✓ Disconnected from braxreportsDB database');
  }
}


/**
 * Wrap a write statement so it runs as dbo. The app's login (excelreports) has a
 * database-wide DENY on INSERT/UPDATE/DELETE in braxreportsDB. REVERT also runs when
 * the statement fails, so a pooled connection is never left elevated.
 */
export function asDbo(statement: string): string {
  return `
    EXECUTE AS USER = 'dbo';
    BEGIN TRY
      ${statement}
    END TRY
    BEGIN CATCH
      REVERT;
      THROW;
    END CATCH;
    REVERT;
  `;
}
