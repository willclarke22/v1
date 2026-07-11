"use client";

import { Canvas } from "@react-three/fiber";
import { Html, OrbitControls, RoundedBox, Text } from "@react-three/drei";
import { useMemo, useState } from "react";

const TAU = Math.PI * 2;

type Vec3 = [number, number, number];

type PrimitiveKind = "box" | "rounded_box" | "sphere" | "cylinder" | "cone" | "torus" | "beam";

type PrimitivePart = {
  id: string;
  label: string;
  kind: PrimitiveKind;
  role: string;
  buildStep: number;
  position: Vec3;
  rotation?: Vec3;
  scale: Vec3;
  color: string;
  opacity?: number;
  metalness?: number;
  roughness?: number;
  labelOffset?: Vec3;
};

type BuildBeat = {
  id: string;
  title: string;
  narration: string;
  partIds: string[];
};

type PrimitiveBuildPlan = {
  title: string;
  prompt: string;
  summary: string;
  constructionLogic: string[];
  parts: PrimitivePart[];
  beats: BuildBeat[];
};

function v(value: Vec3): Vec3 {
  return value;
}

function makeCarPlan(prompt: string): PrimitiveBuildPlan {
  const parts: PrimitivePart[] = [
    {
      id: "road",
      label: "road plane",
      kind: "rounded_box",
      role: "quiet stage that grounds the vehicle",
      buildStep: 1,
      position: v([0, -0.08, 0]),
      scale: v([6.8, 0.08, 3.1]),
      color: "#1f2937",
      roughness: 0.9,
      opacity: 0.92,
    },
    {
      id: "body",
      label: "main body",
      kind: "rounded_box",
      role: "main vehicle mass",
      buildStep: 2,
      position: v([0, 0.58, 0]),
      scale: v([3.35, 0.62, 1.25]),
      color: "#38bdf8",
      metalness: 0.08,
      roughness: 0.32,
    },
    {
      id: "hood",
      label: "front hood",
      kind: "rounded_box",
      role: "front shape that implies engine space",
      buildStep: 2,
      position: v([-1.25, 0.9, 0]),
      scale: v([1.25, 0.28, 1.08]),
      color: "#0ea5e9",
      metalness: 0.08,
      roughness: 0.35,
    },
    {
      id: "cabin",
      label: "cabin",
      kind: "rounded_box",
      role: "passenger space",
      buildStep: 3,
      position: v([0.48, 1.16, 0]),
      scale: v([1.35, 0.82, 1.02]),
      color: "#075985",
      opacity: 0.92,
      metalness: 0.05,
      roughness: 0.24,
    },
    {
      id: "windshield",
      label: "windshield",
      kind: "rounded_box",
      role: "transparent front window",
      buildStep: 3,
      position: v([-0.18, 1.24, -0.52]),
      rotation: v([0.12, 0, 0]),
      scale: v([0.68, 0.45, 0.045]),
      color: "#bae6fd",
      opacity: 0.58,
      roughness: 0.08,
    },
    {
      id: "rear_window",
      label: "rear window",
      kind: "rounded_box",
      role: "transparent rear window",
      buildStep: 3,
      position: v([1.02, 1.24, 0.52]),
      rotation: v([-0.12, 0, 0]),
      scale: v([0.62, 0.42, 0.045]),
      color: "#bae6fd",
      opacity: 0.5,
      roughness: 0.08,
    },
    ...wheelSet(4),
    {
      id: "front_axle",
      label: "front axle",
      kind: "cylinder",
      role: "crossbar connecting front wheels",
      buildStep: 4,
      position: v([-1.12, 0.34, 0]),
      rotation: v([Math.PI / 2, 0, 0]),
      scale: v([0.075, 1.85, 0.075]),
      color: "#cbd5e1",
      metalness: 0.55,
      roughness: 0.25,
    },
    {
      id: "rear_axle",
      label: "rear axle",
      kind: "cylinder",
      role: "crossbar connecting rear wheels",
      buildStep: 4,
      position: v([1.18, 0.34, 0]),
      rotation: v([Math.PI / 2, 0, 0]),
      scale: v([0.075, 1.85, 0.075]),
      color: "#cbd5e1",
      metalness: 0.55,
      roughness: 0.25,
    },
    {
      id: "engine_bay_glow",
      label: "engine bay",
      kind: "sphere",
      role: "visible placeholder for the power source area",
      buildStep: 5,
      position: v([-1.22, 0.98, 0]),
      scale: v([0.28, 0.22, 0.28]),
      color: "#f97316",
      opacity: 0.82,
      roughness: 0.18,
    },
    {
      id: "headlight_l",
      label: "left headlight",
      kind: "sphere",
      role: "front visual detail",
      buildStep: 5,
      position: v([-1.78, 0.62, -0.38]),
      scale: v([0.12, 0.12, 0.12]),
      color: "#fde68a",
      roughness: 0.08,
    },
    {
      id: "headlight_r",
      label: "right headlight",
      kind: "sphere",
      role: "front visual detail",
      buildStep: 5,
      position: v([-1.78, 0.62, 0.38]),
      scale: v([0.12, 0.12, 0.12]),
      color: "#fde68a",
      roughness: 0.08,
    },
  ];

  return {
    title: "Primitive Car Builder",
    prompt,
    summary:
      "A car can be assembled from a small vocabulary: one main body, one cabin, four rotators, two axles, glass panels, lights, and a visible power-source placeholder.",
    constructionLogic: [
      "Start with a grounded stage so the object has scale and direction.",
      "Block in the largest readable silhouette first.",
      "Add the cabin and transparent surfaces to make it read as a car, not a box.",
      "Add four repeated rotators and crossbars so the structure has functional parts.",
      "Add small light/glow details to make the primitive build feel intentional.",
    ],
    parts,
    beats: [
      {
        id: "beat_1",
        title: "Ground the build",
        narration: "First, create a simple stage so the object has a clear bottom, front, and scale.",
        partIds: ["road"],
      },
      {
        id: "beat_2",
        title: "Find the silhouette",
        narration: "The body and hood give the car its main shape before any detail is added.",
        partIds: ["body", "hood"],
      },
      {
        id: "beat_3",
        title: "Add readable space",
        narration: "The cabin and windows make the object read as a vehicle people can sit inside.",
        partIds: ["cabin", "windshield", "rear_window"],
      },
      {
        id: "beat_4",
        title: "Add the moving logic",
        narration: "Four wheels and two axles turn the car from a nice shape into something that could move.",
        partIds: ["wheel_fl", "wheel_fr", "wheel_rl", "wheel_rr", "front_axle", "rear_axle"],
      },
      {
        id: "beat_5",
        title: "Add intent and polish",
        narration: "Small highlights show where power and direction would live in a more detailed teaching scene.",
        partIds: ["engine_bay_glow", "headlight_l", "headlight_r"],
      },
    ],
  };
}

