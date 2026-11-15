# S62A-FIX1C.1: pinned partial-comparison continuation

Research-only, add-only follow-up to S62A-FIX1C. The original paid comparison stopped after exactly one call because the new Model A revision cited a root-problem ID (`MICA-R-001`) as though it were a learner-knowledge record.

- Preserve the exact original invalid response and its usage/cost. Never convert a cross-collection revision into a valid proposal.
- Continue the remaining 23 frozen arms using **unchanged FIX1B/FIX1C prompts and evidence**. This stage does not evaluate or automatically grade learning science.
- Invalid structured model actions remain recorded as invalid results; subsequent calls proceed. Missing/unknown usage or a provider/transport failure stops the run and requires human review before any new paid attempt.
- Exactly one paid continuation attempt; never delete marker automatically or retry unobserved calls.
- Original FIX1C source unchanged; no production, Supabase or other database writes.
- Read-only planning verifies original ZIP SHA, exact RESULTS bytes and the frozen case hash.

See README_INSTALL.md at package root for safe Windows commands.
