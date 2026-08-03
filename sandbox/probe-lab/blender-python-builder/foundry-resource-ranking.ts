import type {
  AmbientCgMaterialAppearanceProfile,
} from "../assets/catalog/ambientcg/ambientcg-types";
import type {
  AssetEnvironmentIntentV2,
  AssetMaterialSlotIntentV2,
} from "./asset-design-brief";

const MATERIAL_FAMILY_GROUPS = {
  wood: [
    "wood",
    "wooden",
    "timber",
    "plank",
    "planks",
    "bark",
    "veneer",
  ],
  metal: [
    "metal",
    "metallic",
    "steel",
    "iron",
    "brass",
    "bronze",
    "copper",
    "aluminum",
    "aluminium",
    "chrome",
    "zinc",
    "tin",
  ],
  leather: [
    "leather",
    "hide",
    "suede",
  ],
  rubber: [
    "rubber",
    "rubberized",
    "tyre",
    "tire",
  ],
  fabric: [
    "fabric",
    "cloth",
    "textile",
    "canvas",
    "wool",
    "linen",
    "cotton",
    "woven",
  ],
  plastic: [
    "plastic",
    "polymer",
    "vinyl",
    "acrylic",
    "polycarbonate",
    "abs",
  ],
  glass: [
    "glass",
    "glazing",
  ],
  stone: [
    "stone",
    "rock",
    "marble",
    "granite",
    "slate",
    "concrete",
  ],
  ceramic: [
    "ceramic",
    "porcelain",
    "tile",
    "terracotta",
  ],
} as const;

type MaterialFamilyGroup =
  keyof typeof MATERIAL_FAMILY_GROUPS;

export type FoundryEnvironmentClass =
  | "product_studio"
  | "neutral_interior"
  | "residential_interior"
  | "industrial_interior"
  | "urban_exterior"
  | "natural_exterior"
  | "forest"
  | "night_exterior"
  | "unknown";

function expandTokenBoundaries(
  value: string,
) {
  return value
    .replace(
      /([a-z])([A-Z])/g,
      "$1 $2",
    )
    .replace(
      /([A-Za-z])(\d)/g,
      "$1 $2",
    )
    .replace(
      /(\d)([A-Za-z])/g,
      "$1 $2",
    );
}

export function foundryResourceWords(
  values: Array<
    | string
    | null
    | undefined
  >,
) {
  return values
    .flatMap((value) =>
      expandTokenBoundaries(
        value ?? "",
      )
        .toLowerCase()
        .split(/[^a-z0-9]+/g),
    )
    .filter(
      (value) =>
        value.length > 1,
    );
}

export function foundryResourceWordSet(
  values: Array<
    | string
    | null
    | undefined
  >,
) {
  return new Set(
    foundryResourceWords(
      values,
    ),
  );
}

export function scoreFoundryResourceWords(
  requestWords: Set<string>,
  candidateWords: string[],
) {
  let score = 0;
  const reasons: string[] = [];
  const candidateSet =
    new Set(candidateWords);

  for (const word of
    requestWords) {
    if (candidateSet.has(word)) {
      score += 12;
      reasons.push(
        `matches ${word}`,
      );
    }
  }

  return {
    score,
    match_count:
      reasons.length,
    reasons:
      reasons.slice(0, 8),
  };
}

function familyGroupForSlot(
  slot:
    AssetMaterialSlotIntentV2,
): MaterialFamilyGroup | null {
  const requested =
    new Set(
      foundryResourceWords([
        slot.material_family,
        slot.display_name,
        ...slot.semantic_tags,
      ]),
    );

  for (const [
    group,
    aliases,
  ] of Object.entries(
    MATERIAL_FAMILY_GROUPS,
  ) as Array<[
    MaterialFamilyGroup,
    readonly string[],
  ]>) {
    if (
      aliases.some(
        (alias) =>
          requested.has(alias),
      )
    ) {
      return group;
    }
  }

  return null;
}

