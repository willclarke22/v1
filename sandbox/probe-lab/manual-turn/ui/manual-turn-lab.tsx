"use client";

import type { CSSProperties } from "react";
import { useMemo, useState } from "react";

import { ContinuousDirectorPlayer } from "./continuous-director-player";
import {
  extractResourcePlanFromLabResult,
  LabSceneRuntimePanel,
} from "../../scene-resources/ui";

const storySteps = [
  {
    id: "step_1",
    script: "The main misunderstanding is that the piston’s up-and-down motion and the wheel’s rotation seem like two separate movements. The missing link is a mechanism called the crank.",
    learning_job: "Name the learner’s disconnect and introduce the missing mechanism.",
    visual_claim: "The learner must see the piston moving vertically while the crankshaft and wheel remain rotational outputs that need a converter between them.",
    introduced_terms: [{ term: "crank", plain_language_definition: "the mechanism that changes a straight push into rotation" }],
  },
  {
    id: "step_2",
    script: "The piston pushes a metal bar called the connecting rod.",
    learning_job: "Introduce the first physical link and define its name.",
    visual_claim: "The piston and connecting rod are physically linked, so the piston’s straight movement is transferred into the rod.",
    introduced_terms: [{ term: "connecting rod", plain_language_definition: "the metal bar that carries the piston’s push" }],
  },
  {
    id: "step_3",
    script: "That rod attaches to a point on the rotating shaft called the crank pin. Crucially, the crank pin sits away from the shaft’s centre.",
    learning_job: "Introduce the off-centre attachment that makes rotation possible.",
    visual_claim: "The crank pin must be visibly offset from the crankshaft’s centre, with the rod attached to that point.",
    introduced_terms: [{ term: "crank pin", plain_language_definition: "the off-centre attachment point that the rod pushes" }],
  },
  {
    id: "step_4",
    script: "That off-centre position creates a turning effect. As the piston pushes downward, the connecting rod pushes the crank pin around the centre of the shaft. This turns the crankshaft—the main rotating shaft in the engine.",
    learning_job: "Show the causal conversion from straight motion to rotation.",
    visual_claim: "The rod’s downward push moves the offset pin along a circular path, rotating the crankshaft while the rod changes angle.",
    introduced_terms: [{ term: "crankshaft", plain_language_definition: "the main shaft that rotates inside the engine" }],
  },
  {
    id: "step_5",
    script: "So the motion chain is: piston moves up and down → connecting rod transfers the push → off-centre crank pin turns → crankshaft rotates. That rotation can then travel through the rest of the car’s drivetrain to the wheels.",
    learning_job: "Land the repaired mental model and connect it to the wheels.",
    visual_claim: "The complete piston-to-rod-to-crankshaft-to-wheel chain remains visible and animates in causal order.",
    introduced_terms: [{ term: "drivetrain", plain_language_definition: "the parts that carry engine rotation to the wheels" }],
  },
];

const fullPrompt = storySteps.map((step) => step.script).join("\n\n");

