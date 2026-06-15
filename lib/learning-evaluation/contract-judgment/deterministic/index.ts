import type {
  ContractJudgingInput,
  JudgingMethod,
  StructuredJudgment,
} from "../judging-types";
import { judgeDragDrop } from "./judge-drag-drop";
import { judgeGraphMatch } from "./judge-graph-match";
import { judgeMultipleChoice } from "./judge-multiple-choice";
import { judgeOrdering } from "./judge-ordering";
import { judgeSlider } from "./judge-slider";

export { judgeDragDrop } from "./judge-drag-drop";
export { judgeGraphMatch } from "./judge-graph-match";
export { judgeMultipleChoice } from "./judge-multiple-choice";
export { judgeOrdering } from "./judge-ordering";
export { judgeSlider } from "./judge-slider";

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function getInputSchema(input: ContractJudgingInput) {
  const contract = input.probeContractSnapshot as
    | { input_schema?: unknown }
    | null
    | undefined;
  return asRecord(contract?.input_schema);
}

export function getProbeRendererKind(input: ContractJudgingInput): string | null {
  const inputSchema = getInputSchema(input);
  const contract = input.probeContractSnapshot as
    | { renderer_kind?: unknown }
    | null
    | undefined;
  const fromInputSchema = inputSchema.renderer_kind;
  const fromContract = contract?.renderer_kind;

  return typeof fromInputSchema === "string"
    ? fromInputSchema
    : typeof fromContract === "string"
      ? fromContract
      : null;
}

export function structuredNotApplicable(
  method: JudgingMethod = "none",
): StructuredJudgment {
  return {
    method,
    outcome: "not_applicable",
    performance_score: 0,
    confidence: 0,
    item_count: 0,
    correct_count: 0,
    incorrect_count: 0,
    reasons: ["No deterministic structured judge applied to this probe."],
    cautions: [],
  };
}

export function isUsableStructuredJudgment(
  judgment: StructuredJudgment | null,
): judgment is StructuredJudgment {
  return (
    judgment !== null &&
    judgment.outcome !== "not_applicable" &&
    judgment.outcome !== "unjudgeable" &&
    judgment.confidence > 0
  );
}

export function runStructuredJudge(
  input: ContractJudgingInput,
): StructuredJudgment | null {
  const rendererKind = getProbeRendererKind(input);

  switch (rendererKind) {
    case "multiple_choice":
      return judgeMultipleChoice(input);
    case "ordering":
      return judgeOrdering(input);
    case "slider_prediction":
    case "slider":
      return judgeSlider(input);
    case "drag_drop_match":
    case "drag_drop":
      return judgeDragDrop(input);
    case "graph_match":
      return judgeGraphMatch(input);
    default:
      return null;
  }
}