function wheelSet(buildStep: number): PrimitivePart[] {
  const base: Array<[string, string, number, number]> = [
    ["wheel_fl", "front left wheel", -1.12, -0.72],
    ["wheel_fr", "front right wheel", -1.12, 0.72],
    ["wheel_rl", "rear left wheel", 1.18, -0.72],
    ["wheel_rr", "rear right wheel", 1.18, 0.72],
  ];

  return base.map(([id, label, x, z]) => ({
    id,
    label,
    kind: "torus" as const,
    role: "rotator/wheel primitive",
    buildStep,
    position: v([x, 0.34, z]),
    rotation: v([0, 0, 0]),
    scale: v([0.34, 0.34, 0.12]),
    color: "#020617",
    metalness: 0.05,
    roughness: 0.62,
  }));
}

function makeRocketPlan(prompt: string): PrimitiveBuildPlan {
  const parts: PrimitivePart[] = [
    {
      id: "launch_pad",
      label: "launch pad",
      kind: "rounded_box",
      role: "grounding platform",
      buildStep: 1,
      position: v([0, -0.08, 0]),
      scale: v([2.4, 0.12, 2.4]),
      color: "#334155",
    },
    {
      id: "body",
      label: "rocket body",
      kind: "cylinder",
      role: "main vertical body",
      buildStep: 2,
      position: v([0, 1.35, 0]),
      scale: v([0.48, 1.65, 0.48]),
      color: "#e2e8f0",
      metalness: 0.18,
      roughness: 0.22,
    },
    {
      id: "nose",
      label: "nose cone",
      kind: "cone",
      role: "pointed top",
      buildStep: 3,
      position: v([0, 3.16, 0]),
      scale: v([0.52, 0.76, 0.52]),
      color: "#ef4444",
    },
    {
      id: "window",
      label: "window",
      kind: "sphere",
      role: "small identity detail",
      buildStep: 4,
      position: v([0, 1.95, 0.49]),
      scale: v([0.16, 0.16, 0.035]),
      color: "#7dd3fc",
      opacity: 0.84,
    },
    ...[-0.58, 0.58].flatMap((x, index) => [
      {
        id: `fin_${index}_a`,
        label: `side fin ${index + 1}`,
        kind: "cone" as const,
        role: "stabilizing fin",
        buildStep: 4,
        position: v([x, 0.42, 0]),
        rotation: v([0, 0, x < 0 ? Math.PI / 2 : -Math.PI / 2]),
        scale: v([0.22, 0.58, 0.32]),
        color: "#ef4444",
      },
    ]),
    {
      id: "flame_core",
      label: "flame core",
      kind: "cone",
      role: "thrust visualization",
      buildStep: 5,
      position: v([0, -0.55, 0]),
      rotation: v([Math.PI, 0, 0]),
      scale: v([0.38, 0.9, 0.38]),
      color: "#f97316",
      opacity: 0.88,
    },
    {
      id: "flame_glow",
      label: "glow",
      kind: "sphere",
      role: "soft exhaust glow",
      buildStep: 5,
      position: v([0, -0.25, 0]),
      scale: v([0.62, 0.38, 0.62]),
      color: "#fde047",
      opacity: 0.52,
    },
  ];

  return {
    title: "Primitive Rocket Builder",
    prompt,
    summary: "A rocket can be built from stacked vertical primitives: platform, cylinder body, cone nose, fins, window, and exhaust shapes.",
    constructionLogic: [
      "Use a vertical centerline so every part feels intentionally aligned.",
      "Start with the body, then add a cone to make the silhouette instantly readable.",
      "Add fins and a window as small role markers.",
      "Use flame and glow primitives to show the force direction.",
    ],
    parts,
    beats: [
      { id: "beat_1", title: "Place the launch pad", narration: "A stable base gives the rocket a world to launch from.", partIds: ["launch_pad"] },
      { id: "beat_2", title: "Build the body", narration: "The tall cylinder creates the main rocket mass.", partIds: ["body"] },
      { id: "beat_3", title: "Make the silhouette read", narration: "The nose cone turns the cylinder into a rocket shape.", partIds: ["nose"] },
      { id: "beat_4", title: "Add control details", narration: "Fins and a window make the object feel engineered instead of generic.", partIds: ["window", "fin_0_a", "fin_1_a"] },
      { id: "beat_5", title: "Show the force", narration: "The flame and glow show where motion would come from.", partIds: ["flame_core", "flame_glow"] },
    ],
  };
}

