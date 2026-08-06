export type PolyPizzaManualLicenseKind =
  | "cc0"
  | "cc_by"
  | "cc_by_4_0";

export type ParsedPolyPizzaFileName = {
  source_asset_id: string | null;
  source_title: string;
  creator_name: string | null;
};

export type PolyPizzaImportDraft = {
  file_name: string;
  concept: string;
  source_asset_id: string;
  source_title: string;
  creator_name: string;
  license_kind: PolyPizzaManualLicenseKind;
  modification_notice: string;
};

function cleanWords(value: string) {
  return value
    .replace(/\u0000/g, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function technicalSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function polyPizzaModelIdFromUrl(
  value: string,
) {
  return value.match(
    /https?:\/\/(?:www\.)?poly\.pizza\/(?:m|model)\/([a-z0-9_-]{4,80})(?:[/?#]|$)/i,
  )?.[1] ?? null;
}

export function polyPizzaModelIdFromFileName(
  value: string,
) {
  const withoutExtension = value
    .replace(/^.*[\\/]/, "")
    .replace(/\.glb$/i, "")
    .trim();
  const explicit = withoutExtension.match(
    /(?:\s+-\s+|__)([a-z0-9_-]{4,80})$/i,
  )?.[1];
  return explicit ?? null;
}

export function parsePolyPizzaFileName(
  value: string,
): ParsedPolyPizzaFileName {
  const fileName = value
    .replace(/^.*[\\/]/, "")
    .replace(/\.glb$/i, "")
    .trim();
  const sourceAssetId =
    polyPizzaModelIdFromFileName(value);
  const withoutId = sourceAssetId
    ? fileName.replace(
        new RegExp(
          String.raw`(?:\s+-\s+|__)${sourceAssetId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
          "i",
        ),
        "",
      ).trim()
    : fileName;
  const creatorMatch = withoutId.match(
    /^(.+?)\s+by\s+(.+)$/i,
  );
  const sourceTitle = cleanWords(
    creatorMatch?.[1] ?? withoutId,
  );
  const creatorName = cleanWords(
    creatorMatch?.[2] ?? "",
  ) || null;

  return {
    source_asset_id: sourceAssetId,
    source_title: sourceTitle,
    creator_name: creatorName,
  };
}

export function polyPizzaConceptFromFileName(
  value: string,
) {
  const parsed = parsePolyPizzaFileName(
    value,
  );
  return cleanWords(
    parsed.source_title,
  ).toLowerCase();
}

export function polyPizzaAssetId(
  concept: string,
  sourceAssetId: string,
) {
  const sourceSlug =
    technicalSlug(sourceAssetId);
  const baseSlug =
    technicalSlug(concept) || "asset";
  if (!sourceSlug) return "";

  const suffix = `_polyp_${sourceSlug}`;
  const availableBaseLength =
    Math.max(1, 96 - suffix.length);
  return `${baseSlug.slice(
    0,
    availableBaseLength,
  )}${suffix}`;
}

export function polyPizzaSourceUrl(
  sourceAssetId: string,
) {
  const cleanId = sourceAssetId.trim();
  return cleanId
    ? `https://poly.pizza/m/${cleanId}`
    : "";
}

export function buildPolyPizzaAttributionText(
  input: {
    sourceTitle: string;
    creatorName: string;
    licenseKind: PolyPizzaManualLicenseKind;
  },
) {
  const title = cleanWords(
    input.sourceTitle,
  );
  const creator = cleanWords(
    input.creatorName,
  );
  if (!title) return "";

  const license =
    input.licenseKind === "cc0"
      ? "CC0"
      : input.licenseKind ===
          "cc_by_4_0"
        ? "CC-BY 4.0"
        : "CC-BY";
  return creator
    ? `${title} by ${creator} [${license}] via Poly Pizza`
    : `${title} [${license}] via Poly Pizza`;
}

export function validatePolyPizzaImportDraft(
  draft: PolyPizzaImportDraft,
) {
  const errors: string[] = [];
  const fileId =
    polyPizzaModelIdFromFileName(
      draft.file_name,
    );
  const expectedAssetId =
    polyPizzaAssetId(
      draft.concept,
      draft.source_asset_id,
    );

  if (!draft.file_name.toLowerCase().endsWith(".glb")) {
    errors.push("File must be a GLB.");
  }
  if (!draft.concept.trim()) {
    errors.push("Concept is required.");
  }
  if (!draft.source_asset_id.trim()) {
    errors.push(
      "Poly Pizza ID is required.",
    );
  }
  if (
    fileId &&
    fileId !== draft.source_asset_id
  ) {
    errors.push(
      "Filename ID does not match the Poly Pizza ID.",
    );
  }
  if (!draft.source_title.trim()) {
    errors.push(
      "The Poly Pizza model name could not be read from the filename.",
    );
  }
  if (!expectedAssetId) {
    errors.push(
      "The MyWay asset ID could not be generated.",
    );
  }
  if (
    (draft.license_kind === "cc_by" ||
      draft.license_kind ===
        "cc_by_4_0") &&
    !draft.creator_name.trim()
  ) {
    errors.push(
      "Creator name is required for CC BY.",
    );
  }
  if (
    (draft.license_kind === "cc_by" ||
      draft.license_kind ===
        "cc_by_4_0") &&
    !draft.modification_notice.trim()
  ) {
    errors.push(
      "Modification notice is required for CC BY.",
    );
  }

  return errors;
}
