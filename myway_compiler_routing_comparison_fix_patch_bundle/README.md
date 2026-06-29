# MyWay compiler routing + comparison fix

This patch fixes the bug where a model-generated `comparison_space_3d` director contract could be compiled into `surface_or_field` simply because the schema contained a nullable `surface_3d` key.

## What it changes

It updates:

```txt
ui/learning-space/probes/generated-video/procedural-compiler/compile-video-director-to-procedural-plan.ts
```

The compiler now:

- collects string **values** instead of JSON object keys, so schema keys like `surface_3d` do not pollute routing.
- respects explicit `renderer_intent.scene_kind`, especially `comparison_space_3d`.
- only chooses `surface_or_field` when the actual learner/content meaning points to a surface, graph, saddle, field, terrain, or multivariable surface.
- compiles Spanish `se` into `comparison_reveal` with two panels, two `se` tokens, a self-loop arrow, an outside-to-subject arrow, and a rule card.

## Apply

```powershell
cd C:\Users\willc\projects\MyWay\v1

Expand-Archive -LiteralPath "$env:USERPROFILE\Downloads\myway_compiler_routing_comparison_fix_patch_bundle.zip" -DestinationPath . -Force

Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass

.\myway_compiler_routing_comparison_fix_patch_bundle\apply-myway-compiler-routing-comparison-fix.ps1 -RunBuild
```

After build passes, restart `pnpm dev` and retry the Spanish `se` Blender render.

The important JSON check is:

```txt
renderResult.procedural_visual_plan.strategy
```

It should now be:

```txt
comparison_reveal
```

not:

```txt
surface_or_field
```
