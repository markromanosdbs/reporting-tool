/**
 * Creates the two braxreportsDB tables behind "Upload job sheet templates" (approved 30 Sep 2026).
 * Safe to run again: each table is created only if it doesn't exist. Nothing else is changed.
 *
 *   npx tsx src/scripts/createTemplateUpdateTables.ts
 */
import 'dotenv/config';
import { getBraxConnection, asDbo } from '../db.js';

const TEMPLATE_FILES = `
IF OBJECT_ID('dbo.template_files', 'U') IS NULL
CREATE TABLE dbo.template_files (
  id          INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_template_files PRIMARY KEY,
  sha256      CHAR(64)       NOT NULL CONSTRAINT UQ_template_files_sha256 UNIQUE,
  size_bytes  INT            NOT NULL,
  content     VARBINARY(MAX) NOT NULL,
  created_at  DATETIME2(0)   NOT NULL CONSTRAINT DF_template_files_created DEFAULT SYSUTCDATETIME()
);`;

const TEMPLATE_UPDATES = `
IF OBJECT_ID('dbo.template_updates', 'U') IS NULL
CREATE TABLE dbo.template_updates (
  id                INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_template_updates PRIMARY KEY,
  environment       NVARCHAR(10)  NOT NULL,           -- 'live' (VM) or 'local' (a developer PC): each only sees its own
  ref_no            INT           NOT NULL,           -- update-0001, numbered per environment
  report_table      NVARCHAR(100) NOT NULL,
  product           NVARCHAR(100) NOT NULL,           -- e.g. external-blinds-fgsun
  template_file     NVARCHAR(200) NOT NULL,           -- e.g. ExternalBlinds_FGSUN_Template.xlsm
  kind              NVARCHAR(10)  NOT NULL CONSTRAINT CK_template_updates_kind CHECK (kind IN ('upload', 'rollback')),
  source_file_name  NVARCHAR(260) NULL,
  order_no          NVARCHAR(50)  NULL,
  status            NVARCHAR(20)  NOT NULL CONSTRAINT CK_template_updates_status
                      CHECK (status IN ('Checking', 'Checked', 'Failed', 'Applied', 'Replaced', 'Discarded', 'Rolled back')),
  check_result      NVARCHAR(MAX) NULL,               -- JSON shown on the check screen
  rollback_of       INT NULL CONSTRAINT FK_template_updates_rollback_of REFERENCES dbo.template_updates(id),
  replaced_id       INT NULL CONSTRAINT FK_template_updates_replaced REFERENCES dbo.template_updates(id),
  file_id           INT NULL CONSTRAINT FK_template_updates_file REFERENCES dbo.template_files(id),  -- NULL = go-live template from git
  uploaded_by       NVARCHAR(100) NULL,
  uploaded_at       DATETIME2(0)  NULL,
  applied_by        NVARCHAR(100) NULL,
  applied_at        DATETIME2(3)  NULL,
  discarded_by      NVARCHAR(100) NULL,
  discarded_at      DATETIME2(0)  NULL,
  rolled_back_by    NVARCHAR(100) NULL,
  rolled_back_at    DATETIME2(0)  NULL,
  CONSTRAINT UQ_template_updates_ref UNIQUE (environment, ref_no)
);`;

const INDEX = `
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_template_updates_template' AND object_id = OBJECT_ID('dbo.template_updates'))
CREATE INDEX IX_template_updates_template ON dbo.template_updates (environment, template_file, status);`;

const pool = await getBraxConnection();
for (const [name, statement] of [['template_files', TEMPLATE_FILES], ['template_updates', TEMPLATE_UPDATES], ['index', INDEX]]) {
  await pool.request().batch(asDbo(statement));
  console.log(`✓ ${name}`);
}
const check = await pool.request().query(`
  SELECT t.name AS table_name, COUNT(c.column_id) AS columns
  FROM sys.tables t JOIN sys.columns c ON c.object_id = t.object_id
  WHERE t.name IN ('template_files', 'template_updates') GROUP BY t.name`);
console.table(check.recordset);
process.exit(0);
