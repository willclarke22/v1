-- V3.7D.2C.5C / SANDBOX ONLY / READ-ONLY.
-- Run in the existing myway_sandbox SQL Editor, never original MyWay.
-- Read-only: find count, snapshot ownership, RLS and pg_cron availability.
SELECT
  (SELECT count(*) FROM public.topic_state) AS source_topics,
  (SELECT count(*) FROM public.myway_cloud_topic_snapshot) AS snapshot_topics,
  (SELECT count(*) FROM public.myway_cloud_relationship_snapshot) AS snapshot_relationships,
  (SELECT count(DISTINCT owner_uid) FROM public.myway_cloud_topic_snapshot) AS snapshot_owner_count,
  (SELECT count(*) FROM auth.users) AS auth_user_count,
  (SELECT count(*) FROM pg_catalog.pg_extension WHERE extname='pg_cron') AS pg_cron_installed,
  (SELECT count(*) FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relname IN ('myway_cloud_topic_snapshot','myway_cloud_relationship_snapshot')
     AND c.relrowsecurity AND c.relforcerowsecurity) AS rls_forced_tables;
-- pg_cron_installed=0 means enable Supabase Cron manually before script 03.
