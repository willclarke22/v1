-- V3.7D.2C.5C / SANDBOX ONLY / OPTIONAL ADMIN ROLLBACK.
-- Run 05_STOP_CRON.sql FIRST and verify job is gone.
-- Does not drop or modify existing snapshot data or original source tables.
BEGIN;
DROP FUNCTION myway_sync_private.refresh_cloud_snapshot();
DROP TABLE myway_sync_private.owner_binding;
DROP SCHEMA myway_sync_private;
COMMIT;
