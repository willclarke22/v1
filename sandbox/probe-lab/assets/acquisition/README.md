
# Missing-asset acquisition queue

This folder contains the sandbox demand-driven asset workflow.

Flow:

1. A generated scene resolves only scene-approved assets.
2. Every unresolved physical requirement is deduplicated by normalized concept
   plus essential appearance requirements.
3. MyWay immediately returns the incomplete scene.
4. A serialized background queue searches BlendKit for a CC0 candidate.
5. If BlendKit cannot produce a candidate, TRELLIS can be attempted.
6. The candidate appears in the existing Asset Library under **Needs review**.
7. Review actions include:
   - **Approve & publish**
   - **Try another BlenderKit asset**
   - **Generate with TRELLIS instead**
   - **Reject & remove candidate**
8. Approval makes linked scenes refresh-ready.
9. **Refresh missing assets** re-resolves the saved layout without another
   model call.

## Durable queue storage

When the complete R2 environment is configured, the missing-asset queue is
private-R2 authoritative at:

`metadata/myway/workflows/missing-asset-queue-v1.json`

Normal cloud-mode reads and writes do not use
`sandbox/probe-lab/assets/acquisition/missing-asset-jobs.json` as a fallback or
mirror. The old local JSON is used only by the explicit Step 3 migration and is
removed only after a direct source-bucket read verifies the migrated document.

When R2 metadata mode is genuinely disabled, local development retains the
legacy local JSON behavior. A Vercel environment without R2 remains ephemeral
rather than trying to persist into the deployed filesystem.

BlendKit and TRELLIS acquisition still execute on the local MyWay machine.
Only the durable queue state has moved to R2.

Only one acquisition runs at a time so several missing objects do not launch
competing Blender processes. Interrupted active jobs become retryable after a
stale-job safety window.

## Appearance-aware demand

Missing-asset jobs preserve the requirement's visual brief and required,
preferred, and avoided traits. Essential required appearance traits become part
of the deduplication key so incompatible needs such as transparent and opaque
versions do not collapse into one job.

## Direct Asset Library import

The Asset Library can import an object independently of scene generation. A
direct import does not bypass semantic verification or scene approval.

## Cancelling an acquisition need

`Cancel & remove need` removes the shared acquisition job and stops future
retries. Linked scenes are not deleted. If an acquisition was already running,
the worker discards an unwanted candidate before it can enter normal use.
