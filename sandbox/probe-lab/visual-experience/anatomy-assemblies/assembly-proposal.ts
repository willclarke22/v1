/** Review-only exchange contract; importing never mutates cloud state by itself. */
export const ASSEMBLY_PROPOSAL_SCHEMA = "myway_bodyparts3d_assembly_membership_proposal_v1" as const;
export type ProposedAddition = {
  asset_id: string;
  member_id: string;
  label: string;
  system: string;
  confidence: "classification_supported" | "name_review";
  evidence_type: string;
  evidence: string;
  human_review_required: true;
};
export type ProposedAssembly = {
  assembly_id: string;
  assembly_label: string;
  baseline_member_count: number;
  recommended_additions: ProposedAddition[];
  proposed_exclusions: string[];
};
export type AssemblyProposal = {
  schema_version: typeof ASSEMBLY_PROPOSAL_SCHEMA;
  generated_from: {
    atlas_fingerprint: string;
    eligible_element_count: number;
    catalog_sha256: string;
  };
  proposals: ProposedAssembly[];
};
export type EligibleIdentity = { asset_id: string; member_id: string };
const asObject = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : null;
const safeId = (v: unknown): v is string => typeof v === "string" && /^[a-zA-Z0-9_:\-.]{1,150}$/.test(v);
const safeString = (v: unknown, max = 500): v is string => typeof v === "string" && v.length <= max;

/** Fail closed on stale snapshots, swapped FJ identities, invalid IDs or duplicate decisions. */
export function validateAssemblyProposal(
  raw: unknown,
  fingerprint: string,
  assets: EligibleIdentity[],
  assemblyIds: string[],
): AssemblyProposal {
  const data = asObject(raw);
  if (!data || data.schema_version !== ASSEMBLY_PROPOSAL_SCHEMA) throw new Error("Unsupported membership proposal format.");
  const meta = asObject(data.generated_from);
  if (!meta || meta.atlas_fingerprint !== fingerprint) throw new Error("Proposal atlas fingerprint differs from this MyWay atlas. Export a fresh snapshot and regenerate the proposal.");
  if (meta.eligible_element_count !== assets.length) throw new Error("Proposal atlas element count differs from the current inventory.");
  if (!safeString(meta.catalog_sha256, 64) || !/^[a-f0-9]{64}$/.test(meta.catalog_sha256)) throw new Error("Proposal lacks the expected catalog checksum.");
  const proposals = data.proposals;
  if (!Array.isArray(proposals) || proposals.length === 0 || proposals.length > assemblyIds.length) throw new Error("Invalid number of assembly proposals.");
  const byAsset = new Map(assets.map(a => [a.asset_id, a.member_id]));
  if (byAsset.size !== assets.length) throw new Error("Atlas has duplicate asset IDs.");
  const validAssemblyIds = new Set(assemblyIds), seenAssemblies = new Set<string>();
  let total = 0;
  const checked: ProposedAssembly[] = [];
  for (const item of proposals) {
    const p = asObject(item);
    if (!p || !safeId(p.assembly_id) || !validAssemblyIds.has(p.assembly_id) || seenAssemblies.has(p.assembly_id)) throw new Error("Unknown or duplicated assembly in proposal.");
    seenAssemblies.add(p.assembly_id);
    if (!safeString(p.assembly_label, 160) || !Number.isSafeInteger(p.baseline_member_count) || (p.baseline_member_count as number) < 0) throw new Error(`Invalid metadata for ${p.assembly_id}.`);
    const rawAdds = p.recommended_additions, rawExcludes = p.proposed_exclusions;
    if (!Array.isArray(rawAdds) || rawAdds.length > 2500 || !Array.isArray(rawExcludes) || rawExcludes.length > 2500) throw new Error(`Oversized proposal for ${p.assembly_id}.`);
    total += rawAdds.length + rawExcludes.length;
    if (total > 20000) throw new Error("Proposal exceeds the audit limit.");
    const seenAdds = new Set<string>(), adds: ProposedAddition[] = [];
    for (const rawAdd of rawAdds) {
      const add = asObject(rawAdd);
      if (!add || !safeId(add.asset_id) || seenAdds.has(add.asset_id) || !byAsset.has(add.asset_id) || byAsset.get(add.asset_id) !== add.member_id) throw new Error(`Unknown, duplicate, or mismatched asset identity in ${p.assembly_id}.`);
      if (!safeString(add.label, 250) || !safeString(add.system, 70) || !safeString(add.evidence_type, 100) || !safeString(add.evidence, 650) || add.human_review_required !== true || !["classification_supported", "name_review"].includes(String(add.confidence))) throw new Error(`Invalid evidence or review status for ${add.asset_id}.`);
      seenAdds.add(add.asset_id);
      adds.push({asset_id:add.asset_id,member_id:add.member_id as string,label:add.label,system:add.system,confidence:add.confidence as ProposedAddition["confidence"],evidence_type:add.evidence_type,evidence:add.evidence,human_review_required:true});
    }
    const excludes = new Set<string>();
    for (const id of rawExcludes) {
      if (!safeId(id) || !byAsset.has(id) || excludes.has(id) || seenAdds.has(id)) throw new Error(`Invalid or contradictory exclusion in ${p.assembly_id}.`);
      excludes.add(id);
    }
    checked.push({assembly_id:p.assembly_id,assembly_label:p.assembly_label,baseline_member_count:p.baseline_member_count as number,recommended_additions:adds,proposed_exclusions:[...excludes]});
  }
  return {schema_version:ASSEMBLY_PROPOSAL_SCHEMA,
    generated_from:{atlas_fingerprint:fingerprint,eligible_element_count:assets.length,catalog_sha256:meta.catalog_sha256},proposals:checked};
}
