# Phase 1B.5A Director capability visual qualification

This is a **code-level visual audit**, not a substitute for browser review. It
checks whether the controlled fixture geometry, authored motion, semantic recipe,
and renderer pivot are internally consistent enough that the capability should
be visually judgeable in the Director Capability Library. Human review remains
the promotion authority.

## Actor-movement review

### Rigid / root-transform family

- **Translate** — stable frozen canary; directional body makes displacement easy to read.
- **Rotate** — stable frozen canary; asymmetrical body marker makes orientation legible.
- **Pivot** — authored edge/contact pivot remains distinct from centre rotation.
- **Oscillate** — stable frozen canary; repeated path is deterministic.
- **Enter frame / Exit frame** — off-frame start/end intent remains explicit.
- **Move toward / Move away** — target actor remains visible so relational direction can be judged.
- **Spin** — intentionally still a known semantic overlap with Rotate; do not treat it as newly qualified continuous-spin execution.
- **Lift / Lower** — Phase 1B.5A bounds the controlled move to 1 m; Lower starts elevated so neither proof disappears beneath the floor or out of the static teaching frame.
- **Expand / Contract** — Phase 1B.5A moves these to the rigid scale-readable fixture. They no longer inherit the material-process/nozzle visual language.

### Path / surface family

- **Follow path** — explicit curved guide and controlled path remain visible.
- **Slide** — translation is constrained to the authored direction without rolling orientation.
- **Roll** — Phase 1B.5A corrects the controlled proof in three places: the wheel rests at radius-height above the floor, visible geometry rotates around its centre rather than the bottom placement root, and +X travel around +Z uses negative-Z angular polarity. The real resolved-asset adapter gets the same optional bounds-centre pivot treatment.

### Relationship family

- **Attach / Detach** — persistent relation and release are separate scene-state operations.
- **Follow target** — current target state is sampled so the relationship remains visible while the target moves.
- **Aim at / Align** — directional geometry and separate recipe intent keep pointing-to-target distinct from axis alignment.

These controlled proofs do **not** imply that an arbitrary real GLB exposes a
semantic attachment socket or alignable subpart. Asset directability diagnostics
must resolve the required evidence when the action depends on asset anatomy.

### Articulation family

- **Hinge / Open / Close** — the controlled door/hinge fixture makes pivot and openness direction judgeable.
- Real arbitrary GLB child-node, joint, or door execution is still deliberately unqualified. Phase 1B.5A does not promote it.

### Containment family

- **Insert / Remove** — peg/container staging makes direction and containment meaning readable.
- Measured fit, clearance, allowed intersection, and collision remain Asset Scene Builder responsibilities.

### Multi-actor family

- **Assemble / Disassemble / Scatter / Split / Merge** — the fixture exposes multiple stable participant IDs and a shared result region. The choreography planner does not clone geometry or invent absent parts.
- Assemble remains distinct from Merge; Disassemble remains distinct from Split/Scatter at the recipe/state level.

### Process / quantity family

- **Fill / Drain** — open-vessel shell + level ticks + quantity overlay; the container root does not scale to fake contents.
- **Accumulate** — shallow tray + buildup beads + accumulation-region guide; distinct from Fill.
- **Flow** — source/nozzle + explicit route + open destination receiver + deterministic carriers.
- **Emit** — source/nozzle + outward fan guide + deterministic independent carriers; no fake destination receiver.

The process visuals are semantic evidence, not fluid, smoke, granular, collision,
or production particle physics.

## End-to-end runtime checks added in Phase 1B.5A

- Primitive Builder reconstructs incoming `DirectorSceneState` before the active moment.
- The same incoming state reaches actor sampling, camera composition, motivated lighting, and shot validation.
- Cross-moment visibility is forwarded to the real resolved-asset root.
- Process samples are rendered in real resolved scenes as honest carrier/quantity overlays.
- MotionProgram directability requirement resolution is visible beside geometry and placement diagnostics.
- Visual Experience shadow-samples the canonical Director/UMP/state stack while its older renderer remains unchanged until parity is visually qualified.

## Browser review checklist

Review these first because Phase 1B.5A changes their controlled visual proof:

1. Roll — no floor penetration; marker rotates in the travel-consistent direction.
2. Lower — starts elevated and finishes just above the floor.
3. Lift — both endpoints remain comfortably framed.
4. Expand / Contract — reads as object extent change, not a material process.
5. Fill / Drain — level changes while vessel root stays fixed.
6. Accumulate — buildup reads as a pile/quantity, not filling a vessel.
7. Flow — carriers clearly travel source → route → receiver.
8. Emit — carriers spread outward with no implied receiver.

Then spot-check Attach → later target motion, Detach → later target motion,
Assemble/Disassemble, Split/Merge, and a camera-qualified scene to verify the
stateful Builder integration did not regress previously frozen behavior.