const starterJson = {
  request_context: {
    learner_message: "I understand that a piston moves up and down, but how does that make the wheels rotate?",
    bridge_level: "bridge_0",
    jargon_level: "plain_language",
    preferred_style: "visual_description",
    user_interests: ["cars", "mechanical systems"],
  },
  semantic_draft: {
    schema_version: "myway_visual_learning_semantic_draft_v2",
    turn_status: "proceed",
    clarification: {
      question: null,
      reason: "The learner’s topic and goal are clear.",
      confidence: { overall: 0.98, topic: 0.99, learner_goal: 0.98 },
    },
    topic_label: "How piston motion becomes wheel rotation",
    diagnosis: {
      label: "representation_gap",
      confidence: 0.96,
      reason: "The learner sees both motions but not the mechanism that connects them.",
    },
    diagnostic_signal: {
      confusion: { score: 0.82, confidence: 0.92 },
      insight: { score: 0.36, confidence: 0.78 },
      pattern_candidates: [
        {
          id: "piston_missing_cause_chain",
          kind: "confusion",
          shared_label: "missing_cause_chain",
          short_explanation: "The learner sees the input and output motions but not the converter between them.",
          evidence: "They contrast up-and-down motion with rotation and ask how one becomes the other.",
          confidence: 0.94,
        },
      ],
    },
    learning_focus: {
      misunderstanding: "The piston’s up-and-down motion and the wheel’s rotation seem like two separate movements.",
      target_understanding: "The connecting rod and off-centre crank pin convert the piston’s straight movement into crankshaft rotation, which can then reach the wheels.",
    },
    learner_facing_prompt: {
      title: "How a piston creates rotation",
      full_prompt: fullPrompt,
      story_steps: storySteps,
      explanation_pieces: storySteps.map((step) => ({
        id: step.id,
        role: step.learning_job,
        text: step.script,
      })),
      what_to_watch_for: [
        "The rod stays connected to the piston and crank pin",
        "The crank pin is visibly off-centre",
        "The rod changes angle as the crank rotates",
      ],
      tone: "clear_teacher_story",
    },
    scene: {
      title: "The missing link between piston and wheel",
      entities: [
        {
          id: "piston",
          display_name: "Piston",
          semantic_role: "straight-line input",
          visual_need: { description: "a piston moving vertically in a cylinder", semantic_tags: ["piston", "engine", "vertical motion"], preferred_render_kind: "box" },
        },
        {
          id: "rod",
          display_name: "Connecting rod",
          semantic_role: "force-transferring link",
          visual_need: { description: "a rigid rod attached to the piston and crank pin", semantic_tags: ["connecting rod", "linkage"], preferred_render_kind: "arrow" },
        },
        {
          id: "crank",
          display_name: "Crankshaft",
          semantic_role: "rotating output with off-centre pin",
          visual_need: { description: "a crankshaft with a clear centre and offset crank pin", semantic_tags: ["crankshaft", "crank pin", "rotation"], preferred_render_kind: "path" },
        },
        {
          id: "wheel",
          display_name: "Wheel",
          semantic_role: "downstream rotational output",
          visual_need: { description: "a vehicle wheel receiving transmitted rotation", semantic_tags: ["wheel", "rotation"], preferred_render_kind: "path" },
        },
      ],
      relationships: [
        { id: "piston_rod", source_entity_id: "piston", target_entity_ids: ["rod"], relationship_type: "connects_to", explanation: "The piston pushes the rod." },
        { id: "rod_crank", source_entity_id: "rod", target_entity_ids: ["crank"], relationship_type: "causes", explanation: "The rod pushes the off-centre crank pin." },
        { id: "crank_wheel", source_entity_id: "crank", target_entity_ids: ["wheel"], relationship_type: "causes", explanation: "Rotation travels toward the wheel." },
      ],
      director_plan: {
        schema_version: "myway_educational_scene_director_v1",
        title: "The explanation comes alive",
        scene_thesis: "Every visual moment must prove the exact sentence currently shown to the learner.",
        learner_takeaway: "An off-centre crank linkage converts the piston’s straight motion into rotation.",
        representation_strategy: {
          primary_mode: "mechanistic_cutaway",
          secondary_modes: ["diagrammatic_abstraction"],
          reason: "A simplified cutaway keeps the changing geometry visible.",
          fidelity_priority: "causal_clarity",
        },
        style: {
          look: "clean technical cutaway",
          mood: "clear and calm",
          continuity: "Keep the crank centre and offset pin visible once introduced.",
          attention_policy: "One sentence and one visual job at a time.",
        },
        moments: storySteps.map((step, index) => ({
          id: `moment_${index + 1}`,
          title: step.learning_job,
          story_step_id: step.id,
          source_explanation_piece_ids: [step.id],
          learning_job: step.learning_job,
          director_intent: step.visual_claim,
          duration_ms: index === 3 ? 5200 : 4000,
          phase_timing: { enter_ms: 350, establish_ms: 550, act_ms: index === 3 ? 3000 : 2100, reveal_result_ms: 450, hold_ms: 450, transition_ms: 300 },
          introduces_entity_ids:
            index === 0 ? ["piston", "crank", "wheel"] :
            index === 1 ? ["rod"] :
            index === 2 ? [] :
            [],
          keeps_visible_entity_ids:
            index === 0 ? [] : ["piston", "rod", "crank"],
          active_entity_ids:
            index === 0 ? ["piston", "crank", "wheel"] :
            index === 1 ? ["piston", "rod"] :
            index === 2 ? ["rod", "crank"] :
            index === 3 ? ["piston", "rod", "crank"] :
            ["piston", "rod", "crank", "wheel"],
          camera: {
            shot_type: index === 2 ? "close_up" : index === 4 ? "wide" : "medium_close",
            movement: index === 0 ? "static" : index === 2 ? "dolly_in" : index === 4 ? "pull_out" : "track",
            focus_entity_ids:
              index === 0 ? ["piston", "crank", "wheel"] :
              index === 1 ? ["piston", "rod"] :
              index === 2 ? ["rod", "crank"] :
              index === 3 ? ["piston", "rod", "crank"] :
              ["piston", "rod", "crank", "wheel"],
            framing_intent: step.visual_claim,
            keep_visible_entity_ids: index >= 2 ? ["crank"] : [],
            avoid_occlusion_entity_ids: ["rod", "crank"],
            reserve_text_space: "lower_third",
            transition: index === 0 ? "cut" : "smooth_blend",
            attention_sequence: index === 0 ? ["piston motion", "stationary rotational output", "missing converter"] : index === 2 ? ["rod attachment", "shaft centre", "offset distance"] : [step.learning_job],
            end_condition: step.visual_claim,
          },
          timed_text: {
            text: step.script,
            start_ms: 250,
            end_ms: index === 3 ? 4850 : 3650,
            placement: "lower_third",
          },
          events:
            index === 0 ? [
              { id: "show_disconnect", behaviour: "show_entity", actor_entity_id: "piston", supporting_entity_ids: ["crank", "wheel"], start_ms: 300, duration_ms: 700, easing: "gentle_reveal", description: "Show the vertical piston separately from the rotational outputs." },
              { id: "piston_slide", behaviour: "slide", actor_entity_id: "piston", start_ms: 1200, duration_ms: 1800, easing: "instructional_smooth", path_hint: "vertical", description: "Move the piston vertically while the crank and wheel remain still." },
            ] : index === 1 ? [
              { id: "reveal_rod", behaviour: "show_entity", actor_entity_id: "rod", supporting_entity_ids: ["piston"], start_ms: 500, duration_ms: 800, easing: "gentle_reveal", description: "Reveal the connecting rod attached to the piston." },
              { id: "label_rod", behaviour: "show_label", actor_entity_id: "rod", start_ms: 1300, duration_ms: 1500, easing: "gentle_reveal", description: "Label the rod only when the term is introduced." },
            ] : index === 2 ? [
              { id: "highlight_pin", behaviour: "highlight_entity", actor_entity_id: "crank", supporting_entity_ids: ["rod"], start_ms: 500, duration_ms: 1700, easing: "instructional_smooth", description: "Highlight the offset crank pin and its distance from the shaft centre." },
              { id: "show_offset", behaviour: "trace_path", actor_entity_id: "crank", start_ms: 1700, duration_ms: 1400, easing: "mechanical_precise", path_hint: "radius from shaft centre to crank pin", description: "Trace the offset that creates the turning arm." },
            ] : index === 3 ? [
              { id: "piston_reciprocates", behaviour: "oscillate", fallback_behaviour: "slide", actor_entity_id: "piston", start_ms: 500, duration_ms: 3300, easing: "mechanical_precise", path_hint: "vertical reciprocation", description: "Move the piston down and back up." },
              { id: "rod_linkage", behaviour: "two_point_linkage", fallback_behaviour: "rotate", actor_entity_id: "rod", target_entity_id: "crank", supporting_entity_ids: ["piston"], start_ms: 500, duration_ms: 3300, easing: "mechanical_precise", description: "Keep the rod attached at both ends while its angle changes." },
              { id: "crank_rotates", behaviour: "rotate", actor_entity_id: "crank", start_ms: 500, duration_ms: 3300, easing: "mechanical_precise", description: "Rotate the crankshaft through one complete cycle." },
              { id: "trace_pin_circle", behaviour: "trace_path", actor_entity_id: "crank", start_ms: 700, duration_ms: 3000, easing: "mechanical_precise", path_hint: "circular path around shaft centre", description: "Trace the crank pin’s circular path." },
            ] : [
              { id: "chain_highlight", behaviour: "show_relationship", actor_entity_id: "piston", target_entity_id: "wheel", supporting_entity_ids: ["rod", "crank"], start_ms: 500, duration_ms: 2100, easing: "instructional_smooth", description: "Highlight the complete causal chain in order." },
              { id: "wheel_rotates", behaviour: "rotate", actor_entity_id: "wheel", start_ms: 1600, duration_ms: 1700, easing: "instructional_smooth", description: "Rotate the wheel only after crankshaft rotation is established." },
            ],
          success_observation: step.visual_claim,
        })),
        global_text_policy: {
          source: "learner_facing_prompt.story_steps[].script",
          exact_script_required: true,
          progressive_reveal: true,
          avoid_covering_core_motion: true,
          prefer_object_anchored_text: false,
        },
        execution_policy: {
          direction_survives_missing_assets: true,
          preserve_entity_ids_for_late_binding: true,
          asset_resolution_owner: "myway",
          renderer_compiles_behaviours: true,
          allow_abstract_proxy_until_asset_ready: true,
        },
      },
    },
    guided_interaction: {
      instruction: "Scrub through the story and check that each sentence is visibly proven.",
      required_action_type: "scrub_beats",
      target_entity_ids: ["piston", "rod", "crank", "wheel"],
      success_observation: "The learner can trace the full motion chain and explain why the crank pin is off-centre.",
    },
    probe: {
      probe_type: "single_choice",
      question: "Why does the crank pin sit away from the crankshaft’s centre?",
      full_prompt: "Choose the answer that best matches the motion story you just watched.",
      options: [
        { id: "a", text: "The offset lets the rod’s straight push create a turning effect around the shaft’s centre." },
        { id: "b", text: "The offset makes the piston stop moving when the wheel turns." },
        { id: "c", text: "The offset makes room for the vehicle wheel inside the engine." },
      ],
      correct_option_id: "a",
      expected_ideas: ["off-centre force", "turning effect", "rotation around the shaft centre"],
      misconception_markers: [],
      what_it_measures: "Whether the learner understands the mechanism that converts straight motion into rotation.",
    },
    confidence: { overall: 0.97, prompt: 0.98, scene: 0.96, probe: 0.96 },
  },
};

