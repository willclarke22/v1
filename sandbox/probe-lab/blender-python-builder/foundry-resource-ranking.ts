import type {
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
  ],
  plastic: [
    "plastic",
    "polymer",
    "vinyl",
    "acrylic",
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
      score += 14;
      reasons.push(
        `matches ${word}`,
      );
    }
  }

  return {
    score,
    reasons:
      reasons.slice(0, 6),
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
    score: -180,
    reasons: [
      `missing ${group} family identity`,
    ],
  };
}
