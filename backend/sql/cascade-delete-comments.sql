-- Cascade Delete Triggers for Comments
-- When a row is deleted from a main table, automatically delete its comments

-- Trigger for door_screen_components
CREATE TRIGGER tr_door_screen_components_delete
ON [dbo].[door_screen_components]
AFTER DELETE
AS
BEGIN
  DELETE FROM [dbo].[comments]
  WHERE [table_name] = 'door_screen_components'
    AND [quote_no] IN (SELECT [quote_no] FROM deleted)
    AND [line_no] IN (SELECT [line_no] FROM deleted);
END;

-- Trigger for curtain_tracks
CREATE TRIGGER tr_curtain_tracks_delete
ON [dbo].[curtain_tracks]
AFTER DELETE
AS
BEGIN
  DELETE FROM [dbo].[comments]
  WHERE [table_name] = 'curtain_tracks'
    AND [quote_no] IN (SELECT [quote_no] FROM deleted)
    AND [line_no] IN (SELECT [line_no] FROM deleted);
END;

-- Trigger for external_blinds_components
CREATE TRIGGER tr_external_blinds_components_delete
ON [dbo].[external_blinds_components]
AFTER DELETE
AS
BEGIN
  DELETE FROM [dbo].[comments]
  WHERE [table_name] = 'external_blinds_components'
    AND [quote_no] IN (SELECT [quote_no] FROM deleted)
    AND [line_no] IN (SELECT [line_no] FROM deleted);
END;

-- Trigger for panel_glides
CREATE TRIGGER tr_panel_glides_delete
ON [dbo].[panel_glides]
AFTER DELETE
AS
BEGIN
  DELETE FROM [dbo].[comments]
  WHERE [table_name] = 'panel_glides'
    AND [quote_no] IN (SELECT [quote_no] FROM deleted)
    AND [line_no] IN (SELECT [line_no] FROM deleted);
END;

-- Trigger for roller_blind_components
CREATE TRIGGER tr_roller_blind_components_delete
ON [dbo].[roller_blind_components]
AFTER DELETE
AS
BEGIN
  DELETE FROM [dbo].[comments]
  WHERE [table_name] = 'roller_blind_components'
    AND [quote_no] IN (SELECT [quote_no] FROM deleted)
    AND [line_no] IN (SELECT [line_no] FROM deleted);
END;

-- Trigger for roller_shutter_components
CREATE TRIGGER tr_roller_shutter_components_delete
ON [dbo].[roller_shutter_components]
AFTER DELETE
AS
BEGIN
  DELETE FROM [dbo].[comments]
  WHERE [table_name] = 'roller_shutter_components'
    AND [quote_no] IN (SELECT [quote_no] FROM deleted)
    AND [line_no] IN (SELECT [line_no] FROM deleted);
END;

-- Trigger for squalonet_retractable_screens
CREATE TRIGGER tr_squalonet_retractable_screens_delete
ON [dbo].[squalonet_retractable_screens]
AFTER DELETE
AS
BEGIN
  DELETE FROM [dbo].[comments]
  WHERE [table_name] = 'squalonet_retractable_screens'
    AND [quote_no] IN (SELECT [quote_no] FROM deleted)
    AND [line_no] IN (SELECT [line_no] FROM deleted);
END;
