-- V3.7D.2C.5C / SANDBOX ONLY / READ ONLY.
SELECT
 (SELECT count(*) FROM public.topic_state) AS source_topics,
 (SELECT count(*) FROM public.myway_cloud_topic_snapshot) AS cloud_topics,
 (SELECT count(*) FROM public.myway_cloud_relationship_snapshot) AS cloud_relationships,
 (SELECT last_success_at FROM myway_sync_private.owner_binding WHERE singleton=true) AS last_sync_utc,
 (SELECT last_topic_count FROM myway_sync_private.owner_binding WHERE singleton=true) AS last_synced_topic_count,
 (SELECT last_relationship_count FROM myway_sync_private.owner_binding WHERE singleton=true) AS last_synced_relationship_count,
 (SELECT count(*) FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relname IN ('myway_cloud_topic_snapshot','myway_cloud_relationship_snapshot')
   AND c.relrowsecurity AND c.relforcerowsecurity) AS protected_tables;
-- If pg_cron is enabled, inspect the job status in Dashboard > Cron > Jobs & History.
-- Do not expose cron.job views to anon/authenticated users.
