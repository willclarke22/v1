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
