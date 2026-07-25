# Missing-asset acquisition queue

This folder contains the local sandbox demand-driven asset workflow.

Flow:

1. A generated scene resolves only scene-approved assets.
2. Every unresolved physical requirement is deduplicated by normalized concept.
3. MyWay immediately returns the incomplete scene.
4. A serialized local background queue searches BlendKit for a CC0 candidate.
5. If BlendKit cannot produce a candidate, TRELLIS is attempted automatically.
6. The candidate appears in the existing Asset Library under **Needs review**.
7. Review actions are:
   - **Approve & publish**
   - **Try another BlenderKit asset**
   - **Generate with TRELLIS instead**
   - **Reject & remove candidate** to delete an unwanted candidate without automatically starting another acquisition.
8. A removed candidate leaves the shared need under **Acquiring**, where a later BlendKit or TRELLIS attempt can be started manually.
9. Approval makes every linked scene refresh-ready.
9. **Refresh missing assets** re-resolves the saved layout without another model call.

The persistent local queue is written to:

`sandbox/probe-lab/assets/acquisition/missing-asset-jobs.json`

That JSON file is runtime state and is created automatically. BlenderKit and
TRELLIS acquisition run on the local MyWay machine. In Vercel, the route stays
readable and fails gracefully, but no persistent acquisition worker is run.

Only one acquisition runs at a time so several missing objects do not launch
competing Blender processes. Interrupted active jobs become retryable after a
stale-job safety window.

## Appearance-aware demand

Missing-asset jobs preserve the requirement's visual brief and required,
preferred, and avoided traits. Jobs are still identity keyed by concept, but
essential required appearance traits become part of the deduplication key so
incompatible needs such as transparent and opaque versions do not collapse into
one job. BlendKit and TRELLIS receive compact appearance terms without changing
the verified object identity.

## Direct Asset Library import

The Asset Library can import an object independently of scene generation. Type a
name in **Get a CC0 asset directly from BlendKit**. MyWay excludes source assets
already present or rejected, imports one unseen CC0 candidate, queues style
analysis, and places it under **Needs review**. Direct import does not bypass
semantic verification or scene approval.

## Cancelling an acquisition need

The Asset Library Acquiring view exposes `Cancel & remove need`. This removes the shared acquisition job immediately and stops future retries. Linked scenes are not deleted; they continue to show the requirement as unavailable until rebuilt without it. If BlendKit or TRELLIS was already running, the worker discards and removes a newly created candidate before it can enter Needs review.

