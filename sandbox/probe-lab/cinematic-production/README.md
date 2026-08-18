# CP.2A.5 — Choreography Compiler Fidelity

Compatibility note: the original CP.1 **goldfish insert** vocabulary remains part of the Lunch benchmark; CP.2A.5 compiles that insert rather than replacing it.

CP.2A.5 keeps the CP.2A.4 Golden camera/orbit gains and the CP.2A.3 low-cost
preview runtime, but moves the remaining Lunch mismatch into an explicit
**Cinematic Choreography Compiler** layer. GLM still supplies semantic intent,
cast, broad endpoints, attention hints, and interaction timing. MyWay now owns
the connective motion grammar that should not be re-invented by every model
response.

## Whole-interaction semantic hand effector

The hand actor track is now staging/visibility evidence only. During the
hand→burger interaction, CP.1F compiles one collision-safe physical solution at
interaction entry and keeps that same contact pair/corridor across approach,
contact, and retreat. Phase changes no longer re-select geometry. The Lunch hand
uses the reviewed palm-readable `[0.12, π, 0]` semantic effector frame for the
whole interaction instead of a generic geometry-derived twist correction.
Target-relative contact reanchoring from CP.2A.3 stays intact, so burger motion
during the nudge does not require another swept-search solve.

## Actor arrival → settle → hold → depart grammar

Cow and chicken no longer interpret a key at the departure start as "already
departed." The compiler reconstructs each insert from broad authored endpoints
using explicit phase timing:

- cow: arrive 7.55→9.15, hold through 10.55, depart 10.55→11.75;
- chicken: arrive 10.55→11.55, hold through 13.05, depart 13.05→14.55.

The compiler also adds the restrained vertical settle arc that made the Golden
animals read as arrivals rather than flat tray slides. Visibility is coupled to
the insert envelope rather than independently stretched after spatial motion.

## Continuous attention + emphasis envelope

CP.2A.4 removed double-aiming, but still selected the single strongest nearby
`focus_role` key. CP.2A.5 interpolates semantic attention continuously and
compiles the cow→chicken transition into overlapping temporal envelopes. The
same semantic beat drives the yellow actor emphasis envelope, so camera attention
and visual highlight are no longer separate GLM responsibilities.

## Semantic fish forward axis

The reviewed Lunch fish must point approximately down the initial viewing ray
while hidden behind the burger. A model-authored 180° yaw is now treated as an
asset-facing error: the compiler keeps a near-zero semantic forward yaw and adds
only the subtle Golden swim/tail perturbation. Diagnostics explicitly report raw
fish-forward yaw error so GLM can still learn from the mistake.

## Repair improvement gate

A second GLM response is no longer called a successful repair merely because it
parsed. MyWay re-runs deterministic validation, compares repair burden, and only
accepts the replacement when the normalized plan changed **and** measured quality
improved. An unchanged or worse repair remains visible as untouched evidence but
the initial JSON stays authoritative for transparent MyWay compilation.

## New diagnostics

CP.2A.5 adds raw-authoring checks for cow/chicken premature departure and fish
forward yaw, plus compiled diagnostics for animal vertical settle, peak emphasis,
and temporary-attention target speed. These distinguish "GLM authored a weak
track" from "MyWay compiled a weak film."

## Historical CP.1 runtime vocabulary retained

CP.2A.5 remains the same **continuous, seekable short-form player** established in CP.1C. It retains the **hand entrance and burger nudge**, the **cow insert that enters and settles**, explicit **camera position, look target, and field of view**, the rule that the workbench **does not add a second director**, the **solid burger GLB**, the **goldfish insert**, and the **final beauty-render lane**.

The preview remains the CP.1B **WebGL 3D pane**: a **single WebGL Canvas-based 3D pane** with **camera movement visible**. It also retains the CP.1D **smooth performance preview**, `frameloop="demand"`, **low-power WebGL preference**, **wall-time anchored** playback in the **wide rectangular desktop pane**, without **hard reframes / cuts between beats**.

---

# CP.2A.4 — Golden-Fidelity Relationship Compiler

