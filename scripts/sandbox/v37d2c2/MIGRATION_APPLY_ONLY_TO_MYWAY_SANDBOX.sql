-- D.2C.2. MANUAL SUPABASE SQL EDITOR ACTION IN ISOLATED myway_sandbox ONLY.
-- DO NOT run in production, original v1, or a shared database.
-- Separate append-only observations allow hold decisions to retain validated score estimates.
create table if not exists public.myway_sandbox_learning_observations (
  event_id uuid primary key,
  created_at timestamptz not null default now(),
  topic_id uuid null,
  topic_label_candidate text not null,
  root_problem text not null,
  evidence_quote text not null,
  confusion smallint null check (confusion between 0 and 10),
  insight smallint null check (insight between 0 and 10),
  evidence_confidence numeric not null check (evidence_confidence between 0 and 1),
  rubric text not null check (rubric = 'model_0_10_v1'),
  origin text not null check (origin = 'v37d2c2_explicit_session_opt_in')
);
alter table public.myway_sandbox_learning_observations enable row level security;
revoke all on public.myway_sandbox_learning_observations from anon, authenticated;
-- No client-side RLS policy: the pinned server-only client handles writes.
-- No trigger creates topics or updates topic scores/mastery.
