# V3.7D.2C.1 — Turbopack Client Directive Hotfix

Fixes Next.js 16.2.1 build failure caused by a verifier import being inserted above `"use client"` in `learning-turn.client.ts`. Application code is unchanged except the ordering of those two top-level lines.

Requires the already-successfully-installed V3.7D.2C.1 release and its installation marker. The hotfix installer verifies the current release, copies the corrected source, updates only the existing release marker's file hash for that source, and runs all old safety tests, TypeScript, and the new AST-based client directive check.

The old `scripts/sandbox/v37d2c1/run-preview.ps1` continues to work after installation because its checksum verifier remains consistent. No migration, worker, provider, new write route, or data change.

Source rollback: invoke `ROLLBACK_D2C1_CLIENT_DIRECTIVE_HOTFIX.ps1` from this ZIP, which restores the original client file and the release marker from byte-for-byte backups; this will reintroduce the original Next build error, so use only if the hotfix fails for another reason.