export function scoreMaterialFamilyCompatibility(
  slot:
    AssetMaterialSlotIntentV2,
  candidateIdentityWords:
    string[],
) {
  const group =
    familyGroupForSlot(
      slot,
    );
  if (!group) {
    return {
      group: null,
      compatible: true,
      score: 0,
      reasons: [] as string[],
    };
  }

  const candidateSet =
    new Set(
      candidateIdentityWords,
    );
  const aliases =
    MATERIAL_FAMILY_GROUPS[
      group
    ];
  const matched =
    aliases.filter(
      (alias) =>
        candidateSet.has(alias),
    );

  if (matched.length) {
    return {
      group,
      compatible: true,
      score: 90,
      reasons: [
        `${group} family match (${matched[0]})`,
      ],
    };
  }

  return {
    group,
    compatible: false,
    score: -1000,
    reasons: [
      `rejected: missing ${group} family identity`,
    ],
  };
}

function normalizedBrightness(
  value:
    string | null | undefined,
) {
  const words =
    new Set(
      foundryResourceWords([
        value,
      ]),
    );
  if (
    words.has("dark") ||
    words.has("black") ||
    words.has("deep")
  ) {
    return "dark";
  }
  if (
    words.has("light") ||
    words.has("white") ||
    words.has("pale") ||
    words.has("bright")
  ) {
    return "light";
  }
  if (
    words.has("medium") ||
    words.has("mid")
  ) {
    return "medium";
  }
  return null;
}

function appearanceRequested(
  slot:
    AssetMaterialSlotIntentV2,
) {
  return Boolean(
    slot.color_hint ||
    slot.texture_hint ||
    slot.brightness_hint ||
    slot.roughness_hint ||
    (slot.avoid_tags ?? []).length,
  );
}

export function scoreMaterialAppearanceCompatibility(
  slot:
    AssetMaterialSlotIntentV2,
  profile:
    AmbientCgMaterialAppearanceProfile | null,
) {
  const reasons: string[] = [];
  if (
    !profile ||
    profile.status !== "ready" ||
    !profile.summary
  ) {
    return {
      compatible: true,
      score:
        appearanceRequested(slot)
          ? -55
          : 0,
      confidence:
        appearanceRequested(slot)
          ? 0.25
          : 0.5,
      reasons:
        appearanceRequested(slot)
          ? [
              "appearance profile unavailable for a visually specific slot",
            ]
          : [],
    };
  }

  const requestWords =
    foundryResourceWordSet([
      slot.color_hint,
      slot.texture_hint,
      slot.roughness_hint,
      slot.intent,
      ...slot.semantic_tags,
    ]);
  const profileWords =
    foundryResourceWords([
      profile.summary,
      ...profile.dominant_colors,
      profile.brightness,
    ]);
  const lexical =
    scoreFoundryResourceWords(
      requestWords,
      profileWords,
    );
  let score =
    lexical.score;
  reasons.push(
    ...lexical.reasons,
  );

  const avoidWords =
    foundryResourceWordSet(
      slot.avoid_tags ?? [],
    );
  const profileSet =
    new Set(profileWords);
  const conflicts =
    Array.from(
      avoidWords,
    ).filter(
      (word) =>
        profileSet.has(word),
    );
  if (conflicts.length) {
    return {
      compatible: false,
      score: -1000,
      confidence:
        profile.confidence,
      reasons: [
        `rejected: appearance contains avoided ${conflicts.slice(0, 3).join(", ")}`,
      ],
    };
  }

  const requestedBrightness =
    normalizedBrightness(
      slot.brightness_hint,
    );
  if (
    requestedBrightness &&
    profile.brightness
  ) {
    if (
      requestedBrightness ===
      profile.brightness
    ) {
      score += 26;
      reasons.push(
        `${profile.brightness} brightness match`,
      );
    } else {
      score -= 28;
      reasons.push(
        `brightness mismatch: requested ${requestedBrightness}, profile is ${profile.brightness}`,
      );
    }
  }

  const colorWords =
    foundryResourceWordSet([
      slot.color_hint,
    ]);
  const profileColorWords =
    new Set(
      foundryResourceWords(
        profile.dominant_colors,
      ),
    );
  if (colorWords.size) {
    const matches =
      Array.from(
        colorWords,
      ).filter(
        (word) =>
          profileColorWords.has(word),
      );
    if (matches.length) {
      score += 34;
      reasons.push(
        `dominant color match (${matches[0]})`,
      );
    } else {
      score -= 36;
      reasons.push(
        `dominant colors do not match ${slot.color_hint}`,
      );
    }
  }

  if (
    slot.texture_hint &&
    lexical.match_count > 0
  ) {
    score += 18;
    reasons.push(
      "visible texture description match",
    );
  }

  score +=
    Math.round(
      profile.confidence * 10,
    );

  return {
    compatible: true,
    score,
    confidence:
      profile.confidence,
    reasons:
      reasons.slice(0, 10),
  };
}

