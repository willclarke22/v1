# MyWay procedural visual compiler patch

This sandbox patch adds a first procedural visual compiler between the model's VideoDirectorContract and the trusted Blender renderer.

It adds:

- `ui/learning-space/probes/generated-video/procedural-compiler/procedural-visual-contract.ts`
- `ui/learning-space/probes/generated-video/procedural-compiler/compile-video-director-to-procedural-plan.ts`
- `ui/learning-space/probes/generated-video/procedural-compiler/index.ts`

It updates:

- `app/api/probe-lab/generated-video/blender-render/route.ts`
- `scripts/blender/render-myway-director.py`
- `ui/learning-space/probes/generated-video/index.ts`

The route now compiles `director_contract + request_context` into `procedural_visual_plan` before calling Blender. Blender reads the procedural plan and builds safe generated assets such as panels, token cards, actor markers, curved arrows, self-loop arrows, flow channels, particles, barriers, surface meshes, slice curves, and rule cards.

Apply from the repo root:

```powershell
cd C:\Users\willc\projects\MyWay\v1
Expand-Archive -LiteralPath "$env:USERPROFILE\Downloads\myway_procedural_visual_compiler_patch_bundle.zip" -DestinationPath . -Force
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\myway_procedural_visual_compiler_patch_bundle\apply-myway-procedural-visual-compiler-patch.ps1 -RunBuild
```

Then restart dev:

```powershell
pnpm dev
```

Open:

```txt
http://localhost:3000/probe-lab/generated-video
```
