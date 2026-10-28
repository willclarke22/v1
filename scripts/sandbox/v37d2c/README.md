# V3.7D.2C — Semantic difficulty reconciliation and model-estimated signal observations

Experimental v1-learning-experiment only. Must be installed AFTER successful D.2B Fix 3. No new database tables. Existing D.2B embeddings and 3D scene unchanged.

* Compare local MiniLM embeddings of existing stored root-problem texts with the current root problem (in addition to label-level pgvector search). No third paid model is called.
* New-topic suggestions are blocked when a plausible matching difficulty is detected, even if the candidate does not meet the high-confidence associate threshold.
* Explicitly approved association saves score observations (`confusion`, `insight` each 0..10 or missing when -1) alongside evidence. Only D.2A-created topics update provisional `topic_state.confusion` and `.insight` in [0..1] from the observed mean; no learning-score/mastery changes. Legacy topic aggregate signals are never overwritten.
* Optional checkbox in Learning Space permits automated append of ONE scored observation to an existing topic after a COMPLETED teaching response when a particularly strong, unique semantic difficulty match is found. Unchecked by default, opt-in per browser tab, no hidden persistent preference.
* New topic creation remains explicit Workbench approval. Hold/ambiguous/lexical/missing scores never trigger automatic writes.
* Distinct source-only rollback cannot undo an approved/automatic database write.

Model estimated confusion/insight values are observational signals, not calibrated outcomes or verified understanding. Same local embedding service must remain available (port 8001). Global layout/legacy workers and Director remain disabled.
