-- SANDBOX ADMIN SQL / read-only verification. Should show RLS=true/FORCE=true, zero browser table grants,
-- one protected owner, and zero anon function grants. Do NOT confuse SQL-editor postgres rights with browser rights.
SELECT c.relname,c.relrowsecurity AS rls_enabled,c.relforcerowsecurity AS force_rls
 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relname='myway_cloud_vector_snapshot';
SELECT grantee,privilege_type FROM information_schema.role_table_grants
 WHERE table_schema='public' AND table_name='myway_cloud_vector_snapshot'
 AND grantee IN('anon','authenticated','service_role');
SELECT p.proname,has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
 has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute
 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname IN ('myway_cloud_vector_catalog_v37d2c6e','myway_cloud_match_topics_v37d2c6e');
SELECT (SELECT count(*) FROM myway_sync_private.owner_binding WHERE singleton AND enabled) owner_count,
 (SELECT count(*) FROM public.myway_cloud_vector_snapshot) vector_count,
 (SELECT last_success_at FROM myway_sync_private.vector_sync_status WHERE singleton) vector_sync_utc;
SELECT jobid,jobname,schedule,active FROM cron.job WHERE jobname='myway_cloud_vectors_v37d2c6e';
-- Expected: anon_execute false, authenticated_execute true, zero table grants, one owner.