CP.2A.4 is the next benchmark-first Lunch reproduction pass. CP.2A.3's
performance/capture work remains intact: one demand-rendered Canvas, 30 FPS
preview presentation, focus-aware pause, cached actor/material handles, lazy
outlines, and phase-compiled CP.1F interaction solving.

This patch targets the remaining *cinematic* gap exposed by the third GLM
Lunch run rather than adding more rendering cost.

## Full hand contact frame

CP.2A.2 aligned only a selected contact normal. A normal leaves one twist
degree of freedom, so the generated hand could be physically valid while
appearing edge-on or sideways.

Generated hand interactions now start from a benchmark-backed readable
palm/finger effector frame and then solve:

1. the selected source contact normal against the target outward normal, and
2. a geometry-derived tangent against that readable effector reference.

The resulting normal+tangent frame is compiled with the existing CP.2A.3
phase cache. The full swept CP.1F contact search is still **not** rerun every
preview frame.

## Target response causality

Lunch diagnostics now measure the target's peak motion *during* physical
contact, not only pre-contact drift. A valid nudge must be both legible and
directionally consistent with the hand approach. The Golden-derived starter
calibrates the expected response; weak or opposing target motion triggers the
deterministic GLM repair lane.

## Semantic camera focus is single-authority

`focus_role`/`focus_weight` now own the temporary attention shift. MyWay
reconstructs the underlying composition target from non-focus keys and applies
semantic focus once. A GLM plan can no longer move the numeric target fully
onto the cow/chicken and then have MyWay move it toward the same actor again.

## Insert readability envelope

New diagnostics detect:
- overly slow cow/chicken/fish dissolves as well as overly fast pops,
- hand staging that ignores the readable effector frame,
- rigid side-on cow/chicken presentation,
- fish visibility beginning too early.

The GLM prompt now asks for three-quarter animal presentation and the actual
Golden fade/setup timing rather than only broad semantic beats.

## Reveal curve, orbit phase, and hero finish

Total orbit degrees are not enough. CP.2A.4 compares the *phase of the orbit
over time* to Golden Lunch, plus radius, height, fish screen-space reveal
progression, final camera height, and final support opacity.

This catches the previous "perfect mathematical circle" failure: it completed
~360 degrees with zero reversals but arrived back at the front too early and
flattened the recap/hero payoff.

The reproduction prompt now includes sparse Golden shaping anchors for the
late camera rail. These are benchmark evidence, not a new hardcoded runtime
camera authority. Golden Lunch itself remains frozen and byte-protected.

## Deterministic repair now sees visual failures

The third GLM run previously returned `validation.ok=true` with no warnings
despite visible differences. The new quality checks intentionally make those
differences machine-visible so the existing one-pass deterministic repair can
act on them:
- weak/misaligned burger nudge,
- unreadable hand staging,
- side-on inserts,
- early fish setup,
- orbit phase lead,
- high final camera,
- opaque final support foods.

The Golden-derived starter remains the zero-warning calibration oracle.


# CP.2A.3 — Cinematic Runtime Performance + Capture Safety

CP.2A.3 is a performance-only continuation of the Lunch Reproduction Bench. It
does **not** add a second Golden/Generated renderer, change the cinematic JSON
schema, change the frozen Golden camera rail, or weaken CP.1F physical
interaction authority.

The page still owns exactly one shared WebGL Canvas. Golden and Generated only
swap the timeline sampler feeding that Canvas.

## Runtime changes

### Phase-compiled CP.1F interactions

The expensive asset-aware contact solver is no longer rebuilt on every browser
frame. Each interaction compiles a physical solution when it enters
`approach`, `contact`, or `retreat`. The displayed frames then sample that
cached path.

Moving-target behavior is preserved without a full re-solve: cached path
endpoints receive current source/target motion deltas, and the maintained
contact root is rigidly re-anchored through target translation, rotation, and
scale. Contact therefore remains target-relative while the burger moves.

