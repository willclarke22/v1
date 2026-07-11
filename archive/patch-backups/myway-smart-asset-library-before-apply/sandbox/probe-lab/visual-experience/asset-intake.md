# Visual Asset Intake

This is the repeatable workflow for adding GLB assets to the visual-experience sandbox.

## Folder meanings

```txt
public/sandbox-assets/visual-experience/models/<domain>/
  Browser-loadable GLBs. The app can fetch these by URL.

sandbox/probe-lab/visual-experience/assets/registry.json
  The source of truth. The model may only reference assets listed here.

sandbox/probe-lab/visual-experience/assets/licenses/
  One simple license/source record per asset.

sandbox/probe-lab/visual-experience/assets/source/blender/
  Notes or working Blender source files. These are not loaded by the browser.
```

## Manual Blender workflow

1. Open Blender.
2. Bring the asset into the scene through BlenderKit/BlendKit or another source.
3. Delete the default cube/camera/lights unless needed.
4. Select only the asset or collection you want.
5. Export as `glTF Binary (.glb)` with `Selected Objects` enabled.
6. Run `scripts/register-glb-asset.ps1` to copy the GLB into `public/` and update the registry.

## Register command example

```powershell
cd C:\Users\willc\projects\MyWay\v1

.\sandbox\probe-lab\visual-experience\scripts\register-glb-asset.ps1 `
  -SourceGlbPath "$env:USERPROFILE\Downloads\mitochondrion_v1.glb" `
  -AssetId "mitochondrion_v1" `
  -DisplayName "Mitochondrion" `
  -Domain "biology" `
  -Tags "biology,cell,mitochondrion,energy" `
  -RenderRoles "zoom_target,scene_environment" `
  -LicenseKind "royalty_free" `
  -LicenseStatus "sandbox_only" `
  -SourceType "blenderkit" `
  -Notes "Downloaded through BlenderKit and exported from Blender."
```

Then open:

```txt
http://localhost:3000/sandbox/probe-lab/visual-experience
```

## Policy for now

- It is okay for sandbox assets to be `needs_review` or `sandbox_only`.
- Do not mark assets `safe_to_promote_to_app` until the source/license is recorded.
- The model should see only compact asset summaries, not raw source files.
