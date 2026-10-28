# MyWay V3.7C.1 - Real read-only 3D Learning Space + Developer Workbench

**Scope:** Local-only, no external write operations, no model requests, no workers.

## Files introduced in experimental worktree

- `proxy.ts`: fail-closed local-only route boundary. Blocks all legacy `/api/*` write-capable routes, root original UI and unrelated sandbox APIs; allows only the read-only Learning Space API, Learning Space, Workbench, Next dev internals.
- `app/api/sandbox/probe-lab/learning-space/readonly/route.ts`: GET-only experimental Supabase snapshot.
- `sandbox/probe-lab/learning-space/snapshot.server.ts`: reconstructs renderer-ready scene and topic diagnostics from pinned experimental Supabase rows.
- `app/sandbox/probe-lab/learning-space/page.tsx` + `learning-space-preview.tsx`: reuses `SpaceCanvas`, `Sidebar`, `TopicPanel`, `BottomComposer` and `buildLearningSpace`.
- `app/sandbox/probe-lab/learning-space/workbench/page.tsx` + `workbench.tsx`: separate read-only topic/detail/embedding-layout inspector.
- `scripts/sandbox/v37c1/verify-preview.mjs` and `run-readonly-preview.ps1`: preflight and guarded local launcher.

Existing Next startup gate from V3.7B.3 remains unchanged: only the launcher sets a **process-scoped** approval after verification. Experimental legacy worker remains hard-blocked. Production files/worktree and production data are not modified.

## Install (PowerShell, after downloading the single ZIP to Downloads)

```powershell
$ErrorActionPreference = 'Stop'
Set-ExecutionPolicy -Scope Process Bypass -Force
$zip = Join-Path $env:USERPROFILE 'Downloads\MyWay_Learning_Sandbox_V3_7C_1_ReadOnly_Learning_Space.zip'
$dir = Join-Path $env:TEMP ('myway-v37c1-' + [guid]::NewGuid().ToString('N'))
Expand-Archive -LiteralPath $zip -DestinationPath $dir -Force
& (Join-Path $dir 'install-myway-learning-sandbox-v3_7c1.ps1')
```

## Run

From `C:\Users\willc\projects\MyWay\v1-learning-experiment`:

```powershell
& '.\scripts\sandbox\v37c1\run-readonly-preview.ps1'
```

If the experiment's `node_modules/next` is missing, run `pnpm install --frozen-lockfile` **in the experimental worktree only**, then run the guarded launcher again. Do **not** run `pnpm dev` directly or set the launch-approval environment variable yourself. Do **not** start legacy workers.

- Learning Space: `http://127.0.0.1:3001/sandbox/probe-lab/learning-space`
- Workbench: `http://127.0.0.1:3001/sandbox/probe-lab/learning-space/workbench`

The composer accepts text for **local preview feedback only**. It never submits a learner turn. No model calls, topic changes, SQL inserts/updates/deletes or layout recomputations occur in V3.7C.1.

The experiment continues to require the pinned project and its .env.local. Never deploy this branch, expose the dev server publicly, copy production credentials, or disable the route/startup gates. V3.7C.2 will connect live assessment/teaching with controlled writes only after further auditing.