Generated contact-frame orientation is also compiled once at full contact
alignment for each phase. Per-frame orientation is only the inexpensive
quaternion blend; it does not restart contact-pair search and swept collision
sampling.

The cache invalidates conservatively when selected geometry changes, source or
target scale/rotation drifts materially, or a relevant obstacle crosses a
coarse movement bucket. This keeps the path physically safe without returning
to frame-by-frame solving.

### 30 FPS preview presentation

The WebGL Canvas remains `frameloop="demand"`, `dpr={1}`, `shadows={false}`,
antialias-off, and low-power. While the movie is playing, invalidation is capped
at 30 FPS. Timeline time is still wall-time based, so this changes presentation
cost rather than movie duration.

A 120/144 Hz display therefore no longer causes the full cinematic runtime to
execute at 120/144 evaluations per second.

### Capture / focus safety

Playback activity now requires all three:

- the viewer is intersecting the viewport;
- the document is visible;
- the browser window has focus.

When focus is lost (for example while Windows Snipping Tool owns the foreground),
the movie clock freezes instead of continuing to consume CPU/GPU or jumping
ahead. Returning focus resumes from the frozen cinematic time.

### Cached actor render handles + lazy emphasis outlines

Actor mesh/material discovery is performed once per selected asset instead of
traversing every GLB hierarchy twice on every movie frame. Opacity and emphasis
updates use cached material handles and skip unchanged values.

The yellow emphasis silhouette for a real GLB is now created lazily on the
first frame that actually requests emphasis. Assets that never receive emphasis
do not carry a duplicate outline hierarchy.

### Lower allocation camera + geometry path

Prepared asset geometry now stores its eight framing corners once. Camera safety
reuses scratch `Vector3` instances instead of allocating corners/vectors every
frame, and its framing-entry list is memoized. Camera-aware studio lighting also
reuses scratch vectors.

Prepared interaction geometry, fallback geometry, and primary support-surface
selection are cached.

### React workbench isolation

The large Original GLM / Resolved Plan / Diff JSON strings now live inside a
memoized evidence component. Playback timecode updates no longer stringify those
large objects several times per second.

## Preserved behavior

- one shared WebGL Canvas;
- Golden and Generated source toggle;
- frozen Golden Lunch oracle;
- editable cinematic JSON;
- GLM generation/repair evidence;
- CP.1F measured contact and collision authority;
- CP.2A.2 generated contact-frame orientation;
- target-relative maintained contact;
- physical fish/burger spacing;
- C2 camera + soft framing safety;
- Inspect mode.

---

# CP.2A.2 — Cinematic Relationship + Contact-Frame Fidelity

CP.2A.2 responds to the second GLM Lunch reproduction rather than broadening the benchmark. Round 2 proved that the hardening pass fixed units, support seating, relation survival, and late-orbit topology, but also exposed a new boundary: structurally valid JSON can still miss the visual relationships that make the golden film read.

## Physical interaction is no longer a catch-all

`interactions` is now reserved for literal `touch | nudge | push` events. Entrance/reveal/pop semantics remain actor choreography. Unsupported semantic kinds are surfaced as authoring warnings and ignored by the CP.1F lane instead of being silently coerced into `nudge`.

For Lunch this means the intended physical interaction is the hand → burger nudge. Cow, chicken, and fish entrances are carried by actor tracks; the fish may additionally use directional surface clearance.

## Generated contact-frame orientation

CP.1F already solved literal source/target contact roots. CP.2A.2 adds a generated-lane orientation companion in the shared runtime: after the contact region pair is selected, MyWay aligns the selected source contact-region normal against the target outward normal. The orientation blends in during approach, holds through contact, and unwinds during retreat.

This is deliberately enabled only for generated-plan playback. Frozen Golden Lunch keeps its authored hand orientation unchanged.

## Cinematic visibility governor

Bounded opacity removed C2 pre-echo in CP.2A.1, but Round 2 still authored 0→1 fades in roughly 0.1–0.2 seconds. CP.2A.2 expands very short visibility transitions to a minimum cinematic envelope without moving spatial keys. The GLM contract also asks for roughly 0.5–0.8 second fades so framing safety is not forced to react to one-frame-sized visibility pressure.

