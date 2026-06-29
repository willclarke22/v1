"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Player } from "@remotion/player";
import { UniversalSceneRemotionComposition } from "./universal-scene-remotion-composition";
import {
  buildFallbackUniversalSceneContract,
  getUniversalSceneDurationInFrames,
  type UniversalSceneContract,
} from "./universal-scene-contract";
import {
  buildDefaultVideoDirectorRequestContext,
  buildFallbackVideoDirectorContract,
  VIDEO_DIRECTOR_LAB_SAMPLES,
  type MyWayVideoDirectorContract,
  type VideoDirectorBridgeLevel,
  type VideoDirectorDiagnosisLabel,
} from "../director";
import { GeneratedVideo3DPlayer } from "../hybrid-3d";

type GenerationProvider = "nvidia" | "ollama";
type GenerationSource = "deterministic" | GenerationProvider;

type UniversalSceneResponse = {
  ok: boolean;
  source: "nvidia" | "ollama" | "fallback";
  provider?: GenerationProvider;
  model: string;
  contract: UniversalSceneContract;
  director_contract: MyWayVideoDirectorContract;
  context?: unknown;
  error?: string;
  warnings?: string[];
  debug?: unknown;
};

const PROVIDER_DEFAULT_MODELS: Record<GenerationProvider, string> = {
  nvidia: "nvidia/nemotron-3-super-120b-a12b",
  ollama: "qwen2.5:3b",
};

const PROVIDER_LABELS: Record<GenerationProvider, string> = {
  nvidia: "NVIDIA NIM",
  ollama: "Local Ollama",
};

const DIAGNOSIS_OPTIONS: VideoDirectorDiagnosisLabel[] = [
  "unknown",
  "recall_gap",
  "representation_gap",
  "procedure_gap",
  "discrimination_gap",
  "transfer_gap",
  "metacognitive_gap",
  "no_gap_detected",
];

const BRIDGE_OPTIONS: VideoDirectorBridgeLevel[] = ["bridge_0", "bridge_1", "bridge_2", "full_bridge"];

const shellStyle = {
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: "2rem",
  background: "rgba(0,0,0,0.2)",
  backdropFilter: "blur(18px)",
  boxShadow: "0 24px 80px rgba(0,0,0,0.28)",
} as const;

function TinyLabel({ children }: { children: ReactNode }) {
  return (
    <p
      style={{
        margin: 0,
        color: "rgba(255,255,255,0.58)",
        fontSize: "0.72rem",
        fontWeight: 900,
        letterSpacing: "0.16em",
        textTransform: "uppercase",
      }}
    >
      {children}
    </p>
  );
}

function ActionButton({
  children,
  disabled,
  onClick,
  variant = "secondary",
}: {
  children: ReactNode;
  disabled?: boolean;
  onClick: () => void;
  variant?: "primary" | "secondary";
}) {
  const primary = variant === "primary";

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{
        border: primary ? "1px solid rgba(221,214,254,0.46)" : "1px solid rgba(255,255,255,0.12)",
        borderRadius: "999px",
        background: primary
          ? "linear-gradient(135deg, rgba(147,51,234,0.88), rgba(8,145,178,0.86))"
          : "rgba(255,255,255,0.06)",
        color: "white",
        padding: "0.7rem 0.95rem",
        fontWeight: 900,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.55 : 1,
        boxShadow: primary ? "0 18px 48px rgba(88,28,135,0.34)" : "none",
      }}
    >
      {children}
    </button>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <section style={{ display: "grid", gap: "0.55rem" }}>
      <TinyLabel>{label}</TinyLabel>
      {children}
    </section>
  );
}

function textInputStyle() {
  return {
    width: "100%",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: "1rem",
    background: "rgba(255,255,255,0.07)",
    color: "white",
    padding: "0.72rem 0.86rem",
    lineHeight: 1.5,
    outline: "none",
  } as const;
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{ border: "1px solid rgba(255,255,255,0.1)", borderRadius: "1rem", padding: "0.78rem", background: "rgba(255,255,255,0.055)" }}>
      <TinyLabel>{label}</TinyLabel>
      <p style={{ margin: "0.35rem 0 0", color: "white", fontWeight: 900 }}>{value}</p>
    </div>
  );
}

