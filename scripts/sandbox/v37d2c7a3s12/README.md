# V3.7D.2C.7A.3S1.2 — Model C selective benchmark

- Prerequisite: installed S1.1 and pinned 7A.3R2 runtime, clean original main at `462a7a4`.
- Adds a localhost-only, dev-only **shadow** 4-way model adjudicator with exact event anchor validation.
- Adds balanced/priority/all evaluation selection, semantic scoring, bounded paid model calls, cost breakdown and diagnostic metrics.
- No Supabase reads/writes, SQL, cloud jobs, Git writes, live topic/difficulty mutations, user-facing UI changes, or automatic learning-memory association.
- Guards and rollback work with the previous S1.1 installed source; does not rely on the obsolete pre-commit 7A.3R2 Git HEAD pin.
- Provider pricing remains an estimate, not a hard billing cap. All paid runs require explicit model-mode opt-in.
