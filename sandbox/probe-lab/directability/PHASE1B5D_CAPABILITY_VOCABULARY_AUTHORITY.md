# Phase 1B.5D — Capability Vocabulary + Authority Cleanup

## Goal

Prevent adjacent MyWay scene vocabularies from becoming duplicate execution languages before the real-asset execution bench is added.

Phase 1B.5D is an authority/labeling phase. It does not add new motion execution.

## Four authority layers

### 1. Director action

Question: **What should happen, to whom, and over what time?**

Owner: canonical Director + Universal Motion Program.

Examples: `roll`, `attach`, `object_open`, `insert_into`, `fill`, `flow`.

This is the semantic action vocabulary that may be intentionally selected by GLM.

### 2. Asset qualification

Question: **Can this particular real asset legitimately participate?**

Owner: Directable Asset compiler + operator qualification.

Examples: `roll`, `attach_as_source`, `attach_as_target`, `open_subpart`, `insert_into_target`, `fill_target`.

These are internal evidence roles and must not be presented as alternate Director commands.

### 3. Pair interaction

Question: **Can these two particular assets satisfy the interaction together?**

Owner: asset-pair resolver.

Examples: `place_on`, `surface_attach`, `precise_attach`, `insert`, `flow`.

Pair output remains a candidate. It cannot activate parenting, containment, support, or a persistent scene relationship by itself.

### 4. Builder placement

Question: **Where may the actors actually be placed after measured scene validation?**

Owner: Asset Scene Builder / Primitive Builder.

Examples: `on_ground`, `on_surface`, `beside`, `inside`, `attached_to`.

Builder placement keeps final scale/fit/clearance/stability/collision authority.

## Key mappings

| Director action | Asset qualification | Pair interaction | Builder relation |
| --- | --- | --- | --- |
| Translate | `translate` | — | — |
| Rotate | `rotate` | — | — |
| Aim at | `aim` | — | — |
| Align | `align` | — | — |
| Roll | `roll` | — | `on_ground` final contact validation |
| Attach | source/target attach operators | `precise_attach` or `surface_attach` | `attached_to` |
| Open | `open_subpart` | — | — |
| Close | `close_subpart` | — | — |
| Insert into target | target `insert_into_target` | `insert` | `inside` |
| Fill | target `fill_target` | — | — |
| Flow | source/target flow operators | `flow` | — |
| Emit | source `emit_from_source` | — | — |

Detach and Remove consume already-activated relationships rather than creating new pair-compatibility passes.

## Naming disambiguation

Stable internal IDs remain unchanged:
- camera framing `insert` is displayed as **Insert shot**;
- object motion `insert_into` is displayed as **Insert into target**.

This prevents camera framing and object interaction from appearing to be the same capability.

## Protected boundaries

Phase 1B.5D must preserve:
- 183 Director capabilities;
- support distribution `direct 101 / compound 65 / approximate 15 / declared 2`;
- Phase 1B.5C.2 scale authority and fit gates;
- proposed-only pair relationships;
- one demand-rendered Canvas in the Director Capability Library;
- zero direct Canvas ownership in the library shell and Directable Assets labs;
- existing Director/UMP/camera/scene-state runtime behaviour;
- Builder final fit/collision/stability authority.

## Next phase

Phase 1B.5E can consume this authority map in the Director Capability Library real-asset execution bench. That phase may select real Asset Library actors and surface qualification/pair/runtime status, but should continue using the same shared runtime rather than inventing another execution language.
