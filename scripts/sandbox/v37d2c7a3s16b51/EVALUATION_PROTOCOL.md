# S1.6B.5.1 — Evaluation protocol

1. Offline default: correction PHOTO_T10, closure PHOTO_T10A, reported progress PROGRESS01; each has adaptive_v5 and calibrated_v5_1; zero model calls.
2. Run `--set actions --limit 7 --mode offline` to inspect all seven selected instructional actions, including the two labeled synthetic action probes (MED_REPAIR and MED_VERIFY).
3. If approved after the free checks, use `--mode model --limit 3 --variants adaptive,calibrated --allow-spend --budget-usd 0.05` while local server is active. Admission budget is NOT a hard billing cap. Up to six normal calls plus a capped two formatting retries. Actual estimated USD logged from returned usage when present, unknown costs stop the run.
4. Rate paired outputs blindly if possible: (a) accurately acknowledges precisely what changed and preserves real older history; (b) closure avoids unsolicited reteaching/question; (c) reported vs demonstrated evidence is appropriately calibrated; (d) next move fits what learner requested; (e) accuracy; (f) naturalness and restraint. Each judgment must quote evidence; do not infer actual learner outcomes from examples.
5. Do not promote to persistent learner state or production without a separate reviewed release and multi-turn tests.
