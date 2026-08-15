import type { PrimitiveBuilderPlacementRelation } from "../primitive-builder/asset-requirement-plan";
import type { DirectableAssetOperatorId } from "./interaction-operator-contract";
import type { DirectableAssetPairInteractionId } from "./pair-interaction-contract";

export const DIRECTOR_CAPABILITY_AUTHORITY_SCHEMA_VERSION =
  "myway_director_capability_authority_phase1b5d_v1" as const;

export type DirectorCapabilityAuthorityLayerId =
  | "director_action"
  | "asset_qualification"
  | "pair_interaction"
  | "builder_placement";

export type DirectorCapabilityAuthorityLayer = {
  id: DirectorCapabilityAuthorityLayerId;
  label: string;
  question: string;
  owner: string;
  exposed_to_director_model: boolean;
  note: string;
};

export const DIRECTOR_CAPABILITY_AUTHORITY_LAYERS = [
  {
    id: "director_action",
    label: "Director action",
    question: "What should happen, to whom, and over what time?",
    owner: "Canonical Director + Universal Motion Program",
    exposed_to_director_model: true,
    note: "Semantic action vocabulary. This is the layer GLM may intentionally request.",
  },
  {
    id: "asset_qualification",
    label: "Asset qualification",
    question: "Can this particular real asset legitimately participate in that action?",
    owner: "Directable Asset compiler + operator qualification",
    exposed_to_director_model: false,
    note: "Internal evidence/requirements vocabulary. Operator roles such as attach_as_source are not Director commands.",
  },
  {
    id: "pair_interaction",
    label: "Pair interaction",
    question: "Can these two particular assets satisfy the interaction together?",
    owner: "Asset-pair interaction resolver",
    exposed_to_director_model: false,
    note: "Internal compatibility and candidate-transform vocabulary. A resolved candidate is not a final physics verdict.",
  },
  {
    id: "builder_placement",
    label: "Builder placement",
    question: "Where may the actors actually be placed after measured fit and collision checks?",
    owner: "Asset Scene Builder / Primitive Builder placement validation",
    exposed_to_director_model: false,
    note: "Final scene-fit authority. Placement relations are not alternate names for Director motion actions.",
  },
] as const satisfies readonly DirectorCapabilityAuthorityLayer[];

export type DirectorCapabilityAssetAuthorityPath = {
  director_capability_id: string;
  director_action_label: string;
  asset_operator_ids: readonly DirectableAssetOperatorId[];
  source_operator_ids: readonly DirectableAssetOperatorId[];
  target_operator_ids: readonly DirectableAssetOperatorId[];
  pair_interaction_ids: readonly DirectableAssetPairInteractionId[];
  builder_placement_relations: readonly PrimitiveBuilderPlacementRelation[];
  relationship_dependency: string | null;
  inverse_director_capability_id: string | null;
  builder_validation_required: boolean;
  runtime_owner: "shared_director_runtime";
  note: string;
};

