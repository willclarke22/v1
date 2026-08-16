# Cinematic Production

## CP.1D — Smooth Performance Preview

Cinematic Production remains **benchmark first, generalize second**. CP.1D keeps the continuous, seekable short-form player from CP.1C but changes how it runs so the burger benchmark behaves more like a real video preview and stops consuming unnecessary CPU/GPU while the rest of the desktop is in use.

The page still uses the actual Asset Library cast for the tray, solid burger GLB, cow, chicken, goldfish, and left hand. It still uses exactly one WebGL 3D pane.

### Golden benchmark 01

`benchmark_01_burger_assembly_tabletop` remains the benchmark-first visual target for this phase.

### Continuous playback

The eight-shot benchmark remains visible for navigation, but shot cards are seek points rather than the playback engine. Pressing **Play benchmark** advances one continuous timeline through:

1. a three-burger establish with a camera push;
2. a hand entrance and burger nudge;
3. a hero-burger slide with a lower camera push;
4. a cow insert that enters and settles;
5. a mirrored chicken insert;
6. a goldfish insert with a small pop/bob entrance;
7. a hand-assisted return to the tray and burger regroup;
8. a slow hero beauty push.

A scrubber exposes the current production time so animation and camera timing can still be judged directly.

### Camera grammar

CP.1B established the single WebGL Canvas-based 3D pane and made camera movement visible. CP.1C moved camera position, look target, and field of view onto the continuous movie timeline. CP.1D preserves those camera beats but removes the extra React-driven frame loop and the second layer of camera smoothing.

The preview follows the reference-video motion pattern more closely: hard reframes / cuts between beats, then smooth in-shot camera and object motion inside each beat. The player uses the earlier wide rectangular workbench viewport again so it is easier to inspect on desktop, while keeping the CP.1D performance safeguards and continuous cinematic motion.

### Performance architecture

The movie clock now lives inside the WebGL runtime rather than calling React state on every animation frame.

The runtime uses the same performance principles that already proved useful in the Director Capability Library:

- one WebGL Canvas;
- `frameloop="demand"`;
- `dpr={1}`;
- `shadows={false}`;
- low-power WebGL preference;
- no real-time 1024px shadow map;
- IntersectionObserver and document-visibility gating;
- full-speed WebGL animation only while the movie is playing and visible;
- throttled page-level timecode updates instead of whole-page rerenders every frame.

The clock is wall-time anchored, so dropped render frames do not make the 26-second benchmark take twice as long.

### Existing boundaries

CP.1D does not add a second Director, asset resolver, Builder, or scene authority. The Director Capability Library, Directable Assets, Asset Library, Scene Builder, and Blender Foundry remain the authoritative labs for their respective responsibilities.

### CP.1D non-goals

- the hand is not yet a production-quality grasp rig;
- the solid burger GLB is not separated into bun, patty, lettuce, and cheese layers;
- the cow / chicken / goldfish inserts are benchmark staging, not final compositing;
- the current WebGL lighting is not the final beauty-render lane;
- this phase does not yet route complex shots through Blender.


### CP.1D.1 viewport adjustment

The WebGL preview is restored to the earlier wide rectangular desktop pane. CP.1D.1 keeps the runtime-owned wall clock, demand rendering, DPR 1, disabled dynamic shadows, visibility gating, low-power WebGL preference, and throttled React UI updates unchanged. The vertical-only FOV compensation is removed so the original camera field-of-view values are used again.
