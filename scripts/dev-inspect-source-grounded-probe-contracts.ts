import { normalizeSourceInput } from "@/archive/old-engine/source-processing";
import {
  buildProbeAuthoringContext,
  buildSourceGroundedProbeInput,
} from "@/archive/old-engine/probe-authoring";
import { buildProbeContract } from "@/archive/old-engine/probes/build-probe-contract";
import type {
  DiagnosisType,
  ProbeContractSnapshot,
} from "@/types/contracts";
import type { ProbeAssessmentTarget } from "@/archive/old-engine/probes/probe-types";

/**
 * Dev inspection: Source-Grounded Probe Contracts
 *
 * This script does NOT judge learner answers.
 * It prints human-readable contract inspection cards so we can evaluate whether
 * the probe contracts MyWay is generating feel like the right product object.
 *
 * It checks this part of the loop:
 *
 * source text
 * → normalized source chunks
 * → source-grounded authoring context
 * → source-grounded probe input
 * → probe contract
 * → readable inspection card
 *
 * Run:
 * npx tsx scripts/dev-inspect-source-grounded-probe-contracts.ts
 *
 * Suggested package.json script:
 * "inspect:source-grounded-contracts": "tsx scripts/dev-inspect-source-grounded-probe-contracts.ts"
 *
 * Useful PowerShell command:
 * pnpm inspect:source-grounded-contracts *> source-grounded-contract-inspection.txt; notepad source-grounded-contract-inspection.txt
 */

type DomainConfig = {
  domain_id: string;
  topicLabel: string;
  sourceTitle: string;
  sourceText: string;
  topicLabels: string[];
  targetDiagnosis: DiagnosisType;
  assessmentTarget: ProbeAssessmentTarget;
  expected_mechanism_summary: string;
  product_review_prompt: string;
};

type ContractRecord = Record<string, unknown>;

function printSection(title: string) {
  console.log(`\n${"=".repeat(92)}`);
  console.log(title);
  console.log(`${"=".repeat(92)}`);
}

function printSubsection(title: string) {
  console.log(`\n--- ${title} ---`);
}

function asRecord(value: unknown): ContractRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as ContractRecord)
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function asBoolean(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function asNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function formatMaybe(value: unknown, fallback = "not set") {
  if (typeof value === "string") return value.trim() || fallback;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value == null) return fallback;
  return JSON.stringify(value);
}

function formatList(values: unknown[], fallback = "none") {
  const strings = values
    .map((value) => {
      if (typeof value === "string") return value.trim();
      if (typeof value === "number" || typeof value === "boolean") return String(value);
      return "";
    })
    .filter(Boolean);

  return strings.length ? strings : [fallback];
}

function printBulletList(values: unknown[], fallback = "none") {
  for (const value of formatList(values, fallback)) {
    console.log(`- ${value}`);
  }
}

function printMarkerList(markers: unknown[], fallback = "none") {
  if (!markers.length) {
    console.log(`- ${fallback}`);
    return;
  }

  for (const marker of markers) {
    const record = asRecord(marker);
    const label = asString(record.label, "Unnamed marker");
    const description = asString(record.description, "");
    const required = record.required;
    const weight = record.weight;
    const mapsToDiagnosis = record.maps_to_diagnosis;
    const severity = record.severity;

    const details = [
      typeof required === "boolean" ? `required=${required}` : null,
      typeof weight === "number" ? `weight=${weight.toFixed(2)}` : null,
      typeof mapsToDiagnosis === "string" ? `maps_to=${mapsToDiagnosis}` : null,
      typeof severity === "number" ? `severity=${severity.toFixed(2)}` : null,
    ].filter(Boolean);

    console.log(`- ${label}${details.length ? ` (${details.join(", ")})` : ""}`);
    if (description) console.log(`  ${description}`);
  }
}