function makeHousePlan(prompt: string): PrimitiveBuildPlan {
  const parts: PrimitivePart[] = [
    { id: "ground", label: "ground", kind: "rounded_box", role: "base", buildStep: 1, position: v([0, -0.08, 0]), scale: v([4.7, 0.1, 3.6]), color: "#14532d", opacity: 0.9 },
    { id: "walls", label: "walls", kind: "rounded_box", role: "main enclosed space", buildStep: 2, position: v([0, 0.7, 0]), scale: v([2.2, 1.35, 1.65]), color: "#f8fafc", roughness: 0.55 },
    { id: "roof", label: "roof", kind: "cone", role: "protective roof", buildStep: 3, position: v([0, 1.78, 0]), rotation: v([0, Math.PI / 4, 0]), scale: v([1.82, 0.76, 1.82]), color: "#b91c1c", roughness: 0.4 },
    { id: "door", label: "door", kind: "rounded_box", role: "entry point", buildStep: 4, position: v([0, 0.36, 0.85]), scale: v([0.42, 0.7, 0.08]), color: "#7c2d12" },
    { id: "window_l", label: "left window", kind: "rounded_box", role: "light opening", buildStep: 4, position: v([-0.72, 0.88, 0.86]), scale: v([0.36, 0.36, 0.055]), color: "#93c5fd", opacity: 0.72 },
    { id: "window_r", label: "right window", kind: "rounded_box", role: "light opening", buildStep: 4, position: v([0.72, 0.88, 0.86]), scale: v([0.36, 0.36, 0.055]), color: "#93c5fd", opacity: 0.72 },
    { id: "chimney", label: "chimney", kind: "rounded_box", role: "small roof detail", buildStep: 5, position: v([0.65, 2.24, -0.28]), scale: v([0.28, 0.7, 0.28]), color: "#78350f" },
    { id: "smoke", label: "smoke", kind: "sphere", role: "soft atmosphere", buildStep: 5, position: v([0.72, 2.75, -0.28]), scale: v([0.32, 0.22, 0.32]), color: "#cbd5e1", opacity: 0.55 },
  ];

  return {
    title: "Primitive House Builder",
    prompt,
    summary: "A house reads clearly when the primitives establish base, enclosed space, roof, entry, windows, and small lived-in details.",
    constructionLogic: [
      "Start with a base to anchor the object.",
      "Create the largest enclosed volume first.",
      "Add a roof to make the silhouette unmistakable.",
      "Use doors and windows as role markers.",
      "Add one atmospheric detail to make the primitive scene feel alive.",
    ],
    parts,
    beats: [
      { id: "beat_1", title: "Ground it", narration: "A simple ground plane gives the house a readable place to sit.", partIds: ["ground"] },
      { id: "beat_2", title: "Build the room", narration: "The wall block creates the main usable space.", partIds: ["walls"] },
      { id: "beat_3", title: "Add shelter", narration: "The roof completes the protective structure.", partIds: ["roof"] },
      { id: "beat_4", title: "Add openings", narration: "A door and windows make the object feel usable, not just solid.", partIds: ["door", "window_l", "window_r"] },
      { id: "beat_5", title: "Add life", narration: "A chimney and smoke add a small story without needing complex assets.", partIds: ["chimney", "smoke"] },
    ],
  };
}

