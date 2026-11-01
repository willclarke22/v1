-- MANUAL OPT-IN / SANDBOX ADMIN ONLY / AFTER verifying one refresh and cloud authenticated RPC.
-- Intentionally separate job from V3.7D.2C.5C (which stays unchanged).
DO $pre$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM myway_sync_private.vector_sync_status WHERE singleton AND last_success_at IS NOT NULL)
 THEN RAISE EXCEPTION 'Run manual vector refresh first'; END IF;
 IF EXISTS(SELECT 1 FROM cron.job WHERE jobname='myway_cloud_vectors_v37d2c6e')
 THEN RAISE EXCEPTION 'Cron job already exists'; END IF;
END $pre$;
SELECT cron.schedule('myway_cloud_vectors_v37d2c6e','* * * * *',
  'SELECT myway_sync_private.refresh_cloud_vector_snapshot_v37d2c6e();');
