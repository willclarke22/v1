-- DESTRUCTIVE MANUAL ADMIN ONLY / myway_sandbox. Stop use of Workbench 7A panel first.
-- Only 7A functions/table dropped. Does not touch source data, 5C/6E projections or cron.
BEGIN;
DROP FUNCTION IF EXISTS public.myway_cloud_match_difficulties_v37d2c7a(jsonb,text,integer);
DROP FUNCTION IF EXISTS public.myway_cloud_difficulty_export_v37d2c7a();
DROP FUNCTION IF EXISTS public.myway_cloud_difficulty_catalog_v37d2c7a();
DROP FUNCTION IF EXISTS myway_sync_private.apply_difficulty_vector_v37d2c7a(uuid,text,text,jsonb);
DROP FUNCTION IF EXISTS myway_sync_private.refresh_cloud_difficulties_v37d2c7a();
DROP TABLE IF EXISTS public.myway_cloud_difficulty_snapshot;
COMMIT;
