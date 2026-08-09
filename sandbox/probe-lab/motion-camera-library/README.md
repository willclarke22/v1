
# Director Capability Library

The canonical page route is now:

`/sandbox/probe-lab/director-capability-library`

The former `/sandbox/probe-lab/motion-camera-library` route redirects to the canonical URL. The implementation folder remains in place temporarily to preserve internal import compatibility while the feature is promoted into the Asset Scene Builder.

## Purpose

The library is the isolated visual proof environment for the vocabulary GLM may
use when directing a MyWay scene. It connects each semantic directing term to:

- a typed capability id and category;
- an inspectable Director instruction;
- a named compiler/controller id;
- Three.js and Blender support levels;
- an explicit fallback;
- a single-Canvas interactive demonstration;
- real browser-loadable examples selected from the reviewed Asset Library;
- visibility and future promotion diagnostics.

## Categories

- narrative and attention;
- camera framing;
- camera angle;
- camera movement;
- object motion;
- blocking and placement;
- lighting and emphasis;
- transitions and continuity.

## Runtime boundary

The page intentionally reuses exactly one React Three Fiber `Canvas`. Selecting a
new capability swaps the active fixture and controllers inside that viewer. It
does not create a Canvas per card.

The current page proves vocabulary, composition, controller behaviour, and real
asset casting. It does not claim to run the Asset Scene Builder's measured
collision or analytic occlusion solvers. A capability should be promoted in this
order:

```text
declared capability
→ single-viewer visual proof
→ multi-asset verification
→ Asset Scene Builder integration
→ Visual Experience integration
→ Blender Scene Compiler implementation
```

## Canonical files

- `director-capability-registry.ts` — typed vocabulary and execution metadata.
- `ui/director-capability-library-lab.tsx` — one Canvas, a fixed searchable capability sidebar, and the full-width inspector.
- `ui/director-capability-preview.tsx` — real-asset casting, motion, camera, lighting, and guides.
- `ui/index.ts` — canonical export plus a temporary compatibility alias.

## Current workbench layout

- The left column keeps the WebGL preview and transport visible.
- The right column is a fixed-height, independently scrollable capability catalogue.
- Search and filters remain visible at the top of that sidebar.
- The selected capability inspector occupies the full-width section beneath the workbench.
- The default secondary fixture deterministically prefers the reviewed Soldier asset (`soldier_polyp_ul46oxezyk`) instead of the previous coffee-mug example.

## V2 composition workbench

The library now proves **composed shots**, not only isolated demo motions. A
selected capability is wrapped in a canonical V2 Director moment so the preview
can combine framing, angle, lens, camera movement, blocking, lighting,
continuity, actor motion, and constraints at the same time.

The expanded vocabulary adds high-value camera moves (arc, dolly, lead/lag
follow, reframe, rise reveal, spline, object-attached, pass-through, settle),
mechanical/educational actor verbs, composition and lens controls, cinematic
blocking, motivated lighting, richer narrative jobs, continuity rules, and
kinematic constraints.

Camera and actor controllers are parameterized and actor-relative. The same
shared `director-shot-runtime.tsx` is used by the Asset Scene Builder so a
capability that graduates from this page does not need a second execution
language. The preview's visibility/occlusion checks are intentionally
approximate; measured physical placement and collision authority remain in the
Asset Scene Builder.

## Movement polish pass

The capability fixtures intentionally use a stable cast so visual comparisons are
repeatable across cards:

- `primary_subject` → reviewed Soldier (`soldier_polyp_ul46oxezyk`);
- `secondary_subject` → reviewed Fire Hydrant (`fire_hydrant_bk_mrjsn0wl`);
- `context_subject` → reviewed Lantern (`lantern_bk_mrqk238f`) when available, so motivated-light demos have a meaningful source.

The V2 preview distinguishes world-fixed camera composition from explicit
actor-relative tracking. A `static` camera therefore stays fixed while its demo
subject travels; `follow`, lead/lag follow, parallel tracking, and object-attached
views opt into actor-relative composition. Camera and actor damping use frame
time rather than fixed per-frame lerp factors, and paused scrubbing snaps to the
requested timeline sample.

The polish pass also gives roll a translational component, hinges/open/close a
visible edge pivot, pans/reframes real two-subject targets, settle a preceding
move to settle from, and transition/continuity cards concrete benchmark action
instead of static-only demonstrations. `inside_object` remains explicitly
approximate because an arbitrary reviewed GLB is not guaranteed to contain a
renderable interior.
