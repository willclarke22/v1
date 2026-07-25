# MyWay Spatial Geometry Profiles

The geometry worker reopens existing GLB files in Blender. It does not re-import,
replace, rename, or reacquire an asset.

Spatial Geometry Profile v3 stores a generic representation that applies to all
asset identities:

- measured local bounds and bottom contact
- upward-facing support regions with usable footprint, exposure, openness,
  vertical rank, and clearance above
- conservative containment regions derived from measured enclosed free space
- exterior attachment regions on the measured bounds
- one or more solid collision regions
- audit confidence and review warnings

The profile deliberately avoids making the placement engine depend on labels such
as tabletop, shelf, roof, seat, or ledge. Those labels may still be shown to a
human, but placement is driven by generic geometry and spatial properties.

The queue is serialized because Blender profiling is CPU and file intensive. Run
`scripts/audit-and-backfill-geometry-profiles.ps1` while `pnpm dev` remains
running. The latest report is written to:

`sandbox/probe-lab/assets/debug/latest-geometry-backfill-report.json`
