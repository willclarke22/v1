"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { Html, Line, OrbitControls, RoundedBox, Text } from "@react-three/drei";
import * as THREE from "three";
import { createContext, FormEvent, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { MutableRefObject, ReactNode, RefObject } from "react";
import type { PrimitiveBeat, PrimitiveBuildPlanV1, PrimitivePart } from "../primitive-build-plan";
import type { PrimitiveSceneGraphV1 } from "../primitive-scene-graph";

type Vec3 = [number, number, number];
type ProviderChoice = "deepseek" | "glm";
type FallbackChoice = "none" | "deepseek" | "glm";

type GenerateResponse = {
  ok: boolean;
  schema_version?: string;
  plan: PrimitiveBuildPlanV1;
  scene_graph?: PrimitiveSceneGraphV1;
  warnings?: string[];
  provider_requested?: string;
  fallback_provider?: string;
  provider_used?: string;
  provider_model?: string;
  provider_fallback_used?: boolean;
  provider_call_error?: string | null;
  duration_ms?: number;
  prompt_stats?: {
    system_chars: number;
    user_chars: number;
    total_chars: number;
  };
  parse_ok?: boolean;
  parse_error?: string | null;
  model_call_diagnostics?: unknown;
  raw_text_preview?: string;
};

type RenderPart = PrimitivePart & {
  position: Vec3;
  scale: Vec3;
};

type ResolvedScene = {
  parts: RenderPart[];
  byId: Map<string, RenderPart>;
};

type SceneScriptKind =
  | "group"
  | "box"
  | "softBox"
  | "cylinder"
  | "sphere"
  | "torus"
  | "cone"
  | "rod"
  | "plane"
  | "glow"
  | "cloud";

type SceneScriptMotion = {
  type:
    | "driftY"
    | "oscillateY"
    | "pathLoop"
    | "pulse"
    | "rotateX"
    | "rotateY"
    | "rotateZ"
    | "swingX"
    | "swingY"
    | "swingZ"
    | "orbitAround"
    | "followTarget"
    | "connectBetween";
  speed?: number;
  phase?: number;
  amplitude?: number;
  centerY?: number;
  pivot?: Vec3;
  minAngle?: number;
  maxAngle?: number;
  points?: Vec3[];
  faceDirection?: boolean;
  center?: Vec3;
  radius?: number;
  plane?: "xy" | "xz" | "yz";
  target?: string;
  from?: string;
  to?: string;
  thickness?: number;
  minOpacity?: number;
  maxOpacity?: number;
  activeWindow?: [number, number];
};

type SceneScriptNode = {
  id: string;
  kind: SceneScriptKind;
  position?: Vec3;
  scale?: Vec3;
  rotation?: Vec3;
  color?: string;
  radius?: number;
  metalness?: number;
  roughness?: number;
  opacity?: number;
  motion?: SceneScriptMotion;
  children?: SceneScriptNode[];
};

type SceneScriptRegistryRef = MutableRefObject<Map<string, THREE.Object3D>>;

const SceneScriptRegistryContext = createContext<SceneScriptRegistryRef | null>(null);

const DEFAULT_PROMPT = "build a kitchen with a pot on the stove";

const DEFAULT_SCENE_SCRIPT = String.raw`return scene([
  // Room shell: one composed diorama, not independent floating panels.
  softBox("wood_base", [0, -0.16, 0], [9.7, 0.28, 7.2], "#9b6a3e", { radius: 0.16 }),
  softBox("floor", [0, 0, 0], [9.25, 0.14, 6.75], "#d6a564", { radius: 0.1 }),
  softBox("back_wall", [0, 2.12, -3.25], [9.25, 4.25, 0.24], "#ead8c5", { radius: 0.16 }),
  softBox("left_wall", [-4.5, 2.12, 0], [0.24, 4.25, 6.75], "#e2c5ab", { radius: 0.16 }),
  box("tile_backsplash", [-0.8, 1.36, -3.1], [6.45, 1.22, 0.05], "#d9bea3"),

  // L-shaped cabinet and counter system.
  group("lower_cabinets", [-0.45, 0, -2.22], [
    softBox("back_run_base", [-1.0, 0.45, 0], [6.35, 0.9, 1.25], "#6f7141", { radius: 0.08 }),
    softBox("back_run_counter", [-1.0, 0.98, 0], [6.6, 0.18, 1.42], "#ead7bd", { radius: 0.13 }),
    softBox("right_run_base", [2.95, 0.45, 1.45], [1.35, 0.9, 4.05], "#6f7141", { radius: 0.08 }),
    softBox("right_run_counter", [2.95, 0.98, 1.45], [1.52, 0.18, 4.25], "#ead7bd", { radius: 0.13 }),
    softBox("peninsula_base", [-3.35, 0.55, 2.15], [1.5, 1.08, 3.0], "#6f7141", { radius: 0.14 }),
    softBox("peninsula_counter", [-3.35, 1.16, 2.15], [1.72, 0.2, 3.25], "#ead7bd", { radius: 0.18 }),
    ...[-3.15, -2.05, 0.85, 1.95].map((x, i) => group("cabinet_door_" + i, [x, 0.45, 0.66], [
      softBox("cabinet_door_panel_" + i, [0, 0, 0], [0.78, 0.72, 0.05], "#777b45", { radius: 0.05 }),
      cylinder("cabinet_knob_" + i, [0.27, 0.02, 0.06], [0.035, 0.035, 0.035], "#211b17", { rotation: [Math.PI / 2, 0, 0] })
    ]))
  ]),

  // Stove owns oven door, burners, knobs, hood, and the pot anchor.
  group("stove", [-2.05, 0, -2.02], [
    softBox("stove_body", [0, 0.5, 0.08], [1.8, 1.0, 1.3], "#2f302f", { radius: 0.08, metalness: 0.2 }),
    softBox("cooktop", [0, 1.04, 0.08], [1.95, 0.1, 1.35], "#161716", { radius: 0.05, metalness: 0.35 }),
    softBox("oven_door", [0, 0.48, 0.78], [1.45, 0.62, 0.08], "#222222", { radius: 0.05, metalness: 0.3 }),
    softBox("oven_window", [0, 0.48, 0.835], [0.95, 0.38, 0.035], "#3d4a50", { radius: 0.03, opacity: 0.75 }),
    box("oven_handle", [0, 0.84, 0.9], [1.05, 0.055, 0.055], "#c7b6a1"),
    ...[-0.5, 0, 0.5].map((x, i) => cylinder("stove_knob_" + i, [x, 0.94, 0.87], [0.08, 0.05, 0.08], "#111111", { rotation: [Math.PI / 2, 0, 0] })),
    ...[[-0.4, -0.25], [0.4, -0.25], [-0.4, 0.45], [0.4, 0.45]].map(([x, z], i) => torus("burner_" + i, [x, 1.12, z], [0.22, 0.22, 0.22], "#0d0d0d")),
    softBox("range_hood_low", [0, 2.52, -0.08], [1.7, 0.18, 0.9], "#c7c3bb", { radius: 0.04, metalness: 0.55 }),
    softBox("range_hood_top", [0, 2.9, -0.16], [1.1, 0.72, 0.55], "#aaa59c", { radius: 0.04, metalness: 0.55 }),
  ]),

  // Pot group: lid, handles, and steam are children of the pot, so they never drift.
  group("pot_on_burner", [-2.45, 1.2, -2.0], [
    cylinder("pot_body", [0, 0.26, 0], [0.42, 0.52, 0.42], "#b7b1a5", { metalness: 0.65, roughness: 0.32 }),
    torus("pot_rim", [0, 0.55, 0], [0.42, 0.42, 0.42], "#8b867c"),
    cylinder("pot_lid", [0, 0.62, 0], [0.45, 0.065, 0.45], "#d4cec3", { metalness: 0.6, roughness: 0.3 }),
    sphere("lid_knob", [0, 0.75, 0], [0.11, 0.11, 0.11], "#312b26"),
    rod("left_handle", [-0.55, 0.36, 0], [0.44, 0.055, 0.055], "#29231e", { rotation: [0, 0, Math.PI / 2] }),
    rod("right_handle", [0.55, 0.36, 0], [0.44, 0.055, 0.055], "#29231e", { rotation: [0, 0, Math.PI / 2] }),
    cloud("steam", [0, 1.08, 0], [0.65, 1.0, 0.65], "#ffffff", { opacity: 0.32 })
  ]),

  // Upper cabinets, window, sink, fridge, and a few props.
  group("upper_cabinets", [-0.5, 0, -3.0], [
    ...[-3.35, -2.15, 0.1, 1.3].map((x, i) => group("upper_cabinet_" + i, [x, 2.65, 0], [
      softBox("upper_box_" + i, [0, 0, 0], [1.0, 1.2, 0.55], "#737641", { radius: 0.09 }),
      softBox("upper_panel_" + i, [0, 0, 0.29], [0.78, 0.92, 0.04], "#797d48", { radius: 0.07 }),
      sphere("upper_knob_" + i, [0.28, -0.04, 0.33], [0.04, 0.04, 0.04], "#211b17")
    ])),
    softBox("open_shelf", [2.55, 2.62, 0], [1.0, 1.2, 0.5], "#795a32", { radius: 0.06 })
  ]),
  group("window_and_sink", [0, 0, 0], [
    softBox("window_frame", [2.25, 2.05, -3.04], [1.75, 1.55, 0.08], "#f5ebdc", { radius: 0.05 }),
    box("window_glass", [2.25, 2.05, -2.98], [1.45, 1.25, 0.03], "#d8eff7", { opacity: 0.62 }),
    softBox("sink_rim", [2.4, 1.14, -0.6], [1.0, 0.12, 0.72], "#c7c0b4", { radius: 0.06, metalness: 0.25 }),
    softBox("sink_basin", [2.4, 1.18, -0.6], [0.72, 0.08, 0.48], "#33383a", { radius: 0.05, metalness: 0.35 }),
    rod("faucet_stem", [2.4, 1.44, -0.94], [0.06, 0.44, 0.06], "#1f1d1a"),
    rod("faucet_arm", [2.58, 1.66, -0.88], [0.36, 0.055, 0.055], "#1f1d1a")
  ]),
  group("fridge", [3.75, 0, -1.0], [
    softBox("fridge_body", [0, 1.15, 0], [1.2, 2.3, 1.05], "#aaa399", { radius: 0.14, metalness: 0.45, roughness: 0.35 }),
    box("fridge_split", [0, 1.55, 0.55], [1.1, 0.035, 0.04], "#2e2e2e"),
    rod("fridge_lower_handle", [0.45, 1.0, 0.62], [0.055, 0.65, 0.055], "#4a4540"),
    rod("fridge_upper_handle", [0.45, 1.85, 0.62], [0.055, 0.48, 0.055], "#4a4540")
  ]),
  softBox("woven_rug", [0.9, 0.04, 1.35], [2.4, 0.035, 1.25], "#b57a45", { radius: 0.04 }),
  glow("warm_under_cabinet_light", [-1.2, 1.78, -2.9], [4.6, 0.08, 0.08], "#ffd08a", { opacity: 0.55 })
]);`;

function v(value: Vec3): Vec3 {
  return value;
}


function scaledSize(part: PrimitivePart): Vec3 {
  const scaleFactor = 0.72;
  const size = part.size ?? [1, 1, 1];
  return [Math.max(0.04, size[0] * scaleFactor), Math.max(0.04, size[1] * scaleFactor), Math.max(0.04, size[2] * scaleFactor)];
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function partOffset(part: PrimitivePart): Vec3 {
  const offset = part.placement.offset ?? [0, 0, 0];
  return [offset[0] ?? 0, offset[1] ?? 0, offset[2] ?? 0];
}

function gentleOffset(part: PrimitivePart, axes: { x?: boolean; y?: boolean; z?: boolean } = { x: true, y: true, z: true }): Vec3 {
  const offset = partOffset(part);
  // Model offsets are hints, not coordinates. Keep them small so relationships/anchors stay in charge.
  return [
    axes.x === false ? 0 : clamp(offset[0], -2.5, 2.5) * 0.16,
    axes.y === false ? 0 : clamp(offset[1], -2.5, 2.5) * 0.18,
    axes.z === false ? 0 : clamp(offset[2], -2.5, 2.5) * 0.16,
  ];
}

function rootNudge(part: PrimitivePart): Vec3 {
  const offset = partOffset(part);
  return [clamp(offset[0], -2.5, 2.5) * 0.12, clamp(offset[1], -2.5, 2.5) * 0.08, clamp(offset[2], -2.5, 2.5) * 0.12];
}

function topOf(part: RenderPart) {
  return part.position[1] + part.scale[1] / 2;
}

function bottomOf(part: RenderPart) {
  return part.position[1] - part.scale[1] / 2;
}

function isHorizontalSurface(part: PrimitivePart | RenderPart) {
  const size = "scale" in part ? part.scale : scaledSize(part);
  return size[1] <= Math.max(0.08, Math.min(size[0], size[2]) * 0.16);
}

function isVerticalPanel(part: PrimitivePart | RenderPart) {
  const size = "scale" in part ? part.scale : scaledSize(part);
  return size[1] > 0.45 && (size[2] <= Math.max(0.08, size[0] * 0.18) || size[0] <= Math.max(0.08, size[2] * 0.18));
}

function panelThinAxis(part: PrimitivePart | RenderPart): "x" | "z" | null {
  const size = "scale" in part ? part.scale : scaledSize(part);
  if (!isVerticalPanel(part)) return null;
  return size[0] < size[2] ? "x" : "z";
}

function footprintArea(part: PrimitivePart) {
  const size = scaledSize(part);
  return size[0] * size[2];
}

function findPrimaryRoot(parts: PrimitivePart[]) {
  const explicitRoots = parts.filter((part) => part.placement.relation === "root" || !part.placement.target_id);
  const candidates = explicitRoots.length ? explicitRoots : parts;
  const floorLike = candidates.filter((part) => isHorizontalSurface(part));
  const bestPool = floorLike.length ? floorLike : candidates;
  return bestPool.slice().sort((a, b) => footprintArea(b) - footprintArea(a))[0] ?? parts[0];
}

function anchorPoint(target: RenderPart, anchor?: string): Vec3 {
  const t = target.position;
  const s = target.scale;
  switch (anchor) {
    case "top":
      return [t[0], t[1] + s[1] / 2, t[2]];
    case "bottom":
      return [t[0], t[1] - s[1] / 2, t[2]];
    case "left":
      return [t[0] - s[0] / 2, t[1], t[2]];
    case "right":
      return [t[0] + s[0] / 2, t[1], t[2]];
    case "front":
      return [t[0], t[1], t[2] + s[2] / 2];
    case "back":
      return [t[0], t[1], t[2] - s[2] / 2];
    default:
      return t;
  }
}

function resolveRootPosition(part: PrimitivePart, primaryRoot: PrimitivePart | null, primaryRootRendered: RenderPart | null): Vec3 {
  const scale = scaledSize(part);
  const nudge = rootNudge(part);

  if (!primaryRoot || part.id === primaryRoot.id || !primaryRootRendered) {
    return [nudge[0], scale[1] / 2 + nudge[1], nudge[2]];
  }

  const root = primaryRootRendered;
  const thinAxis = panelThinAxis(part);
  if (thinAxis === "z") {
    return [root.position[0] + nudge[0], topOf(root) + scale[1] / 2 + nudge[1], root.position[2] - root.scale[2] / 2 + scale[2] / 2 + nudge[2]];
  }
  if (thinAxis === "x") {
    return [root.position[0] + root.scale[0] / 2 - scale[0] / 2 + nudge[0], topOf(root) + scale[1] / 2 + nudge[1], root.position[2] + nudge[2]];
  }

  // Multiple roots should still form one composed scene rather than spread into separate islands.
  return [root.position[0] + nudge[0], topOf(root) + scale[1] / 2 + nudge[1], root.position[2] + nudge[2]];
}

function resolveRelativePosition(part: PrimitivePart, target: RenderPart): Vec3 {
  const scale = scaledSize(part);
  const t = target.position;
  const ts = target.scale;
  const relation = part.placement.relation;
  const anchor = part.placement.anchor;
  const anchorPosition = anchorPoint(target, anchor);
  let position: Vec3;

  switch (relation) {
    case "on_top_of": {
      const nudge = gentleOffset(part, { x: true, y: false, z: true });
      position = [anchorPosition[0] + nudge[0], topOf(target) + scale[1] / 2 + 0.025, anchorPosition[2] + nudge[2]];
      break;
    }
    case "below": {
      const nudge = gentleOffset(part, { x: true, y: false, z: true });
      position = [anchorPosition[0] + nudge[0], bottomOf(target) - scale[1] / 2 - 0.025, anchorPosition[2] + nudge[2]];
      break;
    }
    case "left_of": {
      const nudge = gentleOffset(part, { x: false, y: true, z: true });
      position = [t[0] - ts[0] / 2 - scale[0] / 2 - 0.08, anchorPosition[1] + nudge[1], anchorPosition[2] + nudge[2]];
      break;
    }
    case "right_of": {
      const nudge = gentleOffset(part, { x: false, y: true, z: true });
      position = [t[0] + ts[0] / 2 + scale[0] / 2 + 0.08, anchorPosition[1] + nudge[1], anchorPosition[2] + nudge[2]];
      break;
    }
    case "in_front_of": {
      const nudge = gentleOffset(part, { x: true, y: true, z: false });
      const y = isVerticalPanel(part) && isHorizontalSurface(target) ? topOf(target) + scale[1] / 2 + Math.max(0, nudge[1]) * 0.35 : anchorPosition[1] + nudge[1];
      position = [anchorPosition[0] + nudge[0], y, t[2] + ts[2] / 2 + scale[2] / 2 + 0.08];
      break;
    }
    case "behind": {
      const nudge = gentleOffset(part, { x: true, y: true, z: false });
      const y = isVerticalPanel(part) && isHorizontalSurface(target) ? topOf(target) + scale[1] / 2 + Math.max(0, nudge[1]) * 0.35 : anchorPosition[1] + nudge[1];
      position = [anchorPosition[0] + nudge[0], y, t[2] - ts[2] / 2 - scale[2] / 2 - 0.08];
      break;
    }
    case "inside": {
      const nudge = gentleOffset(part, { x: true, y: true, z: true });
      const y = isHorizontalSurface(target) ? topOf(target) + scale[1] / 2 + 0.025 : t[1] + nudge[1];
      position = [t[0] + nudge[0], y, t[2] + nudge[2]];
      break;
    }
    case "centered_on": {
      const nudge = gentleOffset(part, { x: true, y: true, z: true });
      position = [t[0] + nudge[0], topOf(target) + scale[1] / 2 + nudge[1] * 0.5, t[2] + nudge[2]];
      break;
    }
    case "around": {
      const nudge = gentleOffset(part, { x: true, y: true, z: true });
      position = [t[0] + nudge[0], t[1] + nudge[1], t[2] + ts[2] / 2 + scale[2] / 2 + 0.16 + nudge[2]];
      break;
    }
    case "along": {
      const nudge = gentleOffset(part, { x: true, y: true, z: true });
      position = [t[0] + nudge[0], topOf(target) + scale[1] / 2 + nudge[1] * 0.5, t[2] + nudge[2]];
      break;
    }
    case "attached_to":
    default: {
      const nudge = gentleOffset(part, { x: true, y: true, z: true });
      switch (anchor) {
        case "front":
          position = [anchorPosition[0] + nudge[0], isVerticalPanel(part) && isHorizontalSurface(target) ? topOf(target) + scale[1] / 2 + Math.max(0, nudge[1]) * 0.35 : anchorPosition[1] + nudge[1], anchorPosition[2] + scale[2] / 2 + 0.025];
          break;
        case "back":
          position = [anchorPosition[0] + nudge[0], isVerticalPanel(part) && isHorizontalSurface(target) ? topOf(target) + scale[1] / 2 + Math.max(0, nudge[1]) * 0.35 : anchorPosition[1] + nudge[1], anchorPosition[2] - scale[2] / 2 - 0.025];
          break;
        case "left":
          position = [anchorPosition[0] - scale[0] / 2 - 0.025, anchorPosition[1] + nudge[1], anchorPosition[2] + nudge[2]];
          break;
        case "right":
          position = [anchorPosition[0] + scale[0] / 2 + 0.025, anchorPosition[1] + nudge[1], anchorPosition[2] + nudge[2]];
          break;
        case "bottom":
          position = [anchorPosition[0] + nudge[0], anchorPosition[1] - scale[1] / 2 - 0.025, anchorPosition[2] + nudge[2]];
          break;
        case "top":
          position = [anchorPosition[0] + nudge[0], anchorPosition[1] + scale[1] / 2 + 0.025, anchorPosition[2] + nudge[2]];
          break;
        default:
          position = [t[0] + nudge[0], topOf(target) + scale[1] / 2 + nudge[1], t[2] + nudge[2]];
      }
      break;
    }
  }

  if (part.role === "light_source") {
    position = [t[0], Math.max(position[1], topOf(target) + 1.2), t[2] + 0.25];
  }

  return position;
}

function siblingKey(part: PrimitivePart) {
  return `${part.placement.target_id ?? "root"}|${part.placement.relation}|${part.placement.anchor ?? "center"}`;
}

function distributeSiblings(plan: PrimitiveBuildPlanV1, byId: Map<string, RenderPart>) {
  const groups = new Map<string, PrimitivePart[]>();
  plan.parts.forEach((part) => {
    if (!part.placement.target_id) return;
    const key = siblingKey(part);
    const group = groups.get(key) ?? [];
    group.push(part);
    groups.set(key, group);
  });

  groups.forEach((group) => {
    if (group.length < 2) return;
    const first = group[0];
    const target = first.placement.target_id ? byId.get(first.placement.target_id) : null;
    if (!target) return;

    const relation = first.placement.relation;
    const shouldGrid = relation === "on_top_of" || relation === "inside" || relation === "centered_on";
    if (!shouldGrid) return;

    const columns = Math.ceil(Math.sqrt(group.length));
    const rows = Math.ceil(group.length / columns);
    const usableX = Math.max(0.36, target.scale[0] * 0.7);
    const usableZ = Math.max(0.36, target.scale[2] * 0.7);
    const xStep = columns > 1 ? usableX / (columns - 1) : 0;
    const zStep = rows > 1 ? usableZ / (rows - 1) : 0;

    group.forEach((part, index) => {
      const rendered = byId.get(part.id);
      if (!rendered) return;
      const col = index % columns;
      const row = Math.floor(index / columns);
      const x = columns > 1 ? target.position[0] - usableX / 2 + col * xStep : target.position[0];
      const z = rows > 1 ? target.position[2] - usableZ / 2 + row * zStep : target.position[2];
      rendered.position = [x, rendered.position[1], z];
    });
  });
}

function composeScene(parts: RenderPart[]) {
  if (!parts.length) return;
  const minX = Math.min(...parts.map((part) => part.position[0] - part.scale[0] / 2));
  const maxX = Math.max(...parts.map((part) => part.position[0] + part.scale[0] / 2));
  const minY = Math.min(...parts.map((part) => part.position[1] - part.scale[1] / 2));
  const minZ = Math.min(...parts.map((part) => part.position[2] - part.scale[2] / 2));
  const maxZ = Math.max(...parts.map((part) => part.position[2] + part.scale[2] / 2));
  const centerX = (minX + maxX) / 2;
  const centerZ = (minZ + maxZ) / 2;

  parts.forEach((part) => {
    part.position = [part.position[0] - centerX, part.position[1] - minY, part.position[2] - centerZ];
  });
}

function resolveScene(plan: PrimitiveBuildPlanV1): ResolvedScene {
  const byId = new Map<string, RenderPart>();
  const pending = [...plan.parts];
  const primaryRoot = findPrimaryRoot(plan.parts);

  if (primaryRoot) {
    byId.set(primaryRoot.id, { ...primaryRoot, scale: scaledSize(primaryRoot), position: resolveRootPosition(primaryRoot, primaryRoot, null) });
  }

  plan.parts
    .filter((part) => (part.placement.relation === "root" || !part.placement.target_id) && !byId.has(part.id))
    .forEach((part) => {
      const primaryRendered = primaryRoot ? byId.get(primaryRoot.id) ?? null : null;
      byId.set(part.id, { ...part, scale: scaledSize(part), position: resolveRootPosition(part, primaryRoot ?? null, primaryRendered) });
    });

  let guard = 0;
  while (byId.size < plan.parts.length && guard < plan.parts.length * 4) {
    guard += 1;
    for (const part of pending) {
      if (byId.has(part.id)) continue;
      const targetId = part.placement.target_id;
      const target = targetId ? byId.get(targetId) : null;
      if (!target) continue;

      byId.set(part.id, { ...part, scale: scaledSize(part), position: resolveRelativePosition(part, target) });
    }
  }

  plan.parts.forEach((part, index) => {
    if (!byId.has(part.id)) {
      const scale = scaledSize(part);
      byId.set(part.id, {
        ...part,
        scale,
        position: [(index % 5 - 2) * 0.7, scale[1] / 2, Math.floor(index / 5) * 0.7],
      });
    }
  });

  distributeSiblings(plan, byId);
  const parts = plan.parts.map((part) => byId.get(part.id)!).filter(Boolean);
  composeScene(parts);

  return { parts, byId };
}
function visiblePartIds(plan: PrimitiveBuildPlanV1, activeStep: number) {
  const visible = new Set<string>();
  const safeStep = Math.max(1, Math.min(activeStep, plan.beats.length));
  plan.beats.slice(0, safeStep).forEach((beat) => {
    beat.reveal.forEach((id) => visible.add(id));
  });

  // Keep placement parents visible so an introduced child never floats alone.
  let changed = true;
  while (changed) {
    changed = false;
    plan.parts.forEach((part) => {
      if (!visible.has(part.id)) return;
      const targetId = part.placement.target_id;
      if (targetId && !visible.has(targetId)) {
        visible.add(targetId);
        changed = true;
      }
    });
  }

  return visible;
}

function activePartIds(beat: PrimitiveBeat | undefined) {
  return new Set([...(beat?.reveal ?? []), ...(beat?.emphasize ?? []), ...((beat?.effects ?? []).map((effect) => effect.target_id))]);
}

function materialColor(part: PrimitivePart, active: boolean) {
  if (part.material === "glass") return active ? "#bae6fd" : "#7dd3fc";
  if (part.material === "metal") return active ? "#e5e7eb" : "#94a3b8";
  if (part.material === "glow") return active ? "#fde68a" : "#f59e0b";
  if (part.material === "particle") return active ? "#fed7aa" : "#fb923c";
  if (part.material === "line") return active ? "#c4b5fd" : "#818cf8";
  if (part.role === "background") return "#111827";
  if (part.role === "surface") return active ? "#f8fafc" : "#cbd5e1";
  if (part.role === "container") return active ? "#67e8f9" : "#0891b2";
  if (part.role === "rotator") return active ? "#facc15" : "#334155";
  if (part.role === "connector") return active ? "#fef3c7" : "#64748b";
  if (part.role === "opening") return active ? "#dbeafe" : "#60a5fa";
  if (part.role === "flow" || part.role === "particle_field") return active ? "#fdba74" : "#f97316";
  return active ? "#67e8f9" : "#38bdf8";
}

function materialFor(part: PrimitivePart, active: boolean) {
  const color = materialColor(part, active);
  const transparent = part.material === "glass" || part.primitive === "transparent_shell" || part.modifiers?.includes("transparent") || part.modifiers?.includes("cutaway") || part.material === "particle" || part.primitive === "glow";
  const opacity = part.primitive === "glow" ? 0.55 : part.material === "glass" || part.primitive === "transparent_shell" ? 0.42 : part.modifiers?.includes("transparent") || part.modifiers?.includes("cutaway") ? 0.5 : 1;
  return (
    <meshStandardMaterial
      color={color}
      transparent={transparent}
      opacity={opacity}
      metalness={part.material === "metal" ? 0.42 : 0.08}
      roughness={part.material === "glass" ? 0.12 : part.material === "metal" ? 0.24 : 0.42}
      emissive={part.material === "glow" || active ? color : "#000000"}
      emissiveIntensity={part.material === "glow" ? 0.55 : active ? 0.12 : 0}
      wireframe={part.modifiers?.includes("outlined")}
    />
  );
}

function ParticleCloud({ part, active }: { part: RenderPart; active: boolean }) {
  const color = materialColor(part, active);
  const dots = Array.from({ length: 14 }, (_, index) => {
    const angle = index * 2.399963;
    const radius = 0.16 + (index % 4) * 0.09;
    return [Math.cos(angle) * radius, (index % 5) * 0.12 - 0.22, Math.sin(angle) * radius] as Vec3;
  });

  return (
    <group position={part.position} scale={part.scale}>
      {dots.map((dot, index) => (
        <mesh key={index} position={dot}>
          <sphereGeometry args={[0.09, 16, 10]} />
          <meshStandardMaterial color={color} transparent opacity={0.42} emissive={color} emissiveIntensity={active ? 0.24 : 0.1} />
        </mesh>
      ))}
    </group>
  );
}

function ArrowPrimitive({ part, active }: { part: RenderPart; active: boolean }) {
  const color = materialColor(part, active);
  return (
    <group position={part.position} scale={part.scale}>
      <RoundedBox position={[0, 0, 0]} scale={[1, 0.12, 0.12]} radius={0.04} smoothness={4}>
        <meshStandardMaterial color={color} emissive={active ? color : "#000000"} emissiveIntensity={active ? 0.15 : 0} />
      </RoundedBox>
      <mesh position={[0.62, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
        <coneGeometry args={[0.22, 0.38, 24]} />
        <meshStandardMaterial color={color} emissive={active ? color : "#000000"} emissiveIntensity={active ? 0.15 : 0} />
      </mesh>
    </group>
  );
}

function PartMesh({ part, active }: { part: RenderPart; active: boolean }) {
  const common = { position: part.position, scale: part.scale };

  if (part.primitive === "particle_cloud") return <ParticleCloud part={part} active={active} />;
  if (part.primitive === "arrow") return <ArrowPrimitive part={part} active={active} />;

  if (part.primitive === "label") {
    return (
      <Text position={part.position} fontSize={0.2} maxWidth={2.2} textAlign="center" color="#e0f2fe" anchorX="center" anchorY="middle">
        {part.display_name}
      </Text>
    );
  }

  if (part.primitive === "path") {
    return <Line points={[[-part.scale[0] / 2, part.position[1], part.position[2]], [part.scale[0] / 2, part.position[1], part.position[2]]]} color={materialColor(part, active)} lineWidth={3} />;
  }

  if (part.primitive === "rounded_box" || part.primitive === "rod" || part.primitive === "transparent_shell" || part.primitive === "plane") {
    const scale = part.primitive === "plane" ? v([part.scale[0], Math.min(part.scale[1], 0.05), part.scale[2]]) : part.primitive === "rod" ? v([Math.max(part.scale[0], 0.14), Math.max(part.scale[1], 0.14), Math.max(part.scale[2], 0.14)]) : part.scale;
    return (
      <RoundedBox position={part.position} scale={scale} radius={part.modifiers?.includes("rounded") || part.primitive === "rounded_box" ? 0.08 : 0.035} smoothness={6}>
        {materialFor(part, active)}
      </RoundedBox>
    );
  }

  if (part.primitive === "sphere" || part.primitive === "ellipsoid" || part.primitive === "glow") {
    return (
      <mesh {...common}>
        <sphereGeometry args={[1, 32, 18]} />
        {materialFor(part, active)}
      </mesh>
    );
  }

  if (part.primitive === "cylinder") {
    return (
      <mesh {...common}>
        <cylinderGeometry args={[1, 1, 1, 36]} />
        {materialFor(part, active)}
      </mesh>
    );
  }

  if (part.primitive === "cone") {
    return (
      <mesh {...common}>
        <coneGeometry args={[1, 1, 36]} />
        {materialFor(part, active)}
      </mesh>
    );
  }

  if (part.primitive === "capsule") {
    return (
      <group position={part.position} scale={part.scale}>
        <mesh>
          <cylinderGeometry args={[0.45, 0.45, 1, 24]} />
          {materialFor(part, active)}
        </mesh>
        <mesh position={[0, 0.5, 0]}>
          <sphereGeometry args={[0.45, 24, 12]} />
          {materialFor(part, active)}
        </mesh>
        <mesh position={[0, -0.5, 0]}>
          <sphereGeometry args={[0.45, 24, 12]} />
          {materialFor(part, active)}
        </mesh>
      </group>
    );
  }

  if (part.primitive === "torus") {
    return (
      <mesh {...common}>
        <torusGeometry args={[1, 0.24, 18, 48]} />
        {materialFor(part, active)}
      </mesh>
    );
  }

  return (
    <mesh {...common}>
      <boxGeometry args={[1, 1, 1]} />
      {materialFor(part, active)}
    </mesh>
  );
}

function PrimitiveScene({ plan, activeStep, showLabels }: { plan: PrimitiveBuildPlanV1; activeStep: number; showLabels: boolean }) {
  const scene = useMemo(() => resolveScene(plan), [plan]);
  const activeBeat = plan.beats[activeStep - 1] ?? plan.beats[0];
  const visibleIds = visiblePartIds(plan, activeStep);
  const activeIds = activePartIds(activeBeat);
  const visibleParts = scene.parts.filter((part) => visibleIds.has(part.id));

  return (
    <Canvas camera={{ position: [5.2, 3.8, 6.2], fov: 44 }} shadows>
      <color attach="background" args={["#020617"]} />
      <ambientLight intensity={0.52} />
      <directionalLight position={[4, 7, 5]} intensity={1.25} castShadow />
      <pointLight position={[-4, 3, -4]} intensity={0.6} color="#60a5fa" />
      <pointLight position={[3, 2.5, 3]} intensity={0.35} color="#fbbf24" />
      <group rotation={[0, -0.35, 0]}>
        {visibleParts.map((part) => {
          const active = activeIds.has(part.id);
          return (
            <group key={part.id}>
              <PartMesh part={part} active={active} />
              {showLabels && active ? (
                <Html position={[part.position[0], part.position[1] + part.scale[1] / 2 + 0.28, part.position[2]]} center distanceFactor={7.5}>
                  <div className="rounded-full border border-white/15 bg-black/70 px-2 py-1 text-[10px] font-semibold text-white shadow-xl backdrop-blur">
                    {part.display_name}
                  </div>
                </Html>
              ) : null}
            </group>
          );
        })}
      </group>
      <Text position={[0, 3.7, -2.2]} fontSize={0.18} maxWidth={4.8} textAlign="center" color="#dbeafe" anchorX="center" anchorY="middle">
        {activeBeat?.title ?? plan.scene_title}
      </Text>
      <gridHelper args={[9, 18, "#334155", "#1e293b"]} position={[0, -0.04, 0]} />
      <OrbitControls enableDamping makeDefault />
    </Canvas>
  );
}

function beatButtonTone(isActive: boolean) {
  return isActive
    ? "border-cyan-200/45 bg-cyan-300/20 text-cyan-50 shadow-[0_14px_34px_rgba(34,211,238,0.14)]"
    : "border-white/10 bg-white/[0.055] text-zinc-200 hover:bg-white/[0.09]";
}

function clampStep(value: number, plan: PrimitiveBuildPlanV1 | null) {
  if (!plan) return 1;
  return Math.max(1, Math.min(plan.beats.length, value));
}

function providerLabel(value: string | undefined) {
  if (value === "glm") return "GLM-5.2";
  if (value === "deepseek") return "DeepSeek V4 Pro";
  return value ?? "unknown";
}

function scriptVec3(value: unknown, fallback: Vec3): Vec3 {
  if (!Array.isArray(value)) return fallback;
  return [Number(value[0] ?? fallback[0]), Number(value[1] ?? fallback[1]), Number(value[2] ?? fallback[2])];
}

function normalizeMotion(raw: unknown): SceneScriptMotion | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const motion = raw as Partial<SceneScriptMotion>;
  if (!motion.type || typeof motion.type !== "string") return undefined;
  return {
    ...motion,
    pivot: scriptVec3(motion.pivot, [0, 0, 0]),
    center: scriptVec3(motion.center, [0, 0, 0]),
    points: Array.isArray(motion.points) ? motion.points.map((point) => scriptVec3(point, [0, 0, 0])) : undefined,
  } as SceneScriptMotion;
}

function normalizeNode(raw: unknown): SceneScriptNode | null {
  if (!raw || typeof raw !== "object") return null;
  const node = raw as SceneScriptNode;
  if (!node.id || !node.kind) return null;
  return {
    ...node,
    position: scriptVec3(node.position, [0, 0, 0]),
    scale: scriptVec3(node.scale, [1, 1, 1]),
    rotation: scriptVec3(node.rotation, [0, 0, 0]),
    color: node.color ?? "#94a3b8",
    motion: normalizeMotion(node.motion),
    children: Array.isArray(node.children) ? node.children.map(normalizeNode).filter(Boolean) as SceneScriptNode[] : undefined,
  };
}

function flattenNodes(nodes: unknown[]): SceneScriptNode[] {
  return nodes.flat(Infinity).map(normalizeNode).filter(Boolean) as SceneScriptNode[];
}

function sceneGraphToSceneScriptNodes(sceneGraph: PrimitiveSceneGraphV1 | null): SceneScriptNode[] {
  if (!sceneGraph) return [];
  return flattenNodes(sceneGraph.nodes as unknown[]);
}

function countSceneScriptNodes(nodes: SceneScriptNode[]): number {
  return nodes.reduce((count, node) => count + 1 + countSceneScriptNodes(node.children ?? []), 0);
}

function makeNode(kind: SceneScriptKind, id: string, position: Vec3, scale: Vec3, color: string, options: Partial<SceneScriptNode> = {}): SceneScriptNode {
  return { id, kind, position, scale, color, ...options };
}

function compileSceneScript(code: string): { nodes: SceneScriptNode[]; error: string | null } {
  const scene = (nodes: unknown[]) => flattenNodes(nodes);
  const group = (id: string, position: Vec3, children: unknown[], options: Partial<SceneScriptNode> = {}) =>
    makeNode("group", id, position, [1, 1, 1], options.color ?? "#ffffff", { ...options, children: flattenNodes(children) });
  const box = (id: string, position: Vec3, scale: Vec3, color: string, options: Partial<SceneScriptNode> = {}) => makeNode("box", id, position, scale, color, options);
  const softBox = (id: string, position: Vec3, scale: Vec3, color: string, options: Partial<SceneScriptNode> = {}) => makeNode("softBox", id, position, scale, color, options);
  const cylinder = (id: string, position: Vec3, scale: Vec3, color: string, options: Partial<SceneScriptNode> = {}) => makeNode("cylinder", id, position, scale, color, options);
  const sphere = (id: string, position: Vec3, scale: Vec3, color: string, options: Partial<SceneScriptNode> = {}) => makeNode("sphere", id, position, scale, color, options);
  const torus = (id: string, position: Vec3, scale: Vec3, color: string, options: Partial<SceneScriptNode> = {}) => makeNode("torus", id, position, scale, color, { rotation: [Math.PI / 2, 0, 0], ...options });
  const cone = (id: string, position: Vec3, scale: Vec3, color: string, options: Partial<SceneScriptNode> = {}) => makeNode("cone", id, position, scale, color, options);
  const rod = (id: string, position: Vec3, scale: Vec3, color: string, options: Partial<SceneScriptNode> = {}) => makeNode("rod", id, position, scale, color, options);
  const plane = (id: string, position: Vec3, scale: Vec3, color: string, options: Partial<SceneScriptNode> = {}) => makeNode("plane", id, position, scale, color, options);
  const glow = (id: string, position: Vec3, scale: Vec3, color: string, options: Partial<SceneScriptNode> = {}) => makeNode("glow", id, position, scale, color, options);
  const cloud = (id: string, position: Vec3, scale: Vec3, color: string, options: Partial<SceneScriptNode> = {}) => makeNode("cloud", id, position, scale, color, options);

  try {
    const fn = new Function("scene", "group", "box", "softBox", "cylinder", "sphere", "torus", "cone", "rod", "plane", "glow", "cloud", "Math", code);
    const result = fn(scene, group, box, softBox, cylinder, sphere, torus, cone, rod, plane, glow, cloud, Math);
    return { nodes: Array.isArray(result) ? flattenNodes(result) : [], error: null };
  } catch (caught) {
    return { nodes: [], error: caught instanceof Error ? caught.message : String(caught) };
  }
}

function motionPhase(t: number, motion: SceneScriptMotion) {
  return t * (motion.speed ?? 1) * Math.PI * 2 + (motion.phase ?? 0);
}

function lerp(a: number, b: number, progress: number) {
  return a + (b - a) * progress;
}

function lerpVec3(a: Vec3, b: Vec3, progress: number): Vec3 {
  return [lerp(a[0], b[0], progress), lerp(a[1], b[1], progress), lerp(a[2], b[2], progress)];
}

function sampleLoopPath(points: Vec3[], progress: number): { position: Vec3; next: Vec3 } {
  if (!points.length) return { position: [0, 0, 0], next: [0, 0, 0] };
  if (points.length === 1) return { position: points[0], next: points[0] };
  const normalized = ((progress % 1) + 1) % 1;
  const scaled = normalized * points.length;
  const index = Math.floor(scaled) % points.length;
  const nextIndex = (index + 1) % points.length;
  const local = scaled - Math.floor(scaled);
  return { position: lerpVec3(points[index], points[nextIndex], local), next: points[nextIndex] };
}

function getWorldPosition(object: THREE.Object3D | undefined): THREE.Vector3 | null {
  if (!object) return null;
  const result = new THREE.Vector3();
  object.getWorldPosition(result);
  return result;
}

function SceneScriptMaterial({ node }: { node: SceneScriptNode }) {
  const transparent = typeof node.opacity === "number" && node.opacity < 1 || node.kind === "cloud" || node.kind === "glow";
  return (
    <meshStandardMaterial
      color={node.color ?? "#94a3b8"}
      transparent={transparent}
      opacity={node.opacity ?? (node.kind === "cloud" ? 0.35 : node.kind === "glow" ? 0.56 : 1)}
      metalness={node.metalness ?? 0.08}
      roughness={node.roughness ?? 0.55}
      emissive={node.kind === "glow" ? node.color ?? "#fbbf24" : "#000000"}
      emissiveIntensity={node.kind === "glow" ? 0.75 : 0}
      depthWrite={node.kind !== "cloud"}
    />
  );
}

function useRegisterSceneScriptObject(id: string, ref: RefObject<THREE.Object3D | null>) {
  const registry = useContext(SceneScriptRegistryContext);
  useEffect(() => {
    if (!registry || !ref.current) return;
    registry.current.set(id, ref.current);
    return () => {
      registry.current.delete(id);
    };
  }, [id, ref, registry]);
}

function applyMotionTransform(object: THREE.Object3D, node: SceneScriptNode, t: number, registry: SceneScriptRegistryRef | null) {
  const basePosition = node.position ?? [0, 0, 0];
  const baseRotation = node.rotation ?? [0, 0, 0];
  const motion = node.motion;

  object.position.set(basePosition[0], basePosition[1], basePosition[2]);
  object.rotation.set(baseRotation[0], baseRotation[1], baseRotation[2]);
  object.scale.set(1, 1, 1);

  if (!motion) return;

  const phase = motionPhase(t, motion);
  const wave = (Math.sin(phase) + 1) / 2;

  switch (motion.type) {
    case "driftY":
      object.position.y = basePosition[1] + Math.sin(phase) * (motion.amplitude ?? 0.2);
      break;
    case "oscillateY":
      object.position.y = basePosition[1] + (motion.centerY ?? 0) + Math.sin(phase) * (motion.amplitude ?? 0.5);
      break;
    case "rotateX":
      object.rotation.x = baseRotation[0] + phase;
      break;
    case "rotateY":
      object.rotation.y = baseRotation[1] + phase;
      break;
    case "rotateZ":
      object.rotation.z = baseRotation[2] + phase;
      break;
    case "swingX":
      object.rotation.x = baseRotation[0] + lerp(motion.minAngle ?? 0, motion.maxAngle ?? 1, wave);
      break;
    case "swingY":
      object.rotation.y = baseRotation[1] + lerp(motion.minAngle ?? 0, motion.maxAngle ?? 1, wave);
      break;
    case "swingZ":
      object.rotation.z = baseRotation[2] + lerp(motion.minAngle ?? 0, motion.maxAngle ?? 1, wave);
      break;
    case "pulse": {
      const amount = 1 + 0.12 * wave;
      object.scale.set(amount, amount, amount);
      break;
    }
    case "pathLoop": {
      const points = motion.points ?? [];
      const sampled = sampleLoopPath(points, t * (motion.speed ?? 0.25) + (motion.phase ?? 0));
      object.position.set(sampled.position[0], sampled.position[1], sampled.position[2]);
      if (motion.faceDirection) {
        const dx = sampled.next[0] - sampled.position[0];
        const dz = sampled.next[2] - sampled.position[2];
        if (Math.abs(dx) + Math.abs(dz) > 0.001) object.rotation.y = Math.atan2(dx, dz);
      }
      break;
    }
    case "orbitAround": {
      const center = motion.center ?? [0, 0, 0];
      const radius = motion.radius ?? 1;
      const angle = phase;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      const plane = motion.plane ?? "xz";
      if (plane === "xy") object.position.set(center[0] + x, center[1] + y, center[2]);
      else if (plane === "yz") object.position.set(center[0], center[1] + x, center[2] + y);
      else object.position.set(center[0] + x, center[1], center[2] + y);
      break;
    }
    case "followTarget": {
      const target = registry?.current.get(motion.target ?? "");
      const targetWorld = getWorldPosition(target);
      if (targetWorld && object.parent) {
        object.parent.worldToLocal(targetWorld);
        object.position.copy(targetWorld);
      }
      break;
    }
    default:
      break;
  }
}

function SceneScriptMotionFrame({ node, children }: { node: SceneScriptNode; children: ReactNode }) {
  const registry = useContext(SceneScriptRegistryContext);
  const ref = useRef<THREE.Group>(null);
  useRegisterSceneScriptObject(node.id, ref);

  useFrame(({ clock }) => {
    if (!ref.current) return;
    applyMotionTransform(ref.current, node, clock.elapsedTime, registry);
  });

  const position = node.position ?? [0, 0, 0];
  const rotation = node.rotation ?? [0, 0, 0];
  const motion = node.motion;

  // Hinged motion: offset the child contents around a local pivot point.
  if (motion?.type === "swingX" || motion?.type === "swingY" || motion?.type === "swingZ") {
    const pivot = motion.pivot ?? [0, 0, 0];
    return (
      <group position={position} rotation={rotation}>
        <group position={pivot}>
          <group ref={ref} position={[-pivot[0], -pivot[1], -pivot[2]]}>
            {children}
          </group>
        </group>
      </group>
    );
  }

  return (
    <group ref={ref} position={position} rotation={rotation}>
      {children}
    </group>
  );
}

function SceneScriptConnector({ node }: { node: SceneScriptNode }) {
  const registry = useContext(SceneScriptRegistryContext);
  const ref = useRef<THREE.Mesh>(null);
  useRegisterSceneScriptObject(node.id, ref);

  useFrame(() => {
    const motion = node.motion;
    if (!ref.current || motion?.type !== "connectBetween") return;
    const from = registry?.current.get(motion.from ?? "");
    const to = registry?.current.get(motion.to ?? "");
    const fromWorld = getWorldPosition(from);
    const toWorld = getWorldPosition(to);
    if (!fromWorld || !toWorld || !ref.current.parent) return;

    ref.current.parent.worldToLocal(fromWorld);
    ref.current.parent.worldToLocal(toWorld);
    const midpoint = fromWorld.clone().add(toWorld).multiplyScalar(0.5);
    const delta = toWorld.clone().sub(fromWorld);
    const length = Math.max(0.01, delta.length());
    const direction = delta.normalize();
    const thickness = motion.thickness ?? node.scale?.[0] ?? 0.08;

    ref.current.position.copy(midpoint);
    ref.current.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
    ref.current.scale.set(thickness, length, thickness);
  });

  return (
    <mesh ref={ref} castShadow receiveShadow>
      <cylinderGeometry args={[1, 1, 1, 24]} />
      <SceneScriptMaterial node={node} />
    </mesh>
  );
}

function SceneScriptPrimitiveBody({ node }: { node: SceneScriptNode }) {
  const scale = node.scale ?? [1, 1, 1];

  if (node.kind === "cloud") {
    const dots = Array.from({ length: 18 }, (_, index) => {
      const angle = index * 2.399963;
      const radius = 0.16 + (index % 4) * 0.08;
      return [Math.cos(angle) * radius, index * 0.05, Math.sin(angle) * radius] as Vec3;
    });
    return (
      <group scale={scale}>
        {dots.map((dot, index) => (
          <mesh key={index} position={dot} scale={[0.08, 0.08, 0.08]}>
            <sphereGeometry args={[1, 12, 12]} />
            <SceneScriptMaterial node={node} />
          </mesh>
        ))}
      </group>
    );
  }

  if (node.kind === "softBox" || node.kind === "rod" || node.kind === "plane") {
    const actualScale = node.kind === "plane" ? [scale[0], Math.min(scale[1], 0.035), scale[2]] as Vec3 : scale;
    return (
      <RoundedBox args={actualScale} radius={node.radius ?? (node.kind === "softBox" ? 0.08 : 0.035)} smoothness={8} castShadow receiveShadow>
        <SceneScriptMaterial node={node} />
      </RoundedBox>
    );
  }

  if (node.kind === "box") {
    return (
      <mesh scale={scale} castShadow receiveShadow>
        <boxGeometry args={[1, 1, 1]} />
        <SceneScriptMaterial node={node} />
      </mesh>
    );
  }

  if (node.kind === "sphere" || node.kind === "glow") {
    return (
      <mesh scale={scale} castShadow receiveShadow>
        <sphereGeometry args={[1, 32, 18]} />
        <SceneScriptMaterial node={node} />
      </mesh>
    );
  }

  if (node.kind === "cylinder") {
    return (
      <mesh scale={scale} castShadow receiveShadow>
        <cylinderGeometry args={[1, 1, 1, 48]} />
        <SceneScriptMaterial node={node} />
      </mesh>
    );
  }

  if (node.kind === "torus") {
    return (
      <mesh scale={scale} castShadow receiveShadow>
        <torusGeometry args={[1, 0.08, 16, 64]} />
        <SceneScriptMaterial node={node} />
      </mesh>
    );
  }

  if (node.kind === "cone") {
    return (
      <mesh scale={scale} castShadow receiveShadow>
        <coneGeometry args={[1, 1, 36]} />
        <SceneScriptMaterial node={node} />
      </mesh>
    );
  }

  return null;
}

function SceneScriptMesh({ node }: { node: SceneScriptNode }) {
  if (node.motion?.type === "connectBetween") return <SceneScriptConnector node={node} />;

  if (node.kind === "group") {
    return (
      <SceneScriptMotionFrame node={node}>
        {(node.children ?? []).map((child) => <SceneScriptMesh key={child.id} node={child} />)}
      </SceneScriptMotionFrame>
    );
  }

  return (
    <SceneScriptMotionFrame node={node}>
      <SceneScriptPrimitiveBody node={node} />
    </SceneScriptMotionFrame>
  );
}

function SceneScriptCanvas({ nodes }: { nodes: SceneScriptNode[] }) {
  const registryRef = useRef<Map<string, THREE.Object3D>>(new Map());
  return (
    <Canvas camera={{ position: [6.4, 5.2, 7.2], fov: 42 }} shadows>
      <color attach="background" args={["#202124"]} />
      <ambientLight intensity={0.55} />
      <directionalLight position={[4, 8, 6]} intensity={1.75} castShadow shadow-mapSize-width={2048} shadow-mapSize-height={2048} />
      <pointLight position={[-1.5, 2.4, -2.7]} intensity={1.15} color="#ffd08a" />
      <pointLight position={[2.3, 2.5, -2.6]} intensity={0.65} color="#fff0cc" />
      <SceneScriptRegistryContext.Provider value={registryRef}>
        <group rotation={[0, -0.25, 0]}>
          {nodes.map((node) => <SceneScriptMesh key={node.id} node={node} />)}
        </group>
      </SceneScriptRegistryContext.Provider>
      <OrbitControls target={[0, 1.2, -0.8]} enablePan={false} minDistance={5} maxDistance={13} maxPolarAngle={Math.PI / 2.05} />
    </Canvas>
  );
}

export function PrimitiveBuilderLab() {
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [provider, setProvider] = useState<ProviderChoice>("glm");
  const [fallbackProvider, setFallbackProvider] = useState<FallbackChoice>("deepseek");
  const [showLabels, setShowLabels] = useState(true);
  const [activeStep, setActiveStep] = useState(1);
  const [result, setResult] = useState<GenerateResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sceneScriptCode, setSceneScriptCode] = useState(DEFAULT_SCENE_SCRIPT);
  const [sceneScriptResult, setSceneScriptResult] = useState(() => compileSceneScript(DEFAULT_SCENE_SCRIPT));

  const plan = result?.plan ?? null;
  const sceneGraph = result?.scene_graph ?? null;
  const graphNodes = useMemo(() => sceneGraphToSceneScriptNodes(sceneGraph), [sceneGraph]);
  const graphNodeCount = useMemo(() => countSceneScriptNodes(graphNodes), [graphNodes]);
  const currentBeat = plan ? plan.beats[activeStep - 1] ?? plan.beats[0] : null;
  const visibleCount = plan ? visiblePartIds(plan, activeStep).size : 0;

  async function submitPrompt(event?: FormEvent) {
    event?.preventDefault();
    const cleanPrompt = prompt.trim();
    if (!cleanPrompt || loading) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/sandbox/probe-lab/primitive-builder/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: cleanPrompt,
          provider,
          fallback_provider: fallbackProvider,
          style: {
            look: "clean_stylized",
            mood: "neutral",
            complexity: "medium",
            cutaway: false,
          },
        }),
      });

      const json = (await response.json()) as GenerateResponse | { error?: string };
      if (!response.ok || !("plan" in json)) {
        throw new Error(("error" in json && json.error) || `Request failed with ${response.status}`);
      }

      setResult(json);
      setActiveStep(1);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setLoading(false);
    }
  }

  function renderSceneScript() {
    setSceneScriptResult(compileSceneScript(sceneScriptCode));
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <section className="mx-auto flex min-h-screen w-full max-w-[1550px] flex-col gap-5 px-5 py-5 lg:px-7">
        <header className="flex flex-wrap items-start justify-between gap-4 rounded-[2rem] border border-white/10 bg-white/[0.055] p-5 shadow-2xl backdrop-blur-xl">
          <div className="max-w-3xl">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-100/70">MyWay Sandbox</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Primitive Builder Lab</h1>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-zinc-200/72">
              Type a build request. The selected model returns a grouped primitive scene graph, then MyWay renders it with trusted primitives and allowed motion semantics.
            </p>
          </div>
          <a href="/sandbox/probe-lab" className="rounded-2xl border border-white/10 bg-white/[0.07] px-4 py-2 text-sm font-semibold text-zinc-100 transition hover:bg-white/[0.11]">
            Back to Probe Lab
          </a>
        </header>

        <section className="grid min-h-[720px] flex-1 gap-5 xl:grid-cols-[minmax(22rem,0.34fr)_minmax(0,1fr)_minmax(23rem,0.36fr)]">
          <aside className="flex flex-col gap-4 rounded-[2rem] border border-white/10 bg-white/[0.055] p-4 shadow-2xl backdrop-blur-xl">
            <form onSubmit={submitPrompt}>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-100/70">Prompt</p>
              <label className="mt-3 block text-sm font-semibold text-zinc-100" htmlFor="primitive-builder-prompt">
                What should MyWay build?
              </label>
              <textarea
                id="primitive-builder-prompt"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                rows={6}
                className="mt-2 w-full resize-none rounded-3xl border border-white/10 bg-black/35 p-4 text-sm leading-6 text-white outline-none transition placeholder:text-zinc-500 focus:border-cyan-200/45"
                placeholder="build a kitchen with a pot on the stove"
              />

              <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                <label className="block text-xs font-semibold uppercase tracking-[0.14em] text-zinc-300/80">
                  Primary model
                  <select
                    value={provider}
                    onChange={(event) => setProvider(event.target.value as ProviderChoice)}
                    className="mt-2 w-full rounded-2xl border border-white/10 bg-black/35 px-3 py-2 text-sm normal-case tracking-normal text-white outline-none focus:border-cyan-200/45"
                  >
                    <option value="deepseek">DeepSeek V4 Pro</option>
                    <option value="glm">GLM-5.2</option>
                  </select>
                </label>

                <label className="block text-xs font-semibold uppercase tracking-[0.14em] text-zinc-300/80">
                  Fallback
                  <select
                    value={fallbackProvider}
                    onChange={(event) => setFallbackProvider(event.target.value as FallbackChoice)}
                    className="mt-2 w-full rounded-2xl border border-white/10 bg-black/35 px-3 py-2 text-sm normal-case tracking-normal text-white outline-none focus:border-cyan-200/45"
                  >
                    <option value="none">No fallback</option>
                    <option value="deepseek">DeepSeek V4 Pro</option>
                    <option value="glm">GLM-5.2</option>
                  </select>
                </label>
              </div>

              <button type="submit" disabled={loading} className="mt-3 w-full rounded-2xl bg-cyan-300 px-4 py-3 text-sm font-black text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-60">
                {loading ? "Building graph..." : "Generate grouped scene"}
              </button>
            </form>

            {error ? <div className="rounded-3xl border border-rose-300/20 bg-rose-500/10 p-4 text-sm leading-6 text-rose-100">{error}</div> : null}

            <div className="mt-auto rounded-3xl border border-cyan-200/15 bg-cyan-300/10 p-4">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-cyan-100/80">Planner contract</p>
              <p className="mt-2 text-sm leading-6 text-cyan-50/80">
                The model outputs primitive_scene_graph_v1: grouped nodes, local child coordinates, and allowed motion semantics. MyWay owns rendering, validation, runtime animation, and safety. No assets or code are generated by the model.
              </p>
            </div>
          </aside>

          <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-black shadow-2xl">
            <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-white/[0.045] px-5 py-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-zinc-400">3D build space</p>
                <h2 className="mt-1 text-lg font-semibold text-white">{sceneGraph?.scene_title ?? plan?.scene_title ?? "Waiting for a build request"}</h2>
              </div>
              <label className="flex items-center gap-2 text-xs font-semibold text-zinc-300">
                <input type="checkbox" checked={showLabels} onChange={(event) => setShowLabels(event.target.checked)} className="h-4 w-4 rounded border-white/20 bg-black" />
                Labels
              </label>
            </div>
            <div className="h-[640px] min-h-[58vh]">
              {sceneGraph ? (
                <SceneScriptCanvas nodes={graphNodes} />
              ) : plan ? (
                <PrimitiveScene plan={plan} activeStep={activeStep} showLabels={showLabels} />
              ) : (
                <div className="flex h-full items-center justify-center bg-[radial-gradient(circle_at_center,rgba(34,211,238,0.12),transparent_34%)] p-8 text-center">
                  <div className="max-w-md rounded-[2rem] border border-white/10 bg-white/[0.055] p-6 shadow-2xl backdrop-blur-xl">
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-100/70">Empty build space</p>
                    <h2 className="mt-3 text-2xl font-semibold text-white">Send a prompt to assemble primitives</h2>
                    <p className="mt-2 text-sm leading-7 text-zinc-300/78">
                      Try something like “build a kitchen with a pot on the stove and cabinets opening” or “build a car with an exposed moving piston.”
                    </p>
                  </div>
                </div>
              )}
            </div>
          </section>

          <aside className="flex flex-col gap-4 rounded-[2rem] border border-white/10 bg-white/[0.055] p-4 shadow-2xl backdrop-blur-xl">
            {plan ? (
              <>
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-100/70">Grouped scene graph</p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">{plan.scene_title}</h2>
                  <p className="mt-2 text-sm leading-7 text-zinc-200/76">{plan.scene_summary}</p>
                </div>

                <div className="rounded-3xl border border-white/10 bg-black/24 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-zinc-300/70">Active beat</p>
                    <span className="rounded-full border border-white/10 bg-white/[0.06] px-2 py-1 text-xs text-zinc-300">
                      {activeStep}/{plan.beats.length}
                    </span>
                  </div>
                  <h3 className="mt-3 text-lg font-semibold text-white">{currentBeat?.title}</h3>
                  <p className="mt-3 text-xs font-semibold text-cyan-100/70">Visible parts: {visibleCount}/{plan.parts.length}</p>
                  {sceneGraph ? <p className="mt-1 text-xs font-semibold text-emerald-100/70">Graph nodes: {graphNodeCount}</p> : null}
                </div>

                <div className="grid gap-2 overflow-auto pr-1">
                  {plan.beats.map((beat, index) => {
                    const step = index + 1;
                    return (
                      <button key={beat.id} type="button" onClick={() => setActiveStep(clampStep(step, plan))} className={`rounded-2xl border p-3 text-left transition ${beatButtonTone(step === activeStep)}`}>
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold">{beat.title}</p>
                          <span className="text-xs opacity-70">{step}</span>
                        </div>
                        <p className="mt-1 text-xs leading-5 opacity-75">reveals {beat.reveal.length} part{beat.reveal.length === 1 ? "" : "s"}</p>
                      </button>
                    );
                  })}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setActiveStep((step) => clampStep(step - 1, plan))} className="rounded-2xl border border-white/10 bg-white/[0.055] px-3 py-2 text-sm font-semibold text-zinc-100 transition hover:bg-white/[0.09]">
                    Previous
                  </button>
                  <button type="button" onClick={() => setActiveStep((step) => clampStep(step + 1, plan))} className="rounded-2xl border border-white/10 bg-white/[0.055] px-3 py-2 text-sm font-semibold text-zinc-100 transition hover:bg-white/[0.09]">
                    Next
                  </button>
                </div>

                <div className="rounded-3xl border border-white/10 bg-black/24 p-4 text-xs leading-5 text-zinc-300">
                  <p className="font-black uppercase tracking-[0.14em] text-zinc-400">Model run</p>
                  <p className="mt-2">Schema: {result?.schema_version ?? (sceneGraph ? "primitive_scene_graph_v1" : "primitive_build_plan_v1")}</p>
                  <p>Primary: {providerLabel(result?.provider_requested)}</p>
                  <p>Fallback: {providerLabel(result?.fallback_provider)}</p>
                  <p>Used: {result?.provider_model ?? result?.provider_used ?? "unknown"}</p>
                  <p>Duration: {result?.duration_ms ? `${Math.round(result.duration_ms / 1000)}s` : "—"}</p>
                  <p>Parse: {result?.parse_ok ? "ok" : "failed"}</p>
                </div>

                {result?.warnings?.length ? (
                  <details className="rounded-3xl border border-amber-200/20 bg-amber-300/10 p-4">
                    <summary className="cursor-pointer text-sm font-semibold text-amber-100">Warnings</summary>
                    <ul className="mt-3 list-disc space-y-1 pl-5 text-xs leading-5 text-amber-50/80">
                      {result.warnings.map((warning, index) => (
                        <li key={index}>{warning}</li>
                      ))}
                    </ul>
                  </details>
                ) : null}

                <details className="rounded-3xl border border-white/10 bg-black/24 p-4">
                  <summary className="cursor-pointer text-sm font-semibold text-zinc-100">Show grouped scene graph JSON</summary>
                  <pre className="mt-3 max-h-72 overflow-auto rounded-2xl bg-black/45 p-3 text-[11px] leading-5 text-zinc-300">{JSON.stringify(sceneGraph ?? plan, null, 2)}</pre>
                </details>
              </>
            ) : (
              <div className="flex h-full flex-col justify-center rounded-3xl border border-white/10 bg-black/24 p-5 text-center">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-zinc-400">No plan yet</p>
                <h2 className="mt-3 text-xl font-semibold text-white">The grouped scene graph will appear here after generation.</h2>
                <p className="mt-2 text-sm leading-6 text-zinc-300/72">The right panel no longer contains deterministic examples. It populates from the grouped model response.</p>
              </div>
            )}
          </aside>
        </section>

        <section className="grid gap-5 rounded-[2rem] border border-white/10 bg-white/[0.055] p-4 shadow-2xl backdrop-blur-xl xl:grid-cols-[minmax(24rem,0.44fr)_minmax(0,1fr)]">
          <div className="flex min-h-[620px] flex-col">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-100/70">Hand-code comparator</p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">Paste SceneScript primitives</h2>
                <p className="mt-2 text-sm leading-6 text-zinc-300/76">
                  This remains a local reverse-engineering comparator. It uses the same grouped primitive and motion vocabulary as the model scene graph, but written as SceneScript for quick experiments.
                </p>
              </div>
              <button
                type="button"
                onClick={renderSceneScript}
                className="rounded-2xl bg-emerald-300 px-4 py-2 text-sm font-black text-slate-950 transition hover:bg-emerald-200"
              >
                Render SceneScript
              </button>
            </div>

            <textarea
              value={sceneScriptCode}
              onChange={(event) => setSceneScriptCode(event.target.value)}
              spellCheck={false}
              className="mt-4 min-h-[470px] flex-1 resize-y rounded-3xl border border-white/10 bg-black/45 p-4 font-mono text-[11px] leading-5 text-zinc-200 outline-none transition placeholder:text-zinc-600 focus:border-emerald-200/45"
            />

            {sceneScriptResult.error ? (
              <div className="mt-3 rounded-2xl border border-rose-300/20 bg-rose-500/10 p-3 text-sm leading-6 text-rose-100">
                {sceneScriptResult.error}
              </div>
            ) : (
              <p className="mt-3 text-xs leading-5 text-zinc-400">
                Rendered {sceneScriptResult.nodes.length} top-level node{sceneScriptResult.nodes.length === 1 ? "" : "s"}. Helpers: scene, group, box, softBox, cylinder, sphere, torus, cone, rod, plane, glow, cloud. Motion: pathLoop, swingX/Y/Z, rotateX/Y/Z, driftY, oscillateY, pulse, orbitAround, followTarget, connectBetween.
              </p>
            )}
          </div>

          <div className="overflow-hidden rounded-[1.7rem] border border-white/10 bg-black shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 bg-white/[0.045] px-5 py-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-zinc-400">Manual primitive render</p>
                <h3 className="mt-1 text-lg font-semibold text-white">Hand-built comparison scene</h3>
              </div>
              <span className="rounded-full border border-emerald-200/20 bg-emerald-300/10 px-3 py-1 text-xs font-semibold text-emerald-100">
                SceneScript
              </span>
            </div>
            <div className="h-[620px] min-h-[58vh]">
              {sceneScriptResult.error ? (
                <div className="flex h-full items-center justify-center p-8 text-center text-sm leading-6 text-zinc-400">
                  Fix the SceneScript error, then render again.
                </div>
              ) : (
                <SceneScriptCanvas nodes={sceneScriptResult.nodes} />
              )}
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}