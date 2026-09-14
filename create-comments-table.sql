-- Create comments table in ComponentsReport database
CREATE TABLE [dbo].[comments] (
    [id] INT PRIMARY KEY IDENTITY(1,1),
    [table_name] NVARCHAR(100) NOT NULL,
    [quote_no] NVARCHAR(50) NOT NULL,
    [line_no] INT NOT NULL,
    [column_name] NVARCHAR(255) NOT NULL,
    [user] NVARCHAR(255) NOT NULL,
    [timestamp] DATETIME NOT NULL DEFAULT GETUTCDATE(),
    [comment_text] NVARCHAR(MAX) NOT NULL,
    [created_at] DATETIME NOT NULL DEFAULT GETUTCDATE(),
    [updated_at] DATETIME NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT [FK_comments_table] FOREIGN KEY ([table_name]) REFERENCES [information_schema].[tables]([table_name])
);

-- Create index for faster queries
CREATE INDEX [IX_comments_lookup] ON [dbo].[comments] (
    [table_name],
    [quote_no],
    [line_no]
);

-- Create index for user/timestamp searches
CREATE INDEX [IX_comments_user_timestamp] ON [dbo].[comments] (
    [user],
    [timestamp]
);
