import { normalizeSourceInput } from "@/archive/old-engine/source-processing";
import {
  buildProbeAuthoringContext,
  buildSourceGroundedProbeInput,
} from "@/archive/old-engine/probe-authoring";
import { buildProbeContract } from "@/archive/old-engine/probes/build-probe-contract";
import {
  judgeProbeAttemptAgainstContract,
  type ContractJudgment,
} from "@/archive/old-engine/judging";
import { updateDiagnosisBeliefs } from "@/archive/old-engine/diagnosis";
import type {
  DiagnosisDelta,
  DiagnosisType,
  ProbeContractSnapshot,
} from "@/types/contracts";
import type {
  AttemptInterpretation,
  NormalizedEvidenceInput,
} from "@/archive/old-engine/evidence";
import type { ProbeAssessmentTarget } from "@/archive/old-engine/probes/probe-types";

/**
 * Dev test: Multi-domain Source-Grounded Attempt Judging + Diagnosis Update
 *
 * This script intentionally tests more than one content domain so we do not
 * overfit the source-grounded rubric signal to the original federalism example.
 *
 * It checks the core MyWay bridge:
 *
 * source text
 * → normalized source chunks
 * → source-grounded probe contract
 * → learner text attempt
 * → heuristic rubric source_grounded_signal
 * → ContractJudgment
 * → updateDiagnosisBeliefs()
 *
 * Run:
 * pnpm test:source-grounded-attempt
 *
 * Or directly:
 * npx tsx scripts/dev-test-source-grounded-attempt-judging.ts
 */

type AttemptOutcome =
  | "strong_evidence"
  | "partial_evidence"
  | "weak_evidence"
  | "no_evidence"
  | "uninterpretable";

type ExpectedSignalDirection = {
  used_source_focus?: boolean;
  addressed_relationship_or_mechanism?: boolean;
  possible_surface_word_match?: boolean;
  possible_overclaim?: boolean;
};

type TestCaseConfig = {
  case_id: string;
  label: string;
  text: string;
  interpretation: {
    outcome: AttemptOutcome;
    evidenceStrength: number;
    judgmentConfidence: number;
    diagnosisDelta: DiagnosisDelta;
    conceptualCoherence: number;
    representationQuality: number;
    discriminationAccuracy?: number;
    confusion?: number;
    insight?: number;
  };
  expected_signal_direction: ExpectedSignalDirection;
  expectation_note: string;
};

type DomainConfig = {
  domain_id: string;
  topicLabel: string;
  sourceTitle: string;
  sourceText: string;
  topicLabels: string[];
  targetDiagnosis: DiagnosisType;
  assessmentTarget: ProbeAssessmentTarget;
  expected_mechanism_summary: string;
  cases: TestCaseConfig[];
};

