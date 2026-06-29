"use client";

import { useEffect, useMemo, useRef } from "react";
import { ProbeShell } from "./probe-shell";
import type {
  GenericProbeComponentProps,
  ProbeGraphFunctionDraft,
  ProbeGraphModeDraft,
  ProbeGraphParameterDraft,
  ProbeGraphPoint3DDraft,
  ProbeGraphPointDraft,
  ProbeGraphView3DDraft,
  ProbeGraphWindow3DDraft,
  ProbeGraphWindowDraft,
} from "./probe-ui-types";
import {
  GraphConceptControls,
  GraphEquationPanel,
  GraphModeSwitch,
  GraphObservationBox,
  GraphWindowControls,
} from "./graph/graph-controls";
import { Graph2DWorkspace } from "./graph/graph-2d-workspace";
import { Graph3DWorkspace } from "./graph/graph-3d-workspace";
import {
  DEFAULT_FUNCTIONS,
  DEFAULT_PARAMETERS,
  DEFAULT_SURFACE_EXPRESSION,
  GRAPH_MODE_COPY,
  VIEW_PRESETS,
  type GraphAnimationId,
} from "./graph/graph-types";
import {
  buildGraphFeatures,
  evaluateExpression,
  getExpressionStatus,
  normalizeFunctions,
  normalizeParameters,
  normalizeView3D,
  normalizeWindow2D,
  normalizeWindow3D,
  parametersToVariables,
  roundForStorage,
  screenToX,
  screenToY,
} from "./graph/graph-expression";
import { ProbeButton, ProbePill, ProbeSection, ProbeStack, probeTheme } from "./shared";

function setFirstFunctionExpression(
  functions: ProbeGraphFunctionDraft[],
  expression: string,
): ProbeGraphFunctionDraft[] {
  if (!functions.length) {
    return [{ ...DEFAULT_FUNCTIONS[0], expression }];
  }

  return functions.map((fn, index) =>
    index === 0 ? { ...fn, expression, enabled: true } : fn,
  );
}

function appendExpression(expression: string, insert: string) {
  return `${expression}${expression.trim() ? " + " : ""}${insert}`;
}

function getAnimatedParameterValue(args: {
  parameter: ProbeGraphParameterDraft;
  frame: number;
  totalFrames: number;
}) {
  const min = args.parameter.min ?? -5;
  const max = args.parameter.max ?? 5;
  const center = (min + max) / 2;
  const amplitude = (max - min) * 0.36;
  const progress = args.frame / args.totalFrames;
  const wave = Math.sin(progress * Math.PI * 2);
  return roundForStorage(center + amplitude * wave, 2);
}