function ProviderButton({
  provider,
  selected,
  onSelect,
}: {
  provider: GenerationProvider;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      style={{
        textAlign: "left",
        border: selected ? "1px solid rgba(221,214,254,0.45)" : "1px solid rgba(255,255,255,0.1)",
        borderRadius: "1rem",
        background: selected ? "rgba(147,51,234,0.2)" : "rgba(255,255,255,0.045)",
        color: "white",
        padding: "0.75rem",
        cursor: "pointer",
      }}
    >
      <p style={{ margin: 0, fontWeight: 950 }}>{PROVIDER_LABELS[provider]}</p>
      <p style={{ margin: "0.25rem 0 0", color: "rgba(255,255,255,0.58)", fontSize: "0.76rem", lineHeight: 1.35 }}>
        {provider === "nvidia"
          ? "Hosted model for personalized director-contract quality testing."
          : "Local fallback path for offline/director experiments."}
      </p>
    </button>
  );
}

function splitList(value: string) {
  return value
    .split(/[\n,]/g)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 8);
}

function UniversalSceneRemotionLabInner() {
  const firstSample = VIDEO_DIRECTOR_LAB_SAMPLES[0]?.context ?? buildDefaultVideoDirectorRequestContext("I am stuck.");
  const [learnerMessage, setLearnerMessage] = useState(firstSample.learner_message);
  const [topicLabel, setTopicLabel] = useState(firstSample.learning_context.topic_label ?? "");
  const [diagnosisLabel, setDiagnosisLabel] = useState<VideoDirectorDiagnosisLabel>(firstSample.learning_context.diagnosis_label ?? "unknown");
  const [rootProblem, setRootProblem] = useState(firstSample.learning_context.root_problem ?? "");
  const [misconceptionTarget, setMisconceptionTarget] = useState(firstSample.learning_context.misconception_target ?? "");
  const [bridgeLevel, setBridgeLevel] = useState<VideoDirectorBridgeLevel>(firstSample.learning_context.bridge_level);
  const [priorAttemptSummary, setPriorAttemptSummary] = useState(firstSample.learning_context.prior_attempt_summary ?? "");
  const [interests, setInterests] = useState(firstSample.personalization_profile.interests.join(", "));
  const [profileSummary, setProfileSummary] = useState(firstSample.personalization_profile.profile_summary ?? "");

  const [provider, setProvider] = useState<GenerationProvider>("nvidia");
  const [modelName, setModelName] = useState(PROVIDER_DEFAULT_MODELS.nvidia);
  const [contract, setContract] = useState<UniversalSceneContract>(() => buildFallbackUniversalSceneContract(firstSample.learner_message));
  const [directorContract, setDirectorContract] = useState<MyWayVideoDirectorContract>(() => buildFallbackVideoDirectorContract(firstSample));
  const [source, setSource] = useState<GenerationSource>("deterministic");
  const [status, setStatus] = useState("Ready. Add learner context, interests, and root problem, then ask the model for a video director contract.");
  const [lastError, setLastError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [lastPayload, setLastPayload] = useState<unknown>(null);
  const [showFallback2D, setShowFallback2D] = useState(false);

  const requestContext = useMemo(() => {
    const fallback = buildDefaultVideoDirectorRequestContext(learnerMessage);
    const bridge = bridgeLevel;
    return {
      ...fallback,
      learner_message: learnerMessage,
      learning_context: {
        ...fallback.learning_context,
        topic_label: topicLabel,
        diagnosis_label: diagnosisLabel,
        root_problem: rootProblem,
        misconception_target: misconceptionTarget,
        bridge_level: bridge,
        language_policy: {
          jargon_level: (bridge === "bridge_0" ? "none" : bridge === "bridge_1" ? "light" : "standard") as "none" | "light" | "standard" | "full",
        },
        prior_attempt_summary: priorAttemptSummary || null,
      },
      personalization_profile: {
        ...fallback.personalization_profile,
        interests: splitList(interests),
        preferred_explanation_style: ["visual_description", "concrete_examples", "step_by_step"] as import("../director").VideoDirectorPresentationStyle[],
        avoidances: ["long captions", "generic textbook explainer", "decorative personalization"],
        known_good_metaphors: [],
        profile_summary: profileSummary || null,
      },
    };
  }, [bridgeLevel, diagnosisLabel, interests, learnerMessage, misconceptionTarget, priorAttemptSummary, profileSummary, rootProblem, topicLabel]);

  const durationInFrames = useMemo(() => getUniversalSceneDurationInFrames(contract), [contract]);
  const inputProps = useMemo(() => ({ contract }), [contract]);

  function selectProvider(nextProvider: GenerationProvider) {
    setProvider(nextProvider);
    setModelName(PROVIDER_DEFAULT_MODELS[nextProvider]);
    setStatus(`Selected ${PROVIDER_LABELS[nextProvider]}. Ready to generate a personalized video director contract.`);
  }

  function applySample(index: number) {
    const sample = VIDEO_DIRECTOR_LAB_SAMPLES[index];
    if (!sample) return;
    const context = sample.context;
    setLearnerMessage(context.learner_message);
    setTopicLabel(context.learning_context.topic_label ?? "");
    setDiagnosisLabel(context.learning_context.diagnosis_label ?? "unknown");
    setRootProblem(context.learning_context.root_problem ?? "");
    setMisconceptionTarget(context.learning_context.misconception_target ?? "");
    setBridgeLevel(context.learning_context.bridge_level);
    setPriorAttemptSummary(context.learning_context.prior_attempt_summary ?? "");
    setInterests(context.personalization_profile.interests.join(", "));
    setProfileSummary(context.personalization_profile.profile_summary ?? "");
    const fallbackDirector = buildFallbackVideoDirectorContract(context);
    setDirectorContract(fallbackDirector);
    setContract(buildFallbackUniversalSceneContract(context.learner_message));
    setSource("deterministic");
    setLastPayload({ ok: true, source: "sample", context });
    setLastError(null);
    setStatus(`Loaded sample: ${sample.label}. Generate to ask the selected model for a custom director plan.`);
  }

  function useDeterministicFallback() {
    const fallback = buildFallbackUniversalSceneContract(requestContext.learner_message);
    const directorFallback = buildFallbackVideoDirectorContract(requestContext);
    setContract(fallback);
    setDirectorContract(directorFallback);
    setSource("deterministic");
    setLastError(null);
    setLastPayload({ ok: true, source: "deterministic", contract: fallback, director_contract: directorFallback, context: requestContext });
    setStatus("Showing deterministic MyWay fallback contracts. This tests the generic 3D renderer without calling a model.");
  }

  async function generateWithProvider() {
    setIsGenerating(true);
    setLastError(null);

    const providerLabel = PROVIDER_LABELS[provider];
    setStatus(`Asking ${providerLabel} (${modelName}) to create a personalized video director plan plus 2D fallback scene...`);

    try {
      const response = await fetch("/api/probe-lab/generated-video/universal-scene-contract", {
        cache: "no-store",
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          provider,
          model: modelName,
          ...requestContext,
          learner_signal: requestContext.learner_message,
        }),
      });

      const data = (await response.json()) as UniversalSceneResponse;
      setLastPayload(data);
      setContract(data.contract);
      setDirectorContract(data.director_contract);

      if (data.ok) {
        const successfulProvider = data.provider ?? provider;
        setSource(successfulProvider);
        setLastError(null);
        setStatus(data.warnings?.join("\n") || `${providerLabel} generated a director contract and MyWay rendered the 3D/hybrid preview.`);
      } else {
        setSource("deterministic");
        setLastError(data.error ?? `Unknown ${providerLabel} route error`);
        setStatus(
          `${providerLabel} route returned ok=false:\n${JSON.stringify(
            {
              error: data.error,
              warnings: data.warnings,
              debug: data.debug,
            },
            null,
            2,
          ).slice(0, 3000)}`,
        );
      }
    } catch (error) {
      console.error("[myway-universal-scene-ui]", error);
      const fallback = buildFallbackUniversalSceneContract(requestContext.learner_message);
      const directorFallback = buildFallbackVideoDirectorContract(requestContext);
      setContract(fallback);
      setDirectorContract(directorFallback);
      setSource("deterministic");
      setLastError(error instanceof Error ? error.message : "Unknown client error");
      setLastPayload({ ok: false, source: "client_catch", error: error instanceof Error ? error.message : String(error), context: requestContext });
      setStatus("Client fetch failed. Showing deterministic director fallback so the 3D renderer still works.");
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[460px_minmax(0,1fr)]">
      <aside style={{ ...shellStyle, padding: "1rem" }}>
        <div style={{ display: "grid", gap: "1rem" }}>
          <Field label="Sample contexts">
            <div style={{ display: "grid", gap: "0.45rem" }}>
              {VIDEO_DIRECTOR_LAB_SAMPLES.map((sample, index) => (
                <button
                  key={sample.label}
                  type="button"
                  onClick={() => applySample(index)}
                  style={{
                    textAlign: "left",
                    border: sample.context.learner_message === learnerMessage ? "1px solid rgba(221,214,254,0.34)" : "1px solid rgba(255,255,255,0.1)",
                    borderRadius: "1rem",
                    background: sample.context.learner_message === learnerMessage ? "rgba(221,214,254,0.14)" : "rgba(255,255,255,0.045)",
                    color: "rgba(255,255,255,0.82)",
                    padding: "0.64rem 0.72rem",
                    lineHeight: 1.35,
                    cursor: "pointer",
                    fontSize: "0.8rem",
                    fontWeight: 800,
                  }}
                >
                  {sample.label}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Learner message or attempt">
            <textarea
              value={learnerMessage}
              onChange={(event) => setLearnerMessage(event.target.value)}
              rows={5}
              placeholder="Type a real MyWay learner message or attempt..."
              style={{ ...textInputStyle(), resize: "vertical" }}
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Topic label">
              <input value={topicLabel} onChange={(event) => setTopicLabel(event.target.value)} style={textInputStyle()} />
            </Field>
            <Field label="Diagnosis">
              <select value={diagnosisLabel} onChange={(event) => setDiagnosisLabel(event.target.value as VideoDirectorDiagnosisLabel)} style={textInputStyle()}>
                {DIAGNOSIS_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </Field>
          </div>

          <Field label="Root problem">
            <textarea value={rootProblem} onChange={(event) => setRootProblem(event.target.value)} rows={3} style={{ ...textInputStyle(), resize: "vertical" }} />
          </Field>

          <Field label="Misconception target">
            <textarea value={misconceptionTarget} onChange={(event) => setMisconceptionTarget(event.target.value)} rows={2} style={{ ...textInputStyle(), resize: "vertical" }} />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Bridge level">
              <select value={bridgeLevel} onChange={(event) => setBridgeLevel(event.target.value as VideoDirectorBridgeLevel)} style={textInputStyle()}>
                {BRIDGE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </Field>
            <Field label="Interests">
              <input value={interests} onChange={(event) => setInterests(event.target.value)} style={textInputStyle()} />
            </Field>
          </div>

          <Field label="Prior attempt summary">
            <textarea value={priorAttemptSummary} onChange={(event) => setPriorAttemptSummary(event.target.value)} rows={2} placeholder="Optional: what happened on the last attempt?" style={{ ...textInputStyle(), resize: "vertical" }} />
          </Field>

          <Field label="Profile summary">
            <textarea value={profileSummary} onChange={(event) => setProfileSummary(event.target.value)} rows={2} style={{ ...textInputStyle(), resize: "vertical" }} />
          </Field>

          <Field label="Model provider">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.55rem" }}>
              <ProviderButton provider="nvidia" selected={provider === "nvidia"} onSelect={() => selectProvider("nvidia")} />
              <ProviderButton provider="ollama" selected={provider === "ollama"} onSelect={() => selectProvider("ollama")} />
            </div>
          </Field>

          <Field label="Model name">
            <input value={modelName} onChange={(event) => setModelName(event.target.value)} style={{ ...textInputStyle(), borderRadius: "999px", fontWeight: 850 }} />
          </Field>

          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.6rem" }}>
            <ActionButton disabled={isGenerating} onClick={useDeterministicFallback}>Fallback director</ActionButton>
            <ActionButton disabled={isGenerating} onClick={generateWithProvider} variant="primary">
              {isGenerating ? "Generating..." : `Generate with ${PROVIDER_LABELS[provider]}`}
            </ActionButton>
          </div>

          <section style={{ display: "grid", gap: "0.6rem", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "1.25rem", background: "rgba(255,255,255,0.055)", padding: "0.85rem" }}>
            <TinyLabel>Status</TinyLabel>
            <pre style={{ margin: 0, whiteSpace: "pre-wrap", color: lastError ? "#fecaca" : "rgba(255,255,255,0.78)", fontSize: "0.8rem", lineHeight: 1.45, fontFamily: "inherit" }}>
              {status}
            </pre>
          </section>

          <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.55rem" }}>
            <StatCard label="provider" value={PROVIDER_LABELS[provider]} />
            <StatCard label="source" value={source} />
            <StatCard label="3D kind" value={directorContract.renderer_intent.scene_kind} />
            <StatCard label="2D duration" value={`${Math.round(durationInFrames / contract.format.fps)}s`} />
          </section>
        </div>
      </aside>

      <section style={{ ...shellStyle, overflow: "hidden" }}>
        <div style={{ display: "grid", gap: "1rem", padding: "1rem" }}>
          <section style={{ display: "grid", gap: "0.85rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "end", flexWrap: "wrap" }}>
              <div>
                <TinyLabel>Hybrid 3D director preview</TinyLabel>
                <h2 style={{ margin: "0.35rem 0 0", color: "white", fontSize: "1.3rem", lineHeight: 1.2 }}>{directorContract.title}</h2>
              </div>
              <ActionButton onClick={() => setShowFallback2D((value) => !value)}>
                {showFallback2D ? "Hide 2D fallback" : "Show 2D fallback"}
              </ActionButton>
            </div>
            <GeneratedVideo3DPlayer contract={directorContract} />
          </section>

          {showFallback2D ? (
            <section style={{ display: "grid", gap: "0.75rem" }}>
              <TinyLabel>Trusted Remotion/SVG fallback scene</TinyLabel>
              <div style={{ position: "relative", overflow: "hidden", borderRadius: "1.55rem", border: "1px solid rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.32)" }}>
                <Player
                  component={UniversalSceneRemotionComposition}
                  inputProps={inputProps}
                  durationInFrames={durationInFrames}
                  compositionWidth={contract.format.width}
                  compositionHeight={contract.format.height}
                  fps={contract.format.fps}
                  controls
                  loop
                  style={{ width: "100%" }}
                />
              </div>
            </section>
          ) : null}

          <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <section style={{ display: "grid", gap: "0.75rem", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "1.4rem", background: "rgba(255,255,255,0.055)", padding: "1rem" }}>
              <TinyLabel>Model-created director plan</TinyLabel>
              <p style={{ margin: 0, color: "rgba(255,255,255,0.72)", lineHeight: 1.55 }}>{directorContract.creative_brief.why_this_should_unstick_the_learner}</p>
              <div style={{ border: "1px solid rgba(255,255,255,0.08)", borderRadius: "1rem", background: "rgba(0,0,0,0.14)", padding: "0.75rem" }}>
                <TinyLabel>Aha moment</TinyLabel>
                <p style={{ margin: "0.35rem 0 0", color: "rgba(255,255,255,0.82)", lineHeight: 1.45, fontSize: "0.9rem", fontWeight: 850 }}>{directorContract.creative_brief.aha_moment}</p>
              </div>
              <div style={{ display: "grid", gap: "0.5rem" }}>
                {directorContract.beats.map((beat, index) => (
                  <div key={beat.id} style={{ border: "1px solid rgba(255,255,255,0.08)", borderRadius: "1rem", background: "rgba(0,0,0,0.16)", padding: "0.75rem" }}>
                    <p style={{ margin: 0, color: "white", fontWeight: 900 }}>{index + 1}. {beat.purpose}</p>
                    <p style={{ margin: "0.28rem 0 0", color: "rgba(255,255,255,0.68)", lineHeight: 1.45, fontSize: "0.86rem" }}>{beat.expected_realization}</p>
                  </div>
                ))}
              </div>
            </section>

            <section style={{ border: "1px solid rgba(255,255,255,0.1)", borderRadius: "1.4rem", background: "rgba(255,255,255,0.055)", padding: "1rem" }}>
              <TinyLabel>Video director contract JSON</TinyLabel>
              <pre style={{ margin: "0.75rem 0 0", maxHeight: "42rem", overflow: "auto", whiteSpace: "pre-wrap", color: "rgba(255,255,255,0.76)", fontSize: "0.72rem", lineHeight: 1.45 }}>
                {JSON.stringify(directorContract, null, 2)}
              </pre>
            </section>
          </div>

          {lastPayload ? (
            <section style={{ border: "1px solid rgba(255,255,255,0.1)", borderRadius: "1.4rem", background: "rgba(255,255,255,0.045)", padding: "1rem" }}>
              <TinyLabel>Last route payload</TinyLabel>
              <pre style={{ margin: "0.75rem 0 0", maxHeight: "18rem", overflow: "auto", whiteSpace: "pre-wrap", color: "rgba(255,255,255,0.64)", fontSize: "0.7rem", lineHeight: 1.42 }}>
                {JSON.stringify(lastPayload, null, 2)}
              </pre>
            </section>
          ) : null}
        </div>
      </section>
    </div>
  );
}

export function UniversalSceneRemotionLab() {
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  if (!hasMounted) {
    return (
      <div
        style={{
          display: "grid",
          placeItems: "center",
          minHeight: "28rem",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: "2rem",
          background: "radial-gradient(circle at top left, rgba(168,85,247,0.2), transparent 34%), rgba(0,0,0,0.2)",
          color: "rgba(255,255,255,0.78)",
          fontWeight: 850,
        }}
      >
        Loading video director + 3D renderer sandbox.
      </div>
    );
  }

  return <UniversalSceneRemotionLabInner />;
}
