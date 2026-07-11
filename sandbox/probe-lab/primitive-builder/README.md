# Primitive Builder Lab

The lab now supports a hybrid scene path:

- procedural SceneScript primitives,
- reusable GLB assets from the shared MyWay Asset Library,
- hands-off BlendKit acquisition through Blender,
- TRELLIS generation when BlendKit has no suitable asset,
- scene manifests that reference individual reusable assets.

SceneScript can load a registered asset with:

```js
model("pot", "metal_cooking_pot_bk_123", [0, 1, 0], [1, 1, 1], {
  motion: { type: "oscillateY", amplitude: 0.03, speed: 1.4 }
})
```
