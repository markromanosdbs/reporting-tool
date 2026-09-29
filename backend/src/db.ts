import sql from 'mssql';

// Main ComponentsReport database config
const config: sql.config = {
  server: process.env.AZURE_SQL_SERVER || '',
  database: process.env.AZURE_SQL_DATABASE || '',
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

let pool: sql.ConnectionPool | null = null;
let braxPool: sql.ConnectionPool | null = null;
// While a pool is connecting, other callers wait for that same pool. (Before, a second caller made a
// new pool and the first caller was handed that unconnected one → "Connection is closed" at start-up.)
let connecting: Promise<sql.ConnectionPool> | null = null;
let braxConnecting: Promise<sql.ConnectionPool> | null = null;

export async function connectDB(): Promise<sql.ConnectionPool> {
  if (pool && pool.connected) {
    return pool;
  }
  connecting ??= (async () => {
    const p = new sql.ConnectionPool(config);
    await p.connect();
    pool = p;
    console.log('✓ Connected to ComponentsReport database');
    return p;
  })().finally(() => { connecting = null; });
  return connecting;
}

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

export async function getConnection(): Promise<sql.ConnectionPool> {
  if (!pool || !pool.connected) {
    return connectDB();
  }
  return pool;
}

export async function closeDB(): Promise<void> {
  if (pool) {
    await pool.close();
    console.log('✓ Disconnected from ComponentsReport database');
  }
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
