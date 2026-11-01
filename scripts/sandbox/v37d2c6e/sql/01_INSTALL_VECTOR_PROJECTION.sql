-- V3.7D.2C.6E — MANUAL ADMIN SQL. RUN ONLY in the isolated myway_sandbox Supabase project.
-- Creates a separate browser-inaccessible vector projection and a tightly scoped authenticated RPC.
-- NO source-topic changes, no original table privileges, no schedule, and no cloud writes for users.
-- Check the project selector, 00_PREFLIGHT.sql and README before executing.
BEGIN;
DO $pre$
DECLARE v_owner uuid;
BEGIN
  IF (SELECT count(*) FROM myway_sync_private.owner_binding WHERE singleton AND enabled) <> 1 THEN
    RAISE EXCEPTION 'Existing D2C5C owner binding must be enabled and unique'; END IF;
  SELECT owner_uid INTO STRICT v_owner FROM myway_sync_private.owner_binding WHERE singleton AND enabled;
  IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=v_owner) THEN RAISE EXCEPTION 'Owner missing'; END IF;
  IF (SELECT count(*) FROM public.topic_state) NOT BETWEEN 1 AND 5000 THEN RAISE EXCEPTION 'Unexpected source count'; END IF;
  IF EXISTS(SELECT 1 FROM public.myway_cloud_topic_snapshot WHERE owner_uid<>v_owner) THEN
    RAISE EXCEPTION 'Snapshot owner mismatch'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.myway_cloud_topic_snapshot WHERE owner_uid=v_owner) THEN
    RAISE EXCEPTION 'Snapshot empty'; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_extension x JOIN pg_catalog.pg_namespace n ON n.oid=x.extnamespace
                WHERE x.extname='vector' AND n.nspname='extensions') THEN
    RAISE EXCEPTION 'Expected pgvector in schema extensions'; END IF;
  IF EXISTS(SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
            WHERE n.nspname='public' AND c.relname='myway_cloud_vector_snapshot') THEN
    RAISE EXCEPTION 'Vector projection already installed; do not reinstall'; END IF;
  IF (SELECT count(*) FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname IN('myway_cloud_topic_snapshot','myway_cloud_relationship_snapshot')
      AND c.relrowsecurity AND c.relforcerowsecurity)<>2 THEN
    RAISE EXCEPTION 'Previous cloud snapshots must retain FORCE RLS'; END IF;
END $pre$;

CREATE TABLE public.myway_cloud_vector_snapshot(
 owner_uid uuid NOT NULL,
 topic_id text NOT NULL,
 kind text NOT NULL CHECK(kind='label'),
 embedding_model text NOT NULL CHECK(pg_catalog.length(embedding_model) BETWEEN 1 AND 128),
 embedding extensions.vector(384) NOT NULL,
 synced_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
 PRIMARY KEY(owner_uid,topic_id,kind),
 FOREIGN KEY(owner_uid,topic_id) REFERENCES public.myway_cloud_topic_snapshot(owner_uid,topic_id) ON DELETE CASCADE
);
ALTER TABLE public.myway_cloud_vector_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.myway_cloud_vector_snapshot FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.myway_cloud_vector_snapshot FROM PUBLIC, anon, authenticated, service_role;
-- Intentionally NO RLS policies: even owner-authenticated browsers cannot read raw vectors.
-- This uses exact cosine scan at small/medium counts; benchmark before adding approximate indexes.
CREATE INDEX myway_cloud_vector_owner_model ON public.myway_cloud_vector_snapshot(owner_uid,kind,embedding_model);

CREATE TABLE myway_sync_private.vector_sync_status(
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 owner_uid uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
 last_success_at timestamptz,
 indexed_labels integer,
 source_labels integer
);
ALTER TABLE myway_sync_private.vector_sync_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE myway_sync_private.vector_sync_status FORCE ROW LEVEL SECURITY;
REVOKE ALL ON myway_sync_private.vector_sync_status FROM PUBLIC,anon,authenticated,service_role;
INSERT INTO myway_sync_private.vector_sync_status(singleton,owner_uid)
 SELECT true,owner_uid FROM myway_sync_private.owner_binding WHERE singleton AND enabled;

