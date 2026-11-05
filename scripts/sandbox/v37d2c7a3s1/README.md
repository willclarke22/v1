# V3.7D.2C.7A.3S1 — Learning Intelligence Terminal Harness

This is a read-only experiment-infrastructure patch based on the user's November 4, 2026 15:59 EST clean committed full source dump. It is intentionally limited to `scripts/sandbox/learning-intelligence/`, `scripts/sandbox/v37d2c7a3s1/`, and `scripts/sandbox/current-local-release.json`.

- Adds deterministic 160-case, 16-domain synthetic fixture evaluation using the SAME production `difficulty-identity.ts` logic.
- Adds optional live MiniLM event embeddings via fixed local port 8001; not a substitute for production pgvector retrieval.
- Adds explicit opt-in local GPT-4.1-mini/GPT-4o-mini Model A and Model C inference comparisons via existing read-only localhost:3001 routes only, without touching topic tables.
- Adds provider-reported token usage ledger with MyWay's existing model cost table, USD known subtotal, unpriced failures, conservative per-call admission reserve and budget stop.
- Adds no route, UI, persistence, topic, RLS, Supabase schema, Cron, or cloud changes.
- Does not change runtime memory policies, automatic association, or original `v1/main`.
- Installation preflight guards against uncommitted files, branch mismatch, original-main drift, protected Git common-dir mismatch, and 7A.3R2 preimage drift. Verifies ZIP payload hashes, copies files transactionally, runs tests/TypeScript and restores all original bytes on failure.
- The original 7A.3R2 release verifier pins the *pre-commit* Git HEAD; S1 deliberately does not run that obsolete head check. It verifies source preimages separately instead.

See `scripts/sandbox/learning-intelligence/README.md` for commands and rigorous limitations. S1 is a terminal infrastructure milestone, **not** a claim of safe unattended memory automation.
