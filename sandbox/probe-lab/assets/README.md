# MyWay Asset Runtime

The Asset Library stores reusable GLB assets, verified semantic identity,
geometry profiles, review status, licensing, and local or Cloudflare R2 paths.

Asset resolution may return:

- a reviewed library asset;
- an explicitly requested BlenderKit acquisition;
- an explicitly requested TRELLIS generation;
- unresolved.

Primitive asset fallbacks are disabled. Missing physical objects remain absent
until a real asset is available.
