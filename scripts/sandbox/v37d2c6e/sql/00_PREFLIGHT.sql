-- SANDBOX ADMIN SQL EDITOR ONLY. Read only. Abort if project is not myway_sandbox.
SELECT (SELECT count(*) FROM public.topic_state) source_topics,
 (SELECT count(*) FROM public.topic_vectors WHERE kind='label') indexed_label_vectors,
 (SELECT count(*) FROM public.myway_cloud_topic_snapshot) cloud_topics,
 (SELECT count(*) FROM myway_sync_private.owner_binding WHERE singleton AND enabled) enabled_owners,
 (SELECT last_success_at FROM myway_sync_private.owner_binding WHERE singleton) last_snapshot_sync,
 (SELECT count(*) FROM pg_catalog.pg_extension x JOIN pg_catalog.pg_namespace n ON n.oid=x.extnamespace
   WHERE x.extname='vector' AND n.nspname='extensions') expected_pgvector_extension;
SELECT kind,embedding_model,count(*) AS count FROM public.topic_vectors
 GROUP BY kind,embedding_model ORDER BY kind,count DESC;
-- IMPORTANT: local model aliases such as 'local-embedding-service' do not prove browser MiniLM equivalence.
