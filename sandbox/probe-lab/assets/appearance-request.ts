import type {
  MyWayAssetAppearanceRequestV1,
  MyWayAssetObjectComposition,
} from "./asset-types";

const MAX_VISUAL_BRIEF_LENGTH = 600;
const MAX_TRAITS = 12;
const MAX_TRAIT_LENGTH = 100;

function text(value: unknown, maximum: number) {
  return typeof value === "string"
    ? value.trim().replace(/\s+/g, " ").slice(0, maximum)
    : "";
}

function strings(
  value: unknown,
  limit = MAX_TRAITS,
  maximum = MAX_TRAIT_LENGTH,
) {
  if (!Array.isArray(value)) return [];

  return Array.from(
    new Set(
      value
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => text(entry, maximum))
        .filter(Boolean),
    ),
  ).slice(0, limit);
}

export function normalizeAppearanceRequest(
  value: unknown,
): MyWayAssetAppearanceRequestV1 | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const item = value as Record<string, unknown>;
  const visualBrief = text(
    item.visual_brief ?? item.description ?? item.appearance,
    MAX_VISUAL_BRIEF_LENGTH,
  );
  const requiredTraits = strings(
    item.required_traits ?? item.must_have,
  );
  const preferredTraits = strings(
    item.preferred_traits ?? item.prefer,
  );
  const avoidTraits = strings(
    item.avoid_traits ?? item.avoid,
  );

  if (
    !visualBrief &&
    !requiredTraits.length &&
    !preferredTraits.length &&
    !avoidTraits.length
  ) {
    return undefined;
  }

  return {
    schema_version: "myway_asset_appearance_request_v1",
    visual_brief: visualBrief,
    required_traits: requiredTraits,
    preferred_traits: preferredTraits,
    avoid_traits: avoidTraits,
  };
}

export function hasAppearanceIntent(
  request: MyWayAssetAppearanceRequestV1 | undefined,
) {
  return Boolean(
    request &&
      (request.visual_brief ||
        request.required_traits.length ||
        request.preferred_traits.length ||
        request.avoid_traits.length),
  );
}

export function canonicalAppearanceQueryText(input: {
  concept: string;
  request: MyWayAssetAppearanceRequestV1;
}) {
  return [
    `Object identity: ${input.concept.trim() || "unknown object"}`,
    `Desired visible appearance: ${
      input.request.visual_brief || "not otherwise specified"
    }`,
    `Required visible traits: ${
      input.request.required_traits.join("; ") || "none"
    }`,
    `Preferred visible traits: ${
      input.request.preferred_traits.join("; ") || "none"
    }`,
    `Avoid visible traits: ${
      input.request.avoid_traits.join("; ") || "none"
    }`,
  ].join("\n");
}

export function appearanceAcquisitionTerms(
  request: MyWayAssetAppearanceRequestV1 | undefined,
) {
  if (!request) return [];

  return Array.from(
    new Set([
      ...request.required_traits,
      ...request.preferred_traits,
      request.visual_brief,
    ].map((value) => value.trim()).filter(Boolean)),
  ).slice(0, 6);
}

export function appearanceRequirementKey(input: {
  concept: string;
  request?: MyWayAssetAppearanceRequestV1;
  desired_composition?: MyWayAssetObjectComposition;
}) {
  const concept = input.concept
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
  const required = (input.request?.required_traits ?? [])
    .map((value) =>
      value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim()
        .replace(/\s+/g, " "),
    )
    .filter(Boolean)
    .sort();

  return [
    concept,
    input.desired_composition &&
    input.desired_composition !== "unknown"
      ? `composition:${input.desired_composition}`
      : "",
    required.length ? `required:${required.join("|")}` : "",
  ]
    .filter(Boolean)
    .join("::");
}
