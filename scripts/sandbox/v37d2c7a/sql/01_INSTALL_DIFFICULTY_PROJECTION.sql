-- MANUAL ADMIN SQL, myway_sandbox ONLY. No Cron. No cloud write privileges.
-- Separate difficulty evidence from topic-label vectors and topic-level message centroids.
BEGIN;
DO $pre$
DECLARE v_owner uuid;
BEGIN
 IF (SELECT count(*) FROM myway_sync_private.owner_binding WHERE singleton AND enabled) <> 1
 THEN RAISE EXCEPTION 'Expected one pre-existing enabled sandbox owner'; END IF;
 SELECT owner_uid INTO STRICT v_owner FROM myway_sync_private.owner_binding WHERE singleton AND enabled;
 IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=v_owner) THEN RAISE EXCEPTION 'Owner missing'; END IF;
 IF (SELECT count(*) FROM public.topic_state) NOT BETWEEN 1 AND 5000 THEN RAISE EXCEPTION 'Unexpected topic count'; END IF;
 IF (SELECT count(*) FROM public.myway_cloud_topic_snapshot WHERE owner_uid=v_owner)=0
  OR EXISTS(SELECT 1 FROM public.myway_cloud_topic_snapshot WHERE owner_uid<>v_owner)
 THEN RAISE EXCEPTION 'Existing topic snapshot owner mismatch'; END IF;
 IF (SELECT count(*) FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON c.relnamespace=n.oid
 WHERE n.nspname='public' AND c.relname IN ('myway_cloud_topic_snapshot','myway_cloud_vector_snapshot')
 AND c.relrowsecurity AND c.relforcerowsecurity) <> 2 THEN RAISE EXCEPTION '6E/5C FORCE RLS prerequisite missing'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_extension x JOIN pg_catalog.pg_namespace n ON n.oid=x.extnamespace
 WHERE x.extname='vector' AND n.nspname='extensions') THEN RAISE EXCEPTION 'pgvector extension must be in extensions schema'; END IF;
 IF EXISTS(SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON c.relnamespace=n.oid
 WHERE n.nspname='public' AND c.relname='myway_cloud_difficulty_snapshot')
 THEN RAISE EXCEPTION '7A table already exists: do not reinstall'; END IF;
END $pre$;

CREATE TABLE public.myway_cloud_difficulty_snapshot (
 owner_uid uuid NOT NULL,
 event_id uuid NOT NULL,
 topic_id text NOT NULL,
 root_problem text NOT NULL CHECK(pg_catalog.length(root_problem) BETWEEN 15 AND 500),
 root_sha256 text NOT NULL CHECK(root_sha256 ~ '^[0-9a-f]{64}$'),
 embedding_model text,
 embedding extensions.vector(384),
 refreshed_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
 PRIMARY KEY(owner_uid,event_id),
 FOREIGN KEY(owner_uid,topic_id) REFERENCES public.myway_cloud_topic_snapshot(owner_uid,topic_id) ON DELETE CASCADE,
 CHECK((embedding IS NULL AND embedding_model IS NULL) OR
       (embedding IS NOT NULL AND embedding_model='Xenova/all-MiniLM-L6-v2@transformers-4.3.1-q8-wasm'))
);
ALTER TABLE public.myway_cloud_difficulty_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.myway_cloud_difficulty_snapshot FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.myway_cloud_difficulty_snapshot FROM PUBLIC,anon,authenticated,service_role;
-- NO RLS SELECT policies: actual private root text and vectors are never table-readable in browser.
CREATE INDEX myway_difficulty_owner_model_v37d2c7a ON public.myway_cloud_difficulty_snapshot(owner_uid,embedding_model);

