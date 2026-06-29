"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Player } from "@remotion/player";
import { UniversalSceneRemotionComposition } from "./universal-scene-remotion-composition";
import {
  buildFallbackUniversalSceneContract,
  getUniversalSceneDurationInFrames,
  type UniversalSceneContract,
} from "./universal-scene-contract";

const SAMPLE_MESSAGES = [
  "I do not understand why a baseball runner has to tag up before running after a fly ball.",
  "I do not get how money moves through a bank loan. Is the bank handing over cash or changing records?",
  "I understand x squared and y squared separately, but I do not get why x squared minus y squared makes a saddle.",
  "I keep mixing up claim and evidence in an essay.",
  "I do not understand why resistance changes current in a circuit.",
  "I know evaporation and condensation are opposites, but I keep mixing up which direction energy is moving.",
];

type GenerationProvider = "nvidia" | "ollama";
type GenerationSource = "deterministic" | GenerationProvider;

type UniversalSceneResponse = {
  ok: boolean;
  source: "nvidia" | "ollama" | "fallback";
  provider?: GenerationProvider;
  model: string;
  contract: UniversalSceneContract;
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
          ? "Hosted strong model for contract quality testing."
          : "Local model path for fallback/offline experiments."}
      </p>
    </button>
  );
}

function UniversalSceneRemotionLabInner() {
  const [learnerSignal, setLearnerSignal] = useState(SAMPLE_MESSAGES[0] ?? "I am stuck.");
  const [provider, setProvider] = useState<GenerationProvider>("nvidia");
  const [modelName, setModelName] = useState(PROVIDER_DEFAULT_MODELS.nvidia);
  const [contract, setContract] = useState<UniversalSceneContract>(() => buildFallbackUniversalSceneContract(SAMPLE_MESSAGES[0] ?? "I am stuck."));
  const [source, setSource] = useState<GenerationSource>("deterministic");
  const [status, setStatus] = useState("Ready. Choose a provider, type any MyWay-style learner message, and generate a director-level animation contract.");
  const [lastError, setLastError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [lastPayload, setLastPayload] = useState<unknown>(null);

  const durationInFrames = useMemo(() => getUniversalSceneDurationInFrames(contract), [contract]);
  const inputProps = useMemo(() => ({ contract }), [contract]);

  function selectProvider(nextProvider: GenerationProvider) {
    setProvider(nextProvider);
    setModelName(PROVIDER_DEFAULT_MODELS[nextProvider]);
    setStatus(`Selected ${PROVIDER_LABELS[nextProvider]}. Ready to generate a universal scene contract.`);
  }

  function useDeterministicFallback() {
    const fallback = buildFallbackUniversalSceneContract(learnerSignal);
    setContract(fallback);
    setSource("deterministic");
    setLastError(null);
    setLastPayload({ ok: true, source: "deterministic", contract: fallback });
    setStatus("Showing MyWay's deterministic universal-scene fallback. This uses the same generic renderer without calling a model.");
  }

  async function generateWithProvider() {
    setIsGenerating(true);
    setLastError(null);

    const providerLabel = PROVIDER_LABELS[provider];
    setStatus(`Asking ${providerLabel} (${modelName}) to create a director-level scene plan and renderable graph...`);

    try {
      const response = await fetch("/api/probe-lab/generated-video/universal-scene-contract", {
        cache: "no-store",
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          provider,
          learner_signal: learnerSignal,
          model: modelName,
        }),
      });

      const data = (await response.json()) as UniversalSceneResponse;
      setLastPayload(data);
      setContract(data.contract);

      if (data.ok) {
        const successfulProvider = data.provider ?? provider;
        setSource(successfulProvider);
        setLastError(null);
        setStatus(data.warnings?.join("\n") || `${providerLabel} generated a director scene contract and Remotion rendered it.`);
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
      const fallback = buildFallbackUniversalSceneContract(learnerSignal);
      setContract(fallback);
      setSource("deterministic");
      setLastError(error instanceof Error ? error.message : "Unknown client error");
      setLastPayload({ ok: false, source: "client_catch", error: error instanceof Error ? error.message : String(error) });
      setStatus("Client fetch failed. Showing deterministic universal-scene fallback so the renderer still works.");
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[430px_minmax(0,1fr)]">
      <aside style={{ ...shellStyle, padding: "1rem" }}>
        <div style={{ display: "grid", gap: "1rem" }}>
          <section style={{ display: "grid", gap: "0.75rem" }}>
            <TinyLabel>Learner message</TinyLabel>
            <textarea
              value={learnerSignal}
              onChange={(event) => setLearnerSignal(event.target.value)}
              rows={7}
              placeholder="Type a real MyWay learner message..."
              style={{
                width: "100%",
                resize: "vertical",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: "1.2rem",
                background: "rgba(255,255,255,0.07)",
                color: "white",
                padding: "0.85rem 0.95rem",
                lineHeight: 1.5,
                outline: "none",
              }}
            />
          </section>

          <section style={{ display: "grid", gap: "0.65rem" }}>
            <TinyLabel>Sample messages</TinyLabel>
            <div style={{ display: "grid", gap: "0.45rem" }}>
              {SAMPLE_MESSAGES.map((message) => (
                <button
                  key={message}
                  type="button"
                  onClick={() => setLearnerSignal(message)}
                  style={{
                    textAlign: "left",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: "1rem",
                    background: message === learnerSignal ? "rgba(221,214,254,0.14)" : "rgba(255,255,255,0.045)",
                    color: "rgba(255,255,255,0.82)",
                    padding: "0.65rem 0.72rem",
                    lineHeight: 1.35,
                    cursor: "pointer",
                    fontSize: "0.82rem",
                    fontWeight: 750,
                  }}
                >
                  {message}
                </button>
              ))}
            </div>
          </section>

          <section style={{ display: "grid", gap: "0.65rem" }}>
            <TinyLabel>Model provider</TinyLabel>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.55rem" }}>
              <ProviderButton provider="nvidia" selected={provider === "nvidia"} onSelect={() => selectProvider("nvidia")} />
              <ProviderButton provider="ollama" selected={provider === "ollama"} onSelect={() => selectProvider("ollama")} />
            </div>
          </section>

          <section style={{ display: "grid", gap: "0.65rem" }}>
            <TinyLabel>Model name</TinyLabel>
            <input
              value={modelName}
              onChange={(event) => setModelName(event.target.value)}
              style={{
                width: "100%",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: "999px",
                background: "rgba(255,255,255,0.07)",
                color: "white",
                padding: "0.72rem 0.9rem",
                outline: "none",
                fontWeight: 850,
              }}
            />
            <p style={{ margin: 0, color: "rgba(255,255,255,0.58)", fontSize: "0.78rem", lineHeight: 1.45 }}>
              The model writes director JSON only. MyWay validates, stabilizes layout, and Remotion renders with trusted code.
            </p>
          </section>

          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.6rem" }}>
            <ActionButton disabled={isGenerating} onClick={useDeterministicFallback}>
              Fallback scene
            </ActionButton>
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
            <StatCard label="elements" value={contract.elements.length} />
            <StatCard label="duration" value={`${Math.round(durationInFrames / contract.format.fps)}s`} />
          </section>
        </div>
      </aside>

      <section style={{ ...shellStyle, overflow: "hidden" }}>
        <div style={{ display: "grid", gap: "1rem", padding: "1rem" }}>
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

          <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <section style={{ display: "grid", gap: "0.75rem", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "1.4rem", background: "rgba(255,255,255,0.055)", padding: "1rem" }}>
              <TinyLabel>Generated plan</TinyLabel>
              <h2 style={{ margin: 0, color: "white", fontSize: "1.25rem", lineHeight: 1.2 }}>{contract.title}</h2>
              <p style={{ margin: 0, color: "rgba(255,255,255,0.72)", lineHeight: 1.55 }}>{contract.learning_goal}</p>
              {contract.director_plan ? (
                <div style={{ border: "1px solid rgba(255,255,255,0.08)", borderRadius: "1rem", background: "rgba(0,0,0,0.14)", padding: "0.75rem" }}>
                  <p style={{ margin: 0, color: "rgba(255,255,255,0.58)", fontSize: "0.72rem", fontWeight: 900, letterSpacing: "0.14em", textTransform: "uppercase" }}>Director intent</p>
                  <p style={{ margin: "0.35rem 0 0", color: "rgba(255,255,255,0.76)", lineHeight: 1.45, fontSize: "0.86rem" }}>{contract.director_plan.visual_intent}</p>
                </div>
              ) : null}
              <div style={{ display: "grid", gap: "0.5rem" }}>
                {contract.scenes.map((scene, index) => (
                  <div key={scene.id} style={{ border: "1px solid rgba(255,255,255,0.08)", borderRadius: "1rem", background: "rgba(0,0,0,0.16)", padding: "0.75rem" }}>
                    <p style={{ margin: 0, color: "white", fontWeight: 900 }}>{index + 1}. {scene.title}</p>
                    <p style={{ margin: "0.28rem 0 0", color: "rgba(255,255,255,0.68)", lineHeight: 1.45, fontSize: "0.86rem" }}>{scene.caption}</p>
                  </div>
                ))}
              </div>
            </section>

            <section style={{ border: "1px solid rgba(255,255,255,0.1)", borderRadius: "1.4rem", background: "rgba(255,255,255,0.055)", padding: "1rem" }}>
              <TinyLabel>Director scene contract JSON</TinyLabel>
              <pre style={{ margin: "0.75rem 0 0", maxHeight: "34rem", overflow: "auto", whiteSpace: "pre-wrap", color: "rgba(255,255,255,0.76)", fontSize: "0.72rem", lineHeight: 1.45 }}>
                {JSON.stringify(contract, null, 2)}
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
        Loading universal Remotion scene sandbox.
      </div>
    );
  }

  return <UniversalSceneRemotionLabInner />;
}