type JsonObject = Record<string, unknown>;
function asRecord(value: unknown): JsonObject | null { return value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : null; }
function Panel({ title, children }: { title: string; children: React.ReactNode }) { return <section style={panelStyle}><h2 style={{ margin: 0, fontSize: 18 }}>{title}</h2>{children}</section>; }
function JsonPanel({ title, value }: { title: string; value: unknown }) { return <Panel title={title}><pre style={preStyle}>{JSON.stringify(value ?? null, null, 2)}</pre></Panel>; }

function ScriptPanel({ result }: { result: JsonObject | null }) {
  const learnerScript = asRecord(result?.learner_script);
  const steps = Array.isArray(learnerScript?.story_steps) ? learnerScript.story_steps : storySteps;
  return <Panel title="Canonical learner script">
    <p style={{ margin: 0, color: "rgba(255,255,255,0.68)", lineHeight: 1.55 }}>This is the exact script the visualization should display and prove, step by step.</p>
    <div style={{ display: "grid", gap: 10 }}>
      {steps.map((value, index) => {
        const step = asRecord(value) ?? {};
        return <div key={String(step.id ?? index)} style={scriptStepStyle}>
          <div style={{ color: "#7dd3fc", fontSize: 12, fontWeight: 900 }}>STEP {index + 1}</div>
          <div style={{ lineHeight: 1.6 }}>{String(step.script ?? "")}</div>
          <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 12 }}>{String(step.learning_job ?? "")}</div>
        </div>;
      })}
    </div>
  </Panel>;
}

