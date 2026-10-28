/** V3.7D.1. Read-only, deterministic topic-memory comparison. No persistence. */
import type { TopicStateRow } from "@/lib/persistence/read";

export type MemoryRetrievalStatus = "semantic_pgvector" | "lexical_fallback" | "unavailable";
export type TopicMemoryAction = "associate_existing" | "propose_new" | "hold";
export type TopicMemoryCandidate = {
  topicId: string;
  topicLabel: string;
  similarity: number | null; // Null means NO numerical semantic similarity was measured.
  diagnosis: string | null;
  storedRootProblems: string[];
  rootProblemOverlap: number | null;
  rootProblemSemanticSimilarity: number | null;
  topicLabelFit: number; // Grounded label tokens in assessed topic and full learner question, NOT model confidence.
  comparison: "historical_evidence" | "label_only";
};
export type TopicMemoryPreview = {
  schema: "myway-v37d1-memory-preview-v1";
  mode: "read_only";
  action: TopicMemoryAction;
  targetTopicId: string | null;
  reasonCode: string;
  rationale: string;
  retrievalStatus: MemoryRetrievalStatus;
  candidateCount: number;
  candidates: TopicMemoryCandidate[];
  limitations: string[];
  approvalToken?: string | null;
  reviewToken?: string | null;
  autoEligible?: boolean; // Local-only, high-bar same-topic association, never creation.
  scoreObservation?: {confusion:number;insight:number;rubric:"model_0_10_v1"}; // Server-issued, short-lived, one-time capability; not a write itself.
};

