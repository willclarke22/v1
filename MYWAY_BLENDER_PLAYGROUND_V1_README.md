# MyWay Blender Playground v1 patch

This patch adds a separate freeform Blender sandbox at:

`/probe-lab/blender-playground`

It does not replace the existing generated-video lab. It adds a simpler test loop:

1. freeform prompt
2. NVIDIA scene-plan JSON
3. trusted Blender script
4. PNG still or PNG frame sequence

## Files added

- `app/probe-lab/blender-playground/page.tsx`
- `app/api/probe-lab/blender-playground/scene-plan/route.ts`
- `app/api/probe-lab/blender-playground/render/route.ts`
- `ui/learning-space/probes/generated-video/blender-playground/index.ts`
- `ui/learning-space/probes/generated-video/blender-playground/freeform-blender-playground-lab.tsx`
- `scripts/blender/render-freeform-scene.py`

## Notes

- The route uses `NVIDIA_API_KEY` if available.
- If `NVIDIA_API_KEY` is missing or the model call fails, the scene-plan route returns a deterministic fallback plan so the render path can still be tested.
- The Blender render route uses `MYWAY_BLENDER_EXE` or the same default Windows Blender paths as the existing render route.
- Render output goes to `public/generated-video-renders/<render_id>/frame_0001.png` etc.
