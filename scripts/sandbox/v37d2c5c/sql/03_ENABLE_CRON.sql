-- V3.7D.2C.5C / SANDBOX ONLY / MANUALLY ENABLE AUTOMATIC DATABASE SYNC.
-- Requires Supabase Cron/pg_cron enabled in THIS sandbox project.
-- Do not use in original MyWay. Review job name and schedule before Run.
DO $check$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_extension WHERE extname='pg_cron') THEN
    RAISE EXCEPTION 'pg_cron not installed; enable Supabase Cron in sandbox Dashboard first';
  END IF;
  IF EXISTS(SELECT 1 FROM cron.job WHERE jobname='myway_cloud_sync_v37d2c5c') THEN
    RAISE EXCEPTION 'Sync job already exists: refusing to replace an existing schedule';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM myway_sync_private.owner_binding WHERE singleton=true AND enabled=true AND last_success_at IS NOT NULL) THEN
    RAISE EXCEPTION 'First run 02_RUN_ONE_REFRESH.sql successfully';
  END IF;
END $check$;
SELECT cron.schedule(
  'myway_cloud_sync_v37d2c5c',
  '* * * * *',
  'SELECT myway_sync_private.refresh_cloud_snapshot();'
);
