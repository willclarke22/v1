# MyWay Asset Pipeline

Shared sandbox asset system used by Primitive Builder and Visual Experience.

Resolution order:

1. Reuse a matching asset from `library/registry.json`.
2. Search and acquire a free BlendKit model through Blender.
3. Generate a missing model through NVIDIA TRELLIS.
4. Fall back to procedural primitives.

Blender runs in background and performs normalization, grounding, scaling, thumbnail rendering and GLB export. BlendKit must be installed and enabled in Blender. A stored BlendKit login is used automatically when available.
