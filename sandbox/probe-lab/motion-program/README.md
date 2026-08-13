# Universal Motion Program — Phase 1B.4.2

`myway_motion_program_v1` is the renderer-neutral deterministic execution layer
beneath the semantic MyWay Director language.

Phase 1B.4.2 deliberately stays narrow:

- executable channels: `transform`, `orientation`;
- executable coordinate spaces: `world`, `actor_local`;
- primitives: vector lerp, angle lerp, rotate around anchor, periodic sampling;
- composition helpers: sequence, parallel, hold, repeat, reverse;
- Director adapter subset: `move_to`, `rotate`, `pivot`, `oscillate`;
- all other transform semantics retain the legacy actor runtime;
- the named Director Capability Library is not required to author a valid program;
- unsupported future lanes remain declared rather than being faked as root motion.

The public scene runtime API remains `sampleDirectorActorState(...)`. The adapter
may execute a MotionProgram only when every transform event for that actor is in
the frozen Phase 1B.4.2 subset; otherwise the complete actor uses the legacy path
so event ordering cannot silently change.
