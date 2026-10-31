-- V3.7D.2C.5B / SANDBOX ONLY / REVIEW BEFORE EXECUTION.
-- Run ONLY in Supabase myway_sandbox SQL Editor. It creates TWO NEW snapshot tables.
-- Does NOT migrate topic data, add policies to existing tables, change auth users,
-- or enable writes for anon/authenticated clients.
-- WARNING: Supabase SQL Editor uses privileged role: confirm project identity manually.
BEGIN;
CREATE TABLE public.myway_cloud_topic_snapshot (
  owner_uid uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  topic_id text NOT NULL,
  topic_label text NOT NULL,
  diagnosis text,
  next_step text,
  confusion double precision,
  insight double precision,
  learning_score double precision,
  topic_position_x double precision NOT NULL,
  topic_position_y double precision NOT NULL,
  topic_position_z double precision NOT NULL,
  semantic_position_x double precision,
  semantic_position_y double precision,
  semantic_position_z double precision,
  semantic_position_method text,
  semantic_position_updated_at text,
  PRIMARY KEY(owner_uid,topic_id)
);
CREATE TABLE public.myway_cloud_relationship_snapshot (
  owner_uid uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  relationship_id text NOT NULL,
  source_topic_id text NOT NULL,
  target_topic_id text NOT NULL,
  relationship_type text NOT NULL,
  strength double precision NOT NULL,
  confidence double precision NOT NULL,
  evidence_count integer NOT NULL DEFAULT 0,
  visible_by_default boolean NOT NULL DEFAULT false,
  affects_layout boolean NOT NULL DEFAULT false,
  show_in_overview boolean NOT NULL DEFAULT false,
  show_on_focus boolean NOT NULL DEFAULT true,
  max_opacity double precision NOT NULL DEFAULT 0.35,
  visual_style text NOT NULL DEFAULT 'thread',
  priority double precision NOT NULL DEFAULT 1,
  PRIMARY KEY(owner_uid,relationship_id),
  FOREIGN KEY(owner_uid,source_topic_id) REFERENCES public.myway_cloud_topic_snapshot(owner_uid,topic_id) ON DELETE CASCADE,
  FOREIGN KEY(owner_uid,target_topic_id) REFERENCES public.myway_cloud_topic_snapshot(owner_uid,topic_id) ON DELETE CASCADE
);
ALTER TABLE public.myway_cloud_topic_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.myway_cloud_topic_snapshot FORCE ROW LEVEL SECURITY;
ALTER TABLE public.myway_cloud_relationship_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.myway_cloud_relationship_snapshot FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.myway_cloud_topic_snapshot FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.myway_cloud_relationship_snapshot FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.myway_cloud_topic_snapshot TO authenticated;
GRANT SELECT ON public.myway_cloud_relationship_snapshot TO authenticated;
CREATE POLICY myway_cloud_topics_owner_select ON public.myway_cloud_topic_snapshot
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = owner_uid);
CREATE POLICY myway_cloud_relationships_owner_select ON public.myway_cloud_relationship_snapshot
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = owner_uid);
COMMIT;
