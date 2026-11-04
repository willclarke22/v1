# MyWay V3.7D.2C.7A.2 — Topic decisions and in-panel search previews

**Experiment only.** Based on installed V3.7D.2C.7A.1, original `v1/main` checkpoint `462a7a4`, and isolated experiment branch `myway/learning-sandbox-v3_7a`. The 7A.1 ZIP was installed but not committed at the start of this patch. The installer accepts that exact earlier uncommitted state, or a clean 7A.1-only commit, after verifying hashes and Git lineage. It never stages or commits source.

## What changed

- The existing transient search bubbles move from a centered, absolute canvas overlay into **MyWay Response** in the left sidebar. On submit, that panel automatically opens. Candidates remain **existing, read-only topic previews**, not created spheres; clicking one selects the existing sphere. Loading dots, progress and semantic/lexical labels remain available.
- Workbench now explicitly shows the distinction between the **deterministic memory action** (which controls server-issued tokens) and **Model C's advisory relation**. This makes a “same topic, new difficulty” verifier suggestion versus a “propose new” deterministic action visible instead of quietly implying agreement.
- Manual Model C-reviewed association controls are shown only when the **same server review evidence validator** reports eligibility. A weak historical similarity such as the electron-energy test (`0.198`) no longer yields a misleading approval button.
- Server only issues a short-lived review capability when at least one candidate satisfies that unchanged reviewed-association evidence gate. The route still rechecks the exact target on consumption; no added authority, no new thresholds, no memory-write endpoint.
- The deterministic proposal now checks **all server-held topic labels**, not just the top five semantic matches, before suggesting a new sphere. A canonical exact-label collision holds for review even when the matching sphere was absent from the nearest-neighbor results. This can block duplication but cannot force an association.
- The deterministic proposal now checks **all server-held topic labels**, not just the top five semantic matches, before suggesting a new sphere. A canonical exact-label collision holds for review even when the matching sphere was absent from the nearest-neighbor results. This can block duplication but cannot force an association.
- Small pure read-only explanation module avoids duplicating decision explanations in React. No model prompts changed; no data migrations or cloud permissions changed.

## Acceptance tests

1. Stop Next on 3001, install ZIP with checksum-verified PowerShell launcher, and inspect all output. The installer checks exact 7A.1 ancestor/manifest, node tests, Git branch and original/main identity, and creates source backups. Targeted and full TypeScript validation must pass.
2. Launch local MyWay and submit a learner question with **Auto-create**, **Auto-match**, and **Save score observations** OFF. The search dots and topic bubbles must appear inside the **MyWay Response** section in the left panel, not over the 3D canvas. Clicking a candidate should select its existing sphere without creating a new sphere.
3. Repeat atomic-solid example. Workbench should show agreement between Model C and topic-memory evidence; reviewed association requires a real capability and checkbox.
4. Repeat electron-energy query. If the historical difficulty similarity remains low, Model C may suggest an existing broad topic, but the approval control must **not** be offered. The deterministic proposal/hold must remain unchanged and clearly explained.
5. Repeat vague entanglement question. An existing label without root-problem evidence must not authorize an automatic association. Verify no unexpected database writes.
6. Inspect `git status`, `git diff --check`, and exact staged paths before any separate commit. Never run `git add -A` blindly.

## Limitations

This patch does **not** solve topic-taxonomy decisions with another model. Whether electron energy levels deserve a new sphere remains a review decision; subject similarity alone cannot prove historical difficulty equality. Relationships, teaching/voice refinement and cloud Model A/B/C remain later milestones. Historical difficulty embeddings on Vercel still require the previous manual 7A indexing workflow.

No SQL, Cron, cloud model inference, cloud topic writes, model/API keys, Git commits or deployments are executed by this ZIP. Rollback restores **only this patch** and leaves the previously installed 7A.1 sources in place.