CREATE FUNCTION myway_sync_private.refresh_cloud_vector_snapshot_v37d2c6e()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_owner uuid; v_source int; v_cloud int; v_indexed int;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(3712,2503); -- synchronize with earlier D2C5C snapshot job
  SELECT owner_uid INTO STRICT v_owner FROM myway_sync_private.owner_binding WHERE singleton AND enabled;
  IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=v_owner) THEN RAISE EXCEPTION 'Owner absent'; END IF;
  IF EXISTS(SELECT 1 FROM public.myway_cloud_topic_snapshot WHERE owner_uid<>v_owner)
     OR EXISTS(SELECT 1 FROM public.myway_cloud_vector_snapshot WHERE owner_uid<>v_owner) THEN
    RAISE EXCEPTION 'Owner mismatch; refusing vector sync'; END IF;
  SELECT count(*) INTO v_source FROM public.topic_state;
  SELECT count(*) INTO v_cloud FROM public.myway_cloud_topic_snapshot WHERE owner_uid=v_owner;
  IF v_source NOT BETWEEN 1 AND 5000 OR v_cloud NOT BETWEEN 1 AND 5000 OR v_source*2<v_cloud THEN
    RAISE EXCEPTION 'Source/cloud topic counts failed bounds'; END IF;
  -- Copy ONLY already-prepared label vectors and model IDs. Never copy raw learner text or messages.
  INSERT INTO public.myway_cloud_vector_snapshot(owner_uid,topic_id,kind,embedding_model,embedding,synced_at)
  SELECT v_owner,v.topic_id,'label',v.embedding_model,v.embedding,pg_catalog.now()
  FROM public.topic_vectors v
  JOIN public.myway_cloud_topic_snapshot s ON s.owner_uid=v_owner AND s.topic_id=v.topic_id
  WHERE v.kind='label' AND pg_catalog.length(v.embedding_model) BETWEEN 1 AND 128
  ON CONFLICT(owner_uid,topic_id,kind) DO UPDATE SET
   embedding_model=EXCLUDED.embedding_model,embedding=EXCLUDED.embedding,synced_at=EXCLUDED.synced_at
  WHERE public.myway_cloud_vector_snapshot.embedding_model IS DISTINCT FROM EXCLUDED.embedding_model
     OR public.myway_cloud_vector_snapshot.embedding::text IS DISTINCT FROM EXCLUDED.embedding::text;
  -- Remove deleted or no-longer-indexed topics and changed-model leftovers. Safe because index is a projection.
  DELETE FROM public.myway_cloud_vector_snapshot p WHERE p.owner_uid=v_owner
    AND NOT EXISTS(SELECT 1 FROM public.topic_vectors v JOIN public.myway_cloud_topic_snapshot s
                   ON s.owner_uid=p.owner_uid AND s.topic_id=v.topic_id
                   WHERE v.topic_id=p.topic_id AND v.kind='label' AND pg_catalog.length(v.embedding_model) BETWEEN 1 AND 128);
  SELECT count(*) INTO v_indexed FROM public.myway_cloud_vector_snapshot WHERE owner_uid=v_owner;
  UPDATE myway_sync_private.vector_sync_status SET last_success_at=pg_catalog.now(),
    indexed_labels=v_indexed,source_labels=v_source WHERE singleton AND owner_uid=v_owner;
END $fn$;
REVOKE ALL ON FUNCTION myway_sync_private.refresh_cloud_vector_snapshot_v37d2c6e()
 FROM PUBLIC,anon,authenticated,service_role;

-- SECURITY DEFINER is limited to a fixed owner binding and never returns raw vectors.
CREATE FUNCTION public.myway_cloud_vector_catalog_v37d2c6e()
RETURNS TABLE(source_model text, indexed_topics bigint, last_synced_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_owner uuid;
BEGIN
  IF auth.uid() IS NULL OR auth.role()<>'authenticated' THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  SELECT owner_uid INTO v_owner FROM myway_sync_private.owner_binding
   WHERE singleton AND enabled AND owner_uid=auth.uid();
  IF v_owner IS NULL THEN RETURN; END IF;
  RETURN QUERY SELECT p.embedding_model,pg_catalog.count(*)::bigint,pg_catalog.max(p.synced_at)
   FROM public.myway_cloud_vector_snapshot p JOIN public.myway_cloud_topic_snapshot s
   ON s.owner_uid=p.owner_uid AND s.topic_id=p.topic_id
   WHERE p.owner_uid=v_owner AND p.kind='label'
   GROUP BY p.embedding_model ORDER BY pg_catalog.count(*) DESC,p.embedding_model;
END $fn$;
REVOKE ALL ON FUNCTION public.myway_cloud_vector_catalog_v37d2c6e() FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.myway_cloud_vector_catalog_v37d2c6e() TO authenticated;

CREATE FUNCTION public.myway_cloud_match_topics_v37d2c6e(
  p_query jsonb, p_model text, p_limit integer DEFAULT 8
) RETURNS TABLE(topic_id text,topic_label text,source_model text,similarity double precision)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_owner uuid; v_query extensions.vector(384); v_length int;
BEGIN
  IF auth.uid() IS NULL OR auth.role()<>'authenticated' THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  SELECT owner_uid INTO v_owner FROM myway_sync_private.owner_binding
   WHERE singleton AND enabled AND owner_uid=auth.uid();
  IF v_owner IS NULL THEN RETURN; END IF;
  IF p_model IS NULL OR pg_catalog.length(p_model) NOT BETWEEN 1 AND 128 OR
     p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 20 OR p_query IS NULL OR
     pg_catalog.jsonb_typeof(p_query)<>'array' OR pg_catalog.length(p_query::text)>14000 THEN
    RAISE EXCEPTION 'Invalid vector request' USING ERRCODE='22023'; END IF;
  v_length:=pg_catalog.jsonb_array_length(p_query);
  IF v_length<>384 OR EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements(p_query) AS x(value)
                             WHERE pg_catalog.jsonb_typeof(x.value)<>'number') THEN
    RAISE EXCEPTION 'Expected 384 numeric coordinates' USING ERRCODE='22023'; END IF;
  v_query:=p_query::text::extensions.vector(384);
  IF ((-1.0 * (v_query OPERATOR(extensions.<#>) v_query)) < 0.94 OR
      (-1.0 * (v_query OPERATOR(extensions.<#>) v_query)) > 1.06) THEN
    RAISE EXCEPTION 'Embedding must be normalized' USING ERRCODE='22023'; END IF;
  RETURN QUERY
   SELECT p.topic_id,s.topic_label,p.embedding_model,
          (1.0-(p.embedding OPERATOR(extensions.<=>) v_query))::double precision
   FROM public.myway_cloud_vector_snapshot p
   JOIN public.myway_cloud_topic_snapshot s ON s.owner_uid=p.owner_uid AND s.topic_id=p.topic_id
   WHERE p.owner_uid=v_owner AND p.kind='label' AND p.embedding_model=p_model
   ORDER BY p.embedding OPERATOR(extensions.<=>) v_query, p.topic_id
   LIMIT p_limit;
END $fn$;
REVOKE ALL ON FUNCTION public.myway_cloud_match_topics_v37d2c6e(jsonb,text,integer)
 FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.myway_cloud_match_topics_v37d2c6e(jsonb,text,integer) TO authenticated;
COMMIT;
