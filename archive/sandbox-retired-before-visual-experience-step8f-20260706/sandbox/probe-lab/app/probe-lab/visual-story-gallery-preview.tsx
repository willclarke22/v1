"use client";

import { useState } from "react";
import type { EngineRenderableProbe } from "@/lib/engine";
import {
  ProbeRenderer,
  createEmptyProbeAnswerDraft,
  type ProbeAnswerDraft,
} from "@/ui/learning-space/probes";

const visualStoryProbe = {
  id: "probe-lab-visual-story-preview",
  probe_type: "video_explanation",
  expected_attempt_type: "text",
  prompt: {
    stem: "Visual Story probe preview",
    body: "Watch how a dot moving around a circle turns into a wave, then interact with the scene.",
  },
  answer_key: {
    acceptable_responses: ["completed visual story interaction"],
    success_markers: ["visual_story_completed"],
  },
  misconception_candidates: [],
  renderer_params: {
    visual_story: {
      schema_version: "myway_visual_story_renderer_v1",
      scene_kind: "visual_story",
      title: "Circle motion becomes a wave",
      scene_family: "motion_to_graph",
      story: {
        orientation_script:
          "Imagine a dot moving around a wheel. If you track only the dot's height over time, that circular motion becomes a repeating wave. One full turn around the wheel matches one full repeat on the graph.",
        visual_semantics: {
          key_entities: [
            {
              id: "wheel",
              kind: "wheel",
              label: "turning wheel",
              role: "source motion",
              description: "The circular motion that creates the repeat.",
              visual_style: { emphasis: "high", primitive_style: "diagrammatic" },
            },
            {
              id: "dot",
              kind: "dot",
              label: "moving dot",
              role: "tracked point",
              description: "The point whose height gets graphed.",
              visual_style: { emphasis: "high", primitive_style: "glassy" },
            },
            {
              id: "wave",
              kind: "wave",
              label: "height graph",
              role: "output pattern",
              description: "The dot's height shown over time.",
              visual_style: { emphasis: "high", primitive_style: "neon" },
            },
          ],
          key_relationships: [
            {
              id: "height_to_wave",
              from_entity_id: "dot",
              to_entity_id: "wave",
              relationship_type: "maps_to",
              label: "height becomes graph position",
              description: "The dot's height is plotted as the wave height.",
            },
          ],
          key_transformations: [
            {
              id: "circle_to_wave",
              type: "map",
              from_entity_id: "wheel",
              to_entity_id: "wave",
              description: "A full circle maps to one full wave repeat.",
            },
          ],
          supporting_examples: [
            {
              id: "sound_example",
              example_type: "sound_wave",
              label: "sound wave",
              description: "Repeating motion can show up as a wave pattern.",
              explicitly_mentioned: true,
            },
          ],
        },
        beats: [
          {
            id: "beat_1",
            script_segment: "Start with a dot moving around a wheel.",
            duration_ms: 2600,
            active_entity_ids: ["wheel", "dot"],
            actions: [{ id: "show_wheel", type: "reveal", target_entity_id: "wheel" }],
          },
          {
            id: "beat_2",
            script_segment: "Track only the dot's height as it moves.",
            duration_ms: 3200,
            active_entity_ids: ["dot"],
            actions: [{ id: "track_height", type: "trace", target_entity_id: "dot" }],
          },
          {
            id: "beat_3",
            script_segment: "That height over time becomes a repeating wave.",
            duration_ms: 3600,
            active_entity_ids: ["wave"],
            actions: [{ id: "draw_wave", type: "transform", target_entity_id: "wave" }],
          },
        ],
        script_display: {
          mode: "progressive_caption",
          animate_text: true,
          hide_during_interaction_by_default: true,
        },
      },
      interaction_phase: {
        free_exploration: {
          instructions:
            "Drag the scene, move the dot, mark one repeat, and tap a peak to complete the visual story.",
        },
        required_actions: ["mark_one_repeat", "tap_peak"],
        manipulators: [
          {
            id: "move_dot",
            type: "scrub",
            target_entity_id: "dot",
            label: "Move dot",
            instruction: "Drag horizontally to move the dot through the cycle.",
          },
        ],
      },
      optional_check: {
        prompt: "Mark one repeat and tap a peak.",
        success_criteria: {
          required_action_ids: ["mark_one_repeat", "tap_peak"],
        },
      },
    },
  },
} as unknown as EngineRenderableProbe;

export function VisualStoryGalleryPreview() {
  const [draft, setDraft] = useState<ProbeAnswerDraft>(() =>
    createEmptyProbeAnswerDraft("text")
  );

  return (
    <section
      style={{
        marginTop: "1.25rem",
        border: "1px solid rgba(255,255,255,0.12)",
        borderRadius: "28px",
        padding: "1rem",
        background: "rgba(255,255,255,0.04)",
      }}
    >
      <div style={{ marginBottom: "0.85rem" }}>
        <p
          style={{
            margin: 0,
            color: "rgba(221,214,254,0.82)",
            fontSize: "0.72rem",
            fontWeight: 850,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
          }}
        >
          Added template
        </p>
        <h2 style={{ margin: "0.25rem 0 0", color: "white", fontSize: "1.35rem" }}>
          Visual Story Probe
        </h2>
      </div>

      <ProbeRenderer
        probe={visualStoryProbe}
        initialDraft={draft}
        disabled={false}
        onDraftChange={setDraft}
        onSubmit={() => undefined}
      />
    </section>
  );
}
