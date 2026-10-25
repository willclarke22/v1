-- V3.7B.1 | READ-ONLY verification in myway_sandbox
SELECT extname,extversion FROM pg_extension WHERE extname='vector';
SELECT table_name FROM information_schema.tables
 WHERE table_schema='public' AND table_name IN ('topic_state','runs','attempts','topic_vectors')
 ORDER BY table_name;
SELECT c.relname AS table_name,c.relrowsecurity AS rls_enabled
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relname IN ('topic_state','runs','attempts','topic_vectors')
 ORDER BY c.relname;
SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND proname IN ('myway_match_topics','myway_sync_topic_vectors','myway_upsert_topic_vector') ORDER BY proname;
SELECT tgname,pg_get_triggerdef(t.oid) AS definition FROM pg_trigger t
 WHERE t.tgrelid='public.topic_state'::regclass AND NOT t.tgisinternal;
SELECT count(*) AS topic_count FROM public.topic_state;
SELECT count(*) AS indexed_vector_count FROM public.topic_vectors;
