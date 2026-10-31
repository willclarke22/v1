-- V3.7D.2C.5B / SANDBOX ONLY / REVIEW BEFORE EXECUTION.
-- Perform ONLY after 01_CREATE_CLOUD_READONLY_TABLES.sql succeeded.
-- Explicit one-time admin seed: requires EXACTLY ONE Supabase Auth user; fails otherwise.
-- Assigns an owner to NEW snapshot rows, NOT to existing topic_state records.
-- SQL Editor is privileged. Do NOT run in the original MyWay Supabase project.
-- On repeat, this script FAILS rather than silently replacing the snapshot.
BEGIN;
DO $seed$
DECLARE
  owner_id uuid;
  user_count integer;
  topic_count integer;
  edge_count integer;
BEGIN
  SELECT count(*) INTO user_count FROM auth.users;
  IF user_count <> 1 THEN RAISE EXCEPTION 'Expected exactly 1 sandbox Auth user, found %',user_count; END IF;
  SELECT id INTO STRICT owner_id FROM auth.users;
  IF EXISTS(SELECT 1 FROM public.myway_cloud_topic_snapshot)
    OR EXISTS(SELECT 1 FROM public.myway_cloud_relationship_snapshot) THEN
    RAISE EXCEPTION 'Snapshot tables already populated; refusing unreviewed reseed';
  END IF;
  INSERT INTO public.myway_cloud_topic_snapshot (
    owner_uid,topic_id,topic_label,diagnosis,next_step,confusion,insight,learning_score,
    topic_position_x,topic_position_y,topic_position_z,
    semantic_position_x,semantic_position_y,semantic_position_z,
    semantic_position_method,semantic_position_updated_at
  )
  SELECT owner_id, topic_id, left(topic_label,140), diagnosis, left(next_step,250),
    confusion::double precision,insight::double precision,learning_score::double precision,
    topic_position_x,topic_position_y,topic_position_z,
    semantic_position_x,semantic_position_y,semantic_position_z,
    left(semantic_position_method,100),semantic_position_updated_at
  FROM public.topic_state;
  GET DIAGNOSTICS topic_count = ROW_COUNT;
  IF topic_count <> 43 THEN
    RAISE EXCEPTION 'Expected 43 topics based on Oct 31 preflight, found %. Rollback.',topic_count;
  END IF;
  -- Read ONE newest nonempty relationship layer. Only sanitized typed graph fields
  -- are copied; evidence summaries, prompts, transcripts and raw topic_json are excluded.
  INSERT INTO public.myway_cloud_relationship_snapshot (
    owner_uid,relationship_id,source_topic_id,target_topic_id,relationship_type,
    strength,confidence,evidence_count,visible_by_default,affects_layout,
    show_in_overview,show_on_focus,max_opacity,visual_style,priority
  )
  WITH src AS (
    SELECT topic_json->'learning_space_relationships' AS graph
    FROM public.topic_state
    WHERE jsonb_typeof(topic_json->'learning_space_relationships')='array'
      AND jsonb_array_length(topic_json->'learning_space_relationships')>0
    ORDER BY updated_at DESC,topic_id
    LIMIT 1
  ), raw AS (
    SELECT value AS r FROM src, LATERAL jsonb_array_elements(src.graph)
  ), typed AS (
    SELECT r,
      left(nullif(r->>'relationship_id',''),200) AS rid,
      nullif(r->>'source_topic_id','') AS sid,
      nullif(r->>'target_topic_id','') AS tid,
      nullif(r->>'relationship_type','') AS kind
    FROM raw WHERE jsonb_typeof(r)='object'
  )
  SELECT DISTINCT ON (typed.rid)
    owner_id,typed.rid,typed.sid,typed.tid,typed.kind,
    CASE WHEN jsonb_typeof(r->'strength')='number'
      THEN LEAST(1.0,GREATEST(0.0,(r->>'strength')::double precision)) ELSE 0.5 END,
    CASE WHEN jsonb_typeof(r->'confidence')='number'
      THEN LEAST(1.0,GREATEST(0.0,(r->>'confidence')::double precision)) ELSE 0.5 END,
    CASE WHEN jsonb_typeof(r->'evidence_count')='number'
      THEN LEAST(100000,GREATEST(0,(r->>'evidence_count')::numeric))::integer ELSE 0 END,
    COALESCE((r->>'visible_by_default')::boolean,false),
    COALESCE((r->>'affects_layout')::boolean,false),
    COALESCE((r->'display_policy'->>'show_in_overview')::boolean,false),
    COALESCE((r->'display_policy'->>'show_on_focus')::boolean,true),
    CASE WHEN jsonb_typeof(r->'display_policy'->'max_opacity')='number'
      THEN LEAST(1,GREATEST(0,(r->'display_policy'->>'max_opacity')::double precision)) ELSE 0.35 END,
    CASE WHEN r->'display_policy'->>'visual_style' IN
      ('arc','thread','arrow','halo','trail','line','dashed_line','pulse_line')
      THEN r->'display_policy'->>'visual_style' ELSE 'thread' END,
    CASE WHEN jsonb_typeof(r->'display_policy'->'priority')='number'
      THEN (r->'display_policy'->>'priority')::double precision ELSE 1 END
  FROM typed
    JOIN public.myway_cloud_topic_snapshot a ON a.owner_uid=owner_id AND a.topic_id=typed.sid
    JOIN public.myway_cloud_topic_snapshot b ON b.owner_uid=owner_id AND b.topic_id=typed.tid
  WHERE typed.rid IS NOT NULL AND typed.sid<>typed.tid AND typed.kind IN (
    'semantic','semantic_similarity','shared_diagnosis','shared_confusion_pattern',
    'shared_insight_pattern','prerequisite','blocks','transfer_bridge','analogy',
    'same_cluster','co_attempted','content_source_overlap','shared_confusion','strategy','temporal')
  ORDER BY typed.rid;
  GET DIAGNOSTICS edge_count = ROW_COUNT;
  RAISE NOTICE 'Created read-only snapshot for one owner: % topics, % sanitized relationships',topic_count,edge_count;
END $seed$;
COMMIT;
