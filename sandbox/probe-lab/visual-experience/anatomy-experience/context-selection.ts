/** Pure, deterministic selection layer. Asset IDs and available geometry are authoritative upstream. */
export type AnatomyContextRole = "focal" | "functional" | "orientation" | "environment";
export type ContextCandidate = {
  asset_id: string;
  label: string;
  system: string;
  score: number;
  reasons: string[];
  focal: boolean;
};
export type ContextSelected = ContextCandidate & { context_role: AnatomyContextRole };

/** A candidate's role is a teaching/presentation grouping, NOT a claim about its function. */
export function anatomyContextRole(candidate: ContextCandidate): AnatomyContextRole {
  if (candidate.focal) return "focal";
  if (candidate.system === "skeletal") return "orientation";
  if (candidate.system === "muscular") return "functional";
  return "environment";
}
export function chooseBalancedAnatomyContext(candidates: ContextCandidate[], limit = 50) {
  const maximum = Math.max(1, Math.min(100, Math.floor(limit)));
  const groups: Record<AnatomyContextRole, ContextSelected[]> = {
    focal: [], functional: [], orientation: [], environment: [],
  };
  for (const candidate of candidates) {
    const context_role = anatomyContextRole(candidate);
    groups[context_role].push({ ...candidate, context_role });
  }
  const compare = (a: ContextSelected, b: ContextSelected) => b.score-a.score || a.asset_id.localeCompare(b.asset_id);
  for (const group of Object.values(groups)) group.sort(compare);
  // Reserve space for orienting structures even when closely related muscles dominate BM25.
  const budgets: Record<AnatomyContextRole, number> = {
    focal: Math.min(maximum, 6),
    functional: Math.floor(maximum * 0.36),
    orientation: Math.floor(maximum * 0.30),
    environment: Math.floor(maximum * 0.24),
  };
  const selected: ContextSelected[] = [];
  const seen = new Set<string>();
  const take = (candidate: ContextSelected) => {
    if (selected.length >= maximum || seen.has(candidate.asset_id)) return;
    selected.push(candidate); seen.add(candidate.asset_id);
  };
  for (const role of ["focal", "orientation", "environment", "functional"] as const) {
    groups[role].slice(0, budgets[role]).forEach(take);
  }
  // Fill unused quotas by evidence score rather than leaving vacant slots.
  Object.values(groups).flat().sort(compare).forEach(take);
  selected.sort((a,b)=>a.context_role==="focal"&&b.context_role!=="focal"?-1:b.context_role==="focal"&&a.context_role!=="focal"?1:compare(a,b));
  const counts = (array: ContextSelected[]) => ({
    focal:array.filter(a=>a.context_role==="focal").length,
    functional:array.filter(a=>a.context_role==="functional").length,
    orientation:array.filter(a=>a.context_role==="orientation").length,
    environment:array.filter(a=>a.context_role==="environment").length,
  });
  return { selected, selected_counts: counts(selected), candidate_counts: counts(Object.values(groups).flat()), budgets };
}
