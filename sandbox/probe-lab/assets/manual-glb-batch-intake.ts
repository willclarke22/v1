
export const MAX_MANUAL_GLB_BATCH_FILES = 200;

export type ManualCcByLicenseKind =
  | "cc_by"
  | "cc_by_4_0";

export type ParsedManualGlbFileName = {
  source_title: string;
  creator_name: string | null;
  source_asset_id: string;
};

function cleanWords(value: string) {
  return value
    .replace(/\u0000/g, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function withoutGlbExtension(value: string) {
  return value
    .replace(/^.*[\\/]/, "")
    .replace(/\.glb$/i, "")
    .trim();
}

export function technicalSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function parseManualGlbFileName(
  value: string,
): ParsedManualGlbFileName {
  const base = withoutGlbExtension(value);
  const creatorMatch = base.match(
    /^(.+?)\s+by\s+(.+)$/i,
  );
  const sourceTitle = cleanWords(
    creatorMatch?.[1] ?? base,
  );
  const creatorName = cleanWords(
    creatorMatch?.[2] ?? "",
  ) || null;

  return {
    source_title: sourceTitle,
    creator_name: creatorName,
    source_asset_id:
      technicalSlug(base) ||
      `manual_${Date.now().toString(36)}`,
  };
}

export function manualConceptFromFileName(
  value: string,
) {
  const parsed = parseManualGlbFileName(
    value,
  );
  return parsed.source_title
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function buildManualCcByAttributionText(
  input: {
    sourceTitle: string;
    creatorName: string;
    sourceProvider: string;
    licenseKind: ManualCcByLicenseKind;
  },
) {
  const title = cleanWords(
    input.sourceTitle,
  );
  const creator = cleanWords(
    input.creatorName,
  );
  const provider = cleanWords(
    input.sourceProvider,
  );
  const license =
    input.licenseKind === "cc_by_4_0"
      ? "CC-BY 4.0"
      : "CC-BY";

  if (!title || !creator) return "";
  return provider
    ? `${title} by ${creator} [${license}] via ${provider}`
    : `${title} by ${creator} [${license}]`;
}

export function validateCc0ImportDraft(
  draft: {
    file_name: string;
    concept: string;
  },
) {
  const errors: string[] = [];
  if (!draft.file_name.toLowerCase().endsWith(".glb")) {
    errors.push("File must be a GLB.");
  }
  if (!draft.concept.trim()) {
    errors.push("Concept is required.");
  }
  return errors;
}

export function validateCcByImportDraft(
  draft: {
    file_name: string;
    concept: string;
    source_provider: string;
    source_url: string;
    source_asset_id: string;
    source_title: string;
    creator_name: string;
    license_kind: ManualCcByLicenseKind;
    modification_notice: string;
  },
) {
  const errors: string[] = [];
  if (!draft.file_name.toLowerCase().endsWith(".glb")) {
    errors.push("File must be a GLB.");
  }
  if (!draft.concept.trim()) {
    errors.push("Concept is required.");
  }
  if (!draft.source_provider.trim()) {
    errors.push("Source provider is required.");
  }
  if (
    draft.source_provider
      .trim()
      .toLowerCase() === "poly pizza"
  ) {
    errors.push(
      "Turn on the Poly Pizza toggle for Poly Pizza assets.",
    );
  }
  if (!draft.source_url.trim()) {
    errors.push("Source page is required for CC BY.");
  } else {
    try {
      const url = new URL(
        draft.source_url,
      );
      if (
        url.protocol !== "https:" &&
        url.protocol !== "http:"
      ) {
        errors.push(
          "Source page must be an http or https URL.",
        );
      }
    } catch {
      errors.push("Source page is not a valid URL.");
    }
  }
  if (!draft.source_asset_id.trim()) {
    errors.push("Stable source asset ID is required.");
  }
  if (!draft.source_title.trim()) {
    errors.push("Source asset title is required.");
  }
  if (!draft.creator_name.trim()) {
    errors.push("Creator name is required for CC BY.");
  }
  if (!draft.modification_notice.trim()) {
    errors.push("Modification notice is required for CC BY.");
  }
  return errors;
}