function printMisconceptionMappings(mappings: unknown[]) {
  if (!mappings.length) {
    console.log("- none");
    return;
  }

  for (const mapping of mappings) {
    const record = asRecord(mapping);
    const label = asString(record.label, "Unnamed misconception");
    const description = asString(record.description, "");
    const likelyDiagnosis = asString(record.likely_diagnosis, "unknown_diagnosis");

    console.log(`- ${label} (likely_diagnosis=${likelyDiagnosis})`);
    if (description) console.log(`  ${description}`);
  }
}

function printInputSchema(inputSchema: ContractRecord) {
  if (!Object.keys(inputSchema).length) {
    console.log("- no input schema found");
    return;
  }

  console.log(`renderer_kind: ${formatMaybe(inputSchema.renderer_kind)}`);
  console.log(`expected_response_type: ${formatMaybe(inputSchema.expected_response_type)}`);
  console.log(`normalized_value_kind: ${formatMaybe(inputSchema.normalized_value_kind)}`);
  console.log(`required: ${formatMaybe(inputSchema.required)}`);

  const options = asArray(inputSchema.options);
  if (options.length) {
    console.log("options:");
    for (const option of options) {
      const record = asRecord(option);
      console.log(
        `- ${formatMaybe(record.label, "Option")}: ${formatMaybe(record.text)}`,
      );
    }
  }

  const answerCaptureKeys = asArray(inputSchema.answer_capture_keys);
  if (answerCaptureKeys.length) {
    console.log("answer_capture_keys:");
    printBulletList(answerCaptureKeys);
  }
}

function printSourcePolicy(contract: ContractRecord) {
  const sourceMetadata = asRecord(contract.source_metadata);
  const sourcePolicy = asRecord(contract.source_policy);
  const sourceGrounding = asRecord(contract.source_grounding);

  console.log(
    `allowed_claim_strength: ${formatMaybe(
      sourceMetadata.allowed_claim_strength ?? sourcePolicy.allowed_claim_strength,
    )}`,
  );
  console.log(
    `can_make_strong_correctness_claim: ${formatMaybe(
      sourceMetadata.can_make_strong_correctness_claim ??
        sourcePolicy.can_make_strong_correctness_claim,
    )}`,
  );
  console.log(
    `requires_review: ${formatMaybe(
      sourceMetadata.requires_review ?? sourcePolicy.requires_review,
    )}`,
  );
  console.log(
    `source_confidence: ${formatMaybe(
      sourceMetadata.source_confidence ?? sourcePolicy.source_confidence,
    )}`,
  );

  const sourceContentIds = asArray(
    sourceMetadata.source_content_ids ?? sourceGrounding.source_content_ids,
  );
  if (sourceContentIds.length) {
    console.log("source_content_ids:");
    printBulletList(sourceContentIds);
  }

  const cautions = asArray(sourceMetadata.cautions ?? sourcePolicy.cautions);
  if (cautions.length) {
    console.log("source_policy_cautions:");
    printBulletList(cautions);
  }
}

function printJudgingScaffold(contract: ContractRecord) {
  const judgingSchema = asRecord(contract.judging_schema);
  const scaffold = asRecord(judgingSchema.source_grounded_judging_scaffold);

  if (!Object.keys(scaffold).length) {
    console.log("- no source-grounded judging scaffold found");
    return;
  }

  console.log(`scaffold_id: ${formatMaybe(scaffold.scaffold_id)}`);
  console.log(`confidence: ${asNumber(scaffold.confidence, 0).toFixed(2)}`);
  console.log(`requires_review: ${formatMaybe(scaffold.requires_review)}`);
  console.log(`source_focus_summary: ${formatMaybe(scaffold.source_focus_summary)}`);

  printSubsection("success hint candidates");
  printBulletList(asArray(scaffold.success_hint_candidates));

  printSubsection("failure hint candidates");
  printBulletList(asArray(scaffold.failure_hint_candidates));

  printSubsection("misconception hint candidates");
  printBulletList(asArray(scaffold.misconception_hint_candidates));

  const cautions = asArray(scaffold.cautions);
  if (cautions.length) {
    printSubsection("judging scaffold cautions");
    printBulletList(cautions);
  }
}

