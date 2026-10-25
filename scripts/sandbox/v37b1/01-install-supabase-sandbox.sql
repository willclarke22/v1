-- MyWay V3.7B.1 | Experimental Supabase-only schema | 2026-10-24
-- DESIGNED ONLY FOR EMPTY myway_sandbox PROJECT.
-- STOP: This is a WRITE migration. Never run in the original MyWay project.
-- It deliberately refuses any project that already contains MyWay core tables.
-- No credentials, learner data, or original project IDs are embedded here.
-- SQL Editor (myway_sandbox) -> New query -> paste full file -> Run.
-- Safe-run policy: one transaction; fail-closed schema check runs before CREATE.

BEGIN;

DO $guard$
BEGIN
  IF current_user NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'V3.7B.1 BLOCK: SQL Editor/admin role required';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m')
      AND c.relname IN ('topic_state','runs','attempts','topic_vectors')
  ) THEN
    RAISE EXCEPTION 'V3.7B.1 BLOCK: target already contains a MyWay table. Do NOT run against original Supabase; no changes committed.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN
      ('myway_match_topics','myway_sync_topic_vectors','myway_upsert_topic_vector')
  ) THEN
    RAISE EXCEPTION 'V3.7B.1 BLOCK: pre-existing MyWay vector functions; refusing overwrite.';
  END IF;
END;
$guard$;

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

-- Exact structural clone of audited core tables: columns, defaults, PK/FK,
-- constraints, indexes, and RLS. No original records are transferred.
CREATE TABLE public.runs (
  id text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  run_type text NOT NULL,
  user_message text,
  source_message_id text,
  target_topic_id text,
  mode_selected text,
  active_diagnosis text,
  reply_text text,
  suggested_action text,
  run_result_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT runs_pkey PRIMARY KEY (id),
  CONSTRAINT runs_mode_selected_check CHECK (mode_selected = ANY (ARRAY['clarify'::text, 'probe'::text])),
  CONSTRAINT runs_run_type_check CHECK (run_type = ANY (ARRAY['message'::text, 'probe_submit'::text]))
);

CREATE INDEX runs_created_at_idx ON public.runs USING btree (created_at DESC);

CREATE INDEX runs_target_topic_id_idx ON public.runs USING btree (target_topic_id);

CREATE INDEX runs_run_type_idx ON public.runs USING btree (run_type);

ALTER TABLE public.runs ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.attempts (
  id text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  run_id text NOT NULL,
  probe_id text,
  topic_id text NOT NULL,
  response_text text,
  classification text,
  correctness_estimate text,
  explanation_quality text,
  insight numeric,
  confusion numeric,
  attempt_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT attempts_pkey PRIMARY KEY (id),
  CONSTRAINT attempts_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.runs(id) ON DELETE CASCADE
);

CREATE INDEX attempts_run_id_idx ON public.attempts USING btree (run_id);

CREATE INDEX attempts_topic_id_idx ON public.attempts USING btree (topic_id);

CREATE INDEX attempts_probe_id_idx ON public.attempts USING btree (probe_id);

CREATE INDEX attempts_created_at_idx ON public.attempts USING btree (created_at DESC);

ALTER TABLE public.attempts ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.topic_state (
  topic_id text NOT NULL,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  last_run_id text,
  topic_label text NOT NULL,
  confusion numeric,
  insight numeric,
  learning_score numeric,
  diagnosis text,
  next_step text,
  topic_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  topic_position_x double precision,
  topic_position_y double precision,
  topic_position_z double precision,
  semantic_enrichment_status text,
  needs_embedding_centroid boolean DEFAULT false,
  should_schedule_enrichment boolean DEFAULT false,
  semantic_enrichment_prompt_text text,
  layout_status text,
  embedding_skip_reason text,
  semantic_position_x double precision,
  semantic_position_y double precision,
  semantic_position_z double precision,
  semantic_position_updated_at text,
  semantic_position_method text,
  topic_label_embedding_centroid jsonb,
  topic_label_embedding_count integer NOT NULL DEFAULT 0,
  topic_label_embedding_model text,
  topic_label_embedding_updated_at timestamp with time zone,
  topic_message_embedding_centroid jsonb,
  topic_message_embedding_count integer NOT NULL DEFAULT 0,
  topic_message_embedding_model text,
  topic_message_embedding_updated_at timestamp with time zone,
  CONSTRAINT topic_state_pkey PRIMARY KEY (topic_id),
  CONSTRAINT topic_state_last_run_id_fkey FOREIGN KEY (last_run_id) REFERENCES public.runs(id) ON DELETE SET NULL
);

CREATE INDEX topic_state_updated_at_idx ON public.topic_state USING btree (updated_at DESC);

CREATE INDEX topic_state_learning_score_idx ON public.topic_state USING btree (learning_score DESC);

ALTER TABLE public.topic_state ENABLE ROW LEVEL SECURITY;


-- Sandbox-native vector index; original JSONB centroid fields are untouched.
CREATE TABLE public.topic_vectors (
  topic_id text NOT NULL REFERENCES public.topic_state(topic_id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('label','message')),
  embedding_model text NOT NULL CHECK (length(btrim(embedding_model)) > 0),
  embedding extensions.vector(384) NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT topic_vectors_pkey PRIMARY KEY (topic_id,kind)
);
ALTER TABLE public.topic_vectors ENABLE ROW LEVEL SECURITY;
CREATE INDEX topic_vectors_kind_model_idx ON public.topic_vectors(kind,embedding_model);
-- Exact cosine search is intentional at current topic counts. Benchmarks
-- will determine whether to add HNSW later.

