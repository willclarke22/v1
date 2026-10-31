-- V3.7D.2C.5C / SANDBOX ONLY / ADMIN SQL / REVIEW BEFORE EXECUTION.
-- Creates one private owner binding and a restricted ADMIN-ONLY sync function.
-- Does not schedule any job, touch original main, or change public RLS policies.
-- Does not modify public.topic_state. SQL Editor is a privileged context.
BEGIN;
DO $preflight$
BEGIN
  IF (SELECT count(*) FROM public.myway_cloud_topic_snapshot) <> 43 THEN
    RAISE EXCEPTION 'Preflight expected 43 existing cloud snapshot topics';
  END IF;
  IF (SELECT count(*) FROM public.topic_state) <> 43 THEN
    RAISE EXCEPTION 'Preflight expected 43 original source topics';
  END IF;
  IF (SELECT count(DISTINCT owner_uid) FROM public.myway_cloud_topic_snapshot) <> 1
     OR (SELECT count(DISTINCT owner_uid) FROM public.myway_cloud_relationship_snapshot) <> 1 THEN
    RAISE EXCEPTION 'Snapshot must have exactly one owner';
  END IF;
  IF EXISTS(
      SELECT 1 FROM public.myway_cloud_relationship_snapshot r
      WHERE r.owner_uid <> (SELECT owner_uid FROM public.myway_cloud_topic_snapshot LIMIT 1)
  ) THEN RAISE EXCEPTION 'Snapshot owner mismatch'; END IF;
  IF (SELECT count(*) FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public'
      AND c.relname IN ('myway_cloud_topic_snapshot','myway_cloud_relationship_snapshot')
      AND c.relrowsecurity AND c.relforcerowsecurity) <> 2 THEN
    RAISE EXCEPTION 'Both snapshot tables must have FORCE ROW LEVEL SECURITY';
  END IF;
  IF (SELECT count(*) FROM pg_catalog.pg_policies
    WHERE schemaname='public'
    AND ((tablename='myway_cloud_topic_snapshot' AND policyname='myway_cloud_topics_owner_select')
      OR (tablename='myway_cloud_relationship_snapshot' AND policyname='myway_cloud_relationships_owner_select'))
    AND cmd='SELECT' AND roles::text LIKE '%authenticated%'
    AND qual LIKE '%auth.uid%' AND qual LIKE '%owner_uid%') <> 2 THEN
    RAISE EXCEPTION 'Missing or incorrect owner-scoped SELECT policies';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.role_table_grants
    WHERE table_schema='public'
      AND table_name IN ('myway_cloud_topic_snapshot','myway_cloud_relationship_snapshot')
      AND (grantee='anon' OR (grantee='authenticated' AND privilege_type<>'SELECT'))) THEN
    RAISE EXCEPTION 'Unexpected cloud snapshot browser grant';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_policies
    WHERE schemaname='public' AND tablename IN ('myway_cloud_topic_snapshot','myway_cloud_relationship_snapshot')
    AND (cmd <> 'SELECT' OR roles::text NOT LIKE '%authenticated%')) THEN
    RAISE EXCEPTION 'Unexpected snapshot access policy';
  END IF;
