
# ambientCG Phase 1 catalog

This folder mirrors ambientCG API v3 metadata without downloading every binary
asset. The browser-facing workspace lives at:

`/sandbox/probe-lab/asset-library/ambientcg`

The sync endpoint processes one page at a time and stores a resumable checkpoint.
Materials and HDRIs are cached only when selected in the UI. Other ambientCG
resource types remain searchable catalog records for later phases.
