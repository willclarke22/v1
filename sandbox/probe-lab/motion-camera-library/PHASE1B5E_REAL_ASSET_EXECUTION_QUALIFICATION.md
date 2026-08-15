# Phase 1B.5E — Director Capability Library real-asset execution qualification

Phase 1B.5E makes `/sandbox/probe-lab/director-capability-library` the canonical
place to answer a practical question before a capability graduates into scene
generation:

> Does this Director action still behave honestly when the reviewer chooses
> specific real Asset Library GLBs?

## What changed

The existing isolated audit viewer is retained. It already owns the one
demand-rendered WebGL Canvas and already separates controlled proof from
real-asset generalization.

Phase 1B.5E adds:

1. per-role real-asset selectors after the deferred Asset Library snapshot is
   requested;
2. a pure real-asset execution qualification report driven by the Phase 1B.5D
   authority path;
3. **asset/operator qualification** evidence from the hardened Affordance Graph;
4. **pair qualification** evidence for mapped Place/Attach/Insert/Flow-style lanes using
   authoritative preview `scene_instance` dimensions;
5. explicit readiness states that distinguish missing assets, asset-authoring
   requirements, runtime-pending lanes, contextual requirements, Builder
   validation handoff, and assets ready for human visual proof;
6. propagation of the selected asset's existing directability profile into the
   shared `DirectorRuntimeActor` used by the preview runtime.

## What did not change

Phase 1B.5E does **not**:

- add a second Canvas or a second animation clock;
- eagerly fetch the Asset Library at page load;
- create an asset-pair matrix;
- activate pair relationships;
- move fit/collision/stability authority out of Asset Scene Builder;
- fabricate subparts, pivots, ports, sockets, outlets, containment, rigs, or
  animation clips;
- promote declared articulation/rig execution;
- change camera semantics;
- change the 183 Director capability ids or support distribution.

## Review workflow

For a selected capability:

1. keep **Controlled proof** as the deterministic baseline;
2. load the Asset Library only when real-asset testing is desired;
3. leave each role on auto-match or choose a specific reviewed asset;
4. inspect the Phase 1B.5E status, operator requirements, and pair results;
5. switch the existing viewer to **Real-asset proof**;
6. play/scrub and record Pass / Needs work / Blocked / Approximation acceptable
   using the existing visual-audit state.

This is intentionally a qualification bench. Later Phase 1B.6 patches use its
evidence to strengthen the capability families that fail or remain pending.
