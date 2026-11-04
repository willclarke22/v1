# MyWay V3.7D.2C.7A.3R2 — Borderline Approved Event Review

FIX2 after 7A.3R/FIX1 is installed. This is a source-only experiment patch; no SQL, Git writes, Cron, cloud models or deployments.

- The one existing approved Photosynthesis event remains immutable.
- Topic-subject routing is unchanged; verified approved-event scores from 0.70 to 0.80 with strong subject certainty and unambiguous winner now prompt explicit human review rather than claiming a new difficulty.
- A selected 'same difficulty' action reuses the server-held anchor under one-use approval only; 'different difficulty' creates an independent event ID and difficulty ID. No option is preselected. Ambiguity and missing event comparisons hold.
- Old and new provisional root statements and event-specific similarity are displayed in both Workbench and Learning Space.
- Similarity can be topical, so the reviewer must compare meaning and evidence, not treat score or Model C as truth.
- Keeps dev-only runtime guard, read-only event comparisons, same-origin approval, snapshot digest, server-side checked identity, read-back verification and original main isolation.
- Offline installer backs up source and rolls back on failed preflight/compiler/tests. Run only on the specified experimental worktree.

Test before any write: enter a Photosynthesis paraphrase and inspect the *approved event* score and proposed identity. Do not approve until reviewed. The known original event is `be9b9f6a-9c0d-4408-97c8-9ee63a53cbe2`.
