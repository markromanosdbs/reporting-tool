/**
 * Creates braxreportsDB.dbo.app_users for Microsoft sign-in (approved 30 Sep 2026) and adds the first
 * Admin. Safe to run again: the table is created only if missing, and the first Admin only if not there.
 *
 *   npx tsx src/scripts/createAppUsersTable.ts
 */
import 'dotenv/config';
import sql from 'mssql';
import { getBraxConnection, asDbo } from '../db.js';

const FIRST_ADMIN = 'mark@davidsonsblinds.com.au';

const TABLE = `
IF OBJECT_ID('dbo.app_users', 'U') IS NULL
CREATE TABLE dbo.app_users (
  id                INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_app_users PRIMARY KEY,
  email             NVARCHAR(254) NOT NULL CONSTRAINT UQ_app_users_email UNIQUE,   -- lower case, the Microsoft sign-in name
  name              NVARCHAR(200) NULL,                                               -- from Microsoft at sign-in
  role              NVARCHAR(10)  NOT NULL CONSTRAINT CK_app_users_role CHECK (role IN ('Admin', 'Viewer')),
  added_by          NVARCHAR(200) NULL,
  added_at          DATETIME2(0)  NOT NULL CONSTRAINT DF_app_users_added DEFAULT SYSUTCDATETIME(),
  first_sign_in_at  DATETIME2(0)  NULL,
  last_sign_in_at   DATETIME2(0)  NULL
);`;

const pool = await getBraxConnection();
await pool.request().batch(asDbo(TABLE));
console.log('✓ app_users');
await pool.request().input('email', sql.NVarChar, FIRST_ADMIN).query(asDbo(`
  IF NOT EXISTS (SELECT 1 FROM dbo.app_users WHERE email = @email)
    INSERT dbo.app_users (email, role, added_by) VALUES (@email, 'Admin', 'Set up (first Admin)');`));
console.table((await pool.request().query('SELECT id, email, role, added_by, added_at FROM dbo.app_users')).recordset);
process.exit(0);