export function ManualTurnLab() {
  const [source, setSource] = useState(() => JSON.stringify(starterJson, null, 2));
  const [result, setResult] = useState<JsonObject | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const parsedPreview = useMemo(() => { try { return JSON.parse(source) as unknown; } catch { return null; } }, [source]);

  function formatJson() { try { setSource(JSON.stringify(JSON.parse(source), null, 2)); setParseError(null); } catch (error) { setParseError(error instanceof Error ? error.message : String(error)); } }
  async function renderManualTurn() {
    setRequestError(null); setParseError(null); let parsed: unknown;
    try { parsed = JSON.parse(source); } catch (error) { setParseError(error instanceof Error ? error.message : String(error)); return; }
    setIsRunning(true);
    try {
      const response = await fetch("/api/sandbox/probe-lab/manual-turn/render", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(parsed) });
      const payload = await response.json() as JsonObject;
      if (!response.ok || payload.ok !== true) throw new Error(String(payload.error ?? `Request failed with ${response.status}`));
      setResult(payload);
    } catch (error) { setRequestError(error instanceof Error ? error.message : String(error)); } finally { setIsRunning(false); }
  }

  const diagnostics = asRecord(result?.diagnostics);
  const resolved = asRecord(result?.resolved);
  const sourceShape = String(result?.detected_source_shape ?? "not run");
  const sharedResourcePlan =
    extractResourcePlanFromLabResult(result);

  return <main style={{ minHeight: "100vh", background: "radial-gradient(circle at top, #172554 0, #07111f 42%, #030712 100%)", color: "white", padding: 28 }}>
    <div style={{ width: "min(1640px, 100%)", margin: "0 auto", display: "grid", gap: 20 }}>
      <header><div style={{ color: "#7dd3fc", fontWeight: 900, letterSpacing: "0.16em", textTransform: "uppercase", fontSize: 12 }}>MyWay Probe Lab</div><h1 style={{ margin: "8px 0", fontSize: "clamp(2rem, 4vw, 4rem)" }}>Manual Turn Lab</h1><p style={{ maxWidth: 1100, margin: 0, color: "rgba(255,255,255,0.72)", lineHeight: 1.65 }}>The exact full prompt now drives phrase cues, one continuous master timeline, constraint-aware motion direction, continuous camera choreography, and synchronized transcript highlighting.</p></header>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(390px, 0.92fr) minmax(560px, 1.38fr)", gap: 18, alignItems: "start" }}>
        <Panel title="Manual JSON input"><textarea value={source} onChange={(event) => setSource(event.target.value)} spellCheck={false} style={textareaStyle} /><div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}><button onClick={renderManualTurn} disabled={isRunning} style={primaryButtonStyle}>{isRunning ? "Rendering…" : "Validate + render"}</button><button onClick={formatJson} style={buttonStyle}>Format JSON</button><button onClick={() => { setSource(JSON.stringify(starterJson, null, 2)); setResult(null); setParseError(null); setRequestError(null); }} style={buttonStyle}>Load 1:1 story example</button><button onClick={() => { setSource(""); setResult(null); }} style={buttonStyle}>Clear</button></div>{parseError ? <pre style={errorStyle}>JSON parse error: {parseError}</pre> : null}{requestError ? <pre style={errorStyle}>{requestError}</pre> : null}<div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}><span style={pillStyle}>{parsedPreview ? "JSON parses" : "Waiting for valid JSON"}</span><span style={pillStyle}>source: {sourceShape}</span>{diagnostics ? <span style={pillStyle}>1:1 story: {String(diagnostics.story_one_to_one_valid ?? false)}</span> : null}{diagnostics ? <span style={pillStyle}>bindings: {String(diagnostics.render_binding_count ?? 0)}</span> : null}</div></Panel>
        <div style={{ display: "grid", gap: 18 }}><Panel title="Live MyWay output">{result ? <ContinuousDirectorPlayer result={result} /> : <div style={{ minHeight: 620, borderRadius: 18, border: "1px dashed rgba(255,255,255,0.18)", display: "grid", placeItems: "center", color: "rgba(255,255,255,0.55)", padding: 28, textAlign: "center" }}>Select Validate + render to play the canonical story-driven example.</div>}</Panel><ScriptPanel result={result} /></div>
      </div>
      <LabSceneRuntimePanel
        source="manual_turn"
        resourcePlan={sharedResourcePlan}
        heading="Manual Turn reviewed-resource runtime"
      />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))", gap: 18 }}>
        <JsonPanel title="1:1 story-to-scene audit" value={result?.story_sync ?? null} />
        <JsonPanel title="Authoring quality + motion/camera audit" value={result?.quality_audit ?? null} />
        <JsonPanel title="Canonical story contract" value={result?.story_contract ?? null} />
        <JsonPanel title="1. Model-authored semantic draft" value={result?.semantic_draft ?? (asRecord(parsedPreview)?.semantic_draft ?? null)} />
        <JsonPanel title="2. MyWay assembly report" value={result?.assembly ?? null} />
        <JsonPanel title="3. Assembled strict output" value={result?.assembled_output ?? null} />
        <JsonPanel title="Continuous cinematic timeline" value={result?.cinematic_timeline ?? null} />
        <JsonPanel title="Christopher Nolan direction contract" value={result?.cinematic_director_contract ?? null} />
        <JsonPanel title="Canonical director plan" value={result?.director_plan ?? null} />
        <JsonPanel title="MyWay-derived compatibility scene" value={result?.compatibility_scene ?? null} />
        <JsonPanel title="Validation, bindings, and unresolved needs" value={{ diagnostics, validation: asRecord(resolved?.validation), render_bindings: resolved?.render_bindings, queued_asset_needs: resolved?.queued_asset_needs }} />
        <JsonPanel title="Raw pasted output" value={result?.raw_output ?? parsedPreview} />
      </div>
    </div>
  </main>;
}

