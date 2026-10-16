"use client";

import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  CreativeVisualThesisRequest,
  CreativeVisualThesisRunResponse,
} from "../creative-thesis/contracts";

const GSAP_CDN_URL = "https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/gsap.min.js";
const PARENT_CHANNEL = "myway-gsap-story-parent-v1";
const RUNTIME_CHANNEL = "myway-gsap-story-runtime-v1";
const CREATIVE_THESIS_ENDPOINT = "/api/sandbox/probe-lab/visual-experience/creative-thesis";

const DEFAULT_CREATIVE_BRIEF: CreativeVisualThesisRequest = {
  learner_message:
    "Spanish sentences like ‘Se me cayó el vaso’ feel backwards even when I know the words.",
  root_problem:
    "The learner over-relies on English-like linear word position to infer semantic roles and does not yet automatically use Spanish grammatical markers to reconstruct the underlying event structure.",
  current_strategy:
    "Translate each word into English, rearrange it into familiar English order, then infer the meaning.",
  failure_mode:
    "Clitics, omitted subjects, and non-English event packaging make role assignment unstable and overload working memory.",
  target_learning_delta:
    "Spanish grammatical cues should directly evoke a stable event structure before an English translation is built.",
  teaching_signals:
    "Explicit relationship mapping helps. I usually understand once the relationships are explained, but I want intuitive recognition rather than another memorized grammar rule. Spatial and visual representations are promising.",
  prior_response_evidence:
    "The learner strongly recognized this root-problem diagnosis as matching the real difficulty.",
  profile_summary:
    "Prefer intuitive visual explanations that expose hidden relationships before formal terminology. Avoid rote memorization and unnecessary jargon.",
  interests: "video games, sports, painting, languages, psychology",
  model: "z-ai/glm-5.3",
  reasoning_effort: "max",
  candidate_count: 1,
};