type CandidateMatch = { topicId: string; topicLabel: string; similarity: number };
const isRecord = (x: unknown): x is Record<string, unknown> => Boolean(x) && typeof x === "object" && !Array.isArray(x);
const normalized = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
const stopWords = new Set("a an and are as at be but by can do does for from has have how i in is it its of on or our so that the their there these this to was were what when where which who why will with would you your understand confused about because".split(" "));
const words = (s: string): string[] => [...new Set(normalized(s).split(" ").filter(w => w.length >= 3 && !stopWords.has(w)))];
function overlap(a: string, b: string): number {
  if (normalized(a) === normalized(b) && normalized(a).length >= 15) return 1;
  const wa = words(a), wb = words(b);
  if (wa.length < 2 || wb.length < 2) return 0;
  const shared = wa.filter(w => wb.includes(w)).length;
  if (shared < 2) return 0;
  return Math.round(1000 * shared / Math.max(wa.length, wb.length)) / 1000;
}
const topicStem=(word:string)=>word.length>6&&word.endsWith("ing")?word.slice(0,-3):word;
function topicLabelFit(label:string,assessedTopic:string,original:string):number {
 if(normalized(label)===normalized(assessedTopic))return 1;
 const tokens=words(label).map(topicStem);
 if(!tokens.length)return 0;
 const evidence=new Set([...words(assessedTopic),...words(original)].map(topicStem));
 const shared=tokens.filter(w=>evidence.has(w)).length;
 return Math.round(1000*shared/tokens.length)/1000;
}
function storedProblemEvidence(json: unknown): string[] {
  if (!isRecord(json)) return [];
  const result: string[] = [];
  const collect = (obj: Record<string, unknown>) => {
    // Read only explicitly named diagnosis/root-problem fields, never raw chat/event histories.
    for (const key of ["root_problem", "root_problem_explanation", "last_root_problem", "diagnosed_root_problem"]) {
      const item = obj[key];
      if (typeof item === "string" && item.trim().length >= 15 && item.trim().length <= 500 &&
          !result.includes(item.trim())) result.push(item.trim());
    }
  };
  collect(json);
  for (const key of ["diagnosis_state", "last_assessment", "last_diagnosis", "assessment"]) {
    const nested = json[key];
    if (isRecord(nested)) collect(nested);
  }
  // Include evidence previously approved and stored by V3.7D.2A.
  for(const item of Array.isArray(json.myway_learning_evidence)?json.myway_learning_evidence:[]){
    if(!isRecord(item))continue;
    const phrase=item.root_problem;
    if(typeof phrase==="string"&&phrase.trim().length>=15&&phrase.length<=500&& !result.includes(phrase.trim()))result.push(phrase.trim());
  }
  return result.slice(-12);
}
function base(status: MemoryRetrievalStatus, candidates: TopicMemoryCandidate[], action: TopicMemoryAction,
  reasonCode: string, rationale: string, targetTopicId: string | null, limitations: string[]): TopicMemoryPreview {
  return { schema:"myway-v37d1-memory-preview-v1", mode:"read_only", action, targetTopicId,
    reasonCode, rationale, retrievalStatus:status, candidateCount:candidates.length, candidates, limitations };
}
/** This function is pure. Search is performed by MyWay's existing retrieval endpoint. */
export function compareTopicMemory(args: {
  retrievalStatus: MemoryRetrievalStatus;
  matches: CandidateMatch[];
  rows: TopicStateRow[];
  topicName: string;
  rootProblem: string;
  evidenceQuote: string;
  originalMessage: string;
  currentMessage: string;
  rootConfidence: number;
  rootSemanticMatches?: Record<string,number>;
  confusion?: number;
  insight?: number;
}): TopicMemoryPreview {
  const {retrievalStatus:status, matches, rows} = args;
  const byId = new Map(rows.map(r => [r.topic_id, r]));
  const candidates = matches.slice(0,5).map(m => {
    const row = byId.get(m.topicId);
    const storedRootProblems = storedProblemEvidence(row?.topic_json);
    const rootProblemOverlap = storedRootProblems.length
      ? Math.max(...storedRootProblems.map(p => overlap(args.rootProblem, p))) : null;
    return {topicId:m.topicId, topicLabel:m.topicLabel,
      similarity: status === "semantic_pgvector" && Number.isFinite(m.similarity) ? m.similarity : null,
      diagnosis: row?.diagnosis ?? null,
      storedRootProblems, rootProblemOverlap,
      rootProblemSemanticSimilarity: status==="semantic_pgvector" && Number.isFinite(args.rootSemanticMatches?.[m.topicId]) ? Math.max(-1,Math.min(1,args.rootSemanticMatches![m.topicId])) : null,
      topicLabelFit:topicLabelFit(m.topicLabel,args.topicName,args.originalMessage),
      comparison:storedRootProblems.length ? "historical_evidence" as const : "label_only" as const};
  });
  const limitations: string[] = [];
  if (status !== "semantic_pgvector") limitations.push("No reliable semantic similarity was measured; lexical label overlap is not semantic evidence.");
  if (!candidates.some(c => c.comparison === "historical_evidence")) limitations.push("Historical root-problem fields are absent. A strong topic-level match may still be considered, but it does NOT establish that the learner has the same difficulty.");
  const fullEvidence = `${args.originalMessage}\n${args.currentMessage}`.toLowerCase();
  if (!args.evidenceQuote.trim() || !fullEvidence.includes(args.evidenceQuote.trim().toLowerCase())) {
    return base(status,candidates,"hold","ungrounded_evidence",
      "The new root-problem quote could not be verified against the learner's statements. Do not change memory.",null,limitations);
  }
  if (!args.rootProblem.trim() || args.rootConfidence < 0.65) {
    return base(status,candidates,"hold","insufficient_assessment",
      "The assessment has insufficient evidence or confidence for a topic-memory proposal.",null,limitations);
  }
  if (status === "unavailable") return base(status,candidates,"hold","retrieval_unavailable",
    "Topic retrieval was unavailable. This must not be interpreted as evidence that a new topic is required.",null,limitations);
  // D.2C: compare the actual diagnosed difficulty with previously saved difficulty text.
  // Label embeddings alone are NOT proof that the same misconception is recurring.
  // Require search evidence, historical text, a substantial root-problem semantic match,
  // and a unique winner before offering association. Close/ambiguous cases hold.
  const semanticRanked = [...candidates].filter(c=>c.rootProblemSemanticSimilarity!==null)
    .sort((a,b)=>(b.rootProblemSemanticSimilarity??-1)-(a.rootProblemSemanticSimilarity??-1));
  const semanticBest=semanticRanked[0];
  const secondSemantic=semanticRanked[1]?.rootProblemSemanticSimilarity??-1;
  if(status==="semantic_pgvector" && args.rootConfidence>=0.78 && semanticBest &&
     (semanticBest.similarity??0)>=0.17 && (semanticBest.rootProblemSemanticSimilarity??0)>=0.80 &&
     (semanticBest.rootProblemSemanticSimilarity??0)-secondSemantic>=0.08 &&
     semanticBest.topicLabelFit>=0.20) {
    const result=base(status,candidates,"associate_existing","semantic_root_problem_match",
      `Historical difficulty for "${semanticBest.topicLabel}" closely matches the current difficulty. The same topic can receive a separate scored observation rather than another sphere.`,
      semanticBest.topicId,limitations);
    result.autoEligible = args.rootConfidence>=0.80 && (semanticBest.rootProblemSemanticSimilarity??0)>=0.90 &&
      (semanticBest.similarity??0)>=0.20 &&
      typeof args.confusion==="number" && Number.isInteger(args.confusion) && args.confusion>=0 && args.confusion<=10 &&
      typeof args.insight==="number" && Number.isInteger(args.insight) && args.insight>=0 && args.insight<=10;
    return result;
  }
  const ranked = [...candidates].filter(c=>c.rootProblemOverlap !== null)
    .sort((a,b)=>(b.rootProblemOverlap??0)-(a.rootProblemOverlap??0));
  const best=ranked[0];
  if (best && (best.rootProblemOverlap??0)>=0.82 &&
      (status === "semantic_pgvector" ? (best.similarity??0)>=0.60 : best.rootProblemOverlap === 1)) {
    return base(status,candidates,"associate_existing","historical_root_problem_match",
      `Stored root-problem evidence for "${best.topicLabel}" closely matches the assessed difficulty. Preview association only; review before any future write.`,best.topicId,limitations);
  }
  // A legacy topic may have no diagnosed root problems. A HIGH semantic topic match,
  // strong label evidence grounded in the original learner statement, and a confident
  // current assessment allow appending a distinct root-problem event within that topic.
  // This does NOT merge two root problems or prove prior learning history.
  const topicCandidates=[...candidates].filter(c => c.similarity !== null &&
    c.similarity >= (c.topicLabelFit===1 ? 0.68 : 0.82) &&
    c.topicLabelFit >= 0.67 && c.topicLabel.trim().length>=3)
    .sort((a,b)=>(b.similarity??0)-(a.similarity??0));
  if(status==="semantic_pgvector" && args.rootConfidence>=0.78 && topicCandidates.length===1){
    const candidate=topicCandidates[0];
    return base(status,candidates,"associate_existing","strong_topic_level_match",
      `The existing topic "${candidate.topicLabel}" strongly matches the SUBJECT of the learner's question. Store the assessed difficulty as a NEW evidence event under this topic; do not assume the difficulty matches any prior root problem.`,candidate.topicId,limitations);
  }
  if (status === "semantic_pgvector" && args.rootConfidence >= 0.78 && args.topicName.trim() &&
      candidates.every(c => (c.similarity??0) < 0.55) &&
      candidates.every(c => (c.rootProblemOverlap??0) < 0.50) &&
      candidates.every(c => (c.rootProblemSemanticSimilarity??-1) < 0.60)) {
    return base(status,candidates,"propose_new","no_close_semantic_candidate",
      `None of the returned semantic candidates closely matches the assessed difficulty. A new topic is worth reviewing, but absence of a match is not proof of novelty.`,null,limitations);
  }
  return base(status,candidates,"hold", status === "lexical_fallback" ? "lexical_only_uncertain" : "distinct_difficulty_uncertain",
    candidates.length===0 ? "No topic candidates were retrieved. Current retrieval/assessment evidence did not justify a topic-memory change." :
    "No candidate met the stricter requirements for either a root-problem match or a high-confidence subject match. Hold rather than guessing.",null,limitations);
}

export function unavailableMemoryPreview(reason: string): TopicMemoryPreview {
  return base("unavailable",[],"hold","memory_read_unavailable",
    `Topic memory could not be checked (${reason}). No topic decision was made.`,null,["A memory read failure is not evidence that a new topic is needed."]);
}