## Hero anchor versus temporary focus

Camera keys may now include `focus_role` and `focus_weight`. Numeric camera targets remain valid, but temporary semantic attention can blend toward the active subject while the burger remains the narrative anchor. The Lunch dossier explicitly calls for cow/right attention around 9.35s and chicken/left attention around 12.85s.

This keeps “burger is the hero” from being misread as “camera target X must always stay at zero.”

## Stronger executable Lunch diagnostics

The reproduction comparison now also reports:

- fast opacity transition count;
- authored burger drift before hand contact;
- cow and chicken focus-target X at their insert moments;
- a burger/fish projection-overlap proxy;
- fish screen-separation ratio near 15s, which catches an orbit that reveals the fish too quickly;
- non-hand physical interaction count.

Push/nudge targets are causally held until literal contact in the generated compiler, so a smooth actor spline cannot quietly make the burger move before the hand arrives.

## Round-3 GLM guidance

The GLM dossier now emphasizes the parts that were visually wrong in Round 2:

- restrained early camera rather than a deep push-in;
- sparse measured early camera anchors;
- only genuine contact in `interactions`;
- generated contact-frame orientation rather than guessed final hand Euler angles;
- slower visibility ramps;
- cow/chicken temporary focus semantics;
- fish already hidden/opaque before parallax discovery;
- slower opening of the late orbit while preserving its successful one-direction topology.

The late orbit itself remains intentionally preserved as a success from CP.2A.1 rather than being redesigned again.

---

# CP.2A.1 — Reproduction Contract + GLM Guidance Hardening

CP.2A.1 is the first feedback pass from an actual GLM Lunch run. The model understood the story, but the first JSON exposed contract ambiguity: it reasonably treated actor Y as centre height, scale as absolute size, and rotation as degrees; it also invented intuitive interaction/clearance field names that the v1 normalizer silently dropped. The generated camera described an orbit in prose without numerically completing the golden near-full one-direction journey.

This patch hardens the experiment without replacing the frozen Lunch oracle.

## Authoring semantics are explicit

- `position = [x, support_lift_y, z]`; for support-seated actors `support_lift_y = 0` means rest on MyWay's measured support surface.
- authored rotations should use `rotation_deg`; MyWay normalizes to runtime radians and can recover obvious degree-like legacy `rotation` values.
- authored size should use `scale_multiplier`; `1` means the reviewed role-normalized asset size.
- opacity, emphasis, and scale use bounded local interpolation so future C2 tangents cannot create visible pre-echo before an entrance.

## Relations cannot silently disappear

The GLM prompt now shows complete interaction and directional-clearance objects rather than empty arrays. The normalizer accepts the exact contract and the intuitive aliases observed in the first run (`actor/target`, `actor/blocker`, `t_start/t_end`, `min_gap_m`) while surfacing compatibility warnings. Literal `contact_point/contact_normal` values are ignored because CP.1F measured geometry remains contact authority.

## Golden-quality guidance, not a hidden renderer

The generation dossier now includes the learned Lunch timing windows, sparse actor staging anchors, and measurable camera requirements. In particular the late camera must execute a dense, one-direction near-full orbit from front -> right -> behind -> left -> front rather than a short arc that reverses. Golden camera XYZ keys are still not imported into the GLM route.

The route performs at most one visible deterministic repair pass when MyWay detects major reproduction misses such as missing interaction/clearance, excessive support lift, absolute-style scale values, late-orbit under-travel/reversal, fish drift, or badly shifted contact timing. The untouched first GLM response and any repair response remain inspectable on the bench.

## Better diagnostics

`Diff / diagnostics` retains numeric distance/FOV comparison and now also reports:

- camera key count;
- signed/total late-orbit degrees and reversal count;
- fish horizontal drift during the reveal hold;
- hand interaction/contact timing;
- fish clearance declaration and gap;
- opening trio maximum support lift;
- smallest visible scale multiplier;
- confirmation that bounded actor scalar interpolation is active.

