# MyWay V3.7B.0 — Fail-closed isolation and live metadata discovery

## Purpose

Install into the existing **v1-learning-experiment** worktree only. Fix hardcoded Qdrant collection use in application and repository scripts, install runtime guards for Supabase and Qdrant, and generate a **read-only** metadata report from your existing original environment. Original source files and external databases are not changed.

## This DOES NOT do

- Create experimental Supabase project, schema, credentials or tables.
- Create or modify Qdrant collections or vectors.
- Start Next.js or workers, or migrate production data.
- Clone records that might contain learner personal data.

The next infrastructure release requires live-schema verification and independent experimental credentials.

## Safety

- Verifies V3.7A installation marker and exact Git worktree relationship.
- Verifies six pristine source fingerprints from the 2026-10-24 dump.
- Does not load `.env.local` into the experimental application.
- Records only one-way SHA-256 fingerprints of the original Supabase URL and original service-role key in `isolation-boundary.json`, never the raw secrets.
- Every server Supabase client creation and Qdrant client/config access in the experimental branch checks the runtime marker and destination. The original worktree is untouched.
- The live auditor uses GET-only API calls, with a timeout. It stores field names/structure and collection vector settings, never data rows, Qdrant payloads, keys, or full API URLs.
- The SQL table/column metadata available over Supabase PostgREST/OpenAPI does **not** prove indexes, functions, triggers, RLS policies or a complete SQL schema. These must be verified separately.

## Output

Under `v1-learning-experiment/scripts/sandbox/v37b`:
- `installation.json`: patch metadata and SHA checks
- `isolation-boundary.json`: safety fingerprints, no credentials
- `readonly-live-audit.json`: API metadata, or clear blockers if network is unavailable
- `EXPERIMENTAL-ENV.example`: inert setup template
- `README.md`: this guide
- `audit-live-readonly.mjs`: optional rerun of GET-only inspection
- `verify-v37b.mjs`: local static source/marker verification

## Next steps

Inspect the reported blockers, verify Supabase SQL migrations in the original project dashboard, provision separate experimental Supabase project and Qdrant collection, and only then set up experimental `.env.local`. Do not start the experimental Next.js app or workers until a later patch verifies project and collection IDs **and** the worker URL/ports.