function getRendererPrompt(contract: ContractRecord) {
  const rendererConfig = asRecord(contract.renderer_config);
  const prompt =
    rendererConfig.prompt ??
    rendererConfig.instruction ??
    rendererConfig.question ??
    rendererConfig.title;

  return asString(prompt, "No learner-facing prompt found.");
}

function getRendererTitle(contract: ContractRecord) {
  const rendererConfig = asRecord(contract.renderer_config);
  return asString(
    rendererConfig.title ?? contract.title,
    asString(contract.topic_label, "Probe"),
  );
}

function inspectContract(args: {
  domain: DomainConfig;
  normalizedChunkCount: number;
  authoringContext: unknown;
  sourceGroundedInput: unknown;
  contract: ProbeContractSnapshot;
}) {
  const { domain, normalizedChunkCount, authoringContext, sourceGroundedInput } = args;
  const contract = asRecord(args.contract);
  const authoringContextRecord = asRecord(authoringContext);
  const sourceGroundedInputRecord = asRecord(sourceGroundedInput);
  const probeInput = asRecord(sourceGroundedInputRecord.probe_input);

  const successMarkers = asArray(contract.success_markers);
  const failureMarkers = asArray(contract.failure_markers);
  const misconceptionMappings = asArray(contract.misconception_mappings);
  const inputSchema = asRecord(contract.input_schema);
  const generationMetadata = asRecord(contract.generation_metadata);
  const quality = asRecord(contract.quality);
  const cacheCandidate = asRecord(contract.cache_candidate);

  printSection(`Contract Inspection: ${domain.topicLabel}`);

  printSubsection("product review anchor");
  console.log(domain.product_review_prompt);

  printSubsection("source/domain setup");
  console.log(`domain_id: ${domain.domain_id}`);
  console.log(`topic_label: ${domain.topicLabel}`);
  console.log(`source_title: ${domain.sourceTitle}`);
  console.log(`source_chunk_count: ${normalizedChunkCount}`);
  console.log(`target_diagnosis: ${domain.targetDiagnosis}`);
  console.log(`assessment_target: ${domain.assessmentTarget}`);
  console.log(`expected_mechanism_summary: ${domain.expected_mechanism_summary}`);

  printSubsection("contract identity");
  console.log(`contract_id: ${formatMaybe(contract.contract_id)}`);
  console.log(`version: ${formatMaybe(contract.version ?? contract.contract_version)}`);
  console.log(`topic_label: ${formatMaybe(contract.topic_label)}`);
  console.log(`target_diagnosis: ${formatMaybe(contract.target_diagnosis)}`);
  console.log(`probe_type: ${formatMaybe(contract.probe_type)}`);
  console.log(`intent: ${formatMaybe(contract.intent)}`);

  printSubsection("learner-facing surface");
  console.log(`title: ${getRendererTitle(contract)}`);
  console.log(`prompt: ${getRendererPrompt(contract)}`);

  const rendererConfig = asRecord(contract.renderer_config);
  const instructions = rendererConfig.instructions ?? rendererConfig.helper_text;
  if (instructions) console.log(`instructions/helper_text: ${formatMaybe(instructions)}`);

  printSubsection("renderer/input schema");
  console.log(`renderer_kind: ${formatMaybe(contract.renderer_kind)}`);
  console.log(`expected_response_type: ${formatMaybe(contract.expected_response_type)}`);
  printInputSchema(inputSchema);

  printSubsection("what this contract is trying to measure");
  const textPlan = asRecord(contract.text_plan);
  const diagnosticGoal =
    textPlan.diagnostic_goal ??
    generationMetadata.diagnostic_goal ??
    probeInput.diagnosticGoal;
  const measurementIntent = asRecord(
    contract.measurement_intent ?? generationMetadata.measurement_intent,
  );
  console.log(`diagnostic_goal: ${formatMaybe(diagnosticGoal, "not explicitly set")}`);

  const shouldReveal = asArray(measurementIntent.what_response_should_reveal);
  if (shouldReveal.length) {
    console.log("what_response_should_reveal:");
    printBulletList(shouldReveal);
  }

  const progress = asArray(measurementIntent.what_would_count_as_progress);
  if (progress.length) {
    console.log("what_would_count_as_progress:");
    printBulletList(progress);
  }

  printSubsection("success markers");
  printMarkerList(successMarkers);

  printSubsection("failure markers");
  printMarkerList(failureMarkers);

  printSubsection("misconception mappings");
  printMisconceptionMappings(misconceptionMappings);

  printSubsection("source policy / trust boundary");
  printSourcePolicy(contract);

  printSubsection("source-grounded judging scaffold");
  printJudgingScaffold(contract);

  printSubsection("authoring context/debug");
  console.log(`authoring_context_id: ${formatMaybe(authoringContextRecord.authoring_context_id)}`);
  console.log(`readiness: ${formatMaybe(authoringContextRecord.readiness)}`);
  console.log(`source_confidence: ${formatMaybe(authoringContextRecord.source_confidence)}`);
  console.log(`generation_mode: ${formatMaybe(probeInput.generationMode)}`);
  console.log(`source_content_ids: ${formatList(asArray(probeInput.sourceContentIds)).join(", ")}`);
  console.log(
    `normalized_source_chunk_count: ${formatMaybe(
      asArray(probeInput.normalizedSourceChunks).length,
    )}`,
  );

  if (Object.keys(quality).length) {
    printSubsection("contract quality metadata");
    console.log(JSON.stringify(quality, null, 2));
  }

  if (Object.keys(cacheCandidate).length) {
    printSubsection("cache candidate metadata");
    console.log(JSON.stringify(cacheCandidate, null, 2));
  }

  printSubsection("MyWay read");
  const allowedClaimStrength = asString(
    asRecord(contract.source_metadata).allowed_claim_strength,
    "unknown",
  );
  const canStrongClaim = asBoolean(
    asRecord(contract.source_metadata).can_make_strong_correctness_claim,
    false,
  );
  console.log(
    `This is a ${allowedClaimStrength} source-grounded ${formatMaybe(
      contract.renderer_kind,
      "unknown-renderer",
    )} probe targeting ${formatMaybe(contract.target_diagnosis, domain.targetDiagnosis)}.`,
  );
  console.log(
    canStrongClaim
      ? "The contract says strong correctness claims may be possible. Review whether that is intended."
      : "The contract does NOT allow strong correctness claims yet; it should be treated as provisional diagnostic evidence.",
  );
  console.log(
    "Review whether the learner-facing prompt feels like MyWay, whether the success/failure markers are specific enough, and whether the source scaffold captures the key relationship instead of generic topic wording.",
  );

  printSubsection("review questions");
  printBulletList([
    "Does the prompt ask a small enough question, or does it feel like a generic school prompt?",
    "Does the contract name what it is really trying to measure?",
    "Are the success markers specific enough to distinguish understanding from keyword overlap?",
    "Are the failure markers useful for diagnosis, not just grading?",
    "Does the source policy stay honest about provisional/ungrounded parts?",
    "Would this contract produce a probe you would want to see in the app?",
  ]);
}