The Golden Lunch runtime layout, C2 camera rail, camera-safety module, CP.1F geometry solver, and shared WebGL renderer remain unchanged.

---


# CP.2A — Lunch Reproduction Bench + Editable Cinematic JSON

CP.2A freezes the successful CP.1F Lunch film as the **golden oracle** and adds a second authoring lane without replacing the renderer. The experiment asks a concrete question before further abstraction: can GLM (or a pasted ChatGPT/manual plan) reproduce the same Lunch film through structured JSON?

## Simple default workflow

1. **Golden** shows the frozen hand-built Lunch.
2. **Generated** shows the most recently rendered cinematic JSON.
3. The **Cinematic JSON workspace** accepts pasted JSON directly. `Validate` and `Format` never call a model; `Render JSON` compiles the current editor contents immediately.
4. **Generate with GLM** calls the existing NVIDIA/GLM-5.2 provider family and places the untouched model response in evidence while copying its JSON object into the same editable working box. It does not use a separate GLM renderer.
5. Collapsed evidence panels preserve the Original GLM response, normalized/resolved plan, and a lightweight numeric comparison to Golden Lunch.

## One renderer, two samplers

The golden path still defaults to `sampleCinematicBurgerRuntime`. Generated JSON compiles to the same `CinematicShotRuntimeLayout` and is injected only as a runtime sampler. Both paths therefore share:

- the same reviewed Asset Library cast;
- measured support/surface preparation;
- CP.1F asset-aware rigid contact, swept approach/retreat clearance, and contact maintenance;
- directional surface-to-surface spacing;
- the camera-aware lighting rig;
- CP.1E.12 soft final-camera safety;
- the same single demand-rendered WebGL Canvas.

This is deliberate: visual differences should primarily expose orchestration/JSON differences rather than renderer differences.

## Reproduction JSON is intentionally verbose

`myway_cinematic_reproduction_plan_v1` permits explicit camera keys and complete actor keyframes plus interaction and clearance intents. CP.2A does **not** try to guess the final compact GLM language. Once a generated plan looks genuinely strong, repeated or derivable numeric structures can be moved into trusted MyWay capabilities one at a time while checking that the film remains strong.

The included starter JSON is a sparse golden-derived scaffold only so the manual editor has a known-valid example. It is clearly separated from model generation; **Generate with GLM replaces the working editor content with model-authored JSON**.

## Frozen-oracle boundary

CP.2A does not rewrite the Lunch golden choreography, master C2 rail, or camera-safety module. The installer/verifier treats the existing runtime layout and camera-safety source as protected golden evidence.

---

# Cinematic Production

## CP.1F — Asset-Aware Interaction Geometry Foundation

CP.1F is the first deliberate promotion from benchmark-specific coordinate polish into reusable cinematic interaction infrastructure. It preserves the CP.1E.11 one-film/C2 camera, the CP.1E.12 soft post-rail framing guard, and the CP.1E.13 deeper fish staging. The change is downstream of semantic choreography: exact hand/burger contact is no longer authored as a fixed root coordinate.

### Shared interaction authority

The new pure module `sandbox/probe-lab/scenes/asset-aware-interaction-motion.ts` bridges existing MyWay systems rather than inventing a second physics or motion language:

1. the Director / film clock declares semantic interaction intent and timing;
2. geometry-profile exterior regions are consumed as the same generic surface-contact evidence used by Directability;
3. actual normalized GLB bounds remain a fail-safe hull so visible overhangs such as thumbs, handles, or tails cannot penetrate merely because a smaller proxy says the pair fits;
4. Asset Scene Builder-style deterministic clearance search validates the moving source against target and obstacle geometry;
5. a valid source/target contact candidate becomes the moving root used by the existing continuous cinematic runtime;
6. invalid third-actor contact fails closed at a safe pre-contact pose instead of silently intersecting another actor.

The solver produces candidate contact and motion geometry only. It does not activate parenting, containment, attachment, or full physics.

### Intentional contact versus collision

The hand/burger event is now represented as semantic `nudge` intent:

