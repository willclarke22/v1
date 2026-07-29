
# Visual Experience Sandbox

Visual Experience is the educational directing and immediate interactive
playback lane.

## Canonical source of truth

`semantic_scene_plan.director_plan` uses
`myway_educational_scene_director_v1` and owns:

- the scene thesis and learner takeaway;
- representation strategy;
- stable actor ids and semantic roles;
- one learner-attention job per moment;
- semantic behaviours and timing;
- camera focus and framing intent;
- concise timed text cues;
- success observations;
- late-binding policy for missing actors.

The model no longer needs to author separate `directed_scene`,
`scene_moments`, `story_beats`, and renderer beats. MyWay derives those
compatibility views from the director plan.

## Current execution path

1. Build a compact semantic draft from the learner message and diagnosis.
2. Normalize and validate the director plan.
3. Derive legacy story beats and executable semantic beats.
4. Resolve reviewed assets without changing actor ids or direction.
5. Compile spatial constraints, motion tracks, camera tracks, and geometry.
6. Play immediately in React Three Fiber with scrubbing and guided interaction.
7. Preserve warnings for behaviours or actors that need a richer future
   compiler.

## Asset independence

The scene must remain exceptionally directed before final assets exist.
Diagrammatic actors, paths, labels, and procedural effects can communicate the
mechanism while physical actors are unresolved. Later GLBs bind to the same
entity ids.

## Renderer growth

The director behaviour vocabulary is intentionally broader than the current
Three.js implementation. Each semantic event keeps a simpler compatibility
behaviour so current playback remains functional while richer behaviour
compilers are added.

A future Blender Scene Compiler should consume the same director plan for
premium rendering rather than creating a second lesson-planning format.

## Key files

- `../director/` — canonical contract, normalization, validation, adapters.
- `visual-learning-turn-request.ts` — model prompt and response contract.
- `assemble-visual-learning-turn.ts` — semantic draft to canonical output.
- `ui/scene-player/` — compatibility compilation and interactive playback.
- `resolve-visual-learning-turn-assets.server.ts` — late-bound reviewed actors.
