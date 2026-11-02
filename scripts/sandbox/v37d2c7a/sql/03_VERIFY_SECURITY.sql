-- READ ONLY / SANDBOX ADMIN: SQL Editor's own privileges do NOT simulate browser authorization.
SELECT c.relname,c.relrowsecurity AS rls_enabled,c.relforcerowsecurity AS force_rls
 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relname='myway_cloud_difficulty_snapshot';
SELECT grantee,privilege_type FROM information_schema.role_table_grants
 WHERE table_schema='public' AND table_name='myway_cloud_difficulty_snapshot'
 AND grantee IN('anon','authenticated','service_role');
SELECT p.proname,has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
 has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute,
 has_function_privilege('service_role',p.oid,'EXECUTE') AS service_execute
 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
 WHERE (n.nspname='public' AND p.proname IN ('myway_cloud_difficulty_catalog_v37d2c7a',
 'myway_cloud_difficulty_export_v37d2c7a','myway_cloud_match_difficulties_v37d2c7a'))
 OR (n.nspname='myway_sync_private' AND p.proname IN
 ('refresh_cloud_difficulties_v37d2c7a','apply_difficulty_vector_v37d2c7a'));
SELECT count(*) AS events,count(*) FILTER(WHERE embedding IS NOT NULL) AS vectors,
 count(DISTINCT topic_id) AS topics FROM public.myway_cloud_difficulty_snapshot;
-- Expect FORCE RLS true, zero browser table grants, three authenticated-only public RPCs,
-- zero anon/service_role function grants, zero browser grants on private ADMIN functions.
-- Test signed-out/nonowner RPC denial in real clients; SQL editor is not an Auth test.
