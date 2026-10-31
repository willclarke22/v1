-- READ ONLY. Run in myway_sandbox after migration / seed.
SELECT 'myway_cloud_topic_snapshot' AS entity, count(*) AS count FROM public.myway_cloud_topic_snapshot
UNION ALL
SELECT 'myway_cloud_relationship_snapshot',count(*) FROM public.myway_cloud_relationship_snapshot;
SELECT tablename,rowsecurity FROM pg_tables WHERE schemaname='public'
  AND tablename IN ('myway_cloud_topic_snapshot','myway_cloud_relationship_snapshot');
SELECT tablename,policyname,roles,cmd,qual FROM pg_policies WHERE schemaname='public'
  AND tablename IN ('myway_cloud_topic_snapshot','myway_cloud_relationship_snapshot')
ORDER BY tablename;

-- Confirm anonymous role has no snapshot table grants; authenticated role has SELECT only.
SELECT table_name,grantee,privilege_type
FROM information_schema.role_table_grants
WHERE table_schema='public'
 AND table_name IN ('myway_cloud_topic_snapshot','myway_cloud_relationship_snapshot')
 AND grantee IN ('anon','authenticated')
ORDER BY table_name,grantee,privilege_type;