END $preflight$;
CREATE SCHEMA myway_sync_private;
REVOKE ALL ON SCHEMA myway_sync_private FROM PUBLIC, anon, authenticated;
CREATE TABLE myway_sync_private.owner_binding (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  owner_uid uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  enabled boolean NOT NULL DEFAULT true,
  last_success_at timestamptz,
  last_topic_count integer,
  last_relationship_count integer
);
ALTER TABLE myway_sync_private.owner_binding ENABLE ROW LEVEL SECURITY;
ALTER TABLE myway_sync_private.owner_binding FORCE ROW LEVEL SECURITY;
REVOKE ALL ON myway_sync_private.owner_binding FROM PUBLIC, anon, authenticated, service_role;
INSERT INTO myway_sync_private.owner_binding(singleton,owner_uid)
SELECT true, owner_uid FROM public.myway_cloud_topic_snapshot
GROUP BY owner_uid;
-- Note: refresh is a privileged internal administrative function in a NON-EXPOSED schema.
-- It does not accept a caller-selected user ID or read from the request JWT.
CREATE FUNCTION myway_sync_private.refresh_cloud_snapshot() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $refresh$
DECLARE
  v_owner uuid;
  v_source integer;
  v_current integer;
  v_valid integer;
  v_edges integer;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(3712, 2503);
  SELECT owner_uid INTO STRICT v_owner FROM myway_sync_private.owner_binding
  WHERE singleton = true AND enabled = true;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id=v_owner) THEN
    RAISE EXCEPTION 'Sync owner is missing';
  END IF;
  IF EXISTS(SELECT 1 FROM public.myway_cloud_topic_snapshot WHERE owner_uid<>v_owner)
     OR EXISTS(SELECT 1 FROM public.myway_cloud_relationship_snapshot WHERE owner_uid<>v_owner) THEN
    RAISE EXCEPTION 'Unexpected owner in snapshot: refusing sync';
  END IF;
  SELECT count(*) INTO v_source FROM public.topic_state;
  SELECT count(*) INTO v_current FROM public.myway_cloud_topic_snapshot WHERE owner_uid=v_owner;
  SELECT count(*) INTO v_valid FROM public.topic_state
   WHERE topic_position_x IS NOT NULL AND topic_position_y IS NOT NULL AND topic_position_z IS NOT NULL;
  IF v_source < 1 OR v_source > 5000 OR v_valid < 1 OR v_source * 2 < v_current THEN
    RAISE EXCEPTION 'Source count failed fail-closed checks; source %, valid %, snapshot %',v_source,v_valid,v_current;
  END IF;
  -- Upsert only the explicitly permitted scalar visualization fields.
  INSERT INTO public.myway_cloud_topic_snapshot (
    owner_uid,topic_id,topic_label,diagnosis,next_step,confusion,insight,learning_score,
    topic_position_x,topic_position_y,topic_position_z,
    semantic_position_x,semantic_position_y,semantic_position_z,
    semantic_position_method,semantic_position_updated_at
  )
  SELECT v_owner,topic_id,pg_catalog.left(topic_label,140),diagnosis,
    pg_catalog.left(next_step,250),confusion::double precision,insight::double precision,
    learning_score::double precision,
    topic_position_x,topic_position_y,topic_position_z,
    semantic_position_x,semantic_position_y,semantic_position_z,
    pg_catalog.left(semantic_position_method,100),semantic_position_updated_at
  FROM public.topic_state
  WHERE topic_position_x IS NOT NULL AND topic_position_y IS NOT NULL AND topic_position_z IS NOT NULL
  ON CONFLICT (owner_uid,topic_id) DO UPDATE SET
    topic_label=EXCLUDED.topic_label,diagnosis=EXCLUDED.diagnosis,next_step=EXCLUDED.next_step,
    confusion=EXCLUDED.confusion,insight=EXCLUDED.insight,learning_score=EXCLUDED.learning_score,
    topic_position_x=EXCLUDED.topic_position_x,topic_position_y=EXCLUDED.topic_position_y,
    topic_position_z=EXCLUDED.topic_position_z,
    semantic_position_x=EXCLUDED.semantic_position_x,semantic_position_y=EXCLUDED.semantic_position_y,
    semantic_position_z=EXCLUDED.semantic_position_z,
    semantic_position_method=EXCLUDED.semantic_position_method,
    semantic_position_updated_at=EXCLUDED.semantic_position_updated_at
  WHERE (public.myway_cloud_topic_snapshot.topic_label,public.myway_cloud_topic_snapshot.diagnosis,
      public.myway_cloud_topic_snapshot.next_step,public.myway_cloud_topic_snapshot.confusion,
      public.myway_cloud_topic_snapshot.insight,public.myway_cloud_topic_snapshot.learning_score,
      public.myway_cloud_topic_snapshot.topic_position_x,public.myway_cloud_topic_snapshot.topic_position_y,
      public.myway_cloud_topic_snapshot.topic_position_z,public.myway_cloud_topic_snapshot.semantic_position_x,
      public.myway_cloud_topic_snapshot.semantic_position_y,public.myway_cloud_topic_snapshot.semantic_position_z,
      public.myway_cloud_topic_snapshot.semantic_position_method,public.myway_cloud_topic_snapshot.semantic_position_updated_at)
    IS DISTINCT FROM
    (EXCLUDED.topic_label,EXCLUDED.diagnosis,EXCLUDED.next_step,EXCLUDED.confusion,
     EXCLUDED.insight,EXCLUDED.learning_score,EXCLUDED.topic_position_x,EXCLUDED.topic_position_y,
     EXCLUDED.topic_position_z,EXCLUDED.semantic_position_x,EXCLUDED.semantic_position_y,
     EXCLUDED.semantic_position_z,EXCLUDED.semantic_position_method,EXCLUDED.semantic_position_updated_at);
  -- At this scale a full atomic relationship refresh avoids accumulating stale edges.
  -- The graph source is the newest nonempty relationship layer, as in D2C5B seed.
  DELETE FROM public.myway_cloud_relationship_snapshot WHERE owner_uid=v_owner;
  INSERT INTO public.myway_cloud_relationship_snapshot (
    owner_uid,relationship_id,source_topic_id,target_topic_id,relationship_type,
    strength,confidence,evidence_count,visible_by_default,affects_layout,
    show_in_overview,show_on_focus,max_opacity,visual_style,priority
  )
  WITH src AS (
    SELECT topic_json->'learning_space_relationships' AS graph
    FROM public.topic_state
    WHERE pg_catalog.jsonb_typeof(topic_json->'learning_space_relationships')='array'
      AND pg_catalog.jsonb_array_length(topic_json->'learning_space_relationships')>0
    ORDER BY updated_at DESC,topic_id LIMIT 1
  ), raw AS (
    SELECT value AS r FROM src,LATERAL pg_catalog.jsonb_array_elements(src.graph)
  ), typed AS (
    SELECT r,pg_catalog.left(NULLIF(r->>'relationship_id',''),200) AS rid,
      NULLIF(r->>'source_topic_id','') AS sid,
      NULLIF(r->>'target_topic_id','') AS tid,
      NULLIF(r->>'relationship_type','') AS kind
    FROM raw WHERE pg_catalog.jsonb_typeof(r)='object'
  )
  SELECT DISTINCT ON (typed.rid)
    v_owner,typed.rid,typed.sid,typed.tid,typed.kind,
    CASE WHEN pg_catalog.jsonb_typeof(r->'strength')='number'
      THEN LEAST(1.0,GREATEST(0.0,(r->>'strength')::double precision)) ELSE 0.5 END,
    CASE WHEN pg_catalog.jsonb_typeof(r->'confidence')='number'
      THEN LEAST(1.0,GREATEST(0.0,(r->>'confidence')::double precision)) ELSE 0.5 END,
    CASE WHEN pg_catalog.jsonb_typeof(r->'evidence_count')='number'
      THEN LEAST(100000,GREATEST(0,pg_catalog.floor((r->>'evidence_count')::numeric)))::integer ELSE 0 END,
    CASE WHEN pg_catalog.jsonb_typeof(r->'visible_by_default')='boolean'
      THEN (r->>'visible_by_default')::boolean ELSE false END,
    CASE WHEN pg_catalog.jsonb_typeof(r->'affects_layout')='boolean'
      THEN (r->>'affects_layout')::boolean ELSE false END,
    CASE WHEN pg_catalog.jsonb_typeof(r->'display_policy'->'show_in_overview')='boolean'
      THEN (r->'display_policy'->>'show_in_overview')::boolean ELSE false END,
    CASE WHEN pg_catalog.jsonb_typeof(r->'display_policy'->'show_on_focus')='boolean'
      THEN (r->'display_policy'->>'show_on_focus')::boolean ELSE true END,
    CASE WHEN pg_catalog.jsonb_typeof(r->'display_policy'->'max_opacity')='number'
      THEN LEAST(1.0,GREATEST(0.0,(r->'display_policy'->>'max_opacity')::double precision)) ELSE 0.35 END,
    CASE WHEN r->'display_policy'->>'visual_style' IN
      ('arc','thread','arrow','halo','trail','line','dashed_line','pulse_line')
      THEN r->'display_policy'->>'visual_style' ELSE 'thread' END,
    CASE WHEN pg_catalog.jsonb_typeof(r->'display_policy'->'priority')='number'
      THEN (r->'display_policy'->>'priority')::double precision ELSE 1 END
  FROM typed
  JOIN public.myway_cloud_topic_snapshot a ON a.owner_uid=v_owner AND a.topic_id=typed.sid
  JOIN public.myway_cloud_topic_snapshot b ON b.owner_uid=v_owner AND b.topic_id=typed.tid
  WHERE typed.rid IS NOT NULL AND typed.sid<>typed.tid AND typed.kind IN (
    'semantic','semantic_similarity','shared_diagnosis','shared_confusion_pattern',
    'shared_insight_pattern','prerequisite','blocks','transfer_bridge','analogy',
    'same_cluster','co_attempted','content_source_overlap','shared_confusion','strategy','temporal')
  ORDER BY typed.rid;
  GET DIAGNOSTICS v_edges=ROW_COUNT;
  -- Remove deleted source topics; FK cascades their now-obsolete edges.
  -- A temporarily incomplete position is NOT treated as a deletion.
  DELETE FROM public.myway_cloud_topic_snapshot s WHERE s.owner_uid=v_owner
    AND NOT EXISTS(SELECT 1 FROM public.topic_state t WHERE t.topic_id=s.topic_id);
  UPDATE myway_sync_private.owner_binding
  SET last_success_at=pg_catalog.now(),last_topic_count=(SELECT count(*) FROM public.myway_cloud_topic_snapshot WHERE owner_uid=v_owner),
      last_relationship_count=v_edges
  WHERE singleton=true AND owner_uid=v_owner;
END;
$refresh$;
REVOKE ALL ON FUNCTION myway_sync_private.refresh_cloud_snapshot() FROM PUBLIC, anon, authenticated, service_role;
COMMIT;
