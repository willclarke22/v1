import type {
  PrimitiveBuilderAssetRequirement,
  PrimitiveBuilderPlacementRelation,
} from "../primitive-builder/asset-requirement-plan";

export type LogicalAssetSizeSource =
  | "explicit_measurement"
  | "concept_profile"
  | "relationship_cap"
  | "model_hint"
  | "fallback";

export type LogicalAssetSizeDecision = {
  requested_target_extent_m: number;
  target_extent_m: number;
  source: LogicalAssetSizeSource;
  reason: string;
  profile_key: string | null;
  min_extent_m: number;
  max_extent_m: number;
  relationship_cap_m: number | null;
};

type LogicalSizeProfile = {
  key: string;
  phrases: string[];
  target: number;
  min: number;
  max: number;
};

const PROFILES: LogicalSizeProfile[] = [
  { key: "cash_register", phrases: ["cash register", "checkout register", "till"], target: 0.55, min: 0.35, max: 0.85 },
  { key: "pencil_sharpener", phrases: ["pencil sharpener"], target: 0.12, min: 0.07, max: 0.22 },
  { key: "traffic_cone", phrases: ["traffic cone", "road cone"], target: 0.75, min: 0.45, max: 1.05 },
  { key: "office_chair", phrases: ["office chair", "desk chair", "computer chair"], target: 1.1, min: 0.8, max: 1.45 },
  { key: "potted_plant", phrases: ["potted plant", "house plant", "indoor plant"], target: 0.75, min: 0.3, max: 1.5 },
  { key: "park_bench", phrases: ["park bench", "outdoor bench"], target: 1.8, min: 1.2, max: 2.6 },
  { key: "step_ladder", phrases: ["step ladder", "stepladder", "ladder"], target: 2.0, min: 1.1, max: 3.2 },
  { key: "bookshelf", phrases: ["bookshelf", "bookcase", "shelving unit"], target: 2.0, min: 1.1, max: 3.0 },
  { key: "coffee_mug", phrases: ["coffee mug", "mug", "cup"], target: 0.13, min: 0.08, max: 0.22 },
  { key: "air_conditioner", phrases: ["air conditioner", "air conditioning unit", "ac unit"], target: 0.75, min: 0.45, max: 1.4 },
  { key: "fire_hydrant", phrases: ["fire hydrant", "hydrant"], target: 0.85, min: 0.65, max: 1.15 },
  { key: "picnic_table", phrases: ["picnic table"], target: 1.8, min: 1.3, max: 2.4 },
  { key: "cutting_board", phrases: ["cutting board", "chopping board"], target: 0.42, min: 0.25, max: 0.7 },
  { key: "baseball_bat", phrases: ["baseball bat", "bat"], target: 0.86, min: 0.65, max: 1.05 },
  { key: "hair_dryer", phrases: ["hair dryer", "blow dryer"], target: 0.28, min: 0.18, max: 0.4 },
  { key: "wooden_barrel", phrases: ["wooden barrel", "barrel"], target: 0.9, min: 0.55, max: 1.4 },
  { key: "tree_stump", phrases: ["tree stump", "stump"], target: 0.7, min: 0.35, max: 1.5 },
  { key: "wood_log", phrases: ["wood log", "log"], target: 1.0, min: 0.4, max: 2.5 },
  { key: "volleyball", phrases: ["volleyball", "sports ball"], target: 0.21, min: 0.18, max: 0.25 },
  { key: "sunglasses", phrases: ["sunglasses", "glasses"], target: 0.15, min: 0.11, max: 0.2 },
  { key: "camera", phrases: ["camera"], target: 0.18, min: 0.11, max: 0.35 },
  { key: "broom", phrases: ["broom"], target: 1.4, min: 1.0, max: 1.8 },
  { key: "bathtub", phrases: ["bathtub", "bath tub"], target: 1.7, min: 1.3, max: 2.2 },
  { key: "dresser", phrases: ["dresser", "chest of drawers"], target: 1.35, min: 0.9, max: 2.0 },
  { key: "hand_saw", phrases: ["hand saw", "handsaw"], target: 0.55, min: 0.35, max: 0.9 },
  { key: "bar_stool", phrases: ["bar stool", "stool"], target: 0.8, min: 0.55, max: 1.15 },
  { key: "pineapple", phrases: ["pineapple"], target: 0.3, min: 0.2, max: 0.45 },
  { key: "lantern", phrases: ["lantern"], target: 0.4, min: 0.2, max: 0.75 },
  { key: "wrench", phrases: ["wrench", "spanner"], target: 0.3, min: 0.18, max: 0.55 },
  { key: "apple", phrases: ["apple"], target: 0.09, min: 0.06, max: 0.14 },
  { key: "book", phrases: ["book", "books", "hardcover", "paperback"], target: 0.28, min: 0.16, max: 0.45 },
  { key: "phone", phrases: ["smartphone", "mobile phone", "phone"], target: 0.17, min: 0.11, max: 0.25 },
  { key: "tablet", phrases: ["tablet computer", "tablet"], target: 0.28, min: 0.2, max: 0.4 },
  { key: "laptop", phrases: ["laptop computer", "laptop"], target: 0.38, min: 0.28, max: 0.55 },
  { key: "keyboard", phrases: ["computer keyboard", "keyboard"], target: 0.46, min: 0.32, max: 0.65 },
  { key: "mouse", phrases: ["computer mouse", "mouse"], target: 0.12, min: 0.08, max: 0.18 },
  { key: "bottle", phrases: ["water bottle", "bottle"], target: 0.28, min: 0.18, max: 0.45 },
  { key: "plate", phrases: ["dinner plate", "plate"], target: 0.28, min: 0.18, max: 0.4 },
  { key: "bowl", phrases: ["bowl"], target: 0.25, min: 0.15, max: 0.4 },
  { key: "pot", phrases: ["cooking pot", "stock pot", "pot"], target: 0.4, min: 0.25, max: 0.75 },
  { key: "pan", phrases: ["frying pan", "skillet", "pan"], target: 0.48, min: 0.3, max: 0.75 },
  { key: "lamp", phrases: ["table lamp", "desk lamp", "lamp"], target: 0.55, min: 0.3, max: 1.1 },
  { key: "chair", phrases: ["armchair", "dining chair", "chair"], target: 1.05, min: 0.75, max: 1.5 },
  { key: "table", phrases: ["dining table", "coffee table", "table"], target: 1.5, min: 0.8, max: 2.5 },
  { key: "desk", phrases: ["desk"], target: 1.4, min: 0.9, max: 2.1 },
  { key: "couch", phrases: ["sofa", "couch"], target: 2.2, min: 1.5, max: 3.2 },
  { key: "bed", phrases: ["bed"], target: 2.1, min: 1.6, max: 2.7 },
  { key: "refrigerator", phrases: ["refrigerator", "fridge"], target: 1.9, min: 1.4, max: 2.3 },
  { key: "stove", phrases: ["kitchen stove", "oven", "stove"], target: 0.95, min: 0.7, max: 1.3 },
  { key: "sink", phrases: ["kitchen sink", "sink"], target: 0.75, min: 0.45, max: 1.2 },
  { key: "tool", phrases: ["hammer", "screwdriver", "pliers", "tool"], target: 0.35, min: 0.18, max: 0.7 },
  { key: "wheel", phrases: ["car wheel", "wheel", "tire", "tyre"], target: 0.7, min: 0.35, max: 1.2 },
  { key: "piston", phrases: ["engine piston", "piston"], target: 0.18, min: 0.08, max: 0.35 },
  { key: "car", phrases: ["race car", "sports car", "automobile", "car"], target: 4.4, min: 3.0, max: 6.2 },
  { key: "bicycle", phrases: ["bicycle", "bike"], target: 1.8, min: 1.3, max: 2.3 },
  { key: "person", phrases: ["human figure", "person", "adult"], target: 1.75, min: 1.45, max: 2.1 },
  { key: "child", phrases: ["child", "kid"], target: 1.25, min: 0.8, max: 1.6 },
  { key: "door", phrases: ["door"], target: 2.05, min: 1.7, max: 2.6 },
  { key: "window", phrases: ["window"], target: 1.2, min: 0.5, max: 2.5 },
].sort(
  (left, right) =>
    Math.max(...right.phrases.map((phrase) => phrase.length)) -
    Math.max(...left.phrases.map((phrase) => phrase.length)),
);

