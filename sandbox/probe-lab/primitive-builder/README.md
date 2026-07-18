# Primitive Builder Lab

Primitive Builder now uses the shared MyWay hybrid scene runtime.

## Generation path

1. The model returns `primitive_scene_graph_v2`.
2. Asset requirements are resolved against scene-approved library assets.
3. Approved GLBs replace their named primitive fallback subtrees.
4. Missing requirements remain visible as procedural fallbacks.
5. The user may explicitly generate a TRELLIS preview, keep the primitive, or hide the object.
6. The complete mixed scene can be saved as `myway_scene_manifest_v2`.

The model never chooses asset IDs, paths, providers, or URLs. MyWay owns asset
resolution and validates the result.

TRELLIS output is available immediately for the current sandbox scene, but it
remains globally scene-review pending until approved in the Asset Library.