function makeRobotPlan(prompt: string): PrimitiveBuildPlan {
  const parts: PrimitivePart[] = [
    { id: "floor", label: "floor", kind: "rounded_box", role: "stage", buildStep: 1, position: v([0, -0.08, 0]), scale: v([3.8, 0.08, 3.1]), color: "#111827", opacity: 0.9 },
    { id: "torso", label: "torso", kind: "rounded_box", role: "central body", buildStep: 2, position: v([0, 1.05, 0]), scale: v([1.05, 1.25, 0.55]), color: "#94a3b8", metalness: 0.28, roughness: 0.24 },
    { id: "head", label: "head", kind: "rounded_box", role: "control center", buildStep: 3, position: v([0, 2.05, 0]), scale: v([0.82, 0.62, 0.62]), color: "#cbd5e1", metalness: 0.22, roughness: 0.22 },
    { id: "eye_l", label: "left eye", kind: "sphere", role: "attention marker", buildStep: 4, position: v([-0.22, 2.08, 0.33]), scale: v([0.075, 0.075, 0.075]), color: "#22d3ee" },
    { id: "eye_r", label: "right eye", kind: "sphere", role: "attention marker", buildStep: 4, position: v([0.22, 2.08, 0.33]), scale: v([0.075, 0.075, 0.075]), color: "#22d3ee" },
    { id: "arm_l", label: "left arm", kind: "beam", role: "manipulator", buildStep: 5, position: v([-0.82, 1.05, 0]), rotation: v([0, 0, -0.24]), scale: v([0.2, 1.05, 0.2]), color: "#64748b" },
    { id: "arm_r", label: "right arm", kind: "beam", role: "manipulator", buildStep: 5, position: v([0.82, 1.05, 0]), rotation: v([0, 0, 0.24]), scale: v([0.2, 1.05, 0.2]), color: "#64748b" },
    { id: "leg_l", label: "left leg", kind: "beam", role: "support", buildStep: 5, position: v([-0.28, 0.15, 0]), scale: v([0.22, 0.72, 0.22]), color: "#475569" },
    { id: "leg_r", label: "right leg", kind: "beam", role: "support", buildStep: 5, position: v([0.28, 0.15, 0]), scale: v([0.22, 0.72, 0.22]), color: "#475569" },
  ];

  return {
    title: "Primitive Robot Builder",
    prompt,
    summary: "A robot emerges from a body hierarchy: stage, torso, head, sensors, limbs, and supports.",
    constructionLogic: [
      "Build from largest mass to smallest details.",
      "Use symmetry to make a primitive object feel designed.",
      "Use glowing small parts to create focus.",
    ],
    parts,
    beats: [
      { id: "beat_1", title: "Set the stage", narration: "The floor anchors the build.", partIds: ["floor"] },
      { id: "beat_2", title: "Add the body", narration: "The torso gives the robot a central mass.", partIds: ["torso"] },
      { id: "beat_3", title: "Add the head", narration: "The head creates a clear top and identity.", partIds: ["head"] },
      { id: "beat_4", title: "Add attention", narration: "Eyes make the object feel active with only two small primitives.", partIds: ["eye_l", "eye_r"] },
      { id: "beat_5", title: "Add limbs", narration: "Arms and legs turn the stack into a functional body.", partIds: ["arm_l", "arm_r", "leg_l", "leg_r"] },
    ],
  };
}