const panelStyle: CSSProperties = { display: "grid", gap: 14, padding: 18, borderRadius: 22, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(5,12,28,0.76)", boxShadow: "0 24px 80px rgba(0,0,0,0.25)", minWidth: 0 };
const textareaStyle: CSSProperties = { width: "100%", minHeight: 760, resize: "vertical", borderRadius: 16, border: "1px solid rgba(125,211,252,0.28)", background: "#020617", color: "#dbeafe", padding: 16, fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace", fontSize: 12, lineHeight: 1.55, boxSizing: "border-box" };
const preStyle: CSSProperties = { margin: 0, maxHeight: 560, overflow: "auto", whiteSpace: "pre-wrap", overflowWrap: "anywhere", borderRadius: 14, background: "#020617", border: "1px solid rgba(255,255,255,0.08)", padding: 14, color: "#dbeafe", fontSize: 11, lineHeight: 1.55 };
const buttonStyle: CSSProperties = { border: "1px solid rgba(255,255,255,0.15)", borderRadius: 12, padding: "10px 14px", background: "rgba(255,255,255,0.08)", color: "white", cursor: "pointer", fontWeight: 800 };
const primaryButtonStyle: CSSProperties = { ...buttonStyle, background: "linear-gradient(135deg, #0284c7, #2563eb)", borderColor: "rgba(125,211,252,0.7)" };
const pillStyle: CSSProperties = { borderRadius: 999, padding: "6px 9px", background: "rgba(125,211,252,0.1)", border: "1px solid rgba(125,211,252,0.2)", color: "#bae6fd", fontSize: 12 };
const errorStyle: CSSProperties = { ...preStyle, maxHeight: 180, color: "#fecaca", background: "rgba(127,29,29,0.28)" };
const scriptStepStyle: CSSProperties = { display: "grid", gap: 6, padding: 12, borderRadius: 14, border: "1px solid rgba(125,211,252,0.14)", background: "rgba(2,6,23,0.58)" };
export default ManualTurnLab;
