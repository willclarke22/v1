# MyWay V3.7B.3 — Experimental Runtime Safety Gate

## Goal
Protect the original MyWay while preparing to launch the next-generation Learning Space. 42 topics and 84 vectors have already been transferred to the pinned `myway_sandbox` project.

## Changes
1. A **Next.js startup gate** is inserted into `next.config.ts` inside the experimental worktree only. It checks the experimental project URL and service-key fingerprints, the original project's hashes, the worktree identity, Supabase-only mode and missing Qdrant credentials. It then **deliberately blocks startup** until a V3.7C route audit and guarded launcher are completed. Do not set or bypass the launch-approval variable manually.
2. The old `scripts/local-dev/semantic-enrichment-worker.ps1` in the experimental worktree is given an immediate hard stop, preventing it from targeting `localhost:3000`, killing shared local model services or writing via unreviewed routes. The original `v1` worker remains untouched.
3. Adds an audit that makes **GET-only** queries to the already pinned sandbox project for topic/vector/run/attempt counts. It reads only record IDs, never contents.
4. No credentials, database mutations, Qdrant actions, migrations, package installs, build steps, server startups or Git commits are performed by the installer.

## Install
Run the one-ZIP `install-myway-learning-sandbox-v3_7b3.ps1` launcher (from any working directory).

## Read-only verification
From the experimental VS Code PowerShell terminal:
```powershell
& '.\scripts\sandbox\v37b3\run-readonly-audit.ps1'
```
Expected: `V3.7B.3 READ-ONLY PASS`, normally reporting 42 topics / 84 vectors, with 0 runs or attempts.

Report: `%USERPROFILE%\Documents\MyWayDumps\myway-v37b3-readonly-runtime-audit.json`. The report contains no secrets or raw learner/topic data.

## Stop conditions
- Missing/unmatched V3.7B.0/B.2 destination fingerprints.
- Changes to files that the installer expected to be in their committed state.
- Any Qdrant keys present in the experimental `.env.local`.
- Mismatched expected live counts, or any runs/attempts unexpectedly written.

## What remains for V3.7C
- Audit and explicitly replace/disable legacy app API write routes and realtime/browser behavior.
- Add the **new** Learning Space UI and Developer Workbench with sandbox-specific API routes.
- Implement a sandbox-only Next.js launch script on port 3001 after verification, plus separate worker lifecycle in later releases.
- Review whether a browser publishable/anon Supabase key is needed or whether all data should load via guarded server routes. Never expose the service-role key in client code.

The startup gate is intentionally restrictive; this patch proves the environment is still isolated, rather than making an unreviewed production-style application executable.