const PATHS = [
  {
    director_capability_id: "translate",
    director_action_label: "Translate",
    asset_operator_ids: ["translate"],
    source_operator_ids: [],
    target_operator_ids: [],
    pair_interaction_ids: [],
    builder_placement_relations: [],
    relationship_dependency: null,
    inverse_director_capability_id: null,
    builder_validation_required: false,
    runtime_owner: "shared_director_runtime",
    note: "Root translation is a Director/UMP action; asset qualification only proves that a usable root transform exists.",
  },
  {
    director_capability_id: "rotate",
    director_action_label: "Rotate",
    asset_operator_ids: ["rotate"],
    source_operator_ids: [],
    target_operator_ids: [],
    pair_interaction_ids: [],
    builder_placement_relations: [],
    relationship_dependency: null,
    inverse_director_capability_id: null,
    builder_validation_required: false,
    runtime_owner: "shared_director_runtime",
    note: "Root rotation is temporal motion; it is not a Builder placement relation.",
  },
  {
    director_capability_id: "lift",
    director_action_label: "Lift",
    asset_operator_ids: ["lift"],
    source_operator_ids: [],
    target_operator_ids: [],
    pair_interaction_ids: [],
    builder_placement_relations: [],
    relationship_dependency: null,
    inverse_director_capability_id: "lower",
    builder_validation_required: false,
    runtime_owner: "shared_director_runtime",
    note: "Vertical root travel remains Director/UMP-owned; later scene validation may still constrain a final resting pose.",
  },
  {
    director_capability_id: "lower",
    director_action_label: "Lower",
    asset_operator_ids: ["lower"],
    source_operator_ids: [],
    target_operator_ids: [],
    pair_interaction_ids: [],
    builder_placement_relations: [],
    relationship_dependency: null,
    inverse_director_capability_id: "lift",
    builder_validation_required: false,
    runtime_owner: "shared_director_runtime",
    note: "Vertical root travel remains Director/UMP-owned; later scene validation may still constrain a final resting pose.",
  },
  {
    director_capability_id: "aim_at",
    director_action_label: "Aim at",
    asset_operator_ids: ["aim"],
    source_operator_ids: [],
    target_operator_ids: [],
    pair_interaction_ids: [],
    builder_placement_relations: [],
    relationship_dependency: null,
    inverse_director_capability_id: null,
    builder_validation_required: false,
    runtime_owner: "shared_director_runtime",
    note: "Aim needs asset-specific semantic facing evidence but remains a Director orientation action.",
  },
  {
    director_capability_id: "align",
    director_action_label: "Align",
    asset_operator_ids: ["align"],
    source_operator_ids: [],
    target_operator_ids: [],
    pair_interaction_ids: [],
    builder_placement_relations: [],
    relationship_dependency: null,
    inverse_director_capability_id: null,
    builder_validation_required: false,
    runtime_owner: "shared_director_runtime",
    note: "Align may consume qualified geometric or semantic orientation evidence without becoming a placement relation.",
  },
  {
    director_capability_id: "roll",
    director_action_label: "Roll",
    asset_operator_ids: ["roll"],
    source_operator_ids: [],
    target_operator_ids: [],
    pair_interaction_ids: [],
    builder_placement_relations: ["on_ground"],
    relationship_dependency: null,
    inverse_director_capability_id: null,
    builder_validation_required: true,
    runtime_owner: "shared_director_runtime",
    note: "UMP owns rolling motion over time; Builder remains authoritative for the final ground/contact-valid scene pose.",
  },
  {
    director_capability_id: "attach",
    director_action_label: "Attach",
    asset_operator_ids: [],
    source_operator_ids: ["attach_as_source", "surface_attach_as_source"],
    target_operator_ids: ["attach_as_target", "surface_attach_as_target"],
    pair_interaction_ids: ["precise_attach", "surface_attach"],
    builder_placement_relations: ["attached_to"],
    relationship_dependency: null,
    inverse_director_capability_id: "detach",
    builder_validation_required: true,
    runtime_owner: "shared_director_runtime",
    note: "Director says Attach; internal asset roles and pair lanes determine whether a legitimate attachment candidate exists before Builder validation.",
  },
  {
    director_capability_id: "detach",
    director_action_label: "Detach",
    asset_operator_ids: [],
    source_operator_ids: [],
    target_operator_ids: [],
    pair_interaction_ids: [],
    builder_placement_relations: ["attached_to"],
    relationship_dependency: "existing persistent_attachment relationship",
    inverse_director_capability_id: "attach",
    builder_validation_required: true,
    runtime_owner: "shared_director_runtime",
    note: "Detach consumes an already-activated attachment relationship; it is not a second pass through pair compatibility.",
  },
  {
    director_capability_id: "object_open",
    director_action_label: "Open",
    asset_operator_ids: ["open_subpart"],
    source_operator_ids: [],
    target_operator_ids: [],
    pair_interaction_ids: [],
    builder_placement_relations: [],
    relationship_dependency: null,
    inverse_director_capability_id: "object_close",
    builder_validation_required: false,
    runtime_owner: "shared_director_runtime",
    note: "Director Open is distinct from the internal open_subpart qualification requirement and remains fail-closed when no trusted subpart/joint exists.",
  },
  {
    director_capability_id: "object_close",
    director_action_label: "Close",
    asset_operator_ids: ["close_subpart"],
    source_operator_ids: [],
    target_operator_ids: [],
    pair_interaction_ids: [],
    builder_placement_relations: [],
    relationship_dependency: null,
    inverse_director_capability_id: "object_open",
    builder_validation_required: false,
    runtime_owner: "shared_director_runtime",
    note: "Director Close is distinct from the internal close_subpart qualification requirement.",
  },
  {
    director_capability_id: "insert_into",
    director_action_label: "Insert into target",
    asset_operator_ids: [],
    source_operator_ids: [],
    target_operator_ids: ["insert_into_target"],
    pair_interaction_ids: ["insert"],
    builder_placement_relations: ["inside"],
    relationship_dependency: null,
    inverse_director_capability_id: "remove_from",
    builder_validation_required: true,
    runtime_owner: "shared_director_runtime",
    note: "Director Insert into target is distinct from camera Insert shot; pair Insert selects a fit candidate and Builder owns final insertion/containment validity.",
  },
  {
    director_capability_id: "remove_from",
    director_action_label: "Remove from target",
    asset_operator_ids: [],
    source_operator_ids: [],
    target_operator_ids: [],
    pair_interaction_ids: [],
    builder_placement_relations: ["inside"],
    relationship_dependency: "existing containment_membership relationship",
    inverse_director_capability_id: "insert_into",
    builder_validation_required: true,
    runtime_owner: "shared_director_runtime",
    note: "Remove consumes an already-activated containment relationship rather than re-resolving pair compatibility.",
  },
  {
    director_capability_id: "fill",
    director_action_label: "Fill",
    asset_operator_ids: [],
    source_operator_ids: [],
    target_operator_ids: ["fill_target"],
    pair_interaction_ids: [],
    builder_placement_relations: [],
    relationship_dependency: "qualified containment volume",
    inverse_director_capability_id: "drain",
    builder_validation_required: false,
    runtime_owner: "shared_director_runtime",
    note: "Fill is process/quantity semantics; fill_target is an asset requirement, not a second Director action.",
  },
  {
    director_capability_id: "drain",
    director_action_label: "Drain",
    asset_operator_ids: [],
    source_operator_ids: [],
    target_operator_ids: ["drain_target"],
    pair_interaction_ids: [],
    builder_placement_relations: [],
    relationship_dependency: "qualified containment volume",
    inverse_director_capability_id: "fill",
    builder_validation_required: false,
    runtime_owner: "shared_director_runtime",
    note: "Drain is process/quantity semantics; outlet evidence may strengthen real-asset execution later.",
  },
  {
    director_capability_id: "accumulate",
    director_action_label: "Accumulate",
    asset_operator_ids: [],
    source_operator_ids: [],
    target_operator_ids: ["accumulate_on_target"],
    pair_interaction_ids: [],
    builder_placement_relations: [],
    relationship_dependency: "qualified support or containment receiver",
    inverse_director_capability_id: null,
    builder_validation_required: false,
    runtime_owner: "shared_director_runtime",
    note: "Accumulate quantity is Director/runtime state; the asset operator only qualifies a receiving region.",
  },
  {
    director_capability_id: "flow",
    director_action_label: "Flow",
    asset_operator_ids: [],
    source_operator_ids: ["flow_as_source"],
    target_operator_ids: ["flow_as_target"],
    pair_interaction_ids: ["flow"],
    builder_placement_relations: [],
    relationship_dependency: null,
    inverse_director_capability_id: null,
    builder_validation_required: true,
    runtime_owner: "shared_director_runtime",
    note: "Director Flow owns process timing; the pair resolver chooses trusted endpoints while the runtime/Builder later owns route obstruction and visible execution.",
  },
  {
    director_capability_id: "emit",
    director_action_label: "Emit",
    asset_operator_ids: [],
    source_operator_ids: ["emit_from_source"],
    target_operator_ids: [],
    pair_interaction_ids: [],
    builder_placement_relations: [],
    relationship_dependency: null,
    inverse_director_capability_id: null,
    builder_validation_required: false,
    runtime_owner: "shared_director_runtime",
    note: "Emit is a Director process action; emit_from_source only establishes that a trusted emission origin exists.",
  },
] as const satisfies readonly DirectorCapabilityAssetAuthorityPath[];

