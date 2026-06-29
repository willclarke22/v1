# MyWay Blender Playground v2

This patch upgrades the freeform Blender sandbox.

## Main changes

- NVIDIA scene-plan route now asks for `myway_blender_playground_scene_v2`.
- The plan includes scene intent, render quality, composition, camera start/end, environment, subjects, objects, lighting, effects, animation beats, and requested Blender tools.
- The UI auto-generates a rich plan before rendering if no plan exists.
- Blender renderer uses more cinematic tools:
  - bevel modifiers
  - smooth primitives
  - no-label cinematic default
  - fixed text facing when labels are requested
  - better key/rim/fill/practical lights
  - depth of field
  - reflective floor
  - transparent haze/fog slabs
  - softer shadows and wall-edge reveal
  - improved monster/kid primitives

## URL

/probe-lab/blender-playground

## Test flow

1. Restart `pnpm dev` after applying.
2. Open `/probe-lab/blender-playground`.
3. Click **Generate plan** to inspect the richer JSON.
4. Click **Render still**.
5. If the still looks better, click **Render video**.