function buildAndInspectDomain(domain: DomainConfig) {
  const normalized = normalizeSourceInput(
    {
      source_kind: "uploaded_document",
      title: domain.sourceTitle,
      text: domain.sourceText,
      origin_label: `dev-inspect-source-grounded-probe-contracts:${domain.domain_id}`,
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

  inspectContract({
    domain,
    normalizedChunkCount: normalized.chunks.length,
    authoringContext,
    sourceGroundedInput,
    contract: contractResult.contract as unknown as ProbeContractSnapshot,
  });
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
    product_review_prompt:
      "Would this contract help MyWay check whether the learner understands federalism as divided/overlapping authority rather than just naming governments and powers?",
    sourceText: `
Federalism is a system of government where authority is divided between a national government and regional governments. In the United States, the federal government has powers such as regulating interstate commerce, declaring war, and conducting foreign policy. States keep powers such as running most elections, managing local education systems, and creating many criminal and civil laws.

A key idea in American federalism is that neither level of government controls everything. When a political issue involves both national and state responsibilities, conflict can happen over which level has authority. For example, education policy, voting rules, public health responses, and environmental regulation can involve overlapping authority.

The Tenth Amendment is often used to express the idea that powers not delegated to the federal government are reserved to the states or the people. This does not mean states are always stronger than the federal government. It means the constitutional structure creates a division of powers, and many political disputes are partly disputes about where a power belongs.
`,
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
    product_review_prompt:
      "Would this contract help MyWay check whether the learner understands the conversion relationship, not just the words plants/light/oxygen/glucose?",
    sourceText: `
Photosynthesis is the process plants, algae, and some bacteria use to make sugars. In plants, chlorophyll in chloroplasts absorbs light energy. That energy helps convert carbon dioxide from the air and water from the soil into glucose, a sugar the plant can use for energy and growth.

Oxygen is released during photosynthesis as a byproduct. The oxygen does not come from carbon dioxide alone; it is connected to the splitting of water during the light-dependent reactions. Photosynthesis also depends on conditions such as light intensity, carbon dioxide availability, and temperature.

A common misunderstanding is that plants get most of their food from soil. Soil provides minerals and water, but the carbon used to build glucose mainly comes from carbon dioxide in the air.
`,
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
    product_review_prompt:
      "Would this contract help MyWay check whether the learner understands price as an interaction between supply and demand, not one side alone?",
    sourceText: `
Supply and demand describe how buyers and sellers interact in a market. Demand refers to how much of a good buyers are willing and able to purchase at different prices. Supply refers to how much sellers are willing and able to offer at different prices.

When demand increases while supply stays the same, buyers compete for the available goods and the market price tends to rise. When supply increases while demand stays the same, sellers compete to sell more goods and the market price tends to fall. Prices are not controlled by demand alone or supply alone; they reflect the interaction between both sides of the market.

A common mistake is to say that high demand always means high prices. High demand can raise prices, but the final price also depends on how much supply is available and how quickly sellers can respond.
`,
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
    product_review_prompt:
      "Would this contract help MyWay check whether the learner understands working memory as active holding/manipulating, not just 'having a good memory'?",
    sourceText: `
Working memory is the limited-capacity system that lets a person hold information in mind and manipulate it while doing a task. For example, remembering a phone number long enough to dial it, doing mental arithmetic, or following multi-step instructions all involve working memory.

Working memory is different from long-term memory. Long-term memory stores information over longer periods, while working memory keeps information active for immediate use. Working memory is also not just passive storage; it involves control processes such as updating, focusing attention, and resisting distraction.

A common misunderstanding is to treat working memory as simply having a good memory. Someone can remember many facts in long-term memory but still struggle to hold and manipulate several pieces of information at once during a demanding task.
`,
  },
];

printSection("Source-Grounded Probe Contract Inspection V0");
console.log(
  "This output is for product/architecture inspection. It does not judge learner answers.",
);
console.log(
  "Use it to decide whether the generated contracts feel like the right kind of MyWay object before wiring deeper UI behavior.",
);

for (const domain of DOMAINS) {
  buildAndInspectDomain(domain);
}

printSection("Inspection Summary");
console.log(`domain_count: ${DOMAINS.length}`);
console.log("What to look for:");
printBulletList([
  "Are the learner-facing prompts too generic or too school-like?",
  "Do the success markers actually describe understanding, not just answer quality?",
  "Do the failure markers map to useful diagnosis pressure?",
  "Does the source-grounded scaffold preserve the key relationship/mechanism?",
  "Does the trust policy stay conservative for unreviewed source-grounded probes?",
  "What would need to change before rendering these contracts as visible probes in the app?",
]);