export const DIRECTOR_CAPABILITY_ASSET_AUTHORITY_PATHS =
  PATHS as readonly DirectorCapabilityAssetAuthorityPath[];

export type BuilderRelationInteractionBridge = {
  builder_relation: PrimitiveBuilderPlacementRelation;
  pair_interaction_ids: readonly DirectableAssetPairInteractionId[];
  meaning: string;
};

export const BUILDER_RELATION_INTERACTION_BRIDGES = [
  {
    builder_relation: "absolute",
    pair_interaction_ids: [],
    meaning: "Absolute staging is a Builder placement request; no pair interaction is implied.",
  },
  {
    builder_relation: "on_ground",
    pair_interaction_ids: [],
    meaning: "Ground placement is validated by scene geometry/contact; it is not the same thing as Director Roll.",
  },
  {
    builder_relation: "on_surface",
    pair_interaction_ids: ["place_on"],
    meaning: "Builder on_surface is a requested final relation; pair place_on may qualify a candidate support transform before Builder validation.",
  },
  {
    builder_relation: "beside",
    pair_interaction_ids: [],
    meaning: "Adjacency remains a Builder spatial-layout relation and does not require a special asset-pair affordance lane.",
  },
  {
    builder_relation: "inside",
    pair_interaction_ids: ["insert"],
    meaning: "Builder inside describes the requested final relation; pair insert proves aperture/volume compatibility before Builder validation.",
  },
  {
    builder_relation: "attached_to",
    pair_interaction_ids: ["precise_attach", "surface_attach"],
    meaning: "Builder attached_to describes the requested final relation; pair lanes distinguish semantic-port attachment from generic surface contact.",
  },
] as const satisfies readonly BuilderRelationInteractionBridge[];

export function directorCapabilityAssetAuthorityPath(
  capabilityId: string,
): DirectorCapabilityAssetAuthorityPath | null {
  return (
    DIRECTOR_CAPABILITY_ASSET_AUTHORITY_PATHS.find(
      (item) => item.director_capability_id === capabilityId,
    ) ?? null
  );
}
