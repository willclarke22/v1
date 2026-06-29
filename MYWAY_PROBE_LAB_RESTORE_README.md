# MyWay Probe Lab Restore Patch

This patch restores `/probe-lab` as the core probe-template gallery, while keeping:

- `/probe-lab/generated-video` for generated-video experiments
- `/probe-lab/blender-playground` for freeform Blender experiments

It adds:

- `ui/learning-space/probes/probe-lab/probe-template-gallery.tsx`
- replaces `app/probe-lab/page.tsx`

The gallery uses the existing `ProbeRenderer` and the already-implemented probe templates. It includes sample `EngineRenderableProbe` contracts for single choice, multi choice, drag/drop, sequence, slider, graph, audio clip, audio response, video click, and video explanation.
