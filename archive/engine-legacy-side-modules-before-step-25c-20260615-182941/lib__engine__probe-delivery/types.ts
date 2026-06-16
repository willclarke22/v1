import type {
  ProbeContractSnapshot,
  ProbeExpectedResponseType,
  ProbeIntent,
  ProbeType as RuntimeProbeType,
  DiagnosisType as RuntimeDiagnosisType,
} from "@/types/contracts";
import type {
  DiagnosisLabel,
  ProbeAttemptType,
  ProbeContractModelOutput,
  ProbeType as EngineProbeType,
} from "../schemas";
import type { EngineRenderableProbe } from "../renderers";

export type LegacyCompatibleProbeContractInput = {
  targetTopicId?: string | null;
  targetTopicLabel: string;
  targetDiagnosis?: RuntimeDiagnosisType | DiagnosisLabel | null;
  intent?: ProbeIntent | null;
  probeType?: RuntimeProbeType | EngineProbeType | null;
  rendererKind?: string | null;
  expectedResponseType?: ProbeExpectedResponseType | ProbeAttemptType | null;
};

export type LegacyCompatibleProbeContractSnapshot = ProbeContractSnapshot & {
  schema_version: "probe_contract_snapshot_v2_engine_backed";

  /**
   * Engine-native contract fields are repeated at the top level so current
   * frontend adapters can read them without knowing the old renderer_config
   * layout.
   */
  engine_probe_type: EngineProbeType;
  expected_attempt_type: ProbeAttemptType;
  prompt: ProbeContractModelOutput["prompt"];
  presentation_support?: ProbeContractModelOutput["presentation_support"];
  answer_key?: ProbeContractModelOutput["answer_key"];
  misconception_markers: ProbeContractModelOutput["misconception_markers"];
  renderer_params?: ProbeContractModelOutput["renderer_params"];
  delivery_context?: ProbeContractModelOutput["delivery_context"];

  engine_contract: ProbeContractModelOutput;
  engine_renderable_probe: EngineRenderableProbe;
};

export type LegacyCompatibleProbeContractResult = {
  contract: LegacyCompatibleProbeContractSnapshot;
  engine_contract: ProbeContractModelOutput;
  renderable_probe: EngineRenderableProbe;
  warnings: string[];
};

export type ProbeDeliveryRuntimeProbeType = RuntimeProbeType;
export type ProbeDeliveryEngineProbeType = EngineProbeType;
export type ProbeDeliveryAttemptType = ProbeAttemptType;