function makeBridgePlan(prompt: string): PrimitiveBuildPlan {
  const parts: PrimitivePart[] = [
    { id: "water", label: "water", kind: "rounded_box", role: "gap to cross", buildStep: 1, position: v([0, -0.13, 0]), scale: v([5.8, 0.08, 2.8]), color: "#0369a1", opacity: 0.68 },
    { id: "left_bank", label: "left bank", kind: "rounded_box", role: "support side", buildStep: 1, position: v([-2.2, 0.02, 0]), scale: v([1.1, 0.22, 3.0]), color: "#166534" },
    { id: "right_bank", label: "right bank", kind: "rounded_box", role: "support side", buildStep: 1, position: v([2.2, 0.02, 0]), scale: v([1.1, 0.22, 3.0]), color: "#166534" },
    { id: "deck", label: "bridge deck", kind: "rounded_box", role: "path across gap", buildStep: 2, position: v([0, 0.42, 0]), scale: v([4.8, 0.22, 0.72]), color: "#94a3b8", metalness: 0.1, roughness: 0.35 },
    { id: "tower_l", label: "left tower", kind: "beam", role: "vertical support", buildStep: 3, position: v([-1.5, 1.05, 0]), scale: v([0.25, 1.52, 0.25]), color: "#475569" },
    { id: "tower_r", label: "right tower", kind: "beam", role: "vertical support", buildStep: 3, position: v([1.5, 1.05, 0]), scale: v([0.25, 1.52, 0.25]), color: "#475569" },
    { id: "top_cable", label: "main cable", kind: "torus", role: "arched cable cue", buildStep: 4, position: v([0, 1.72, 0]), rotation: v([Math.PI / 2, 0, 0]), scale: v([1.75, 0.18, 0.06]), color: "#e2e8f0", metalness: 0.45, roughness: 0.25 },
    { id: "hanger_l", label: "left hanger", kind: "beam", role: "deck support", buildStep: 5, position: v([-0.72, 1.0, 0]), scale: v([0.06, 1.04, 0.06]), color: "#e2e8f0" },
    { id: "hanger_r", label: "right hanger", kind: "beam", role: "deck support", buildStep: 5, position: v([0.72, 1.0, 0]), scale: v([0.06, 1.04, 0.06]), color: "#e2e8f0" },
  ];

  return {
    title: "Primitive Bridge Builder",
    prompt,
    summary: "A bridge can be built by first showing the gap, then adding deck, supports, and load paths.",
    constructionLogic: [
      "Make the problem visible: there is a gap to cross.",
      "Add a path across the gap.",
      "Add supports and load-carrying cues to make it believable.",
    ],
    parts,
    beats: [
      { id: "beat_1", title: "Show the gap", narration: "The water and banks make the need for a bridge visible.", partIds: ["water", "left_bank", "right_bank"] },
      { id: "beat_2", title: "Add the crossing", narration: "The deck is the usable path across the gap.", partIds: ["deck"] },
      { id: "beat_3", title: "Add supports", narration: "Towers create vertical structure for the bridge.", partIds: ["tower_l", "tower_r"] },
      { id: "beat_4", title: "Add the load path", narration: "The cable suggests how force can be carried across the span.", partIds: ["top_cable"] },
      { id: "beat_5", title: "Tie it together", narration: "Hangers connect the deck back into the support system.", partIds: ["hanger_l", "hanger_r"] },
    ],
  };
}

function makeGenericPlan(prompt: string): PrimitiveBuildPlan {
  const clean = prompt.trim() || "build something interesting";
  const words = clean
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2 && !["build", "make", "create", "the", "and", "with"].includes(word))
    .slice(0, 5);

  const titleWord = words[0] ? words[0][0]!.toUpperCase() + words[0]!.slice(1) : "Object";

  const parts: PrimitivePart[] = [
    { id: "stage", label: "stage", kind: "rounded_box", role: "ground plane", buildStep: 1, position: v([0, -0.08, 0]), scale: v([4.8, 0.08, 3.4]), color: "#111827", opacity: 0.92 },
    { id: "core", label: `${titleWord} core`, kind: "rounded_box", role: "main mass inferred from the request", buildStep: 2, position: v([0, 0.82, 0]), scale: v([1.8, 1.1, 1.1]), color: "#8b5cf6", roughness: 0.32 },
    { id: "top", label: "top feature", kind: "sphere", role: "identity marker", buildStep: 3, position: v([0, 1.65, 0]), scale: v([0.58, 0.42, 0.58]), color: "#c4b5fd", opacity: 0.9 },
    { id: "left_support", label: "left support", kind: "beam", role: "supporting extension", buildStep: 4, position: v([-1.2, 0.45, 0]), rotation: v([0, 0, -0.34]), scale: v([0.16, 1.1, 0.16]), color: "#a78bfa" },
    { id: "right_support", label: "right support", kind: "beam", role: "supporting extension", buildStep: 4, position: v([1.2, 0.45, 0]), rotation: v([0, 0, 0.34]), scale: v([0.16, 1.1, 0.16]), color: "#a78bfa" },
    { id: "signal", label: "purpose glow", kind: "sphere", role: "small cue that marks the interesting part", buildStep: 5, position: v([0, 0.9, 0.72]), scale: v([0.22, 0.22, 0.22]), color: "#22c55e", opacity: 0.88 },
  ];

  return {
    title: `${titleWord} Primitive Builder`,
    prompt,
    summary: "This generic builder makes a readable object from stage, core, feature, supports, and one purpose marker. It is intentionally simple until a model-generated construction plan is connected.",
    constructionLogic: [
      "Extract a likely object name from the request.",
      "Create a readable main mass before details.",
      "Add a top feature, supports, and a focus marker so the primitive object feels designed.",
    ],
    parts,
    beats: [
      { id: "beat_1", title: "Set the stage", narration: "A base gives the generated object a readable world.", partIds: ["stage"] },
      { id: "beat_2", title: "Create the core", narration: "The largest primitive establishes what the build is about.", partIds: ["core"] },
      { id: "beat_3", title: "Add identity", narration: "A visible feature makes the shape less generic.", partIds: ["top"] },
      { id: "beat_4", title: "Add structure", narration: "Support pieces make the object feel built, not just placed.", partIds: ["left_support", "right_support"] },
      { id: "beat_5", title: "Add purpose", narration: "A small glow marks the place the learner should inspect first.", partIds: ["signal"] },
    ],
  };
}