`hand -> approach -> intended burger surface contact -> maintain contact during nudge -> retreat`

The layout supplies source/target roles, approach direction, preferred target side, contact clearance, obstacle clearance, and phase progress. It does **not** supply a literal `handContactPosition`.

At runtime the solver ranks measured exterior contact regions when available and falls back conservatively to normalized visible-bounds faces when they are not. Literal contact is solved surface-to-surface, then the complete visible hull is projected along the chosen contact normal to guarantee a small positive gap rather than interpenetration.

The apple, nigiri, and tray are obstacle geometry. The approach/retreat path is sampled as a swept moving volume; if the preferred contact side or route is physically blocked, a lower-ranked valid contact pair is allowed to win. Semantic preference therefore remains important without outranking literal geometry.

### Contact-coupled motion

During the contact phase the source root is recomputed from the burger's **current resolved world pose every frame**. The hand therefore follows the burger while the nudge is active instead of relying on independent keyframes that merely happen to line up.

Burger translation itself now begins only after the contact phase starts and resolves before release. Attention/emphasis may lead the physical motion, but the object does not move before the hand reaches contact.

### Generalized surface spacing

CP.1F also adds a reusable directional surface-clearance primitive. The goldfish can still be semantically staged "behind the burger", but the runtime enforces a minimum **surface-to-surface** gap using whichever reviewed burger/fish assets are cast. This is stronger than a hard-coded center-to-center Z value and is reusable for behind/beside/negative-space staging.

### Rigid-contact boundary

CP.1F is intentionally a rigid-body contact foundation, not automatic hand articulation. It can robustly solve touch, push, nudge, rest, and coarse surface contact with arbitrary measured assets. A future rig/IK layer can consume the same contact target for finger wrapping or grasp poses without replacing this geometry authority.

### Preserved invariants

- one continuous 0–26 second film sampler;
- semantic beats remain navigation/story metadata, not runtime motion containers;
- C2 master camera and CP.1E.12 soft camera-safety remain intact;
- one demand-rendered low-power WebGL Canvas;
- measured tray seating/support behavior remains intact;
- fish occlusion is still earned by the camera orbit;
- no new asset resolver, Director, scene authority, or physics engine is introduced.

---

## CP.1E.13 — Contact Hold + Deeper Fish Spacing

CP.1E.13 is a focused physical-interaction polish pass on top of CP.1E.12. The successful one-film/C2 camera rail and soft post-rail camera-safety system are intentionally locked; this phase does not retune camera motion.

### Hand approach -> contact -> retreat

CP.1E.12 solved the thumb/apple collision by routing the hand high and behind the apple, but the recording showed that the safe endpoint stopped short of the burger. CP.1E.13 completes the interaction corridor:

1. a high clearance approach passes the apple;
2. the hand descends into a low/right burger contact pose;
3. that pose is held while the burger nudge cue is active;
4. a separate high retreat curve carries the hand back out without retracing through the apple.

The reusable rule is now stronger than obstacle avoidance alone: an interaction trajectory must satisfy both **clearance** and **target contact**.

### Deeper fish negative space

The fish keeps the same occlusion/reveal logic and remains essentially fixed while the camera earns the reveal. Its settled back-plane is moved farther behind the burger so the revealed surfaces no longer read as nearly touching.

### Camera lock

The CP.1E.12 camera runtime and soft safety module are not payload targets in this patch. The installer hashes both files before applying CP.1E.13 and verifies the hashes again afterward, so contact/spacing polish cannot accidentally change the camera that now reads smoothly.

---

## CP.1E.12 — Soft Camera Safety + Physical Clearance

CP.1E.12 preserves the CP.1E.11 one-film runtime and C2 master camera rail. The recording showed that continuity could still be broken *after* the authored camera was sampled: the geometry-aware safe-frame guard had a binary opacity admission and a binary distance threshold, so a fading-in cow could suddenly make the runtime pull the camera backward.

### Final-camera continuity