export function GraphProbe(props: GenericProbeComponentProps) {
  const mode = props.draft.graph_mode ?? "2d";
  const graphWindow = normalizeWindow2D(props.draft.graph_window);
  const graph3DWindow = normalizeWindow3D(props.draft.graph_3d_window);
  const graph3DView = normalizeView3D(props.draft.graph_3d_view);
  const functions = normalizeFunctions(props.draft.graph_functions);
  const parameters = normalizeParameters(props.draft.graph_parameters);
  const variables = useMemo(() => parametersToVariables(parameters), [parameters]);
  const surfaceExpression =
    props.draft.graph_surface_expression?.trim() || DEFAULT_SURFACE_EXPRESSION;
  const selectedPoint = props.draft.graph_selected_point ?? null;
  const selectedPoint3D = props.draft.graph_selected_point_3d ?? null;
  const notes = props.draft.graph_notes ?? "";

  const animationIntervalRef = useRef<number | null>(null);
  const firstFunction = functions[0] ?? DEFAULT_FUNCTIONS[0];
  const activeExpression = mode === "2d" ? firstFunction.expression : surfaceExpression;
  const activeStatus = getExpressionStatus({
    expression: activeExpression,
    variables,
    mode,
  });

  function updateGraph(next: {
    mode?: ProbeGraphModeDraft;
    functions?: ProbeGraphFunctionDraft[];
    parameters?: ProbeGraphParameterDraft[];
    graphWindow?: ProbeGraphWindowDraft;
    graph3DWindow?: ProbeGraphWindow3DDraft;
    graph3DView?: ProbeGraphView3DDraft;
    surfaceExpression?: string;
    selectedPoint?: ProbeGraphPointDraft | null;
    selectedPoint3D?: ProbeGraphPoint3DDraft | null;
    notes?: string;
  }) {
    const nextMode = next.mode ?? mode;
    const nextFunctions = next.functions ?? functions;
    const nextParameters = next.parameters ?? parameters;
    const nextWindow = next.graphWindow ?? graphWindow;
    const next3DWindow = next.graph3DWindow ?? graph3DWindow;
    const next3DView = next.graph3DView ?? graph3DView;
    const nextSurfaceExpression = next.surfaceExpression ?? surfaceExpression;
    const nextPoint =
      next.selectedPoint === undefined ? selectedPoint : next.selectedPoint;
    const nextPoint3D =
      next.selectedPoint3D === undefined ? selectedPoint3D : next.selectedPoint3D;
    const nextNotes = next.notes ?? notes;

    props.onDraftChange({
      ...props.draft,
      attempt_type: "graph",
      graph_mode: nextMode,
      graph_functions: nextFunctions,
      graph_parameters: nextParameters,
      graph_window: nextWindow,
      graph_3d_window: next3DWindow,
      graph_3d_view: next3DView,
      graph_surface_expression: nextSurfaceExpression,
      graph_selected_point: nextPoint,
      graph_selected_point_3d: nextPoint3D,
      graph_notes: nextNotes,
      graph_features: buildGraphFeatures({
        mode: nextMode,
        functions: nextFunctions,
        parameters: nextParameters,
        graphWindow: nextWindow,
        surfaceExpression: nextSurfaceExpression,
        graph3DWindow: next3DWindow,
        graph3DView: next3DView,
        selectedPoint: nextPoint,
        selectedPoint3D: nextPoint3D,
        notes: nextNotes,
      }),
    });
  }

  useEffect(() => {
    const hasGraphPayload = Boolean(props.draft.graph_features?.length);
    if (hasGraphPayload) return;

    updateGraph({});
    // Initialize the graph draft once when a graph probe first appears.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      if (animationIntervalRef.current !== null) {
        window.clearInterval(animationIntervalRef.current);
      }
    };
  }, []);

  function updateParameter(nextParameter: ProbeGraphParameterDraft) {
    updateGraph({
      parameters: parameters.map((candidate) =>
        candidate.name === nextParameter.name ? nextParameter : candidate,
      ),
    });
  }

  function animateParameter(parameterName: GraphAnimationId) {
    if (props.disabled) return;

    if (animationIntervalRef.current !== null) {
      window.clearInterval(animationIntervalRef.current);
    }

    const target = parameters.find((parameter) => parameter.name === parameterName);
    if (!target) return;

    const totalFrames = 54;
    let frame = 0;

    animationIntervalRef.current = window.setInterval(() => {
      frame += 1;
      const value = getAnimatedParameterValue({
        parameter: target,
        frame,
        totalFrames,
      });

      updateGraph({
        parameters: parameters.map((parameter) =>
          parameter.name === parameterName
            ? {
                ...parameter,
                value,
              }
            : parameter,
        ),
      });

      if (frame >= totalFrames && animationIntervalRef.current !== null) {
        window.clearInterval(animationIntervalRef.current);
        animationIntervalRef.current = null;
      }
    }, 36);
  }

  function handle2DPointSelect(point: ProbeGraphPointDraft) {
    updateGraph({ selectedPoint: point });
  }

  function handle3DPointSelect(point: ProbeGraphPoint3DDraft) {
    updateGraph({ selectedPoint3D: point });
  }

  function mark2DCenterPoint() {
    const x = (graphWindow.xMin + graphWindow.xMax) / 2;
    const y = evaluateExpression(firstFunction.expression, { ...variables, x }) ?? 0;

    updateGraph({
      selectedPoint: {
        x: roundForStorage(x, 3),
        y: roundForStorage(y, 3),
        expression: firstFunction.expression,
      },
    });
  }

  function mark3DCenterPoint() {
    const x = (graph3DWindow.xMin + graph3DWindow.xMax) / 2;
    const y = (graph3DWindow.yMin + graph3DWindow.yMax) / 2;
    const z =
      evaluateExpression(surfaceExpression, {
        ...variables,
        x,
        y,
      }) ?? 0;

    updateGraph({
      selectedPoint3D: {
        x: roundForStorage(x, 3),
        y: roundForStorage(y, 3),
        z: roundForStorage(z, 3),
        expression: surfaceExpression,
      },
    });
  }

  const copy = GRAPH_MODE_COPY[mode];

  return (
    <ProbeShell {...props}>
      <ProbeStack gap="1rem">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "1rem",
            alignItems: "end",
            flexWrap: "wrap",
          }}
        >
          <div style={{ maxWidth: "45rem" }}>
            <p style={{ margin: 0, color: probeTheme.text.primary, fontWeight: 950 }}>
              {copy.title}
            </p>
            <p
              style={{
                margin: "0.35rem 0 0",
                color: probeTheme.text.secondary,
                fontSize: "0.86rem",
                lineHeight: 1.55,
              }}
            >
              MyWay can use this space to show the idea moving, then ask what changed.
            </p>
          </div>

          <GraphModeSwitch
            mode={mode}
            disabled={props.disabled}
            onModeChange={(nextMode) => updateGraph({ mode: nextMode })}
          />
        </div>

        <div
          style={{
            display: "grid",
            gap: "1rem",
            gridTemplateColumns: "minmax(18rem, 0.78fr) minmax(25rem, 1.42fr)",
          }}
        >
          <ProbeStack gap="0.85rem">
            <GraphEquationPanel
              mode={mode}
              expression={activeExpression}
              status={activeStatus}
              disabled={props.disabled}
              onExpressionChange={(expression) => {
                if (mode === "2d") {
                  updateGraph({
                    functions: setFirstFunctionExpression(functions, expression),
                  });
                } else {
                  updateGraph({ surfaceExpression: expression });
                }
              }}
              onInsert={(insert) => {
                if (mode === "2d") {
                  updateGraph({
                    functions: setFirstFunctionExpression(
                      functions,
                      appendExpression(firstFunction.expression, insert),
                    ),
                  });
                } else {
                  updateGraph({
                    surfaceExpression: appendExpression(surfaceExpression, insert),
                  });
                }
              }}
            />

            <GraphConceptControls
              mode={mode}
              parameters={parameters}
              disabled={props.disabled}
              onParameterChange={updateParameter}
              onReset={() => updateGraph({ parameters: DEFAULT_PARAMETERS })}
              onAnimate={animateParameter}
            />

            <GraphWindowControls
              mode={mode}
              graphWindow={graphWindow}
              graph3DWindow={graph3DWindow}
              disabled={props.disabled}
              onWindowChange={(nextWindow) =>
                updateGraph({ graphWindow: normalizeWindow2D(nextWindow) })
              }
              on3DWindowChange={(nextWindow) =>
                updateGraph({ graph3DWindow: normalizeWindow3D(nextWindow) })
              }
            />
          </ProbeStack>

          <ProbeStack gap="0.85rem">
            {mode === "2d" ? (
              <>
                <Graph2DWorkspace
                  expression={firstFunction.expression}
                  functions={functions}
                  graphWindow={graphWindow}
                  variables={variables}
                  selectedPoint={selectedPoint}
                  disabled={props.disabled}
                  onPointSelect={handle2DPointSelect}
                />
                <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap" }}>
                  <ProbeButton
                    disabled={props.disabled}
                    variant="ghost"
                    onClick={mark2DCenterPoint}
                    style={{ padding: "0.48rem 0.7rem", fontSize: "0.76rem" }}
                  >
                    Mark center
                  </ProbeButton>
                </div>
              </>
            ) : (
              <>
                <Graph3DWorkspace
                  expression={surfaceExpression}
                  graphWindow={graph3DWindow}
                  graphView={graph3DView}
                  variables={variables}
                  selectedPoint={selectedPoint3D}
                  disabled={props.disabled}
                  onPointSelect={handle3DPointSelect}
                />
                <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap" }}>
                  {VIEW_PRESETS.map((preset) => (
                    <ProbeButton
                      key={preset.id}
                      disabled={props.disabled}
                      variant="ghost"
                      onClick={() => updateGraph({ graph3DView: preset.view })}
                      style={{ padding: "0.48rem 0.7rem", fontSize: "0.76rem" }}
                    >
                      {preset.label}
                    </ProbeButton>
                  ))}
                  <ProbeButton
                    disabled={props.disabled}
                    variant="ghost"
                    onClick={mark3DCenterPoint}
                    style={{ padding: "0.48rem 0.7rem", fontSize: "0.76rem" }}
                  >
                    Mark center
                  </ProbeButton>
                </div>
              </>
            )}

            <ProbeSection
              title="Why this can matter"
              subtitle={
                mode === "2d"
                  ? "A 2D graph can show growth, decay, turning points, or repeated patterns."
                  : "A 3D surface can show how two inputs combine, which is useful for ideas like saddles, optimization, pressure maps, terrain, and tradeoffs."
              }
              badge={<ProbePill tone="purple">{mode === "2d" ? "one input" : "two inputs"}</ProbePill>}
            >
              <p style={{ margin: 0, color: probeTheme.text.secondary, fontSize: "0.84rem", lineHeight: 1.55 }}>
                The model can choose a starting shape, animate one control, then ask the learner to explain the change in plain language.
              </p>
            </ProbeSection>

            <GraphObservationBox
              value={notes}
              disabled={props.disabled}
              onChange={(value) => updateGraph({ notes: value })}
            />
          </ProbeStack>
        </div>
      </ProbeStack>
    </ProbeShell>
  );
}

// These helpers stay exported for tests or future mini-renderers.
export { screenToX, screenToY };
