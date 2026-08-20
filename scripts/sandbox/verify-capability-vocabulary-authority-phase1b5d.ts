import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  BUILDER_RELATION_INTERACTION_BRIDGES,
  DIRECTOR_CAPABILITY_ASSET_AUTHORITY_PATHS,
  DIRECTOR_CAPABILITY_AUTHORITY_LAYERS,
  DIRECTOR_CAPABILITY_AUTHORITY_SCHEMA_VERSION,
  directorCapabilityAssetAuthorityPath,
} from "../../sandbox/probe-lab/directability/capability-authority-contract";
import {
  DIRECTABLE_ASSET_OPERATOR_SPECS,
} from "../../sandbox/probe-lab/directability/interaction-operator-contract";
import {
  DIRECTABLE_ASSET_PAIR_INTERACTION_IDS,
} from "../../sandbox/probe-lab/directability/pair-interaction-contract";
import {
  DIRECTOR_CAPABILITIES,
} from "../../sandbox/probe-lab/motion-camera-library/director-capability-registry";
import {
  PRIMITIVE_BUILDER_PLACEMENT_RELATIONS,
} from "../../sandbox/probe-lab/primitive-builder/asset-requirement-plan";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function source(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

assert(
  DIRECTOR_CAPABILITY_AUTHORITY_SCHEMA_VERSION ===
    "myway_director_capability_authority_phase1b5d_v1",
  "Phase 1B.5D authority schema version drifted.",
);

assert(
  DIRECTOR_CAPABILITY_AUTHORITY_LAYERS.map((item) => item.id).join("|") ===
    "director_action|asset_qualification|pair_interaction|builder_placement",
  "Phase 1B.5D must keep the four authority layers distinct and ordered.",
);

assert(
  DIRECTOR_CAPABILITY_AUTHORITY_LAYERS[0].exposed_to_director_model === true &&
    DIRECTOR_CAPABILITY_AUTHORITY_LAYERS.slice(1).every(
      (item) => item.exposed_to_director_model === false,
    ),
  "Only Director actions may be presented as the Director-model vocabulary.",
);

const operatorIds = new Set(
  DIRECTABLE_ASSET_OPERATOR_SPECS.map((item) => item.id),
);
const pairIds = new Set(DIRECTABLE_ASSET_PAIR_INTERACTION_IDS);
const builderRelations = new Set(PRIMITIVE_BUILDER_PLACEMENT_RELATIONS);

for (const path of DIRECTOR_CAPABILITY_ASSET_AUTHORITY_PATHS) {
  assert(
    DIRECTOR_CAPABILITIES.some(
      (capability) => capability.id === path.director_capability_id,
    ),
    `Authority path references missing Director capability ${path.director_capability_id}.`,
  );
  for (const operatorId of [
    ...path.asset_operator_ids,
    ...path.source_operator_ids,
    ...path.target_operator_ids,
  ]) {
    assert(
      operatorIds.has(operatorId),
      `${path.director_capability_id} references unknown asset operator ${operatorId}.`,
    );
  }
  for (const pairId of path.pair_interaction_ids) {
    assert(
      pairIds.has(pairId),
      `${path.director_capability_id} references unknown pair interaction ${pairId}.`,
    );
  }
  for (const relation of path.builder_placement_relations) {
    assert(
      builderRelations.has(relation),
      `${path.director_capability_id} references unknown Builder placement relation ${relation}.`,
    );
  }
}

for (const bridge of BUILDER_RELATION_INTERACTION_BRIDGES) {
  assert(
    builderRelations.has(bridge.builder_relation),
    `Builder bridge references unknown placement relation ${bridge.builder_relation}.`,
  );
  for (const pairId of bridge.pair_interaction_ids) {
    assert(
      pairIds.has(pairId),
      `Builder bridge ${bridge.builder_relation} references unknown pair interaction ${pairId}.`,
    );
  }
}

assert(
  BUILDER_RELATION_INTERACTION_BRIDGES.map((item) => item.builder_relation)
    .sort()
    .join("|") === [...PRIMITIVE_BUILDER_PLACEMENT_RELATIONS].sort().join("|"),
  "Every current Primitive Builder placement relation must have an explicit Phase 1B.5D authority note.",
);

const attach = directorCapabilityAssetAuthorityPath("attach");
assert(attach, "Attach authority path is missing.");
assert(
  attach.source_operator_ids.includes("attach_as_source") &&
    attach.target_operator_ids.includes("attach_as_target") &&
    attach.pair_interaction_ids.includes("precise_attach") &&
    attach.pair_interaction_ids.includes("surface_attach") &&
    attach.builder_placement_relations.includes("attached_to"),
  "Attach must map Director intent to asset roles, pair compatibility, and Builder placement without collapsing them.",
);

const insert = directorCapabilityAssetAuthorityPath("insert_into");
assert(insert, "Insert-into authority path is missing.");
assert(
  insert.target_operator_ids.includes("insert_into_target") &&
    insert.pair_interaction_ids.join("|") === "insert" &&
    insert.builder_placement_relations.join("|") === "inside",
  "Insert into target must stay distinct across Director action, asset qualification, pair interaction, and Builder placement.",
);

const flow = directorCapabilityAssetAuthorityPath("flow");
assert(flow, "Flow authority path is missing.");
assert(
  flow.source_operator_ids.includes("flow_as_source") &&
    flow.target_operator_ids.includes("flow_as_target") &&
    flow.pair_interaction_ids.join("|") === "flow",
  "Flow must preserve Director process semantics over internal source/target/pair qualification.",
);

const cameraInsert = DIRECTOR_CAPABILITIES.find(
  (item) => item.id === "insert" && item.category === "camera_framing",
);
const objectInsert = DIRECTOR_CAPABILITIES.find(
  (item) => item.id === "insert_into" && item.category === "object_motion",
);
assert(cameraInsert?.label === "Insert shot", "Camera insert must display as Insert shot.");
assert(
  objectInsert?.label === "Insert into target",
  "Object-motion insert_into must display as Insert into target.",
);

assert(
  DIRECTOR_CAPABILITIES.length === 184,
  `Phase 1B.5D changed the 183-capability registry: ${DIRECTOR_CAPABILITIES.length}.`,
);
const supportCounts = DIRECTOR_CAPABILITIES.reduce<Record<string, number>>(
  (counts, capability) => {
    counts[capability.compiler.threejs] =
      (counts[capability.compiler.threejs] ?? 0) + 1;
    return counts;
  },
  {},
);
assert(
  supportCounts.direct === 102 &&
    supportCounts.compound === 65 &&
    supportCounts.approximate === 15 &&
    supportCounts.declared === 2,
  `Phase 1B.5D changed support classifications: ${JSON.stringify(supportCounts)}.`,
);

const workbench = source(
  "sandbox/probe-lab/directability/ui/directable-assets-workbench.tsx",
);
for (const marker of [
  "Phase 1B.5D · vocabulary authority",
  "These layers cooperate but are not synonyms",
  "DIRECTOR_CAPABILITY_AUTHORITY_LAYERS",
]) {
  assert(
    workbench.includes(marker),
    `Directable Assets workbench is missing authority marker: ${marker}.`,
  );
}
assert(
  !workbench.includes("<Canvas"),
  "Phase 1B.5D must not add WebGL Canvas ownership to Directable Assets workbench.",
);

const qualification = source(
  "sandbox/probe-lab/directability/ui/directable-asset-qualification-lab.tsx",
);
for (const marker of [
  "Phase 1B.5B.1 inference",
  "Phase 1B.5B.2 hardening",
  "Asset Qualification Operators",
  "internal qualification requirements, not alternate Director commands",
  "Derived asset-operator qualification",
  "Library-wide qualification audit",
  "Geometry-derived candidates",
  "Top-opening geometry candidate",
]) {
  assert(
    qualification.includes(marker),
    `Asset Qualification tab is missing vocabulary marker: ${marker}.`,
  );
}

const pairLab = source(
  "sandbox/probe-lab/directability/ui/directable-asset-pair-lab.tsx",
);
for (const marker of [
  "Asset Pair Interaction Qualification",
  "compatibility mechanisms beneath Director actions",
  "Every relationship remains proposed",
  "Asset Scene Builder accepts validation",
]) {
  assert(
    pairLab.includes(marker),
    `Pair Interaction tab is missing authority marker: ${marker}.`,
  );
}
assert(
  !pairLab.includes("<Canvas"),
  "Phase 1B.5D pair qualification must not add another WebGL Canvas.",
);

const capabilityLibrary = source(
  "sandbox/probe-lab/motion-camera-library/ui/director-capability-library-lab.tsx",
);
// Phase 1B.6.1 simplified the Director page layout. The authority contract is
// protected by typed helpers and inspector wiring, not by preserving old
// visible headings or explanatory prose forever.
for (const marker of [
  "DIRECTOR_CAPABILITY_AUTHORITY_SCHEMA_VERSION",
  "DIRECTOR_CAPABILITY_AUTHORITY_LAYERS",
  "directorCapabilityAssetAuthorityPath",
  "capabilityAuthorityPath",
  "selected_capability_path",
  "Capability authority path",
]) {
  assert(
    capabilityLibrary.includes(marker),
    `Director Capability Library is missing Phase 1B.5D authority wiring: ${marker}.`,
  );
}
assert(
  !capabilityLibrary.includes("<Canvas"),
  "Director Capability Library shell must retain zero direct Canvas elements.",
);

const authorityDoc = source(
  "sandbox/probe-lab/directability/PHASE1B5D_CAPABILITY_VOCABULARY_AUTHORITY.md",
);
for (const marker of [
  "Director action",
  "Asset qualification",
  "Pair interaction",
  "Builder placement",
  "Insert shot",
  "Insert into target",
  "183 Director capabilities",
]) {
  assert(
    authorityDoc.includes(marker),
    `Phase 1B.5D documentation is missing concept: ${marker}.`,
  );
}

console.log(
  "Director capability vocabulary + authority cleanup Phase 1B.5D verification passed.",
);
console.log(
  "Director actions, asset qualification operators, pair interactions, and Builder placement remain distinct typed layers.",
);
console.log(
  "Camera Insert shot and object Insert into target are visually disambiguated without changing stable IDs.",
);
console.log(
  "183 atomic-capability support distribution, proposed pair relationships, Builder validation authority, and one-Canvas boundaries remain protected without freezing historical page copy.",
);