The post-rail framing layer is now a deterministic soft constraint rather than a second camera animator. Actor bounds participate continuously as opacity rises, and framing pressure blends into the authored camera through a smootherstep protection envelope. There is no `opacity <= 0.06 -> ignore / otherwise full actor` switch and no `required > authored * 1.12 -> jump` branch.

The important invariant is now **final rendered camera continuity**, not merely smooth master-rail control points. Semantic beats remain seek/story metadata only.

### Hand clearance

The early hand no longer follows one straight diagonal through the apple. Its active one-film track follows a cubic clearance arc: rise outside the tray, travel high/behind the apple, then descend toward the burger. This is still benchmark-specific choreography, but it establishes the reusable rule that an interaction approach must account for obstacle clearance rather than assuming an unobstructed line.

### Fish negative space

The fish remains fully behind the burger for the occlusion proof and still holds while the Inspect-like orbit reveals it, but its back-plane position is moved farther away. The added depth separation prevents the revealed fish and burger surfaces from reading as almost touching.

---

## CP.1E.11 — One-Film Runtime + C2 Camera Continuity

Cinematic Production remains **benchmark first, generalize second**. CP.1E.11 removes the last runtime-authority seam that could still make the burger benchmark feel like a chain of shots even when no camera cut existed.

### One film, semantic beats only

The eight benchmark beats remain useful for teaching intent, navigation, inspection, and later GLM planning, but they no longer select runtime actor state during normal playback.

Normal playback is now:

`absolute film time -> one continuous actor choreography -> one continuous camera trajectory`

rather than:

`shot sampler -> shot sampler -> shot sampler -> continuous insert journey`.

The legacy shot samplers remain temporarily in the file for compatibility and midpoint inspection, but `sampleRawCinematicBurgerRuntime()` no longer branches on `segmentAtTime()` or `shotId`.

### Pre-cow seam repair

The CP.1E.10 recording exposed a subtle prepare/settle/restart feeling before the cow. The source confirmed a hidden 7.4-second authority change: the early shot sampler handed control to the continuous insert sampler while the tray and trio were also being restaged.

CP.1E.11 removes that handoff. The tray, apple, burger, nigiri, hand, cow, chicken, fish, recap, and hero are all sampled from one absolute-time choreography from frame zero. The trio begins its outward gallery travel before the cow is visible and keeps moving while the cow arrives, so the film does not finish one composition before beginning the next.

The early trio restaging also consumes one easing curve directly. It is not passed through a second `smootherStep` interpolation layer, avoiding the exaggerated settle that previously advertised the handoff.

### C2 camera continuity

CP.1E.9 removed zero-velocity camera stops and CP.1E.10 added the broad Inspect-like orbit. CP.1E.11 keeps that spatial path but upgrades interpolation from velocity-continuous cubic Hermite to a quintic Hermite trajectory with shared position, velocity, and acceleration at each camera control point.

That makes the master rail **C2 continuous** at internal keys: position, velocity, and acceleration are continuous. Linear time parameterization remains intentional, so a control point cannot silently become a stop.

The broad fish reveal/orbit remains intact: the fish is **fully occluded, then discovered**, the burger stays a solid foreground occluder, and the late-film path continues front -> right side -> behind -> left side -> front hero.

---

## CP.1E.10 — Inspect-Like Orbit + Full Occlusion Reveal


Cinematic Production remains **benchmark first, generalize second**. This phase keeps the 26-second burger benchmark as a reference implementation, but the goal is not to polish one burger short forever. The goal is to discover reusable camera, staging, motion, continuity, lighting, and evaluation rules that MyWay can later drive automatically from high-level cinematic intent.

The page still uses the real Asset Library cast for the tray, apple, burger, nigiri, cow, chicken, goldfish, and hand, and it still uses exactly one WebGL 3D pane.

### Golden benchmark 01

`benchmark_01_burger_assembly_tabletop` remains the benchmark-first visual target.

The eight semantic beats remain visible as **seek/navigation markers**:

1. establish the tabletop trio;
2. hand entrance and burger nudge;
3. hero-burger shift;
4. cow emphasis;
5. chicken emphasis;
6. goldfish reveal;
7. return / recap across the tray;
8. final burger hero push.

