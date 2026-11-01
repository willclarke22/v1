-- SANDBOX ADMIN ONLY. Run 05_STOP_CRON.sql FIRST. Verify app no longer uses RPC.
-- Does NOT modify source topic_state/topic_vectors, original cloud snapshots or old cron job.
BEGIN;
DO $pre$ BEGIN
 IF EXISTS(SELECT 1 FROM cron.job WHERE jobname='myway_cloud_vectors_v37d2c6e')
 THEN RAISE EXCEPTION 'Stop vector Cron before removing projection'; END IF;
END $pre$;
DROP FUNCTION IF EXISTS public.myway_cloud_match_topics_v37d2c6e(jsonb,text,integer);
DROP FUNCTION IF EXISTS public.myway_cloud_vector_catalog_v37d2c6e();
DROP FUNCTION IF EXISTS myway_sync_private.refresh_cloud_vector_snapshot_v37d2c6e();
DROP TABLE IF EXISTS public.myway_cloud_vector_snapshot;
DROP TABLE IF EXISTS myway_sync_private.vector_sync_status;
COMMIT;