function environmentWords(
  values:
    Array<
      string | null | undefined
    >,
) {
  return new Set(
    foundryResourceWords(
      values,
    ),
  );
}

export function classifyFoundryEnvironment(
  values:
    Array<
      string | null | undefined
    >,
): FoundryEnvironmentClass {
  const words =
    environmentWords(values);
  const has = (
    ...tokens: string[]
  ) =>
    tokens.some(
      (token) =>
        words.has(token),
    );

  if (
    has(
      "studio",
      "lookdev",
      "showroom",
      "softbox",
      "cyclorama",
    )
  ) {
    return "product_studio";
  }
  if (
    has(
      "forest",
      "woods",
      "woodland",
      "jungle",
    )
  ) {
    return "forest";
  }
  if (
    has(
      "night",
      "nocturnal",
      "moonlight",
    )
  ) {
    return "night_exterior";
  }
  if (
    has(
      "factory",
      "warehouse",
      "workshop",
      "industrial",
    )
  ) {
    return "industrial_interior";
  }
  if (
    has(
      "home",
      "house",
      "apartment",
      "kitchen",
      "living",
      "bedroom",
      "residential",
    )
  ) {
    return "residential_interior";
  }
  if (
    has(
      "room",
      "interior",
      "indoor",
      "hall",
    )
  ) {
    return "neutral_interior";
  }
  if (
    has(
      "street",
      "city",
      "urban",
      "alley",
      "road",
      "parking",
    )
  ) {
    return "urban_exterior";
  }
  if (
    has(
      "outdoor",
      "nature",
      "field",
      "mountain",
      "beach",
      "park",
      "landscape",
      "meadow",
    )
  ) {
    return "natural_exterior";
  }
  return "unknown";
}

function requestedEnvironmentClass(
  intent:
    AssetEnvironmentIntentV2,
) {
  return classifyFoundryEnvironment([
    intent.preferred_environment_class,
    intent.intent,
    ...intent.semantic_tags,
  ]);
}

export function scoreEnvironmentCompatibility(
  intent:
    AssetEnvironmentIntentV2,
  candidateValues:
    Array<
      string | null | undefined
    >,
) {
  const requested =
    requestedEnvironmentClass(
      intent,
    );
  const candidate =
    classifyFoundryEnvironment(
      candidateValues,
    );

  if (
    requested ===
      "product_studio"
  ) {
    const compatible =
      candidate ===
        "product_studio" ||
      candidate ===
        "neutral_interior";
    return {
      requested,
      candidate,
      compatible,
      score:
        candidate ===
          "product_studio"
          ? 95
          : compatible
            ? 35
            : -1000,
      reasons:
        compatible
          ? [
              `${candidate} environment class match`,
            ]
          : [
              `rejected: ${candidate} is incompatible with product studio look-development`,
            ],
    };
  }

  if (
    requested !== "unknown" &&
    candidate !== "unknown" &&
    requested !== candidate
  ) {
    return {
      requested,
      candidate,
      compatible: false,
      score: -1000,
      reasons: [
        `rejected: requested ${requested}, candidate is ${candidate}`,
      ],
    };
  }

  return {
    requested,
    candidate,
    compatible: true,
    score:
      requested !== "unknown" &&
      requested === candidate
        ? 70
        : candidate ===
            "unknown"
          ? -15
          : 0,
    reasons:
      requested !== "unknown" &&
      requested === candidate
        ? [
            `${candidate} environment class match`,
          ]
        : [],
  };
}