Those semantic boundaries are not camera cuts and are not physical reset points.

### CP.1E.10 continuity experiment

CP.1E.9 proved that semantic boundaries no longer need zero camera velocity, but the recording exposed two deeper problems: the goldfish could leak a tail before it was truly discovered, and the camera still returned toward comfortable frontal compositions after the reveal. Those compositional returns could still feel like new shots.

CP.1E.10 keeps the time-aware Hermite master rail and strengthens the spatial direction:

- the active actor choreography now persists from the insert journey through recap and the final hero;
- the fish holds a deeper back-plane position and aligns its long axis roughly down the initial viewing ray;
- the burger remains a solid, essentially stationary foreground occluder;
- the master camera performs a broad Inspect-like orbit in one rotational direction;
- the orbit continues front -> right side -> behind -> left side -> front hero instead of resetting after the fish;
- recap emphasis and the final hero happen while that same spatial journey is still in motion.

The shot cards remain useful for story organization and seeking, but semantic boundaries are not camera cuts and are not physical reset points.

### Fish parallax proof

The goldfish beat remains the first explicit test of spatially intelligent camera direction, but CP.1E.10 raises the bar from “partly behind” to **fully occluded, then discovered**.

Before the reveal, the fish is centered almost directly behind the burger from the near-frontal approach and rotated so its long profile runs mostly into depth. The intent is that no tail or head advertises the fish early. The fish then stays nearly fixed in world space while the camera sweeps around the burger toward a strong right-side view. The foreground burger should move rapidly across the image while the deeper fish separates from it and becomes readable.

The reveal must come primarily from camera motion around the persistent scene—not from sliding, shrinking, or ghost-fading the burger out of the way. This is the same spatial freedom demonstrated manually by Inspect mode, but authored as deterministic cinematic choreography.

### Late-film through-motion

The camera does not reverse toward a frontal “recap shot” after the fish. It keeps rotating around the tabletop, passes behind the burger/tray, continues around the opposite side, and only returns toward the front as the final hero composition emerges. That deliberate one-direction orbit is meant to remove the remaining “movement resolves -> new shot starts” feeling near the end.

### Physical staging

The runtime keeps the geometry/contact work from the earlier CP.1E phases:

- visible GLB bounds are measured;
- actors are bottom/contact aligned to the tray support surface;
- support-surface lanes constrain placement;
- apple and nigiri remain physical context during the insert journey;
- the burger remains the foreground anchor / occluder during the fish reveal;
- opacity is not used as the primary solution for occlusion.

### Performance architecture

The movie clock lives inside the WebGL runtime rather than driving React state every animation frame.

The runtime preserves:

- one WebGL Canvas;
- `frameloop="demand"`;
- `dpr={1}`;
- `shadows={false}`;
- low-power WebGL preference;
- IntersectionObserver and document-visibility gating;
- wall-time anchored playback;
- throttled page-level timecode updates;
- camera-aware studio lighting;
- analytic crop protection as an emergency envelope rather than a second camera animator.

### Existing boundaries

CP.1E.10 does not add a second Director, asset resolver, Builder, directability authority, or scene authority. The Director Capability Library, Directable Assets, Asset Library, Scene Builder, motion-program infrastructure, and Blender Foundry remain the authoritative labs for their respective responsibilities.

The benchmark is allowed to contain authored choreography while the visual language is being discovered. Once the reference result is genuinely strong, the reusable pieces should be extracted into a general continuous-choreography contract that GLM can request at a high level and MyWay can resolve through trusted camera/directability/motion systems.

### Non-goals

- the hand is not yet a production-quality grasp rig;
- the solid burger GLB is not separated into bun, patty, lettuce, and cheese layers;
- the current WebGL lighting is not the final beauty-render lane;
- CP.1E.10 does not yet formalize the final GLM choreography contract;
- this phase does not yet route complex shots through Blender;
- semantic shot ids remain for authoring/navigation even though they must not advertise themselves as visible cuts.