const DEFAULT_STORY_CODE = `// MyWay 2D Story Lab example
// Available globals: stage, gsap, story
// Give the main timeline to story.timeline so the lab controls can pause/restart it.

stage.innerHTML = \`
<svg viewBox="0 0 1600 900" width="100%" height="100%" role="img" aria-label="Spanish role assignment story">
  <defs>
    <linearGradient id="story-bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#f8fbff" />
      <stop offset="100%" stop-color="#eef8ff" />
    </linearGradient>
    <filter id="soft-shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="10" stdDeviation="14" flood-color="#24496b" flood-opacity="0.14" />
    </filter>
    <marker id="blue-arrow" markerWidth="12" markerHeight="12" refX="10" refY="6" orient="auto">
      <path d="M0,0 L12,6 L0,12 z" fill="#4d8fe8" />
    </marker>
    <marker id="purple-arrow" markerWidth="12" markerHeight="12" refX="10" refY="6" orient="auto">
      <path d="M0,0 L12,6 L0,12 z" fill="#8b65e8" />
    </marker>
  </defs>
  <rect width="1600" height="900" fill="url(#story-bg)" />
  <circle cx="1450" cy="110" r="120" fill="#e2f1ff" opacity="0.9" />
  <circle cx="125" cy="805" r="100" fill="#e6faee" opacity="0.8" />

  <g id="title-scene">
    <text x="90" y="92" font-family="Inter, Arial, sans-serif" font-size="48" font-weight="800" fill="#17324d">Why does Spanish feel “backwards”?</text>
    <text x="92" y="133" font-family="Inter, Arial, sans-serif" font-size="22" fill="#58728a">The words are familiar. The relationships are what your brain is still learning to see.</text>
  </g>

  <g id="english-scene" filter="url(#soft-shadow)">
    <rect x="90" y="205" width="610" height="250" rx="30" fill="#ffffff" />
    <text x="125" y="252" font-family="Inter, Arial, sans-serif" font-size="28" font-weight="800" fill="#17324d">Your English shortcut</text>
    <text x="125" y="287" font-family="Inter, Arial, sans-serif" font-size="18" fill="#58728a">Position usually tells you who did what.</text>
    <g id="english-roles">
      <rect x="130" y="330" width="140" height="58" rx="18" fill="#e7f1ff" />
      <text x="200" y="366" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="20" font-weight="800" fill="#3278d5">SUBJECT</text>
      <rect x="325" y="330" width="140" height="58" rx="18" fill="#f0ebff" />
      <text x="395" y="366" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="20" font-weight="800" fill="#825bd8">VERB</text>
      <rect x="520" y="330" width="140" height="58" rx="18" fill="#e8faef" />
      <text x="590" y="366" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="20" font-weight="800" fill="#269b62">OBJECT</text>
      <path d="M275 359 L315 359" stroke="#87aee2" stroke-width="5" marker-end="url(#blue-arrow)" />
      <path d="M470 359 L510 359" stroke="#87aee2" stroke-width="5" marker-end="url(#blue-arrow)" />
    </g>
    <text x="130" y="425" font-family="Inter, Arial, sans-serif" font-size="28" font-weight="800">
      <tspan fill="#3278d5">I</tspan><tspan fill="#17324d"> </tspan><tspan fill="#825bd8">dropped</tspan><tspan fill="#17324d"> </tspan><tspan fill="#269b62">the glass</tspan><tspan fill="#17324d">.</tspan>
    </text>
  </g>

  <g id="spanish-scene" filter="url(#soft-shadow)">
    <rect x="760" y="205" width="750" height="250" rx="30" fill="#ffffff" />
    <text x="795" y="252" font-family="Inter, Arial, sans-serif" font-size="28" font-weight="800" fill="#17324d">Then Spanish packages the event differently</text>
    <g id="spanish-chips">
      <rect x="800" y="318" width="105" height="64" rx="20" fill="#f0ebff" />
      <text x="852" y="358" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="28" font-weight="800" fill="#825bd8">Se</text>
      <rect x="925" y="318" width="105" height="64" rx="20" fill="#fff0f2" />
      <text x="977" y="358" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="28" font-weight="800" fill="#d65962">me</text>
      <rect x="1050" y="318" width="145" height="64" rx="20" fill="#fff7e3" />
      <text x="1122" y="358" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="28" font-weight="800" fill="#c38a22">cayó</text>
      <rect x="1215" y="318" width="190" height="64" rx="20" fill="#e8faef" />
      <text x="1310" y="358" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="28" font-weight="800" fill="#269b62">el vaso</text>
    </g>
    <g id="confusion">
      <text x="835" y="425" font-family="Inter, Arial, sans-serif" font-size="18" fill="#687e93">Your English parser searches for “I + action + object”…</text>
      <text x="1320" y="427" font-family="Inter, Arial, sans-serif" font-size="42" font-weight="800" fill="#8b65e8">?</text>
      <text x="1370" y="414" font-family="Inter, Arial, sans-serif" font-size="31" font-weight="800" fill="#d65962">?</text>
      <text x="1415" y="430" font-family="Inter, Arial, sans-serif" font-size="36" font-weight="800" fill="#c38a22">?</text>
    </g>
  </g>

  <g id="roles-scene" filter="url(#soft-shadow)">
    <rect x="90" y="515" width="900" height="290" rx="30" fill="#ffffff" />
    <text x="125" y="562" font-family="Inter, Arial, sans-serif" font-size="28" font-weight="800" fill="#17324d">Don’t reorder the words. Decode the relationships.</text>
    <text x="125" y="595" font-family="Inter, Arial, sans-serif" font-size="18" fill="#58728a">The little markers are doing jobs that English often makes obvious with word position.</text>

    <g id="role-source">
      <rect x="135" y="635" width="100" height="58" rx="18" fill="#f0ebff" />
      <text x="185" y="672" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="24" font-weight="800" fill="#825bd8">Se</text>
      <rect x="255" y="635" width="100" height="58" rx="18" fill="#fff0f2" />
      <text x="305" y="672" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="24" font-weight="800" fill="#d65962">me</text>
      <rect x="375" y="635" width="135" height="58" rx="18" fill="#fff7e3" />
      <text x="442" y="672" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="24" font-weight="800" fill="#c38a22">cayó</text>
      <rect x="530" y="635" width="175" height="58" rx="18" fill="#e8faef" />
      <text x="617" y="672" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="24" font-weight="800" fill="#269b62">el vaso</text>
    </g>

    <g id="role-targets">
      <rect x="115" y="725" width="180" height="58" rx="18" fill="#fafbfe" stroke="#dbe5ee" stroke-width="2" />
      <text x="205" y="750" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="16" font-weight="800" fill="#825bd8">EVENT FRAME</text>
      <text x="205" y="772" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="14" fill="#687e93">not “I deliberately did X”</text>

      <rect x="320" y="725" width="180" height="58" rx="18" fill="#fafbfe" stroke="#dbe5ee" stroke-width="2" />
      <text x="410" y="750" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="16" font-weight="800" fill="#d65962">AFFECTED PERSON</text>
      <text x="410" y="772" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="14" fill="#687e93">me</text>

      <rect x="525" y="725" width="180" height="58" rx="18" fill="#fafbfe" stroke="#dbe5ee" stroke-width="2" />
      <text x="615" y="750" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="16" font-weight="800" fill="#c38a22">WHAT HAPPENED</text>
      <text x="615" y="772" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="14" fill="#687e93">fell</text>

      <rect x="730" y="725" width="220" height="58" rx="18" fill="#fafbfe" stroke="#dbe5ee" stroke-width="2" />
      <text x="840" y="750" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="16" font-weight="800" fill="#269b62">THING THAT FELL</text>
      <text x="840" y="772" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="14" fill="#687e93">el vaso = grammatical subject</text>
    </g>

    <path id="line-se" d="M185 695 C185 710 205 710 205 724" fill="none" stroke="#8b65e8" stroke-width="4" marker-end="url(#purple-arrow)" />
    <path id="line-me" d="M305 695 C305 710 410 710 410 724" fill="none" stroke="#d65962" stroke-width="4" marker-end="url(#purple-arrow)" />
    <path id="line-cayo" d="M442 695 C442 710 615 710 615 724" fill="none" stroke="#c38a22" stroke-width="4" marker-end="url(#purple-arrow)" />
    <path id="line-vaso" d="M617 695 C617 710 840 710 840 724" fill="none" stroke="#269b62" stroke-width="4" marker-end="url(#purple-arrow)" />
  </g>

  <g id="movie-scene" filter="url(#soft-shadow)">
    <rect x="1040" y="515" width="470" height="290" rx="30" fill="#ffffff" />
    <text x="1075" y="562" font-family="Inter, Arial, sans-serif" font-size="28" font-weight="800" fill="#17324d">Build the mental movie</text>
    <text x="1075" y="595" font-family="Inter, Arial, sans-serif" font-size="17" fill="#58728a">Meaning should arrive before an English translation.</text>

    <g id="person">
      <circle cx="1135" cy="690" r="28" fill="#ffd7b3" />
      <rect x="1115" y="720" width="40" height="60" rx="17" fill="#5f9eef" />
      <line x1="1135" y1="780" x2="1116" y2="812" stroke="#17324d" stroke-width="7" stroke-linecap="round" />
      <line x1="1135" y1="780" x2="1157" y2="812" stroke="#17324d" stroke-width="7" stroke-linecap="round" />
      <text x="1082" y="650" font-family="Inter, Arial, sans-serif" font-size="15" font-weight="700" fill="#d65962">me = affected</text>
    </g>

    <g id="glass">
      <path d="M1260 625 L1300 625 L1290 674 Q1280 684 1270 674 Z" fill="#dbeeff" stroke="#5598e7" stroke-width="4" />
      <line x1="1280" y1="595" x2="1280" y2="615" stroke="#8b65e8" stroke-width="4" stroke-dasharray="7 7" />
      <text x="1315" y="641" font-family="Inter, Arial, sans-serif" font-size="15" font-weight="700" fill="#269b62">el vaso = thing falling</text>
    </g>
    <path id="fall-path" d="M1280 600 C1305 650 1310 720 1282 775" fill="none" stroke="#8b65e8" stroke-width="4" stroke-dasharray="9 9" opacity="0.55" />

    <g id="meaning-chain">
      <rect x="1350" y="650" width="125" height="42" rx="14" fill="#e7f1ff" />
      <text x="1412" y="676" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="14" font-weight="800" fill="#3278d5">SPANISH CUES</text>
      <path d="M1412 698 L1412 716" stroke="#4d8fe8" stroke-width="4" marker-end="url(#blue-arrow)" />
      <rect x="1350" y="724" width="125" height="42" rx="14" fill="#f0ebff" />
      <text x="1412" y="750" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="14" font-weight="800" fill="#825bd8">EVENT MODEL</text>
      <path d="M1412 772 L1412 790" stroke="#8b65e8" stroke-width="4" marker-end="url(#purple-arrow)" />
      <rect x="1350" y="798" width="125" height="42" rx="14" fill="#e8faef" />
      <text x="1412" y="824" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="14" font-weight="800" fill="#269b62">MEANING</text>
    </g>
  </g>

  <g id="takeaway">
    <rect x="90" y="842" width="1420" height="40" rx="20" fill="#17324d" />
    <text x="800" y="868" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="17" font-weight="700" fill="#ffffff">Goal: Spanish cues → event structure → meaning, without rebuilding the sentence in English first.</text>
  </g>
</svg>\`;

const tl = story.timeline = gsap.timeline({ defaults: { ease: "power2.out" } });

gsap.set(["#english-scene", "#spanish-scene", "#roles-scene", "#movie-scene", "#takeaway"], { autoAlpha: 0 });
gsap.set("#spanish-chips > *", { autoAlpha: 0, y: 18 });
gsap.set("#confusion > *", { autoAlpha: 0, scale: 0.7, transformOrigin: "center" });
gsap.set("#role-targets > *", { autoAlpha: 0, y: 10 });
gsap.set(["#line-se", "#line-me", "#line-cayo", "#line-vaso"], { strokeDasharray: 260, strokeDashoffset: 260 });
gsap.set("#movie-scene", { autoAlpha: 0 });
gsap.set("#glass", { transformOrigin: "1280px 650px" });
gsap.set("#meaning-chain > *", { autoAlpha: 0 });

tl.from("#title-scene", { autoAlpha: 0, y: -18, duration: 0.65 })
  .to("#english-scene", { autoAlpha: 1, duration: 0.55 })
  .from("#english-roles > rect", { scale: 0.75, autoAlpha: 0, stagger: 0.16, transformOrigin: "center", duration: 0.38 }, "<0.1")
  .from("#english-roles > text", { autoAlpha: 0, stagger: 0.16, duration: 0.25 }, "<0.1")
  .to("#spanish-scene", { autoAlpha: 1, duration: 0.55 }, "+=0.45")
  .to("#spanish-chips > *", { autoAlpha: 1, y: 0, stagger: 0.12, duration: 0.34 })
  .to("#english-scene", { opacity: 0.35, duration: 0.5 }, "+=0.25")
  .to("#confusion > *", { autoAlpha: 1, scale: 1, stagger: 0.12, duration: 0.32 })
  .to("#roles-scene", { autoAlpha: 1, duration: 0.55 }, "+=0.5")
  .to("#spanish-scene", { opacity: 0.35, duration: 0.4 }, "<")
  .to("#role-targets > *", { autoAlpha: 1, y: 0, stagger: 0.10, duration: 0.3 })
  .to(["#line-se", "#line-me", "#line-cayo", "#line-vaso"], { strokeDashoffset: 0, stagger: 0.16, duration: 0.5 })
  .to("#movie-scene", { autoAlpha: 1, duration: 0.55 }, "+=0.5")
  .to("#roles-scene", { opacity: 0.55, duration: 0.4 }, "<")
  .to("#glass", { y: 145, rotation: 18, duration: 1.05, ease: "power2.in" })
  .to("#meaning-chain > *", { autoAlpha: 1, stagger: 0.12, duration: 0.3 }, "-=0.3")
  .to("#takeaway", { autoAlpha: 1, duration: 0.55 }, "+=0.35")
  .fromTo("#takeaway", { scaleX: 0.96, transformOrigin: "center" }, { scaleX: 1, duration: 0.45 }, "<");
`;