function normalizePhrase(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function singularToken(value: string) {
  if (value.endsWith("ies") && value.length > 4) {
    return `${value.slice(0, -3)}y`;
  }
  if (value.endsWith("ses") && value.length > 4) {
    return value.slice(0, -2);
  }
  if (value.endsWith("s") && !value.endsWith("ss") && value.length > 3) {
    return value.slice(0, -1);
  }
  return value;
}

function comparablePhrase(value: string) {
  return normalizePhrase(value)
    .split(" ")
    .map(singularToken)
    .join(" ");
}

function phraseAppears(haystack: string, needle: string) {
  const source = ` ${comparablePhrase(haystack)} `;
  const target = ` ${comparablePhrase(needle)} `;
  return source.includes(target);
}

function finite(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : fallback;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

function profileFor(input: {
  concept: string;
  aliases?: string[];
  semanticTags?: string[];
}) {
  const searchable = [
    input.concept,
    ...(input.aliases ?? []),
    ...(input.semanticTags ?? []),
  ].join(" ");

  return (
    PROFILES.find((profile) =>
      profile.phrases.some((phrase) =>
        phraseAppears(searchable, phrase),
      ),
    ) ?? null
  );
}

function toMeters(value: number, unit: string) {
  const normalized = unit.toLowerCase();
  if (normalized === "mm" || normalized.startsWith("millimet")) {
    return value / 1000;
  }
  if (normalized === "cm" || normalized.startsWith("centimet")) {
    return value / 100;
  }
  if (
    normalized === "in" ||
    normalized === "inch" ||
    normalized === "inches"
  ) {
    return value * 0.0254;
  }
  if (
    normalized === "ft" ||
    normalized === "foot" ||
    normalized === "feet"
  ) {
    return value * 0.3048;
  }
  return value;
}

function explicitMeasurementNearConcept(
  userRequest: string | undefined,
  concept: string,
) {
  if (!userRequest?.trim()) return null;

  const matches = [
    ...userRequest.matchAll(
      /(\d+(?:\.\d+)?)\s*(mm|millimeters?|millimetres?|cm|centimeters?|centimetres?|m|meters?|metres?|in|inch|inches|ft|foot|feet)\b/gi,
    ),
  ];

  const conceptTokens = comparablePhrase(concept)
    .split(" ")
    .filter((token) => token.length >= 3);

  for (const match of matches) {
    const index = match.index ?? 0;
    const window = comparablePhrase(
      userRequest.slice(
        Math.max(0, index - 70),
        Math.min(
          userRequest.length,
          index + match[0].length + 70,
        ),
      ),
    );

    if (
      conceptTokens.some((token) =>
        ` ${window} `.includes(` ${token} `),
      )
    ) {
      const meters = toMeters(
        Number(match[1]),
        match[2],
      );
      if (Number.isFinite(meters) && meters > 0) {
        return clamp(meters, 0.02, 30);
      }
    }
  }

  return null;
}


function modifierNearConcept(
  userRequest: string | undefined,
  concept: string,
) {
  if (!userRequest?.trim()) return 1;

  const source =
    userRequest.toLowerCase();
  const normalizedConcept =
    normalizePhrase(concept);
  let conceptIndex =
    source.indexOf(
      normalizedConcept,
    );

  if (conceptIndex < 0) {
    const token =
      normalizedConcept
        .split(" ")
        .filter(
          (value) =>
            value.length >= 3,
        )
        .at(-1);
    if (token) {
      conceptIndex =
        source.indexOf(token);
    }
  }

  if (conceptIndex < 0) return 1;

  const modifierPattern =
    /\b(miniature|mini|tiny|toy sized|toy size|small|compact|giant|oversized|enormous|large|big)\b/gi;
  let best:
    | {
        distance: number;
        multiplier: number;
      }
    | null = null;

  for (
    const match of source.matchAll(
      modifierPattern,
    )
  ) {
    const modifier =
      match[1].toLowerCase();
    const multiplier =
      /^(miniature|mini|tiny|toy)/.test(
        modifier,
      )
        ? 0.45
        : /^(small|compact)$/.test(
              modifier,
            )
          ? 0.75
          : /^(giant|oversized|enormous)$/.test(
                modifier,
              )
            ? 1.8
            : 1.3;
    const distance = Math.abs(
      (match.index ?? 0) -
        conceptIndex,
    );

    if (
      distance <= 45 &&
      (!best ||
        distance <
          best.distance)
    ) {
      best = {
        distance,
        multiplier,
      };
    }
  }

  return best?.multiplier ?? 1;
}

function modifierMultiplier(text: string) {
  const normalized = normalizePhrase(text);
  if (/\b(miniature|mini|tiny|toy sized|toy size)\b/.test(normalized)) {
    return 0.45;
  }
  if (/\b(small|compact)\b/.test(normalized)) {
    return 0.75;
  }
  if (/\b(giant|oversized|enormous)\b/.test(normalized)) {
    return 1.8;
  }
  if (/\b(large|big)\b/.test(normalized)) {
    return 1.3;
  }
  return 1;
}

function relationCap(
  relation: PrimitiveBuilderPlacementRelation | undefined,
  parentTargetExtentM: number | null | undefined,
) {
  if (
    !parentTargetExtentM ||
    !Number.isFinite(parentTargetExtentM) ||
    parentTargetExtentM <= 0
  ) {
    return null;
  }

  if (relation === "inside") {
    return Math.max(0.06, parentTargetExtentM * 0.5);
  }
  if (relation === "on_surface") {
    return Math.max(0.06, parentTargetExtentM * 0.45);
  }
  if (relation === "attached_to") {
    return Math.max(0.06, parentTargetExtentM * 0.5);
  }
  return null;
}

export function logicalAssetSizeDecision(input: {
  concept: string;
  aliases?: string[];
  semanticTags?: string[];
  appearanceText?: string;
  requestedTargetExtentM?: number;
  placementRelation?: PrimitiveBuilderPlacementRelation;
  parentTargetExtentM?: number | null;
  userRequest?: string;
}): LogicalAssetSizeDecision {
  const requested = finite(
    input.requestedTargetExtentM,
    0,
  );
  const profile = profileFor(input);
  const explicit = explicitMeasurementNearConcept(
    input.userRequest,
    input.concept,
  );
  // Only size words attached to the object identity or near that object in
  // the original user request may resize the whole asset. Appearance briefs
  // often describe small internal parts, which must not shrink the object.
  const conceptModifier =
    modifierMultiplier(
      input.concept,
    );
  const requestModifier =
    modifierNearConcept(
      input.userRequest,
      input.concept,
    );
  const modifier =
    conceptModifier !== 1
      ? conceptModifier
      : requestModifier;

  let source: LogicalAssetSizeSource;
  let target: number;
  let reason: string;
  let minimum = profile?.min ?? 0.06;
  let maximum = profile?.max ?? 8;

  if (explicit != null) {
    source = "explicit_measurement";
    target = explicit;
    minimum = Math.min(minimum, target);
    maximum = Math.max(maximum, target);
    reason =
      `Used the explicit physical measurement near "${input.concept}" in the user request.`;
  } else if (profile) {
    source = "concept_profile";
    target = clamp(
      profile.target * modifier,
      profile.min * Math.min(1, modifier),
      profile.max * Math.max(1, modifier),
    );
    minimum = profile.min * Math.min(1, modifier);
    maximum = profile.max * Math.max(1, modifier);
    reason =
      `Used the "${profile.key}" real-world size profile instead of trusting source-file normalization or an arbitrary model scale.`;
  } else if (requested > 0) {
    source = "model_hint";
    target = clamp(requested * modifier, minimum, maximum);
    reason =
      "No known real-world size profile matched, so the bounded scene-planner hint was used.";
  } else {
    source = "fallback";
    target = clamp(1 * modifier, minimum, maximum);
    reason =
      "No explicit measurement or known size profile matched; used a conservative one-metre fallback.";
  }

  const cap = relationCap(
    input.placementRelation,
    input.parentTargetExtentM,
  );

  if (cap != null && target > cap) {
    target = cap;
    source = "relationship_cap";
    reason +=
      ` Capped to ${cap.toFixed(2)} m because it is placed ${input.placementRelation} a ${input.parentTargetExtentM!.toFixed(2)} m parent object.`;
  }

  return {
    requested_target_extent_m: requested,
    target_extent_m: Math.round(clamp(target, 0.02, 30) * 1000) / 1000,
    source,
    reason,
    profile_key: profile?.key ?? null,
    min_extent_m: Math.round(minimum * 1000) / 1000,
    max_extent_m: Math.round(maximum * 1000) / 1000,
    relationship_cap_m:
      cap == null
        ? null
        : Math.round(cap * 1000) / 1000,
  };
}

export function applyLogicalAssetSizing(
  requirements: PrimitiveBuilderAssetRequirement[],
  userRequest: string | undefined,
) {
  const byId = new Map(
    requirements.map((requirement) => [
      requirement.instance_id,
      requirement,
    ]),
  );
  const decisions = new Map<string, LogicalAssetSizeDecision>();
  const resolving = new Set<string>();

  function decide(
    requirement: PrimitiveBuilderAssetRequirement,
  ): LogicalAssetSizeDecision {
    const cached = decisions.get(requirement.instance_id);
    if (cached) return cached;

    if (resolving.has(requirement.instance_id)) {
      const fallback = logicalAssetSizeDecision({
        concept: requirement.concept,
        aliases: requirement.aliases,
        semanticTags: requirement.semantic_tags,
        appearanceText:
          requirement.appearance_request?.visual_brief,
        requestedTargetExtentM:
          requirement.target_extent_m,
        placementRelation:
          requirement.placement_relation,
        userRequest,
      });
      decisions.set(requirement.instance_id, fallback);
      return fallback;
    }

    resolving.add(requirement.instance_id);
    const parent =
      requirement.placement_target_instance_id
        ? byId.get(
            requirement.placement_target_instance_id,
          )
        : undefined;
    const parentDecision =
      parent && parent.instance_id !== requirement.instance_id
        ? decide(parent)
        : null;

    const result = logicalAssetSizeDecision({
      concept: requirement.concept,
      aliases: requirement.aliases,
      semanticTags: requirement.semantic_tags,
      appearanceText:
        requirement.appearance_request?.visual_brief,
      requestedTargetExtentM:
        requirement.target_extent_m,
      placementRelation:
        requirement.placement_relation,
      parentTargetExtentM:
        parentDecision?.target_extent_m ?? null,
      userRequest,
    });

    resolving.delete(requirement.instance_id);
    decisions.set(requirement.instance_id, result);
    return result;
  }

  const normalized = requirements.map((requirement) => {
    const decision = decide(requirement);
    return {
      ...requirement,
      target_extent_m: decision.target_extent_m,
    };
  });

  return {
    requirements: normalized,
    decisions,
  };
}
