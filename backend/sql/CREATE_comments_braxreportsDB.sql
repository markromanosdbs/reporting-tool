-- Comments table for braxreportsDB (same structure as ComponentsReport.dbo.comments)
-- Run in SSMS against braxreportsDB.

USE [braxreportsDB];
GO

IF OBJECT_ID('dbo.comments', 'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[comments] (
        [id]           INT IDENTITY(1,1) NOT NULL PRIMARY KEY CLUSTERED,
        [table_name]   NVARCHAR(100)  NOT NULL,
        [quote_no]     NVARCHAR(50)   NOT NULL,
        [line_no]      INT            NOT NULL,
        [column_name]  NVARCHAR(255)  NOT NULL,
        [user]         NVARCHAR(255)  NOT NULL,
        [timestamp]    DATETIME       NOT NULL DEFAULT (GETUTCDATE()),
        [comment_text] NVARCHAR(MAX)  NOT NULL,
        [created_at]   DATETIME       NOT NULL DEFAULT (GETUTCDATE()),
        [updated_at]   DATETIME       NOT NULL DEFAULT (GETUTCDATE())
    );

    CREATE NONCLUSTERED INDEX [IX_comments_lookup]         ON [dbo].[comments] ([table_name], [quote_no], [line_no]);
    CREATE NONCLUSTERED INDEX [IX_comments_user_timestamp] ON [dbo].[comments] ([user], [timestamp]);
END
GO

-- The web app connects as excelreports (read-only elsewhere in braxreportsDB)
GRANT SELECT, INSERT, UPDATE, DELETE ON [dbo].[comments] TO [excelreports];
GO
