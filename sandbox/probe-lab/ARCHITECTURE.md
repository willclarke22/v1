
# MyWay Probe Lab Architecture

The sandbox is organized around one principle:

> MyWay directs an exceptional educational sequence first, then late-binds the
> best available actors, geometry, renderer behaviours, and production tools.

## Canonical flow

```txt
Learner signal + diagnosis
        ↓
Visual Learning Semantic Draft
        ↓
Educational Scene Director
  - scene thesis
  - representation strategy
  - stable actor ids
  - directed moments
  - semantic behaviours
  - camera cues
  - timed text cues
  - success observations
        ↓
Compatibility adapters
  - Visual Experience story beats
  - executable semantic beats
  - Primitive Builder reveal beats
  - directed-scene hints
        ↓
Set and casting
  - asset requirements
  - reviewed asset resolver
  - missing-asset queue
  - logical sizing
  - geometry profiles
  - spatial constraints
  - collision-safe layout
        ↓
Execution
  - Three.js immediate interactive playback
  - optional Blender scene compilation/rendering later
        ↓
Diagnostic frame review and correction loop
```

## Ownership boundaries

### Educational Scene Director

Owns why the scene exists and what must happen:

- what the learner must notice;
- the order in which ideas become necessary;
- the representation mode;
- actor identities and capability needs;
- semantic movement;
- camera intent;
- concise timed teaching text;
- the observable result of each moment.

The director never chooses asset ids, providers, URLs, files, exact mesh
coordinates, collision solutions, or renderer implementation details.

### Primitive Builder and shared scene runtime

Own set construction and safe placement:

- invisible layout proxies;
- physical asset requirements;
- real-world sizing;
- attachment, containment, support, and adjacency intent;
- reviewed-asset resolution;
- measured geometry regions;
- collision-safe final placement;
- unresolved diagnostics and acquisition jobs.

### Asset runtime

Own actor availability and quality:

- identity and appearance review;
- licensing and provenance;
- geometry profiles;
- reusable GLBs;
- BlendKit, TRELLIS, local import, and GLM procedural acquisition;
- late binding to stable director entity ids.

### Three.js player

Own immediate interactive execution:

- current supported behaviour compilation;
- progressive reveal and scrubbing;
- camera tracks;
- labels and timed text;
- selection and guided interaction;
- graceful diagrammatic proxies while an actor is unresolved.

### Blender

Blender remains a production tool, not the source of educational intelligence.

Current Blender code mainly prepares individual assets. A future separate
Blender Scene Compiler should consume the same director contract to author
cameras, keyframes, text, diagnostics, and premium renders without changing the
lesson plan.

## Compatibility policy

Older structures remain readable while the sandbox migrates:

- `directed_scene`
- `scene_moments`
- `story_beats`
- semantic `beats`
- Primitive Builder reveal `beats`
- inferred motion and camera tracks
- `primitive_build_plan_v1`

They are compatibility views. New model prompts author
`myway_educational_scene_director_v1`, and MyWay derives the older views.

## Missing-asset invariant

A missing asset may reduce literal visual fidelity, but it must not delete or
weaken:

- the actor's stable id;
- its semantic role;
- required capabilities and anchors;
- its directed events;
- camera cues;
- text cues;
- the causal sequence.

This lets a better actor plug in later without regenerating or reinterpreting
the educational direction.