CREATE FUNCTION public.myway_upsert_topic_vector(
  p_topic_id text, p_kind text, p_centroid jsonb, p_model text
) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp
AS $body$
BEGIN
  -- Invalid or incompatible centroids never enter pgvector. This includes
  -- missing model identifiers and vectors of a different dimension.
  IF p_centroid IS NULL OR p_model IS NULL OR btrim(p_model) = '' THEN
    DELETE FROM public.topic_vectors WHERE topic_id=p_topic_id AND kind=p_kind;
    RETURN;
  END IF;
  IF jsonb_typeof(p_centroid) <> 'array' THEN
    DELETE FROM public.topic_vectors WHERE topic_id=p_topic_id AND kind=p_kind;
    RETURN;
  END IF;
  IF jsonb_array_length(p_centroid) <> 384 OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_centroid) AS x(value)
    WHERE jsonb_typeof(x.value) <> 'number'
  ) THEN
    DELETE FROM public.topic_vectors WHERE topic_id=p_topic_id AND kind=p_kind;
    RETURN;
  END IF;
  INSERT INTO public.topic_vectors(topic_id,kind,embedding_model,embedding,updated_at)
  VALUES (p_topic_id,p_kind,p_model,p_centroid::text::extensions.vector(384),now())
  ON CONFLICT (topic_id,kind) DO UPDATE SET
    embedding_model=EXCLUDED.embedding_model,
    embedding=EXCLUDED.embedding,
    updated_at=now();
END;
$body$;

CREATE FUNCTION public.myway_sync_topic_vectors()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp
AS $body$
BEGIN
  PERFORM public.myway_upsert_topic_vector(
    NEW.topic_id,'label',NEW.topic_label_embedding_centroid,NEW.topic_label_embedding_model
  );
  PERFORM public.myway_upsert_topic_vector(
    NEW.topic_id,'message',NEW.topic_message_embedding_centroid,NEW.topic_message_embedding_model
  );
  RETURN NEW;
END;
$body$;

CREATE TRIGGER topic_state_to_vectors
AFTER INSERT OR UPDATE OF
  topic_label_embedding_centroid, topic_label_embedding_model,
  topic_message_embedding_centroid, topic_message_embedding_model
ON public.topic_state
FOR EACH ROW EXECUTE FUNCTION public.myway_sync_topic_vectors();

-- This RPC is intended for the server service-role client only.
-- Match vectors generated by the SAME embedding model and purpose.
CREATE FUNCTION public.myway_match_topics(
  p_query jsonb, p_kind text, p_model text, p_limit integer, p_min_similarity double precision
)
RETURNS TABLE(topic_id text, topic_label text, embedding_model text, similarity double precision)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public, pg_temp
AS $body$
BEGIN
  IF p_query IS NULL OR jsonb_typeof(p_query) <> 'array' THEN
    RAISE EXCEPTION 'myway_match_topics: query must be a 384-element numeric JSON array';
  END IF;
  IF jsonb_array_length(p_query) <> 384 OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_query) AS x(value)
    WHERE jsonb_typeof(x.value) <> 'number'
  ) THEN
    RAISE EXCEPTION 'myway_match_topics: query must contain exactly 384 numbers';
  END IF;
  IF p_kind IS NULL OR p_kind NOT IN ('label','message') OR p_model IS NULL OR btrim(p_model) = '' THEN
    RAISE EXCEPTION 'myway_match_topics: kind and matching model are required';
  END IF;
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'myway_match_topics: limit must be 1 to 100';
  END IF;
  IF p_min_similarity IS NULL OR p_min_similarity < -1 OR p_min_similarity > 1 THEN
    RAISE EXCEPTION 'myway_match_topics: similarity threshold must be -1 to 1';
  END IF;
  RETURN QUERY
    SELECT t.topic_id,t.topic_label,v.embedding_model,
           (1 - (v.embedding <=> (p_query::text::extensions.vector(384))))::double precision AS similarity
    FROM public.topic_vectors v
    JOIN public.topic_state t ON t.topic_id=v.topic_id
    WHERE v.kind=p_kind AND v.embedding_model=p_model
      AND (1 - (v.embedding <=> (p_query::text::extensions.vector(384)))) >= p_min_similarity
    ORDER BY v.embedding <=> (p_query::text::extensions.vector(384)) ASC, t.topic_id ASC
    LIMIT p_limit;
END;
$body$;

-- RLS on topic tables stays on with ZERO public policies (matching source).
-- Avoid exposing similarity RPC to anon/authenticated REST callers.
REVOKE ALL ON FUNCTION public.myway_upsert_topic_vector(text,text,jsonb,text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.myway_sync_topic_vectors()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.myway_match_topics(jsonb,text,text,integer,double precision)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.myway_match_topics(jsonb,text,text,integer,double precision)
  TO service_role;

COMMIT;
-- DO NOT insert synthetic learner evidence into original production records.