CREATE FUNCTION myway_sync_private.refresh_cloud_difficulties_v37d2c7a()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_owner uuid; v_candidates integer; v_unique integer;
BEGIN
 PERFORM pg_catalog.pg_advisory_xact_lock(3712,2503);
 SELECT owner_uid INTO STRICT v_owner FROM myway_sync_private.owner_binding WHERE singleton AND enabled;
 IF EXISTS(SELECT 1 FROM public.myway_cloud_difficulty_snapshot WHERE owner_uid<>v_owner)
  OR EXISTS(SELECT 1 FROM public.myway_cloud_topic_snapshot WHERE owner_uid<>v_owner)
 THEN RAISE EXCEPTION 'Owner mismatch, refusing difficulty refresh'; END IF;
 IF (SELECT count(*) FROM public.topic_state) NOT BETWEEN 1 AND 5000 THEN RAISE EXCEPTION 'Source count out of bounds'; END IF;
 -- No historical fabrication: ONLY approved persisted evidence events, never message centroid vectors.
 -- Two independently documented approval paths are accepted:
 -- (1) v37d2c_validated_assessment; (2) earlier v37d2a_explicit_user_approval
 -- when the parent topic also carries the older explicit-approval provenance.
 -- Do not treat free-form or unknown origin labels as permission.
 WITH eligible AS (
  SELECT t.topic_id, e.value->>'event_id' AS id, pg_catalog.btrim(e.value->>'root_problem') AS problem
  FROM public.topic_state t
  JOIN public.myway_cloud_topic_snapshot s ON s.owner_uid=v_owner AND s.topic_id=t.topic_id
  CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(CASE
    WHEN pg_catalog.jsonb_typeof(t.topic_json->'myway_learning_evidence')='array'
    THEN t.topic_json->'myway_learning_evidence' ELSE '[]'::jsonb END) e(value)
  WHERE pg_catalog.jsonb_typeof(e.value)='object'
   AND (e.value->>'origin'='v37d2c_validated_assessment'
     OR (e.value->>'origin'='v37d2a_explicit_user_approval'
         AND t.topic_json->>'myway_memory_origin'='v37d2a_explicit_user_approval'))
   AND e.value->>'event_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   AND pg_catalog.length(pg_catalog.btrim(e.value->>'root_problem')) BETWEEN 15 AND 500
 )
 SELECT count(*),count(DISTINCT id) INTO v_candidates,v_unique FROM eligible;
 IF v_candidates>100 OR v_candidates<>v_unique
 THEN RAISE EXCEPTION 'Too many or duplicate historical evidence IDs: %, %',v_candidates,v_unique; END IF;
 WITH eligible AS (
  SELECT t.topic_id,(e.value->>'event_id')::uuid AS event_id,
     pg_catalog.btrim(e.value->>'root_problem') AS root_problem
  FROM public.topic_state t
  JOIN public.myway_cloud_topic_snapshot s ON s.owner_uid=v_owner AND s.topic_id=t.topic_id
  CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(CASE
    WHEN pg_catalog.jsonb_typeof(t.topic_json->'myway_learning_evidence')='array'
    THEN t.topic_json->'myway_learning_evidence' ELSE '[]'::jsonb END) e(value)
  WHERE pg_catalog.jsonb_typeof(e.value)='object'
   AND (e.value->>'origin'='v37d2c_validated_assessment'
     OR (e.value->>'origin'='v37d2a_explicit_user_approval'
         AND t.topic_json->>'myway_memory_origin'='v37d2a_explicit_user_approval'))
   AND e.value->>'event_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   AND pg_catalog.length(pg_catalog.btrim(e.value->>'root_problem')) BETWEEN 15 AND 500
 ), hashed AS (
  SELECT topic_id,event_id,root_problem,
   pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(root_problem,'UTF8')),'hex') AS root_sha256
  FROM eligible
 )
 INSERT INTO public.myway_cloud_difficulty_snapshot
   (owner_uid,topic_id,event_id,root_problem,root_sha256)
 SELECT v_owner,topic_id,event_id,root_problem,root_sha256 FROM hashed
 ON CONFLICT(owner_uid,event_id) DO UPDATE SET
  topic_id=EXCLUDED.topic_id,root_problem=EXCLUDED.root_problem,root_sha256=EXCLUDED.root_sha256,
  embedding=CASE WHEN public.myway_cloud_difficulty_snapshot.root_sha256=EXCLUDED.root_sha256
   AND public.myway_cloud_difficulty_snapshot.topic_id=EXCLUDED.topic_id
   THEN public.myway_cloud_difficulty_snapshot.embedding ELSE NULL END,
  embedding_model=CASE WHEN public.myway_cloud_difficulty_snapshot.root_sha256=EXCLUDED.root_sha256
   AND public.myway_cloud_difficulty_snapshot.topic_id=EXCLUDED.topic_id
   THEN public.myway_cloud_difficulty_snapshot.embedding_model ELSE NULL END,
  refreshed_at=pg_catalog.now()
 WHERE (public.myway_cloud_difficulty_snapshot.topic_id,public.myway_cloud_difficulty_snapshot.root_sha256)
 IS DISTINCT FROM (EXCLUDED.topic_id,EXCLUDED.root_sha256);
 -- Deleted/invalidated evidence disappears from index; old embeddings cannot survive stale event IDs.
 DELETE FROM public.myway_cloud_difficulty_snapshot d WHERE d.owner_uid=v_owner
  AND NOT EXISTS (
   SELECT 1 FROM public.topic_state t CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(CASE
    WHEN pg_catalog.jsonb_typeof(t.topic_json->'myway_learning_evidence')='array'
    THEN t.topic_json->'myway_learning_evidence' ELSE '[]'::jsonb END) e(value)
   WHERE t.topic_id=d.topic_id AND pg_catalog.jsonb_typeof(e.value)='object'
    AND (e.value->>'origin'='v37d2c_validated_assessment'
     OR (e.value->>'origin'='v37d2a_explicit_user_approval'
         AND t.topic_json->>'myway_memory_origin'='v37d2a_explicit_user_approval'))
    AND pg_catalog.lower(e.value->>'event_id')=d.event_id::text
    AND pg_catalog.length(pg_catalog.btrim(e.value->>'root_problem')) BETWEEN 15 AND 500
    AND pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.btrim(e.value->>'root_problem'),'UTF8')),'hex')=d.root_sha256);
