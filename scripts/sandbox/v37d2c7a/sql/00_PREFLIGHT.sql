-- V3.7D.2C.7A FIX3 / READ ONLY / MANUAL: sandbox myway_sandbox ONLY.
-- Provenance-aware: both validated assessments and historical explicitly approved D2A events.
-- Before proceeding, confirm visually that this is NOT the original Supabase project.
SELECT
 (SELECT count(*) FROM public.topic_state) AS source_topics,
 (SELECT count(*) FROM public.myway_cloud_topic_snapshot) AS cloud_topics,
 (SELECT count(*) FROM myway_sync_private.owner_binding WHERE singleton AND enabled) AS enabled_owners,
 (SELECT count(*) FROM public.myway_cloud_vector_snapshot) AS existing_6e_label_vectors;
WITH event_rows AS (
 SELECT t.topic_id, t.topic_json->>'myway_memory_origin' AS topic_memory_origin,
        e.value AS event
 FROM public.topic_state t CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(
  CASE WHEN pg_catalog.jsonb_typeof(t.topic_json->'myway_learning_evidence')='array'
   THEN t.topic_json->'myway_learning_evidence' ELSE '[]'::jsonb END) e(value)
), classified AS (
 SELECT topic_id,
  event->>'origin' AS event_origin,
  COALESCE(event->>'event_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',false) AS valid_id,
  COALESCE(pg_catalog.length(pg_catalog.btrim(event->>'root_problem')) BETWEEN 15 AND 500,false) AS valid_length,
  COALESCE(event->>'origin'='v37d2c_validated_assessment'
   OR (event->>'origin'='v37d2a_explicit_user_approval'
       AND topic_memory_origin='v37d2a_explicit_user_approval'),false) AS valid_provenance
 FROM event_rows
)
SELECT count(*) AS total_events,
 count(*) FILTER (WHERE valid_id AND valid_length AND valid_provenance) AS eligible_approved_events,
 count(DISTINCT topic_id) FILTER (WHERE valid_id AND valid_length AND valid_provenance) AS topics_with_approved_history,
 count(*) FILTER (WHERE valid_id AND valid_length AND valid_provenance
   AND event_origin='v37d2c_validated_assessment') AS validated_assessment_events,
 count(*) FILTER (WHERE valid_id AND valid_length AND valid_provenance
   AND event_origin='v37d2a_explicit_user_approval') AS explicitly_approved_d2a_events,
 count(*) FILTER (WHERE NOT (valid_id AND valid_length AND valid_provenance)) AS excluded_events
FROM classified;
-- User's 2026-11-02 inspection: 5 total; 4 validated assessments; 1 legacy explicit approval.
-- Expected only IF the older event also has matching parent-topic provenance: 5 eligible, 4 topics, 0 excluded.
-- If not, STOP and inspect metadata. Do not backfill, fabricate, or bypass the provenance gate.