function buildPrimitivePlan(prompt: string): PrimitiveBuildPlan {
  const lower = prompt.toLowerCase();
  if (/\b(car|vehicle|truck|automobile|engine car)\b/.test(lower)) return makeCarPlan(prompt);
  if (/\b(rocket|spaceship|missile)\b/.test(lower)) return makeRocketPlan(prompt);
  if (/\b(house|home|cabin|building)\b/.test(lower)) return makeHousePlan(prompt);
  if (/\b(robot|android|mech)\b/.test(lower)) return makeRobotPlan(prompt);
  if (/\b(bridge|span|crossing)\b/.test(lower)) return makeBridgePlan(prompt);
  return makeGenericPlan(prompt);
}

function clampStep(value: number, plan: PrimitiveBuildPlan) {
  return Math.max(1, Math.min(plan.beats.length, value));
}

function PartMesh({ part, active }: { part: PrimitivePart; active: boolean }) {
  const opacity = part.opacity ?? 1;
  const material = (
    <meshStandardMaterial
      color={part.color}
      transparent={opacity < 1}
      opacity={opacity}
      metalness={part.metalness ?? 0.12}
      roughness={part.roughness ?? 0.42}
      emissive={active ? part.color : "#000000"}
      emissiveIntensity={active ? 0.12 : 0}
    />
  );

  const common = {
    position: part.position,
    rotation: part.rotation ?? v([0, 0, 0]),
    scale: part.scale,
  };

  if (part.kind === "rounded_box") {
    return (
      <RoundedBox {...common} radius={0.08} smoothness={6}>
        {material}
      </RoundedBox>
    );
  }

  if (part.kind === "sphere") {
    return (
      <mesh {...common}>
        <sphereGeometry args={[1, 32, 18]} />
        {material}
      </mesh>
    );
  }

  if (part.kind === "cylinder") {
    return (
      <mesh {...common}>
        <cylinderGeometry args={[1, 1, 1, 32]} />
        {material}
      </mesh>
    );
  }

  if (part.kind === "cone") {
    return (
      <mesh {...common}>
        <coneGeometry args={[1, 1, 32]} />
        {material}
      </mesh>
    );
  }

  if (part.kind === "torus") {
    return (
      <mesh {...common}>
        <torusGeometry args={[1, 0.28, 18, 48]} />
        {material}
      </mesh>
    );
  }

  if (part.kind === "beam") {
    return (
      <RoundedBox {...common} radius={0.05} smoothness={4}>
        {material}
      </RoundedBox>
    );
  }

  return (
    <mesh {...common}>
      <boxGeometry args={[1, 1, 1]} />
      {material}
    </mesh>
  );
}