END $fn$;
REVOKE ALL ON FUNCTION myway_sync_private.refresh_cloud_difficulties_v37d2c7a() FROM PUBLIC,anon,authenticated,service_role;

-- Offline browser generates ONLY vectors and hashes. This function is MANUALLY invoked in SQL Editor.
CREATE FUNCTION myway_sync_private.apply_difficulty_vector_v37d2c7a(
 p_event_id uuid,p_root_sha256 text,p_model text,p_embedding jsonb
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_owner uuid; v_vector extensions.vector(384); v_count int;
BEGIN
 SELECT owner_uid INTO STRICT v_owner FROM myway_sync_private.owner_binding WHERE singleton AND enabled;
 IF p_root_sha256 IS NULL OR p_root_sha256 !~ '^[0-9a-f]{64}$' OR
  p_model IS DISTINCT FROM 'Xenova/all-MiniLM-L6-v2@transformers-4.3.1-q8-wasm' OR
  p_embedding IS NULL OR pg_catalog.jsonb_typeof(p_embedding)<>'array' OR
  pg_catalog.length(p_embedding::text)>14000 OR pg_catalog.jsonb_array_length(p_embedding)<>384 OR
  EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements(p_embedding) AS x(value)
   WHERE pg_catalog.jsonb_typeof(x.value)<>'number')
 THEN RAISE EXCEPTION 'Invalid difficulty embedding payload' USING ERRCODE='22023'; END IF;
 v_vector:=p_embedding::text::extensions.vector(384);
 IF (-1.0*(v_vector OPERATOR(extensions.<#>) v_vector)) NOT BETWEEN 0.94 AND 1.06
 THEN RAISE EXCEPTION 'Unnormalized embedding' USING ERRCODE='22023'; END IF;
 UPDATE public.myway_cloud_difficulty_snapshot SET embedding=v_vector,embedding_model=p_model
 WHERE owner_uid=v_owner AND event_id=p_event_id AND root_sha256=p_root_sha256;
 GET DIAGNOSTICS v_count=ROW_COUNT;
 IF v_count<>1 THEN RAISE EXCEPTION 'Stale event/hash or wrong sandbox: %',p_event_id; END IF;
END $fn$;
REVOKE ALL ON FUNCTION myway_sync_private.apply_difficulty_vector_v37d2c7a(uuid,text,text,jsonb)
 FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.myway_cloud_difficulty_catalog_v37d2c7a()
RETURNS TABLE(total_events bigint,indexed_events bigint,last_refreshed timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_owner uuid;
BEGIN
 IF auth.uid() IS NULL OR auth.role()<>'authenticated' THEN
  RAISE EXCEPTION 'Sign-in required' USING ERRCODE='42501'; END IF;
 SELECT owner_uid INTO v_owner FROM myway_sync_private.owner_binding
  WHERE singleton AND enabled AND owner_uid=auth.uid();
 IF v_owner IS NULL THEN RETURN; END IF;
 RETURN QUERY SELECT count(*)::bigint,count(*) FILTER (WHERE d.embedding IS NOT NULL)::bigint,
  max(d.refreshed_at) FROM public.myway_cloud_difficulty_snapshot d WHERE d.owner_uid=v_owner;
END $fn$;
REVOKE ALL ON FUNCTION public.myway_cloud_difficulty_catalog_v37d2c7a() FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.myway_cloud_difficulty_catalog_v37d2c7a() TO authenticated;

-- Explicit user action only. Data is private to authenticated owner and bounded (at most 100 events).
-- No quotes/messages or original statement fields, just validated root-problem summaries.
CREATE FUNCTION public.myway_cloud_difficulty_export_v37d2c7a()
RETURNS TABLE(event_id uuid,topic_id text,topic_label text,root_problem text,root_sha256 text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_owner uuid;
BEGIN
 IF auth.uid() IS NULL OR auth.role()<>'authenticated' THEN
  RAISE EXCEPTION 'Sign-in required' USING ERRCODE='42501'; END IF;
 SELECT owner_uid INTO v_owner FROM myway_sync_private.owner_binding
  WHERE singleton AND enabled AND owner_uid=auth.uid();
 IF v_owner IS NULL THEN RETURN; END IF;
 RETURN QUERY SELECT d.event_id,d.topic_id,s.topic_label,d.root_problem,d.root_sha256
 FROM public.myway_cloud_difficulty_snapshot d JOIN public.myway_cloud_topic_snapshot s
 ON s.owner_uid=d.owner_uid AND s.topic_id=d.topic_id
 WHERE d.owner_uid=v_owner ORDER BY d.event_id LIMIT 100;
END $fn$;
REVOKE ALL ON FUNCTION public.myway_cloud_difficulty_export_v37d2c7a() FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.myway_cloud_difficulty_export_v37d2c7a() TO authenticated;

CREATE FUNCTION public.myway_cloud_match_difficulties_v37d2c7a(p_query jsonb,p_model text,p_limit integer DEFAULT 8)
RETURNS TABLE(event_id uuid,topic_id text,topic_label text,root_problem text,source_model text,similarity double precision)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_owner uuid; v_vector extensions.vector(384);
BEGIN
 IF auth.uid() IS NULL OR auth.role()<>'authenticated' THEN
  RAISE EXCEPTION 'Sign-in required' USING ERRCODE='42501'; END IF;
 SELECT owner_uid INTO v_owner FROM myway_sync_private.owner_binding
  WHERE singleton AND enabled AND owner_uid=auth.uid();
 IF v_owner IS NULL THEN RETURN; END IF;
 IF p_model IS DISTINCT FROM 'Xenova/all-MiniLM-L6-v2@transformers-4.3.1-q8-wasm' OR
  p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 10 OR p_query IS NULL OR
  pg_catalog.jsonb_typeof(p_query)<>'array' OR pg_catalog.length(p_query::text)>14000 OR
  pg_catalog.jsonb_array_length(p_query)<>384 OR EXISTS(
   SELECT 1 FROM pg_catalog.jsonb_array_elements(p_query) AS x(value)
   WHERE pg_catalog.jsonb_typeof(x.value)<>'number')
 THEN RAISE EXCEPTION 'Invalid difficulty query vector' USING ERRCODE='22023'; END IF;
 v_vector:=p_query::text::extensions.vector(384);
 IF (-1.0*(v_vector OPERATOR(extensions.<#>) v_vector)) NOT BETWEEN 0.94 AND 1.06
 THEN RAISE EXCEPTION 'Unnormalized query' USING ERRCODE='22023'; END IF;
 RETURN QUERY SELECT d.event_id,d.topic_id,s.topic_label,d.root_problem,d.embedding_model,
  (1.0-(d.embedding OPERATOR(extensions.<=>) v_vector))::double precision
 FROM public.myway_cloud_difficulty_snapshot d JOIN public.myway_cloud_topic_snapshot s
 ON s.owner_uid=d.owner_uid AND s.topic_id=d.topic_id
 WHERE d.owner_uid=v_owner AND d.embedding IS NOT NULL AND d.embedding_model=p_model
 ORDER BY d.embedding OPERATOR(extensions.<=>) v_vector,d.event_id LIMIT p_limit;
END $fn$;
REVOKE ALL ON FUNCTION public.myway_cloud_match_difficulties_v37d2c7a(jsonb,text,integer)
 FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.myway_cloud_match_difficulties_v37d2c7a(jsonb,text,integer) TO authenticated;
COMMIT;
