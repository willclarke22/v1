"use client";

export type GraphVisualLabel = {
  id: string;
  text: string;
  target: string | null;
};

export type GraphVisualPoint = {
  x: number;
  y: number;
  z?: number;
  label: string | null;
};

export type GraphVisualState = {
  activeStepId: string | null;
  activeStepTitle: string | null;
  overlayTitle: string | null;
  overlayText: string | null;
  overlayPlacement: "top_left" | "center" | "bottom" | "near_feature";
  equationStage: string | null;
  finalExpression: string | null;
  showSurface: boolean;
  highlightedAxis: "x" | "y" | "z" | null;
  highlightedTerm: string | null;
  xSlices: number[];
  ySlices: number[];
  labels: GraphVisualLabel[];
  tangent: { x: number; label: string | null } | null;
  secant: { from: number; to: number; label: string | null } | null;
  areaRegion: { from: number; to: number; label: string | null } | null;
  showIntersections: boolean;
  point: GraphVisualPoint | null;
  activeFunctionId: string | null;
  controlsUnlocked: boolean;
  timelineProgress: number;
};

export function createDefaultGraphVisualState(): GraphVisualState {
  return {
    activeStepId: null,
    activeStepTitle: null,
    overlayTitle: null,
    overlayText: null,
    overlayPlacement: "top_left",
    equationStage: null,
    finalExpression: null,
    showSurface: true,
    highlightedAxis: null,
    highlightedTerm: null,
    xSlices: [],
    ySlices: [],
    labels: [],
    tangent: null,
    secant: null,
    areaRegion: null,
    showIntersections: false,
    point: null,
    activeFunctionId: null,
    controlsUnlocked: false,
    timelineProgress: 0,
  };
}

export function cloneGraphVisualState(state: GraphVisualState): GraphVisualState {
  return {
    ...state,
    xSlices: [...state.xSlices],
    ySlices: [...state.ySlices],
    labels: state.labels.map((label) => ({ ...label })),
    tangent: state.tangent ? { ...state.tangent } : null,
    secant: state.secant ? { ...state.secant } : null,
    areaRegion: state.areaRegion ? { ...state.areaRegion } : null,
    point: state.point ? { ...state.point } : null,
  };
}
