-- V3.7D.2C.5C / SANDBOX ONLY / EXPLICIT MANUAL STOP.
-- Stops automatic synchronization. It does NOT drop snapshot records or source tables.
SELECT cron.unschedule('myway_cloud_sync_v37d2c5c');
UPDATE myway_sync_private.owner_binding SET enabled=false WHERE singleton=true;
