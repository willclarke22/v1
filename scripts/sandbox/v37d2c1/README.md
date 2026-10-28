# V3.7D.2C.1 — Shadow semantic association verifier

Select Edge Dev, GPT-4o mini, GPT-4.1 mini, GLM-5.3, GLM Flash or GLM FlashX independently for the verifier. Existing backend restrictions apply.

The verifier runs after semantic retrieval and BEFORE teaching, adds a separate Workbench comparison, latency and model cost. It is observational only. Its decisions cannot change the deterministic topicMemory proposal, topic target, approval token, autoEligible flag, or persistence.

The existing D2C auto-save opt-in still works under existing strict deterministic rules. No automatic creation or global layout worker. No Supabase writes during installation. No new external API route; existing pinned local teaching/GLM routes are extended with strict verifier format.

**Evaluation:** `node scripts/sandbox/v37d2c1/test-v37d2c1.mjs <ProjectRoot>` checks malformed/unknown IDs, allowed relations, provider guards, model selection, and shadow-only invariants. Review model decisions against matching and nonmatching scenarios before enabling write authority in a later patch.

**Known limitation:** No independent durable unassigned scored-observation ledger yet. If topic matching holds, confusion/insight are still visible in the trace but not yet persisted independently. That needs a separate isolated, approved schema/migration and user-scoping design.
