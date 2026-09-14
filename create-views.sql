-- Create views for ComponentsReport database
-- These views JOIN component tables with braxreportsDB.dbo.dbsproduction
-- to include job tracking and dispatch information

-- 1. Door Screen Components
CREATE OR ALTER VIEW [dbo].[view_door_screen_components] AS
SELECT
    dc.*,
    ISNULL(dp.[ProductionStatus], '') AS job_tracking_action,
    ISNULL(dp.[InstallationStatus], '') AS dispatch_action,
    ISNULL(dp.[DateScheduled], NULL) AS dispatch_date
FROM [dbo].[door_screen_components] dc
LEFT JOIN [braxreportsDB].[dbo].[dbsproduction] dp
    ON CONCAT(dc.quote_no, ' ', dc.line_no) = dp.[Buz and Line No.];

-- 2. External Blinds Components
CREATE OR ALTER VIEW [dbo].[view_external_blinds_components] AS
SELECT
    ebc.*,
    ISNULL(dp.[ProductionStatus], '') AS job_tracking_action,
    ISNULL(dp.[InstallationStatus], '') AS dispatch_action,
    ISNULL(dp.[DateScheduled], NULL) AS dispatch_date
FROM [dbo].[external_blinds_components] ebc
LEFT JOIN [braxreportsDB].[dbo].[dbsproduction] dp
    ON CONCAT(ebc.quote_no, ' ', ebc.line_no) = dp.[Buz and Line No.];

-- 3. Panel Glides
CREATE OR ALTER VIEW [dbo].[view_panel_glides] AS
SELECT
    pg.*,
    ISNULL(dp.[ProductionStatus], '') AS job_tracking_action,
    ISNULL(dp.[InstallationStatus], '') AS dispatch_action,
    ISNULL(dp.[DateScheduled], NULL) AS dispatch_date
FROM [dbo].[panel_glides] pg
LEFT JOIN [braxreportsDB].[dbo].[dbsproduction] dp
    ON CONCAT(pg.quote_no, ' ', pg.line_no) = dp.[Buz and Line No.];

-- 4. Roller Blind Components
CREATE OR ALTER VIEW [dbo].[view_roller_blind_components] AS
SELECT
    rbc.*,
    ISNULL(dp.[ProductionStatus], '') AS job_tracking_action,
    ISNULL(dp.[InstallationStatus], '') AS dispatch_action,
    ISNULL(dp.[DateScheduled], NULL) AS dispatch_date
FROM [dbo].[roller_blind_components] rbc
LEFT JOIN [braxreportsDB].[dbo].[dbsproduction] dp
    ON CONCAT(rbc.quote_no, ' ', rbc.line_no) = dp.[Buz and Line No.];

-- 5. Roller Shutter Components
CREATE OR ALTER VIEW [dbo].[view_roller_shutter_components] AS
SELECT
    rsc.*,
    ISNULL(dp.[ProductionStatus], '') AS job_tracking_action,
    ISNULL(dp.[InstallationStatus], '') AS dispatch_action,
    ISNULL(dp.[DateScheduled], NULL) AS dispatch_date
FROM [dbo].[roller_shutter_components] rsc
LEFT JOIN [braxreportsDB].[dbo].[dbsproduction] dp
    ON CONCAT(rsc.quote_no, ' ', rsc.line_no) = dp.[Buz and Line No.];

-- 6. Squalonet Retractable Screens
CREATE OR ALTER VIEW [dbo].[view_squalonet_retractable_screens] AS
SELECT
    srs.*,
    ISNULL(dp.[ProductionStatus], '') AS job_tracking_action,
    ISNULL(dp.[InstallationStatus], '') AS dispatch_action,
    ISNULL(dp.[DateScheduled], NULL) AS dispatch_date
FROM [dbo].[squalonet_retractable_screens] srs
LEFT JOIN [braxreportsDB].[dbo].[dbsproduction] dp
    ON CONCAT(srs.quote_no, ' ', srs.line_no) = dp.[Buz and Line No.];