function PrimitiveScene({ plan, activeStep, showLabels }: { plan: PrimitiveBuildPlan; activeStep: number; showLabels: boolean }) {
  const activeBeat = plan.beats[activeStep - 1] ?? plan.beats[0];
  const activePartIds = new Set(activeBeat?.partIds ?? []);
  const visibleParts = plan.parts.filter((part) => part.buildStep <= activeStep);

  return (
    <Canvas camera={{ position: [4.6, 3.2, 5.2], fov: 44 }} shadows>
      <color attach="background" args={["#020617"]} />
      <ambientLight intensity={0.55} />
      <directionalLight position={[4, 6, 5]} intensity={1.15} castShadow />
      <pointLight position={[-3, 3, -4]} intensity={0.45} color="#60a5fa" />
      <group position={[0, 0, 0]} rotation={[0, -0.32, 0]}>
        {visibleParts.map((part) => {
          const active = activePartIds.has(part.id);
          const labelOffset = part.labelOffset ?? v([0, 0.72, 0]);
          return (
            <group key={part.id}>
              <PartMesh part={part} active={active} />
              {showLabels && (active || part.buildStep === activeStep) ? (
                <Html
                  position={[
                    part.position[0] + labelOffset[0],
                    part.position[1] + labelOffset[1],
                    part.position[2] + labelOffset[2],
                  ]}
                  center
                  distanceFactor={7.5}
                >
                  <div className="rounded-full border border-white/15 bg-black/70 px-2 py-1 text-[10px] font-semibold text-white shadow-xl backdrop-blur">
                    {part.label}
                  </div>
                </Html>
              ) : null}
            </group>
          );
        })}
      </group>

      <Text
        position={[0, 3.55, -1.7]}
        fontSize={0.16}
        maxWidth={4.2}
        textAlign="center"
        color="#dbeafe"
        anchorX="center"
        anchorY="middle"
      >
        {activeBeat?.title ?? plan.title}
      </Text>

      <gridHelper args={[8, 16, "#334155", "#1e293b"]} position={[0, -0.14, 0]} />
      <OrbitControls enableDamping makeDefault />
    </Canvas>
  );
}

function beatButtonTone(isActive: boolean) {
  return isActive
    ? "border-cyan-200/45 bg-cyan-300/20 text-cyan-50 shadow-[0_14px_34px_rgba(34,211,238,0.14)]"
    : "border-white/10 bg-white/[0.055] text-zinc-200 hover:bg-white/[0.09]";
}

const EXAMPLES = [
  "build a car with wheels, headlights, and a visible engine bay",
  "build a rocket on a launch pad",
  "build a cozy house",
  "build a friendly robot",
  "build a bridge across water",
];

