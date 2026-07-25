# MyWay Asset Runtime

The Asset Library stores reusable GLB assets, verified semantic identity,
geometry profiles, review status, licensing, and local or Cloudflare R2 paths.

Asset resolution returns either a reviewed library asset or an unresolved
requirement. Unresolved requirements are handed to the separate demand-driven
acquisition queue.

Primitive asset fallbacks are disabled. Missing physical objects remain absent
until a real asset is available.

## Demand-driven acquisition

Primitive Builder now creates one persistent acquisition job per normalized
missing concept. Multiple scenes share the same job. BlendKit runs first and
TRELLIS is the automatic fallback. Candidates remain scene-review pending in
the existing Asset Library.

The Asset Library is also the review queue:

- **Needs review** shows pending candidates.
- **Acquiring** shows active or failed missing-concept jobs.
- **Approve & publish** combines Cloudflare promotion and scene approval when
  the license record permits public promotion.
- **Try another BlenderKit asset** rejects the current candidate, excludes its
  source ID, and continues the same concept job.
- **Generate with TRELLIS instead** rejects the current candidate and starts a
  TRELLIS candidate for the same concept.

TRELLIS assets remain local-only unless their license record is separately
cleared for public promotion.