const runtimeDocument = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<style>
  html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#08111f;font-family:Inter,Arial,sans-serif}
  #frame{position:relative;width:100%;height:100%;display:grid;place-items:center;background:radial-gradient(circle at 50% 20%,#152238 0%,#07101e 72%)}
  #stage{width:100%;aspect-ratio:16/9;max-height:100%;background:#f7fbff;overflow:hidden}
  #stage>svg{display:block;width:100%;height:100%}
  #runtime-status{position:absolute;left:12px;bottom:10px;padding:6px 9px;border-radius:9px;background:rgba(2,6,23,.72);color:rgba(255,255,255,.72);font-size:11px;pointer-events:none}
  #runtime-status[data-kind="error"]{color:#fecaca;background:rgba(127,29,29,.82)}
</style>
</head>
<body>
<div id="frame">
  <div id="stage" aria-label="MyWay GSAP story stage"></div>
  <div id="runtime-status">Loading GSAP…</div>
</div>
<script>
(function () {
  "use strict";
  var parentChannel = ${JSON.stringify(PARENT_CHANNEL)};
  var runtimeChannel = ${JSON.stringify(RUNTIME_CHANNEL)};
  var stage = document.getElementById("stage");
  var status = document.getElementById("runtime-status");
  var ready = false;
  var story = createStoryState();

  function createStoryState() {
    return {
      timeline: null,
      registerTimeline: function (timeline) {
        this.timeline = timeline;
        return timeline;
      }
    };
  }

  function report(type, message) {
    window.parent.postMessage({ channel: runtimeChannel, type: type, message: message || "" }, "*");
  }

  function setStatus(message, kind) {
    status.textContent = message;
    status.dataset.kind = kind || "status";
  }

  function clearStory() {
    if (window.gsap) {
      try {
        if (story.timeline && typeof story.timeline.kill === "function") story.timeline.kill();
        window.gsap.globalTimeline.clear();
      } catch (_) {}
    }
    story = createStoryState();
    stage.replaceChildren();
  }

  function activeTimeline() {
    if (story.timeline && typeof story.timeline.play === "function") return story.timeline;
    return window.gsap ? window.gsap.globalTimeline : null;
  }

  function runSource(source) {
    if (!ready || !window.gsap) {
      setStatus("GSAP is not ready yet.", "error");
      report("error", "GSAP is not ready yet.");
      return;
    }
    clearStory();
    try {
      var execute = new Function("stage", "gsap", "story", "\\\"use strict\\\";\\n" + source + "\\n//# sourceURL=myway-gsap-story-input.js");
      var returned = execute(stage, window.gsap, story);
      if (!story.timeline && returned && typeof returned.play === "function") story.timeline = returned;
      setStatus("Running · sandboxed iframe", "status");
      report("running", "Story is running.");
    } catch (error) {
      var message = error && error.stack ? error.stack : String(error);
      setStatus("Runtime error · see left pane", "error");
      report("error", message);
    }
  }

  window.addEventListener("message", function (event) {
    var data = event.data || {};
    if (data.channel !== parentChannel || typeof data.type !== "string") return;
    if (data.type === "run") return runSource(String(data.code || ""));
    if (!ready || !window.gsap) return;
    var timeline = activeTimeline();
    try {
      if (data.type === "pause" && timeline) timeline.pause();
      if (data.type === "play" && timeline) timeline.resume();
      if (data.type === "restart" && timeline) timeline.restart();
      if (data.type === "clear") clearStory();
      report("status", data.type);
    } catch (error) {
      report("error", error && error.stack ? error.stack : String(error));
    }
  });

  window.__mywayGsapReady = function () {
    ready = true;
    setStatus("GSAP 3.15.0 ready", "status");
    report("ready", "GSAP 3.15.0 ready.");
  };
  window.__mywayGsapError = function () {
    setStatus("Could not load GSAP from jsDelivr", "error");
    report("error", "Could not load pinned GSAP 3.15.0 from jsDelivr. Check network access and retry.");
  };
})();
</script>
<script src="${GSAP_CDN_URL}" onload="window.__mywayGsapReady()" onerror="window.__mywayGsapError()"></script>
</body>
</html>`;

const card: CSSProperties = {
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 20,
  background: "rgba(15,23,42,0.72)",
  padding: 18,
  boxShadow: "0 18px 60px rgba(2,6,23,0.2)",
};

const button: CSSProperties = {
  borderRadius: 11,
  border: "1px solid rgba(255,255,255,0.18)",
  background: "rgba(30,41,59,0.92)",
  color: "white",
  padding: "9px 12px",
  fontWeight: 700,
  cursor: "pointer",
};

const briefInput: CSSProperties = {
  width: "100%",
  borderRadius: 11,
  border: "1px solid rgba(255,255,255,0.15)",
  background: "rgba(2,6,23,0.78)",
  color: "white",
  padding: "9px 10px",
  outline: "none",
  boxSizing: "border-box",
  fontFamily: "inherit",
  fontSize: 12,
  lineHeight: 1.5,
};

function CreativeField({
  label,
  value,
  onChange,
  rows = 2,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  hint?: string;
}) {
  return (
    <label style={{ display: "grid", gap: 6, minWidth: 0 }}>
      <span style={{ color: "rgba(255,255,255,0.76)", fontSize: 12, fontWeight: 750 }}>{label}</span>
      <textarea
        value={value}
        rows={rows}
        onChange={(event) => onChange(event.target.value)}
        style={{ ...briefInput, resize: "vertical" }}
      />
      {hint ? <span style={{ color: "rgba(255,255,255,0.43)", fontSize: 10, lineHeight: 1.4 }}>{hint}</span> : null}
    </label>
  );
}

function buildSelectedExecutionBrief(result: CreativeVisualThesisRunResponse | null) {
  if (!result?.ok) return "";
  return [
    "MYWAY SELECTED VISUAL THESIS",
    `Title: ${result.selected_thesis.title}`,
    `Visual thesis: ${result.selected_thesis.visual_thesis}`,
    `Representation: ${result.selected_thesis.representation_strategy}`,
    `Critical realization: ${result.selected_thesis.critical_realization}`,
    `Why it fits: ${result.selected_thesis.why_this_targets_root_problem}`,
    "Story arc:",
    ...result.selected_thesis.story_arc.map((item, index) => `${index + 1}. ${item}`),
    "Execution jobs:",
    ...result.selected_thesis.execution_jobs.map((item) => `- ${item}`),
    "Freeform execution needs (allowed even if no known capability exists):",
    ...(result.selected_thesis.freeform_execution_needs.length
      ? result.selected_thesis.freeform_execution_needs.map((item) => `- ${item}`)
      : ["- none specified"]),
    `Truth guard: ${result.selected_thesis.truth_guard}`,
    "Known MyWay execution skills are optional helpers, not creative constraints:",
    ...result.capability_assist.known_skills.map((item) => `- ${item.capability_id}: ${item.semantic_intent}`),
  ].join("\n");
}

export function GsapStoryLab() {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const codeRef = useRef(DEFAULT_STORY_CODE);
  const [code, setCode] = useState(DEFAULT_STORY_CODE);
  const [runtimeReady, setRuntimeReady] = useState(false);
  const [runtimeStatus, setRuntimeStatus] = useState("Loading isolated GSAP runtime…");
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [creativeBrief, setCreativeBrief] = useState<CreativeVisualThesisRequest>(DEFAULT_CREATIVE_BRIEF);
  const [creativeResult, setCreativeResult] = useState<CreativeVisualThesisRunResponse | null>(null);
  const [creativeStatus, setCreativeStatus] = useState("Ready to generate one visual thesis.");
  const [creativeError, setCreativeError] = useState<string | null>(null);
  const [creativeBusy, setCreativeBusy] = useState(false);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);

  useEffect(() => {
    codeRef.current = code;
  }, [code]);

  const send = useCallback((type: "run" | "pause" | "play" | "restart" | "clear", extra?: Record<string, unknown>) => {
    iframeRef.current?.contentWindow?.postMessage(
      { channel: PARENT_CHANNEL, type, ...(extra ?? {}) },
      "*",
    );
  }, []);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.source !== iframeRef.current?.contentWindow) return;
      const data = event.data as { channel?: string; type?: string; message?: string } | null;
      if (!data || data.channel !== RUNTIME_CHANNEL) return;
      if (data.type === "ready") {
        setRuntimeReady(true);
        setRuntimeError(null);
        setRuntimeStatus(data.message || "GSAP ready.");
        iframeRef.current?.contentWindow?.postMessage(
          { channel: PARENT_CHANNEL, type: "run", code: codeRef.current },
          "*",
        );
        return;
      }
      if (data.type === "error") {
        setRuntimeError(data.message || "Unknown runtime error.");
        setRuntimeStatus("Runtime error");
        return;
      }
      if (data.message) setRuntimeStatus(data.message);
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const lineCount = useMemo(() => code.split("\n").length, [code]);

  function run() {
    setRuntimeError(null);
    setPaused(false);
    send("run", { code });
  }

  function togglePlayback() {
    const nextPaused = !paused;
    setPaused(nextPaused);
    send(nextPaused ? "pause" : "play");
  }

  function resetExample() {
    setCode(DEFAULT_STORY_CODE);
    codeRef.current = DEFAULT_STORY_CODE;
    setRuntimeError(null);
    setPaused(false);
    send("run", { code: DEFAULT_STORY_CODE });
  }

  function updateCreativeBrief<K extends keyof CreativeVisualThesisRequest>(
    key: K,
    value: CreativeVisualThesisRequest[K],
  ) {
    setCreativeBrief((current) => ({ ...current, [key]: value }));
  }

  async function generateCreativeTheses() {
    setCreativeBusy(true);
    setCreativeError(null);
    setCreativeResult(null);
    setCopyStatus(null);
    setCreativeStatus("GLM is creating one personalized visual thesis. No second critic model call will run…");
    try {
      const response = await fetch(CREATIVE_THESIS_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(creativeBrief),
      });
      const payload = (await response.json().catch(() => null)) as CreativeVisualThesisRunResponse | null;
      if (!payload) throw new Error(`Creative-thesis route returned no JSON (HTTP ${response.status}).`);
      if (!response.ok || !payload.ok) {
        const message = !payload.ok ? `${payload.phase}: ${payload.error}` : `HTTP ${response.status}`;
        throw new Error(message);
      }
      setCreativeResult(payload);
      setCreativeStatus(
        `Generated “${payload.selected_thesis.title}” in ${(payload.metrics.total_route_duration_ms / 1000).toFixed(1)}s.`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setCreativeError(message);
      setCreativeStatus("Creative thesis generation failed.");
    } finally {
      setCreativeBusy(false);
    }
  }

  async function copySelectedBrief() {
    const text = buildSelectedExecutionBrief(creativeResult);
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus("Copied selected execution brief.");
    } catch {
      setCopyStatus("Clipboard unavailable; select the result text manually.");
    }
  }

  return (
    <section style={{ display: "grid", gap: 16 }}>
      <header style={{ display: "grid", gap: 7 }}>
        <div style={{ color: "#67e8f9", fontSize: 12, fontWeight: 800, letterSpacing: 1.2 }}>
          2D STORY LAB · SVG + GSAP
        </div>
        <h1 style={{ margin: 0, fontSize: "clamp(1.8rem, 3vw, 3rem)" }}>
          Paste a visual program. Watch the story run.
        </h1>
        <p style={{ margin: 0, maxWidth: 980, color: "rgba(255,255,255,0.68)", lineHeight: 1.65 }}>
          The code receives <code>stage</code>, <code>gsap</code>, and <code>story</code>. It executes only inside a sandboxed iframe with scripts enabled and same-origin access denied.
        </p>
      </header>

      <section style={{ ...card, display: "grid", gap: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 14, flexWrap: "wrap" }}>
          <div style={{ display: "grid", gap: 6, maxWidth: 850 }}>
            <div style={{ color: "#c4b5fd", fontSize: 11, fontWeight: 850, letterSpacing: 1.1 }}>
              CREATIVE VISUAL THESIS BENCH V1
            </div>
            <h2 style={{ margin: 0, fontSize: 22 }}>Let the model invent the representation before MyWay binds execution skills.</h2>
            <p style={{ margin: 0, color: "rgba(255,255,255,0.6)", lineHeight: 1.55, fontSize: 12 }}>
              Generation sees the learner problem and personalization evidence only. It produces one strongest visual thesis in a single model call; no asset inventory or Director palette is exposed until afterward.
            </p>
          </div>
          <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
            {["ONE MODEL CALL", "NO ASSETS DURING IDEATION", "NO DIRECTOR PALETTE DURING IDEATION", "FREEFORM ESCAPE HATCH"].map((label) => (
              <span key={label} style={{ borderRadius: 999, padding: "6px 9px", border: "1px solid rgba(196,181,253,0.28)", background: "rgba(91,33,182,0.13)", color: "#ddd6fe", fontSize: 10, fontWeight: 800 }}>
                {label}
              </span>
            ))}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "minmax(320px, 0.95fr) minmax(0, 1.25fr)", gap: 14, alignItems: "start" }}>
          <div style={{ display: "grid", gap: 10, minWidth: 0 }}>
            <CreativeField label="Learner message" value={creativeBrief.learner_message} onChange={(value) => updateCreativeBrief("learner_message", value)} />
            <CreativeField label="Root problem" value={creativeBrief.root_problem} onChange={(value) => updateCreativeBrief("root_problem", value)} rows={3} hint="The missing mental model, not just the surface complaint." />
            <CreativeField label="Current strategy" value={creativeBrief.current_strategy ?? ""} onChange={(value) => updateCreativeBrief("current_strategy", value)} />
            <CreativeField label="Failure mode" value={creativeBrief.failure_mode ?? ""} onChange={(value) => updateCreativeBrief("failure_mode", value)} />
            <CreativeField label="Target learning delta" value={creativeBrief.target_learning_delta} onChange={(value) => updateCreativeBrief("target_learning_delta", value)} rows={3} />
            <CreativeField label="Teaching signals" value={creativeBrief.teaching_signals ?? ""} onChange={(value) => updateCreativeBrief("teaching_signals", value)} rows={3} />
            <CreativeField label="Prior response evidence" value={creativeBrief.prior_response_evidence ?? ""} onChange={(value) => updateCreativeBrief("prior_response_evidence", value)} />
            <CreativeField label="Profile summary" value={creativeBrief.profile_summary ?? ""} onChange={(value) => updateCreativeBrief("profile_summary", value)} rows={3} />
            <CreativeField label="Interests / example domains" value={creativeBrief.interests ?? ""} onChange={(value) => updateCreativeBrief("interests", value)} hint="Optional. The prompt explicitly forbids forcing these into the representation." />

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ color: "rgba(255,255,255,0.7)", fontSize: 11 }}>Model</span>
                <select value={creativeBrief.model ?? "z-ai/glm-5.3"} onChange={(event) => updateCreativeBrief("model", event.target.value as CreativeVisualThesisRequest["model"])} style={briefInput}>
                  <option value="z-ai/glm-5.3">GLM-5.3</option>
                  <option value="z-ai/glm-5.3-flash">GLM-5.3 Flash</option>
                  <option value="deepseek-ai/deepseek-v4-pro">DeepSeek V4 Pro via NVIDIA</option>
                </select>
              </label>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ color: "rgba(255,255,255,0.7)", fontSize: 11 }}>
                  Reasoning {creativeBrief.model === "deepseek-ai/deepseek-v4-pro" ? "(GLM only)" : ""}
                </span>
                <select
                  value={creativeBrief.reasoning_effort ?? "max"}
                  onChange={(event) => updateCreativeBrief("reasoning_effort", event.target.value as CreativeVisualThesisRequest["reasoning_effort"])}
                  disabled={creativeBrief.model === "deepseek-ai/deepseek-v4-pro"}
                  style={{ ...briefInput, opacity: creativeBrief.model === "deepseek-ai/deepseek-v4-pro" ? 0.55 : 1 }}
                >
                  <option value="max">max</option>
                  <option value="high">high</option>
                  <option value="low">low</option>
                </select>
              </label>
            </div>

            <button type="button" onClick={generateCreativeTheses} disabled={creativeBusy} style={{ ...button, padding: "11px 14px", background: creativeBusy ? "rgba(76,29,149,0.3)" : "linear-gradient(135deg, rgba(124,58,237,0.95), rgba(59,130,246,0.95))", opacity: creativeBusy ? 0.65 : 1 }}>
              {creativeBusy ? "Generating one thesis…" : "Generate 1 visual thesis"}
            </button>
            <div style={{ color: creativeError ? "#fecaca" : "rgba(255,255,255,0.48)", fontSize: 11, lineHeight: 1.45 }}>
              {creativeError ?? creativeStatus}
            </div>
          </div>

          <div style={{ display: "grid", gap: 10, minWidth: 0 }}>
            {!creativeResult?.ok ? (
              <div style={{ minHeight: 260, display: "grid", placeItems: "center", borderRadius: 16, border: "1px dashed rgba(255,255,255,0.16)", background: "rgba(2,6,23,0.32)", color: "rgba(255,255,255,0.42)", padding: 20, textAlign: "center", lineHeight: 1.6 }}>
                Generate one personalized visual thesis. MyWay will consult the Director Capability Library only after the thesis exists.
              </div>
            ) : (
              <>
                <div style={{ borderRadius: 16, border: "1px solid rgba(134,239,172,0.28)", background: "rgba(22,101,52,0.13)", padding: 14, display: "grid", gap: 8 }}>
                  <div style={{ color: "#86efac", fontSize: 10, fontWeight: 850, letterSpacing: 1 }}>SELECTED THESIS</div>
                  <h3 style={{ margin: 0, fontSize: 20 }}>{creativeResult.selected_thesis.title}</h3>
                  <div style={{ color: "rgba(255,255,255,0.84)", lineHeight: 1.6, fontSize: 13 }}>{creativeResult.selected_thesis.visual_thesis}</div>
                  <div style={{ color: "#c4b5fd", fontSize: 12, lineHeight: 1.5 }}><strong>Critical realization:</strong> {creativeResult.selected_thesis.critical_realization}</div>
                  <div style={{ color: "rgba(255,255,255,0.56)", fontSize: 11, lineHeight: 1.5 }}>{creativeResult.selection.output.selection_reason}</div>
                  <button type="button" onClick={copySelectedBrief} style={{ ...button, justifySelf: "start" }}>Copy selected execution brief</button>
                  {copyStatus ? <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 10 }}>{copyStatus}</div> : null}
                </div>

                <div style={{ borderRadius: 14, border: "1px solid rgba(96,165,250,0.2)", background: "rgba(30,64,175,0.09)", padding: 12, display: "grid", gap: 8 }}>
                  <div style={{ color: "#93c5fd", fontSize: 11, fontWeight: 850 }}>KNOWN EXECUTION SKILLS · OPTIONAL AFTER SELECTION</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {creativeResult.capability_assist.known_skills.map((skill) => (
                      <span key={skill.capability_id} title={skill.semantic_intent} style={{ borderRadius: 999, padding: "5px 8px", border: "1px solid rgba(96,165,250,0.2)", background: "rgba(30,64,175,0.12)", color: "#bfdbfe", fontSize: 9 }}>
                        {skill.label}
                      </span>
                    ))}
                  </div>
                  <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 10, lineHeight: 1.45 }}>
                    These are reusable motor skills MyWay already knows. They did not influence thesis generation and are not required.
                  </div>
                </div>

                <div style={{ borderRadius: 14, border: "1px solid rgba(251,191,36,0.2)", background: "rgba(120,53,15,0.1)", padding: 12, display: "grid", gap: 6 }}>
                  <div style={{ color: "#fde68a", fontSize: 11, fontWeight: 850 }}>FREEFORM ESCAPE HATCH</div>
                  {creativeResult.capability_assist.freeform_execution_needs.length ? creativeResult.capability_assist.freeform_execution_needs.map((need) => (
                    <div key={need} style={{ color: "rgba(255,255,255,0.63)", fontSize: 11, lineHeight: 1.45 }}>• {need}</div>
                  )) : <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 11 }}>The selected thesis did not request an execution effect beyond the reusable skill library.</div>}
                </div>
              </>
            )}
          </div>
        </div>
      </section>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(340px, 0.9fr) minmax(0, 1.45fr)",
          gap: 16,
          alignItems: "start",
        }}
      >
        <section style={{ ...card, display: "grid", gap: 12, minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 18 }}>Generated code</h2>
              <div style={{ marginTop: 4, color: "rgba(255,255,255,0.48)", fontSize: 11 }}>
                {lineCount.toLocaleString()} lines · paste GPT/GLM output here
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" onClick={run} disabled={!runtimeReady} style={{ ...button, opacity: runtimeReady ? 1 : 0.55 }}>
                Run
              </button>
              <button type="button" onClick={() => send("restart")} disabled={!runtimeReady} style={{ ...button, opacity: runtimeReady ? 1 : 0.55 }}>
                Restart
              </button>
              <button type="button" onClick={togglePlayback} disabled={!runtimeReady} style={{ ...button, opacity: runtimeReady ? 1 : 0.55 }}>
                {paused ? "Play" : "Pause"}
              </button>
              <button type="button" onClick={resetExample} disabled={!runtimeReady} style={{ ...button, opacity: runtimeReady ? 1 : 0.55 }}>
                Reset example
              </button>
            </div>
          </div>

          <textarea
            aria-label="GSAP story code"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            spellCheck={false}
            style={{
              width: "100%",
              minHeight: 650,
              resize: "vertical",
              borderRadius: 14,
              border: "1px solid rgba(148,163,184,0.28)",
              background: "#07111f",
              color: "#dbeafe",
              padding: 14,
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
              fontSize: 12,
              lineHeight: 1.55,
              tabSize: 2,
              outline: "none",
              boxSizing: "border-box",
            }}
          />
          <div style={{ color: "rgba(255,255,255,0.48)", fontSize: 11, lineHeight: 1.5 }}>
            V1 uses pinned GSAP 3.15.0 from jsDelivr inside the isolated preview only. No generated code runs in the MyWay parent document.
          </div>
        </section>

        <section style={{ ...card, display: "grid", gap: 12, minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 18 }}>Visual output</h2>
              <div style={{ marginTop: 4, color: "rgba(255,255,255,0.48)", fontSize: 11 }}>
                16:9 story stage · {runtimeStatus}
              </div>
            </div>
            <div
              style={{
                borderRadius: 999,
                padding: "6px 10px",
                fontSize: 11,
                fontWeight: 800,
                color: runtimeReady ? "#86efac" : "#fde68a",
                border: `1px solid ${runtimeReady ? "rgba(134,239,172,0.35)" : "rgba(253,230,138,0.3)"}`,
                background: runtimeReady ? "rgba(22,101,52,0.18)" : "rgba(120,53,15,0.18)",
              }}
            >
              {runtimeReady ? "GSAP READY" : "LOADING RUNTIME"}
            </div>
          </div>

          <div style={{ borderRadius: 16, overflow: "hidden", border: "1px solid rgba(255,255,255,0.12)", background: "#07111f" }}>
            <iframe
              ref={iframeRef}
              title="MyWay 2D Story GSAP preview"
              sandbox="allow-scripts"
              referrerPolicy="no-referrer"
              srcDoc={runtimeDocument}
              style={{ display: "block", width: "100%", aspectRatio: "16 / 9", border: 0, background: "#07111f" }}
            />
          </div>

          {runtimeError ? (
            <pre
              style={{
                margin: 0,
                maxHeight: 220,
                overflow: "auto",
                whiteSpace: "pre-wrap",
                borderRadius: 12,
                border: "1px solid rgba(248,113,113,0.28)",
                background: "rgba(127,29,29,0.18)",
                color: "#fecaca",
                padding: 12,
                fontSize: 11,
                lineHeight: 1.5,
              }}
            >
              {runtimeError}
            </pre>
          ) : null}
        </section>
      </div>
    </section>
  );
}

export default GsapStoryLab;