export function PrimitiveBuilderLab() {
  const [prompt, setPrompt] = useState(EXAMPLES[0]!);
  const [submittedPrompt, setSubmittedPrompt] = useState(EXAMPLES[0]!);
  const [showLabels, setShowLabels] = useState(true);
  const plan = useMemo(() => buildPrimitivePlan(submittedPrompt), [submittedPrompt]);
  const [activeStep, setActiveStep] = useState(1);

  function submitPrompt(nextPrompt = prompt) {
    setSubmittedPrompt(nextPrompt);
    setPrompt(nextPrompt);
    setActiveStep(1);
  }

  const currentBeat = plan.beats[activeStep - 1] ?? plan.beats[0];
  const visibleCount = plan.parts.filter((part) => part.buildStep <= activeStep).length;

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <section className="mx-auto flex min-h-screen w-full max-w-[1500px] flex-col gap-5 px-5 py-5 lg:px-7">
        <header className="flex flex-wrap items-start justify-between gap-4 rounded-[2rem] border border-white/10 bg-white/[0.055] p-5 shadow-2xl backdrop-blur-xl">
          <div className="max-w-3xl">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-100/70">MyWay Sandbox</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Primitive Builder Lab</h1>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-zinc-200/72">
              A sandbox for the Lego approach: describe an object, generate a primitive construction plan, and build it in React Three Fiber without relying on external assets.
            </p>
          </div>
          <a
            href="/sandbox/probe-lab"
            className="rounded-2xl border border-white/10 bg-white/[0.07] px-4 py-2 text-sm font-semibold text-zinc-100 transition hover:bg-white/[0.11]"
          >
            Back to Probe Lab
          </a>
        </header>

        <section className="grid min-h-[720px] flex-1 gap-5 xl:grid-cols-[minmax(21rem,0.34fr)_minmax(0,1fr)_minmax(22rem,0.36fr)]">
          <aside className="flex flex-col gap-4 rounded-[2rem] border border-white/10 bg-white/[0.055] p-4 shadow-2xl backdrop-blur-xl">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-100/70">Prompt</p>
              <label className="mt-3 block text-sm font-semibold text-zinc-100" htmlFor="primitive-builder-prompt">
                What should MyWay build?
              </label>
              <textarea
                id="primitive-builder-prompt"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                rows={5}
                className="mt-2 w-full resize-none rounded-3xl border border-white/10 bg-black/35 p-4 text-sm leading-6 text-white outline-none transition placeholder:text-zinc-500 focus:border-cyan-200/45"
                placeholder="build a car"
              />
              <button
                type="button"
                onClick={() => submitPrompt()}
                className="mt-3 w-full rounded-2xl bg-cyan-300 px-4 py-3 text-sm font-black text-slate-950 transition hover:bg-cyan-200"
              >
                Build with primitives
              </button>
            </div>

            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-zinc-300/70">Try examples</p>
              <div className="mt-3 grid gap-2">
                {EXAMPLES.map((example) => (
                  <button
                    key={example}
                    type="button"
                    onClick={() => submitPrompt(example)}
                    className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-left text-xs leading-5 text-zinc-200 transition hover:bg-white/[0.08]"
                  >
                    {example}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-auto rounded-3xl border border-cyan-200/15 bg-cyan-300/10 p-4">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-cyan-100/80">Current scope</p>
              <p className="mt-2 text-sm leading-6 text-cyan-50/80">
                This first pass is deterministic. The shape of the plan is what a future model call should produce, but this lab lets us test the renderer and primitive vocabulary first.
              </p>
            </div>
          </aside>

          <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-black shadow-2xl">
            <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-white/[0.045] px-5 py-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-zinc-400">3D build space</p>
                <h2 className="mt-1 text-lg font-semibold text-white">{plan.title}</h2>
              </div>
              <label className="flex items-center gap-2 text-xs font-semibold text-zinc-300">
                <input
                  type="checkbox"
                  checked={showLabels}
                  onChange={(event) => setShowLabels(event.target.checked)}
                  className="h-4 w-4 rounded border-white/20 bg-black"
                />
                Labels
              </label>
            </div>
            <div className="h-[620px] min-h-[55vh]">
              <PrimitiveScene plan={plan} activeStep={activeStep} showLabels={showLabels} />
            </div>
          </section>

          <aside className="flex flex-col gap-4 rounded-[2rem] border border-white/10 bg-white/[0.055] p-4 shadow-2xl backdrop-blur-xl">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-100/70">Construction plan</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">{plan.title}</h2>
              <p className="mt-2 text-sm leading-7 text-zinc-200/76">{plan.summary}</p>
            </div>

            <div className="rounded-3xl border border-white/10 bg-black/24 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-zinc-300/70">Active beat</p>
                <span className="rounded-full border border-white/10 bg-white/[0.06] px-2 py-1 text-xs text-zinc-300">
                  {activeStep}/{plan.beats.length}
                </span>
              </div>
              <h3 className="mt-3 text-lg font-semibold text-white">{currentBeat?.title}</h3>
              <p className="mt-2 text-sm leading-6 text-zinc-200/76">{currentBeat?.narration}</p>
              <p className="mt-3 text-xs font-semibold text-cyan-100/70">Visible parts: {visibleCount}/{plan.parts.length}</p>
            </div>

            <div className="grid gap-2">
              {plan.beats.map((beat, index) => {
                const step = index + 1;
                return (
                  <button
                    key={beat.id}
                    type="button"
                    onClick={() => setActiveStep(clampStep(step, plan))}
                    className={`rounded-2xl border p-3 text-left transition ${beatButtonTone(step === activeStep)}`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold">{beat.title}</p>
                      <span className="text-xs opacity-70">{step}</span>
                    </div>
                    <p className="mt-1 text-xs leading-5 opacity-75">{beat.partIds.length} part{beat.partIds.length === 1 ? "" : "s"}</p>
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setActiveStep((step) => clampStep(step - 1, plan))}
                className="rounded-2xl border border-white/10 bg-white/[0.055] px-3 py-2 text-sm font-semibold text-zinc-100 transition hover:bg-white/[0.09]"
              >
                Previous
              </button>
              <button
                type="button"
                onClick={() => setActiveStep((step) => clampStep(step + 1, plan))}
                className="rounded-2xl border border-white/10 bg-white/[0.055] px-3 py-2 text-sm font-semibold text-zinc-100 transition hover:bg-white/[0.09]"
              >
                Next
              </button>
            </div>

            <details className="rounded-3xl border border-white/10 bg-black/24 p-4">
              <summary className="cursor-pointer text-sm font-semibold text-zinc-100">Show primitive plan JSON</summary>
              <pre className="mt-3 max-h-72 overflow-auto rounded-2xl bg-black/45 p-3 text-[11px] leading-5 text-zinc-300">
                {JSON.stringify(
                  {
                    prompt: plan.prompt,
                    constructionLogic: plan.constructionLogic,
                    beats: plan.beats,
                    parts: plan.parts.map(({ id, label, kind, role, buildStep }) => ({ id, label, kind, role, buildStep })),
                  },
                  null,
                  2,
                )}
              </pre>
            </details>
          </aside>
        </section>
      </section>
    </main>
  );
}
