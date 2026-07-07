# Visual Experience Step 4: Request Debug + Compiler Prompt

Step 4 creates the model-facing request shape without calling a real model provider yet.

The important files are:

- `compiler.ts` builds `VisualExperienceCompilerInput` from learner context, diagnosis, personalization defaults, asset summaries, and renderer capabilities.
- `model-request.ts` owns the actual prompt wording and response contract.
- `routes/request-debug.ts` returns the exact model request object that Step 7 can send to a provider.
- `routes/compile-experience.ts` returns the same model request plus a deterministic scaffold output so validation and UI can be tested now.

The tweakable prompt lives in `model-request.ts`:

- `VISUAL_EXPERIENCE_COMPILER_SYSTEM_PROMPT`
- `buildVisualExperienceCompilerUserPrompt`
- `buildVisualExperienceResponseContract`

The model boundary is:

```txt
learner message + target topic + diagnosis/root problem + personalization context
+ available registered asset summaries + renderer capabilities
→ VisualExperienceCompilerOutput
```

Rules for the model:

1. Use only registered `asset_id` values from `available_assets`.
2. Do not invent file paths or raw code.
3. If a better asset is missing, declare it in `asset_requests`.
4. The `orientation` is learner-facing and drives the scene.
5. The `scene_plan` is renderer-facing JSON that MyWay validates before rendering.
6. `bridge_0` / `jargon_level: none` should avoid jargon.
