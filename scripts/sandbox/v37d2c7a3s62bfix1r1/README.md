# MyWay S62B-FIX1R1 — Reliable report writer

Add-only research successor to S62B-FIX1. No production API/DB routes and no migration.

## Failure being addressed

The old runner rebuilt and overwrote `TURN_INSPECTOR.html` on every checkpoint. On Windows, a write to this file failed while episode 3 was being routed, aborting a free 20-episode run. The root filesystem error (`UNKNOWN: unknown error, open`) is not conclusively diagnosed; reducing unnecessary HTML writes is a mitigation, not proof that antivirus, indexing, storage or other causes are absent.

## Changed

- Keep durable `TRACE.json` checkpoints during episodes, but generate HTML only once after all episodes finish (including a partial-run failure).
- Clearly report HTML generation failures while preserving an authoritative trace and summary; no fabricated model results or progress.
- A separate read-only-replay report reconstructor creates `TURN_INSPECTOR_RECOVERED.html` without changing `TRACE.json`, including for the interrupted FIX1 run.
- All original FIX1 modules and S62B remain byte-identical; only add `s62bfix1r1-*` files and stage verifier.
- No automatic retry in Model mode; no spending without explicit budget approval.

## Not solved

The OS-level reason behind Windows `UNKNOWN` is unknown; partial reports cannot be resumed with guarantees. The 20-episode test is synthetic, symbolic and unscored for educational quality. Real model reasoning, 2D/3D/audio rendering, deployment and production persistence remain unvalidated.

## R1 v2 verification policy
R1 v2 checks signed-off source hashes and installation receipts of original S62B/FIX1 without rerunning the old FIX1 HTML-writing selftest. New R1 tests execute at install; runtime launch only runs pinned integrity verification. This avoids masking the known Windows legacy report failure.
