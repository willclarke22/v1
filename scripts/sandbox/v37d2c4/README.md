# MyWay V3.7D.2C.4: Interactive 3D Cloud Demo

Release from experimental branch commit `55760a3` only. No production change; no Supabase queries or inference enabled.

## What this does

The Vercel Learning Space page uses **the original** `SpaceCanvas`, `Sidebar`, `TopicPanel`, `buildLearningSpace`, and progress UI with nine **fictional demonstration topics**. Rotate and zoom the actual WebGL canvas, select spheres, open panels and switch relationship modes. Text input is disabled. The existing cloud Workbench remains a static status shell.

## Security boundaries

- Existing pinned Vercel project / branch / isolated Supabase checks in `lib/sandbox/v37d2c3` are unchanged.
- Existing cloud proxy still denies all APIs, non-GET methods, unrelated routes and writes.
- Demo fixture module imports **no** Supabase, embedding, model, or network client. No learner data is loaded.
- The original local page continues to use `LearningSpacePreview` exactly as before.
- Vercel Authentication (All Deployments) should remain enabled.
- Do not add a service-role key, Qdrant URL or any production environment variables to Vercel.

## Install / inspect / push

Run `INSTALL_V37D2C4.ps1` from the extracted ZIP. Wait for `INSTALL SUCCESS`; do not install over a different Git baseline. Test source integrity and TypeScript on your actual checkout before committing. Backups and `installation.json` are kept out of Git.

Then stage **only**:

- `app/sandbox/probe-lab/learning-space/page.tsx`
- `lib/sandbox/v37d2c4/cloud-learning-space-demo.tsx`
- `lib/sandbox/v37d2c4/demo-topics.ts`
- `scripts/sandbox/v37d2c4/README.md`
- `scripts/sandbox/v37d2c4/test-v37d2c4.mjs`
- `scripts/sandbox/v37d2c4/verify-v37d2c4.mjs`
- `scripts/sandbox/v37d2c4/tsconfig.verify.json`

This is **7** source files including the original page, NOT the local marker.

Do not deploy until Vercel project identity variables, `MYWAY_CLOUD_SHELL_MODE=readonly` and deployment protection remain configured. The URL `/sandbox/probe-lab/learning-space` should render WebGL spheres. `/sandbox/probe-lab/learning-space/workbench` will still show the read-only shell. If WebGL is disabled in the visiting browser, 3D may not render.

Use `ROLLBACK_V37D2C4.ps1` for a local-only rollback if all source hashes match the installed patch. Remote rollback requires a separate reviewed Git commit and push.