function printSection(title: string, value: unknown) {
  console.log(`\n=== ${title} ===`);
  console.log(JSON.stringify(value, null, 2));
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function emptyDiagnosisDelta(): DiagnosisDelta {
  return {
    recall_gap: 0,
    representation_gap: 0,
    procedure_gap: 0,
    discrimination_gap: 0,
    transfer_gap: 0,
  };
}

function buildTextEvidence(text: string): NormalizedEvidenceInput {
  return {
    response_type: "text",
    value: {
      kind: "text",
      text,
    },
  } as unknown as NormalizedEvidenceInput;
}

function buildAttemptInterpretation(args: {
  attemptId: string;
  topicId: string;
  probeId: string;
  text: string;
  outcome: AttemptOutcome;
  evidenceStrength: number;
  judgmentConfidence: number;
  diagnosisDelta: DiagnosisDelta;
  conceptualCoherence: number;
  representationQuality: number;
  discriminationAccuracy?: number;
  confusion?: number;
  insight?: number;
}): AttemptInterpretation {
  return {
    interpretation_id: `interp-${args.attemptId}`,
    evidence_id: args.attemptId,
    linked_topic_id: args.topicId,
    linked_probe_id: args.probeId,
    linked_stimulus_id: `stimulus-${args.probeId}`,
    modality: "text",
    outcome: args.outcome,
    evidence_strength: clamp01(args.evidenceStrength),
    judgment_confidence: clamp01(args.judgmentConfidence),
    diagnosis_delta: args.diagnosisDelta,
    model_signals_used: {
      confusion: clamp01(args.confusion ?? 0.42),
      insight: clamp01(args.insight ?? 0.36),
      status: "dev_seeded",
    },
    features: {
      conceptual_coherence: clamp01(args.conceptualCoherence),
      discrimination_accuracy: clamp01(args.discriminationAccuracy ?? 0.45),
      prediction_accuracy: 0,
      procedure_order_quality: 0,
      representation_quality: clamp01(args.representationQuality),
    },
    reasons: [
      "Dev-seeded AttemptInterpretation for multi-domain source-grounded judging test.",
      `Response text: ${args.text}`,
    ],
    cautions: [
      "This AttemptInterpretation is synthetic test input; the contract/rubric judgment is the part being tested.",
    ],
  } as unknown as AttemptInterpretation;
}

function compactBeliefs(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;

  const state = value as {
    active_diagnosis?: unknown;
    beliefs?: Record<string, unknown>;
  };

  const beliefs = state.beliefs ?? {};

  return {
    active_diagnosis: state.active_diagnosis ?? null,
    beliefs: Object.fromEntries(
      Object.entries(beliefs).map(([key, entry]) => {
        const record =
          entry && typeof entry === "object" && !Array.isArray(entry)
            ? (entry as Record<string, unknown>)
            : {};

        return [
          key,
          {
            belief: record.belief,
            confidence: record.confidence,
            evidence_count: record.evidence_count,
            last_delta: record.last_delta,
            resolution_pressure: record.resolution_pressure,
            last_resolution_delta: record.last_resolution_delta,
            status: record.status,
            strongest_evidence_tier: record.strongest_evidence_tier,
          },
        ];
      }),
    ),
  };
}

function summarizeJudgment(judgment: ContractJudgment) {
  return {
    outcome: judgment.outcome,
    contract_confidence: judgment.contract_confidence,
    evidence_strength: judgment.evidence_strength,
    evidence_tier: judgment.evidence_tier,
    allowed_claim_strength: judgment.allowed_claim_strength,
    can_make_strong_correctness_claim:
      judgment.can_make_strong_correctness_claim,
    judging_methods: judgment.judging_methods,
    success_score: judgment.success_score,
    failure_score: judgment.failure_score,
    misconception_score: judgment.misconception_score,
    source_grounded_signal: judgment.source_grounded_signal ?? null,
    diagnosis_delta: judgment.diagnosis_delta,
    resolution_delta: judgment.resolution_delta,
    suggested_active_diagnosis: judgment.suggested_active_diagnosis,
    top_reasons: judgment.reasons.slice(0, 10),
    top_cautions: judgment.cautions.slice(0, 10),
  };
}

function sourceSignalMatchesExpectation(
  judgment: ContractJudgment,
  expected: ExpectedSignalDirection,
) {
  const signal = judgment.source_grounded_signal;
  if (!signal) {
    return {
      pass: false,
      mismatches: ["Missing source_grounded_signal."],
    };
  }

  const actual = {
    used_source_focus: signal.used_source_focus,
    addressed_relationship_or_mechanism:
      signal.addressed_relationship_or_mechanism,
    possible_surface_word_match: signal.possible_surface_word_match,
    possible_overclaim: signal.possible_overclaim,
  };

  const mismatches = Object.entries(expected).flatMap(([key, expectedValue]) => {
    const actualValue = actual[key as keyof typeof actual];
    return actualValue === expectedValue
      ? []
      : [`${key}: expected ${String(expectedValue)}, got ${String(actualValue)}`];
  });

  return {
    pass: mismatches.length === 0,
    mismatches,
  };
}

function buildDomainContract(domain: DomainConfig) {
  const normalized = normalizeSourceInput(
    {
      source_kind: "uploaded_document",
      title: domain.sourceTitle,
      text: domain.sourceText,
      origin_label: `dev-test-source-grounded-attempt-judging:${domain.domain_id}`,
      topic_labels: domain.topicLabels,
    },
    {
      max_chunk_chars: 900,
      min_chunk_chars: 250,
    },
  );

  const authoringContext = buildProbeAuthoringContext({
    topicLabel: domain.topicLabel,
    sourceChunks: normalized.chunks,
    assessmentTarget: domain.assessmentTarget,
    preferredRendererKinds: ["text_explanation", "multiple_choice"],
  });

  const sourceGroundedInput = buildSourceGroundedProbeInput(authoringContext, {
    targetDiagnosis: domain.targetDiagnosis,
    intent: "diagnostic",
    probeType: "explain",
    preferTextExplanationUntilReviewed: true,
  });

  const contractResult = buildProbeContract(sourceGroundedInput.probe_input);

  return {
    normalized,
    authoringContext,
    sourceGroundedInput,
    contract: contractResult.contract as unknown as ProbeContractSnapshot,
  };
}

const DOMAINS: DomainConfig[] = [
  {
    domain_id: "federalism",
    topicLabel: "American Politics",
    sourceTitle: "Federalism mini source",
    topicLabels: ["American Politics", "Federalism"],
    targetDiagnosis: "representation_gap",
    assessmentTarget: "representation",
    expected_mechanism_summary:
      "Authority is divided between national and state governments, so conflicts can happen when responsibilities overlap.",
    sourceText: `
Federalism is a system of government where authority is divided between a national government and regional governments. In the United States, the federal government has powers such as regulating interstate commerce, declaring war, and conducting foreign policy. States keep powers such as running most elections, managing local education systems, and creating many criminal and civil laws.

A key idea in American federalism is that neither level of government controls everything. When a political issue involves both national and state responsibilities, conflict can happen over which level has authority. For example, education policy, voting rules, public health responses, and environmental regulation can involve overlapping authority.

The Tenth Amendment is often used to express the idea that powers not delegated to the federal government are reserved to the states or the people. This does not mean states are always stronger than the federal government. It means the constitutional structure creates a division of powers, and many political disputes are partly disputes about where a power belongs.
`,
    cases: [
      {
        case_id: "good_mechanism_answer",
        label: "Good mechanism answer",
        text: "Federalism means national and state governments divide authority, so conflict can happen when both levels have responsibility over the same issue, like education or public health.",
        interpretation: {
          outcome: "strong_evidence",
          evidenceStrength: 0.78,
          judgmentConfidence: 0.7,
          diagnosisDelta: {
            ...emptyDiagnosisDelta(),
            representation_gap: 0.08,
          },
          conceptualCoherence: 0.78,
          representationQuality: 0.8,
          discriminationAccuracy: 0.66,
          confusion: 0.2,
          insight: 0.72,
        },
        expected_signal_direction: {
          used_source_focus: true,
          addressed_relationship_or_mechanism: true,
          possible_surface_word_match: false,
          possible_overclaim: false,
        },
        expectation_note:
          "Should recognize source focus, mechanism, and only cautious resolution pressure.",
      },
      {
        case_id: "shallow_keyword_answer",
        label: "Shallow keyword answer",
        text: "Federalism is about government and powers and states.",
        interpretation: {
          outcome: "weak_evidence",
          evidenceStrength: 0.34,
          judgmentConfidence: 0.42,
          diagnosisDelta: {
            ...emptyDiagnosisDelta(),
            recall_gap: 0.08,
            representation_gap: 0.2,
          },
          conceptualCoherence: 0.28,
          representationQuality: 0.25,
          discriminationAccuracy: 0.22,
          confusion: 0.64,
          insight: 0.2,
        },
        expected_signal_direction: {
          used_source_focus: true,
          addressed_relationship_or_mechanism: false,
          possible_surface_word_match: true,
          possible_overclaim: false,
        },
        expectation_note:
          "Should detect source vocabulary but mark missing mechanism/surface-word matching.",
      },
      {
        case_id: "overclaiming_answer",
        label: "Overclaiming answer",
        text: "Federalism proves that states always control everything and the federal government never has authority over education, voting, public health, or environmental rules.",
        interpretation: {
          outcome: "partial_evidence",
          evidenceStrength: 0.52,
          judgmentConfidence: 0.5,
          diagnosisDelta: {
            ...emptyDiagnosisDelta(),
            representation_gap: 0.12,
            discrimination_gap: 0.16,
            transfer_gap: 0.08,
          },
          conceptualCoherence: 0.34,
          representationQuality: 0.36,
          discriminationAccuracy: 0.2,
          confusion: 0.56,
          insight: 0.28,
        },
        expected_signal_direction: {
          used_source_focus: true,
          possible_overclaim: true,
        },
        expectation_note:
          "Should detect source focus but preserve conservative overclaim/discrimination pressure.",
      },
      {
        case_id: "off_target_answer",
        label: "Off-target answer",
        text: "The best way to study politics is to memorize dates and watch debates on television.",
        interpretation: {
          outcome: "no_evidence",
          evidenceStrength: 0.18,
          judgmentConfidence: 0.34,
          diagnosisDelta: {
            ...emptyDiagnosisDelta(),
            representation_gap: 0.18,
            transfer_gap: 0.1,
          },
          conceptualCoherence: 0.16,
          representationQuality: 0.12,
          discriminationAccuracy: 0.18,
          confusion: 0.7,
          insight: 0.12,
        },
        expected_signal_direction: {
          used_source_focus: false,
          addressed_relationship_or_mechanism: false,
          possible_surface_word_match: false,
          possible_overclaim: false,
        },
        expectation_note:
          "Should not see source focus or mechanism in an unrelated response.",
      },
      {
        case_id: "contradiction_answer",
        label: "Contradiction answer",
        text: "Federalism means one national government controls all important power, and states do not keep their own authority.",
        interpretation: {
          outcome: "partial_evidence",
          evidenceStrength: 0.44,
          judgmentConfidence: 0.48,
          diagnosisDelta: {
            ...emptyDiagnosisDelta(),
            representation_gap: 0.26,
            discrimination_gap: 0.12,
          },
          conceptualCoherence: 0.28,
          representationQuality: 0.24,
          discriminationAccuracy: 0.16,
          confusion: 0.62,
          insight: 0.18,
        },
        expected_signal_direction: {
          used_source_focus: true,
          possible_overclaim: false,
        },
        expectation_note:
          "Should see source-topic terms, but contract/failure scoring should still apply pressure because the answer contradicts the source.",
      },
    ],
  },
  {
    domain_id: "photosynthesis",
    topicLabel: "Photosynthesis",
    sourceTitle: "Photosynthesis mini source",
    topicLabels: ["Biology", "Photosynthesis"],
    targetDiagnosis: "representation_gap",
    assessmentTarget: "representation",
    expected_mechanism_summary:
      "Plants use light energy to convert carbon dioxide and water into glucose, releasing oxygen as a byproduct.",
    sourceText: `
Photosynthesis is the process plants, algae, and some bacteria use to make sugars. In plants, chlorophyll in chloroplasts absorbs light energy. That energy helps convert carbon dioxide from the air and water from the soil into glucose, a sugar the plant can use for energy and growth.

Oxygen is released during photosynthesis as a byproduct. The oxygen does not come from carbon dioxide alone; it is connected to the splitting of water during the light-dependent reactions. Photosynthesis also depends on conditions such as light intensity, carbon dioxide availability, and temperature.

A common misunderstanding is that plants get most of their food from soil. Soil provides minerals and water, but the carbon used to build glucose mainly comes from carbon dioxide in the air.
`,
    cases: [
      {
        case_id: "good_mechanism_answer",
        label: "Good mechanism answer",
        text: "Photosynthesis uses light captured by chlorophyll to help turn carbon dioxide and water into glucose, and oxygen is released as a byproduct.",
        interpretation: {
          outcome: "strong_evidence",
          evidenceStrength: 0.8,
          judgmentConfidence: 0.72,
          diagnosisDelta: {
            ...emptyDiagnosisDelta(),
            representation_gap: 0.06,
          },
          conceptualCoherence: 0.82,
          representationQuality: 0.84,
          discriminationAccuracy: 0.7,
          confusion: 0.18,
          insight: 0.76,
        },
        expected_signal_direction: {
          used_source_focus: true,
          addressed_relationship_or_mechanism: true,
          possible_surface_word_match: false,
          possible_overclaim: false,
        },
        expectation_note:
          "Should detect mechanism: light/chlorophyll supports conversion into glucose with oxygen released.",
      },
      {
        case_id: "shallow_keyword_answer",
        label: "Shallow keyword answer",
        text: "Photosynthesis is plants and light and oxygen and glucose.",
        interpretation: {
          outcome: "weak_evidence",
          evidenceStrength: 0.32,
          judgmentConfidence: 0.42,
          diagnosisDelta: {
            ...emptyDiagnosisDelta(),
            recall_gap: 0.08,
            representation_gap: 0.22,
          },
          conceptualCoherence: 0.24,
          representationQuality: 0.22,
          discriminationAccuracy: 0.2,
          confusion: 0.66,
          insight: 0.18,
        },
        expected_signal_direction: {
          used_source_focus: true,
          addressed_relationship_or_mechanism: false,
          possible_surface_word_match: true,
          possible_overclaim: false,
        },
        expectation_note:
          "Should see biology/source terms but not a mechanism.",
      },
      {
        case_id: "overclaiming_answer",
        label: "Overclaiming answer",
        text: "Photosynthesis proves that plants only need sunlight and never need water or carbon dioxide to make food.",
        interpretation: {
          outcome: "partial_evidence",
          evidenceStrength: 0.46,
          judgmentConfidence: 0.5,
          diagnosisDelta: {
            ...emptyDiagnosisDelta(),
            representation_gap: 0.18,
            discrimination_gap: 0.18,
            transfer_gap: 0.08,
          },
          conceptualCoherence: 0.28,
          representationQuality: 0.26,
          discriminationAccuracy: 0.12,
          confusion: 0.6,
          insight: 0.2,
        },
        expected_signal_direction: {
          used_source_focus: true,
          possible_overclaim: true,
        },
        expectation_note:
          "Should detect source topic plus overclaim/contradiction-like pressure.",
      },
      {
        case_id: "off_target_answer",
        label: "Off-target answer",
        text: "Cells are interesting because animals can move around and choose where to find food.",
        interpretation: {
          outcome: "no_evidence",
          evidenceStrength: 0.18,
          judgmentConfidence: 0.34,
          diagnosisDelta: {
            ...emptyDiagnosisDelta(),
            representation_gap: 0.18,
            transfer_gap: 0.1,
          },
          conceptualCoherence: 0.14,
          representationQuality: 0.12,
          discriminationAccuracy: 0.18,
          confusion: 0.7,
          insight: 0.12,
        },
        expected_signal_direction: {
          used_source_focus: false,
          addressed_relationship_or_mechanism: false,
          possible_surface_word_match: false,
          possible_overclaim: false,
        },
        expectation_note:
          "Should not mark a generic cell/animal answer as source-grounded photosynthesis understanding.",
      },
      {
        case_id: "contradiction_answer",
        label: "Contradiction answer",
        text: "Plants get most of their food from soil, and carbon dioxide is not really involved in building glucose.",
        interpretation: {
          outcome: "partial_evidence",
          evidenceStrength: 0.44,
          judgmentConfidence: 0.48,
          diagnosisDelta: {
            ...emptyDiagnosisDelta(),
            representation_gap: 0.26,
            discrimination_gap: 0.16,
          },
          conceptualCoherence: 0.24,
          representationQuality: 0.22,
          discriminationAccuracy: 0.12,
          confusion: 0.64,
          insight: 0.18,
        },
        expected_signal_direction: {
          used_source_focus: true,
        },
        expectation_note:
          "Should see source-relevant terms but contract/failure scoring should treat the content as wrong.",
      },
    ],
  },
  {
    domain_id: "supply-demand",
    topicLabel: "Supply and Demand",
    sourceTitle: "Supply and demand mini source",
    topicLabels: ["Economics", "Supply and Demand"],
    targetDiagnosis: "representation_gap",
    assessmentTarget: "representation",
    expected_mechanism_summary:
      "Price tends to rise when demand increases or supply falls, and tends to fall when supply increases or demand falls.",
    sourceText: `
Supply and demand describe how buyers and sellers interact in a market. Demand refers to how much of a good buyers are willing and able to purchase at different prices. Supply refers to how much sellers are willing and able to offer at different prices.

When demand increases while supply stays the same, buyers compete for the available goods and the market price tends to rise. When supply increases while demand stays the same, sellers compete to sell more goods and the market price tends to fall. Prices are not controlled by demand alone or supply alone; they reflect the interaction between both sides of the market.

A common mistake is to say that high demand always means high prices. High demand can raise prices, but the final price also depends on how much supply is available and how quickly sellers can respond.
`,
    cases: [
      {
        case_id: "good_mechanism_answer",
        label: "Good mechanism answer",
        text: "If demand rises and supply stays the same, buyers compete for limited goods, so price tends to rise; if supply rises while demand stays the same, price tends to fall.",
        interpretation: {
          outcome: "strong_evidence",
          evidenceStrength: 0.82,
          judgmentConfidence: 0.72,
          diagnosisDelta: {
            ...emptyDiagnosisDelta(),
            representation_gap: 0.06,
          },
          conceptualCoherence: 0.84,
          representationQuality: 0.82,
          discriminationAccuracy: 0.74,
          confusion: 0.18,
          insight: 0.78,
        },
        expected_signal_direction: {
          used_source_focus: true,
          addressed_relationship_or_mechanism: true,
          possible_surface_word_match: false,
          possible_overclaim: false,
        },
        expectation_note:
          "Should detect the causal/conditional price mechanism.",
      },
      {
        case_id: "shallow_keyword_answer",
        label: "Shallow keyword answer",
        text: "Supply and demand are markets and buyers and sellers and prices.",
        interpretation: {
          outcome: "weak_evidence",
          evidenceStrength: 0.32,
          judgmentConfidence: 0.42,
          diagnosisDelta: {
            ...emptyDiagnosisDelta(),
            recall_gap: 0.08,
            representation_gap: 0.22,
          },
          conceptualCoherence: 0.24,
          representationQuality: 0.22,
          discriminationAccuracy: 0.2,
          confusion: 0.66,
          insight: 0.18,
        },
        expected_signal_direction: {
          used_source_focus: true,
          addressed_relationship_or_mechanism: false,
          possible_surface_word_match: true,
          possible_overclaim: false,
        },
        expectation_note:
          "Should detect source terms without mechanism.",
      },
      {
        case_id: "overclaiming_answer",
        label: "Overclaiming answer",
        text: "High demand always guarantees high prices, and supply never matters if enough buyers want the product.",
        interpretation: {
          outcome: "partial_evidence",
          evidenceStrength: 0.48,
          judgmentConfidence: 0.5,
          diagnosisDelta: {
            ...emptyDiagnosisDelta(),
            representation_gap: 0.16,
            discrimination_gap: 0.18,
            transfer_gap: 0.08,
          },
          conceptualCoherence: 0.3,
          representationQuality: 0.28,
          discriminationAccuracy: 0.12,
          confusion: 0.62,
          insight: 0.22,
        },
        expected_signal_direction: {
          used_source_focus: true,
          possible_overclaim: true,
        },
        expectation_note:
          "Should detect overclaiming from always/never and preserve conservative diagnosis pressure.",
      },
      {
        case_id: "off_target_answer",
        label: "Off-target answer",
        text: "A business should make its logo memorable and post more often on social media.",
        interpretation: {
          outcome: "no_evidence",
          evidenceStrength: 0.18,
          judgmentConfidence: 0.34,
          diagnosisDelta: {
            ...emptyDiagnosisDelta(),
            representation_gap: 0.18,
            transfer_gap: 0.1,
          },
          conceptualCoherence: 0.14,
          representationQuality: 0.12,
          discriminationAccuracy: 0.18,
          confusion: 0.7,
          insight: 0.12,
        },
        expected_signal_direction: {
          used_source_focus: false,
          addressed_relationship_or_mechanism: false,
          possible_surface_word_match: false,
          possible_overclaim: false,
        },
        expectation_note:
          "Should not mistake generic business advice for supply/demand understanding.",
      },
      {
        case_id: "contradiction_answer",
        label: "Contradiction answer",
        text: "Prices are controlled by demand alone, so supply does not affect the final market price.",
        interpretation: {
          outcome: "partial_evidence",
          evidenceStrength: 0.44,
          judgmentConfidence: 0.48,
          diagnosisDelta: {
            ...emptyDiagnosisDelta(),
            representation_gap: 0.24,
            discrimination_gap: 0.16,
          },
          conceptualCoherence: 0.24,
          representationQuality: 0.22,
          discriminationAccuracy: 0.14,
          confusion: 0.64,
          insight: 0.18,
        },
        expected_signal_direction: {
          used_source_focus: true,
        },
        expectation_note:
          "Should detect source-topic terms, while judgment should still penalize the contradiction.",
      },
    ],
  },
  {
    domain_id: "working-memory",
    topicLabel: "Working Memory",
    sourceTitle: "Working memory mini source",
    topicLabels: ["Psychology", "Working Memory"],
    targetDiagnosis: "representation_gap",
    assessmentTarget: "representation",
    expected_mechanism_summary:
      "Working memory temporarily holds and manipulates information for ongoing tasks, unlike long-term memory storage.",
    sourceText: `
Working memory is the limited-capacity system that lets a person hold information in mind and manipulate it while doing a task. For example, remembering a phone number long enough to dial it, doing mental arithmetic, or following multi-step instructions all involve working memory.

Working memory is different from long-term memory. Long-term memory stores information over longer periods, while working memory keeps information active for immediate use. Working memory is also not just passive storage; it involves control processes such as updating, focusing attention, and resisting distraction.

A common misunderstanding is to treat working memory as simply having a good memory. Someone can remember many facts in long-term memory but still struggle to hold and manipulate several pieces of information at once during a demanding task.
`,
    cases: [
      {
        case_id: "good_mechanism_answer",
        label: "Good mechanism answer",
        text: "Working memory is not just storing facts; it keeps information active so you can use and manipulate it during a task, like doing mental math or following steps.",
        interpretation: {
          outcome: "strong_evidence",
          evidenceStrength: 0.8,
          judgmentConfidence: 0.72,
          diagnosisDelta: {
            ...emptyDiagnosisDelta(),
            representation_gap: 0.06,
          },
          conceptualCoherence: 0.82,
          representationQuality: 0.84,
          discriminationAccuracy: 0.72,
          confusion: 0.18,
          insight: 0.76,
        },
        expected_signal_direction: {
          used_source_focus: true,
          addressed_relationship_or_mechanism: true,
          possible_surface_word_match: false,
          possible_overclaim: false,
        },
        expectation_note:
          "Should detect the active hold/manipulate/use contrast.",
      },
      {
        case_id: "shallow_keyword_answer",
        label: "Shallow keyword answer",
        text: "Working memory is memory and attention and information.",
        interpretation: {
          outcome: "weak_evidence",
          evidenceStrength: 0.32,
          judgmentConfidence: 0.42,
          diagnosisDelta: {
            ...emptyDiagnosisDelta(),
            recall_gap: 0.08,
            representation_gap: 0.22,
          },
          conceptualCoherence: 0.24,
          representationQuality: 0.22,
          discriminationAccuracy: 0.2,
          confusion: 0.66,
          insight: 0.18,
        },
        expected_signal_direction: {
          used_source_focus: true,
          addressed_relationship_or_mechanism: false,
          possible_surface_word_match: true,
          possible_overclaim: false,
        },
        expectation_note:
          "Should detect source vocabulary without the hold/manipulate contrast.",
      },
      {
        case_id: "overclaiming_answer",
        label: "Overclaiming answer",
        text: "Working memory proves that people with good memory can always focus and never get distracted during hard tasks.",
        interpretation: {
          outcome: "partial_evidence",
          evidenceStrength: 0.48,
          judgmentConfidence: 0.5,
          diagnosisDelta: {
            ...emptyDiagnosisDelta(),
            representation_gap: 0.16,
            discrimination_gap: 0.18,
            transfer_gap: 0.08,
          },
          conceptualCoherence: 0.3,
          representationQuality: 0.28,
          discriminationAccuracy: 0.12,
          confusion: 0.62,
          insight: 0.22,
        },
        expected_signal_direction: {
          used_source_focus: true,
          possible_overclaim: true,
        },
        expectation_note:
          "Should detect overclaiming from always/never.",
      },
      {
        case_id: "off_target_answer",
        label: "Off-target answer",
        text: "The brain has neurons, and people should sleep more before an exam.",
        interpretation: {
          outcome: "no_evidence",
          evidenceStrength: 0.18,
          judgmentConfidence: 0.34,
          diagnosisDelta: {
            ...emptyDiagnosisDelta(),
            representation_gap: 0.18,
            transfer_gap: 0.1,
          },
          conceptualCoherence: 0.14,
          representationQuality: 0.12,
          discriminationAccuracy: 0.18,
          confusion: 0.7,
          insight: 0.12,
        },
        expected_signal_direction: {
          used_source_focus: false,
          addressed_relationship_or_mechanism: false,
          possible_surface_word_match: false,
          possible_overclaim: false,
        },
        expectation_note:
          "Should not mark a generic brain/study response as working-memory understanding.",
      },
      {
        case_id: "contradiction_answer",
        label: "Contradiction answer",
        text: "Working memory is basically the same as long-term memory because both are just storing information for later.",
        interpretation: {
          outcome: "partial_evidence",
          evidenceStrength: 0.44,
          judgmentConfidence: 0.48,
          diagnosisDelta: {
            ...emptyDiagnosisDelta(),
            representation_gap: 0.24,
            discrimination_gap: 0.16,
          },
          conceptualCoherence: 0.24,
          representationQuality: 0.22,
          discriminationAccuracy: 0.14,
          confusion: 0.64,
          insight: 0.18,
        },
        expected_signal_direction: {
          used_source_focus: true,
        },
        expectation_note:
          "Should see source-relevant terms but not treat contradiction as mastery.",
      },
    ],
  },
];

const domainResults = DOMAINS.map((domain) => {
  const { normalized, authoringContext, sourceGroundedInput, contract } =
    buildDomainContract(domain);

  const probeId = `probe-source-grounded-attempt-dev-${domain.domain_id}`;
  const topicId = `topic-${domain.domain_id}-dev`;

  printSection(`${domain.topicLabel} contract summary`, {
    domain_id: domain.domain_id,
    source_id: normalized.source.source_id,
    chunk_count: normalized.chunks.length,
    authoring_context_id: authoringContext.authoring_context_id,
    readiness: authoringContext.readiness,
    source_confidence: authoringContext.source_confidence,
    expected_mechanism_summary: domain.expected_mechanism_summary,
    contract_id: contract.contract_id,
    renderer_kind: contract.renderer_kind,
    target_diagnosis: contract.target_diagnosis,
    prompt: contract.renderer_config?.prompt,
    allowed_claim_strength:
      (contract.source_metadata as Record<string, unknown> | undefined)
        ?.allowed_claim_strength ?? null,
    can_make_strong_correctness_claim:
      (contract.source_metadata as Record<string, unknown> | undefined)
        ?.can_make_strong_correctness_claim ?? null,
    has_source_grounded_judging_scaffold: Boolean(
      contract.judging_schema?.source_grounded_judging_scaffold,
    ),
    source_grounded_judging_scaffold:
      contract.judging_schema?.source_grounded_judging_scaffold ?? null,
    source_grounded_input_metadata: {
      generationMode: sourceGroundedInput.probe_input.generationMode,
      rendererKind: sourceGroundedInput.probe_input.rendererKind,
      sourceContentIds: sourceGroundedInput.probe_input.sourceContentIds,
      normalizedSourceChunkCount:
        sourceGroundedInput.probe_input.normalizedSourceChunks?.length ?? 0,
      authoringContextId: sourceGroundedInput.probe_input.authoringContextId,
    },
  });

  const caseResults = domain.cases.map((testCase) => {
    const attemptInterpretation = buildAttemptInterpretation({
      attemptId: `attempt-${domain.domain_id}-${testCase.case_id}`,
      topicId,
      probeId,
      text: testCase.text,
      ...testCase.interpretation,
    });

    const judgment = judgeProbeAttemptAgainstContract({
      attemptInterpretation,
      normalizedEvidence: buildTextEvidence(testCase.text),
      probeContractSnapshot: contract,
    });

    const diagnosisUpdate = updateDiagnosisBeliefs({
      previousState: undefined,
      currentActiveDiagnosis: domain.targetDiagnosis,
      attemptInterpretation,
      contractJudgment: judgment,
      source: "contract_judgment_v1_1",
    });

    const expectationCheck = sourceSignalMatchesExpectation(
      judgment,
      testCase.expected_signal_direction,
    );

    return {
      domain_id: domain.domain_id,
      topic_label: domain.topicLabel,
      case_id: testCase.case_id,
      label: testCase.label,
      response: testCase.text,
      expectation_note: testCase.expectation_note,
      expected_signal_direction: testCase.expected_signal_direction,
      expectation_check: expectationCheck,
      judgment: summarizeJudgment(judgment),
      diagnosis_state_update: {
        active_diagnosis: diagnosisUpdate.active_diagnosis,
        changed: diagnosisUpdate.changed,
        reasons: diagnosisUpdate.reasons,
        compact_state: compactBeliefs(diagnosisUpdate.diagnosis_state),
      },
      quick_check: {
        has_source_grounded_signal: Boolean(judgment.source_grounded_signal),
        remains_heuristic_rubric:
          judgment.evidence_tier === "heuristic_rubric_judgment",
        remains_conservative:
          judgment.allowed_claim_strength === "conservative" &&
          judgment.can_make_strong_correctness_claim === false,
        diagnosis_state_used_contract_judgment:
          diagnosisUpdate.diagnosis_state.last_update?.source ===
          "contract_judgment_v1_1",
      },
    };
  });

  for (const result of caseResults) {
    printSection(`${domain.topicLabel} / ${result.label}`, result);
  }

  return {
    domain_id: domain.domain_id,
    topic_label: domain.topicLabel,
    case_results: caseResults,
  };
});

const allCaseResults = domainResults.flatMap((domain) => domain.case_results);
const failingExpectationChecks = allCaseResults.filter(
  (result) => !result.expectation_check.pass,
);

printSection("multi-domain quick check summary", {
  domain_count: domainResults.length,
  case_count: allCaseResults.length,
  all_cases_have_source_grounded_signal: allCaseResults.every(
    (result) => result.quick_check.has_source_grounded_signal,
  ),
  all_cases_remain_conservative: allCaseResults.every(
    (result) => result.quick_check.remains_conservative,
  ),
  all_cases_use_contract_diagnosis_update: allCaseResults.every(
    (result) => result.quick_check.diagnosis_state_used_contract_judgment,
  ),
  all_expected_signal_directions_passed:
    failingExpectationChecks.length === 0,
  failing_expectation_checks: failingExpectationChecks.map((result) => ({
    domain_id: result.domain_id,
    case_id: result.case_id,
    label: result.label,
    expected_signal_direction: result.expected_signal_direction,
    mismatches: result.expectation_check.mismatches,
    source_grounded_signal:
      result.judgment.source_grounded_signal ?? null,
  })),
  expected_direction_notes: {
    good_mechanism_answer:
      "Should show source focus + mechanism and some cautious resolution pressure.",
    shallow_keyword_answer:
      "Should show source focus but surface-word / missing-mechanism pressure.",
    overclaiming_answer:
      "Should show overclaim/discrimination pressure without strong correctness claims.",
    off_target_answer:
      "Should not show source focus or source-grounded mechanism.",
    contradiction_answer:
      "May show source focus, but judgment/diagnosis should still preserve failure/discrimination pressure.",
  },
});
