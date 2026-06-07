import * as THREE from "three";

export const DEFAULT_CAMERA_POSITION = new THREE.Vector3(0, 18, 72);
export const DEFAULT_TARGET = new THREE.Vector3(0, 0, 0);
export const ZOOMED_OUT_DISTANCE = 72;

/**
 * Renderer-only expansion.
 *
 * Supabase topic_position / semantic_position stay in canonical semantic-map
 * units. The canvas expands those coordinates for a more spacious,
 * NASA-Eyes-like overview without corrupting persisted layout math.
 *
 * v15: X/Z still provide the broad map, but Y now has enough scale to make
 * the learning space genuinely explorable from different viewpoints.
 */
export const VISUAL_SPACE_SCALE_XZ = 6.85;
export const VISUAL_SPACE_SCALE_Y = 4.35;

/**
 * NASA-Eyes-style composition shaping.
 *
 * This pass gives the map more "system scale" while preserving relationships:
 * most of the extra spacing comes from uniform X/Z expansion, not nonlinear
 * distortion. This radial boost is kept
 * deliberately gentle: it helps far topics feel like they live in a larger
 * solar-system space, but it should not become the main source of semantic
 * distance. The backend semantic layout still owns topic relationships.
 *
 * This is renderer-only. It does not modify topic_position or semantic_position.
 */
export const RADIAL_EXPANSION_START = 1.35;
export const RADIAL_EXPANSION_LINEAR_GAIN = 0.045;
export const RADIAL_EXPANSION_CURVE_GAIN = 0.018;
export const RADIAL_EXPANSION_CURVE_POWER = 1.18;
export const RADIAL_EXPANSION_MAX_BOOST = 0.42;

/**
 * Renderer-only body scale.
 *
 * The learning-space contract still owns render_state.radius. These factors
 * only decide how large the bodies appear in this particular scene composition.
 * Smaller background bodies create a stronger sense of navigable space, while
 * the selected/focused body can become visually dominant like a planet view.
 */
export const OVERVIEW_TOPIC_BODY_SCALE = 0.74;
export const SELECTED_TOPIC_BODY_SCALE = 0.94;
export const FOCUSED_TOPIC_BODY_SCALE = 1.28;
export const FOCUSED_BACKGROUND_TOPIC_BODY_SCALE = 0.5;
export const FOCUSED_SELECTED_BACKGROUND_TOPIC_BODY_SCALE = 0.68;

export const SETTLE_DELAY_MS = 220;
export const TOPIC_CLICK_SEQUENCE_MS = 280;

/**
 * Global labels should hide only for real manual view manipulation.
 * A normal click/select, worker refresh, semantic-layout commit, or
 * programmatic camera ride should not blank every topic label.
 */
export const VIEW_DRAG_LABEL_HIDE_THRESHOLD_PX = 8;

/**
 * Topic arrival should feel like a gentle materialization, not a flash.
 * These values only control the creation animation for genuinely new topic ids.
 */
export const TOPIC_APPEARANCE_LERP_ALPHA = 0.075;
export const TOPIC_APPEARANCE_START_SCALE = 0.58;

/**
 * Visual-only movement policy.
 *
 * Canonical topic positions still come from learningSpace.topics[].position.
 * These values only control how the renderer eases toward that already-committed
 * renderer-safe position. Keep these intentionally calm so semantic-layout
 * updates feel like graceful migration rather than abrupt jumps.
 *
 * Keep the overview/focused/background alphas matched for now so a staged
 * layout release feels like one synchronized migration event instead of the
 * highlighted topic arriving before or after the rest of the map.
 */
export const OVERVIEW_TOPIC_POSITION_LERP_ALPHA = 0.009;
export const FOCUSED_TOPIC_POSITION_LERP_ALPHA = 0.009;
export const BACKGROUND_TOPIC_POSITION_LERP_ALPHA = 0.009;
export const PROBE_TOPIC_POSITION_LERP_ALPHA = 0;

/**
 * Elegant semantic drift trail policy.
 *
 * The trail should feel like a subtle memory of movement, not a busy sci-fi
 * effect. It appears only after a meaningful committed position change and
 * fades away automatically. White keeps it readable over the starfield without
 * adding another semantic color language.
 */
export const MOVEMENT_TRAIL_MIN_DISTANCE = 0.14;
export const MOVEMENT_TRAIL_FADE_RATE = 0.985;
export const MOVEMENT_TRAIL_TARGET_REACHED_FADE_RATE = 0.982;
export const MOVEMENT_TRAIL_MIN_OPACITY = 0.012;
export const MOVEMENT_TRAIL_OVERVIEW_OPACITY = 0.72;
export const MOVEMENT_TRAIL_FOCUSED_OPACITY = 0.62;
export const MOVEMENT_TRAIL_BACKGROUND_OPACITY = 0.42;

/**
 * Camera tether policy.
 *
 * This is deliberately gentler than a user-triggered warp/focus. Topic movement
 * should not yank the camera around; only the currently focused/selected topic
 * is softly followed.
 */
export const CAMERA_TETHER_MIN_TOPIC_MOVE = 0.035;
export const FOCUSED_TOPIC_TETHER_CAMERA_ALPHA = 0.045;
export const FOCUSED_TOPIC_TETHER_TARGET_ALPHA = 0.055;
export const SELECTED_TOPIC_TETHER_TARGET_ALPHA = 0.045;

/**
 * Collision-safe local liveliness.
 *
 * Topic center positions remain controlled by semantic layout + backend commit.
 * This small local bob is reserved inside render_state.collision_radius, so it
 * should not break the non-overlap contract. Keep this subtle: MyWay should
 * feel alive without making topic placement visually untrustworthy.
 */
export const LOCAL_BOB_MAX_AMPLITUDE = 0.055;
export const LOCAL_BOB_RESERVE_USAGE = 0.52;
export const LOCAL_BOB_MIN_RESERVE = 0.045;
export const LOCAL_BOB_XZ_FACTOR = 0.22;
export const LOCAL_BOB_LERP_ALPHA = 0.08;
export const LOCAL_BOB_BASE_SPEED = 0.62;
export const LOCAL_BOB_SPEED_VARIATION = 0.28;

/**
 * Map-label policy.
 *
 * Labels are useful for navigation, but the current topic's label becomes
 * redundant in close-up because the right panel owns that context.
 * Do not hide all labels just because a topic is focused or because layout
 * migration is staged; other labels should remain visible so the learner can
 * stay oriented.
 */
export const LABEL_HIDE_SCREEN_RADIUS_PX = 44;
export const LABEL_MAX_WIDTH_OVERVIEW = 210;
export const LABEL_MAX_WIDTH_PROMINENT = 260;
export const LABEL_OFFSET_MIN_PX = 34;
export const LABEL_OFFSET_MAX_PX = 112;
export const LABEL_OFFSET_SCREEN_RADIUS_MULTIPLIER = 0.86;
export const LABEL_OFFSET_SCREEN_RADIUS_BIAS_PX = 22;
export const LABEL_OFFSET_CURRENT_TOPIC_EXTRA_PX = 18;
export const SEMANTIC_RELATIONSHIP_ARC_MAX_COUNT = 3;
export const SEMANTIC_RELATIONSHIP_ARC_SEGMENTS = 72;
export const SEMANTIC_RELATIONSHIP_ARC_MIN_OPACITY = 0.1;
export const SEMANTIC_RELATIONSHIP_ARC_BASE_OPACITY = 0.18;
export const SEMANTIC_RELATIONSHIP_ARC_FOCUSED_OPACITY_BOOST = 0.12;
export const SEMANTIC_RELATIONSHIP_ARC_HOVERLESS_LIFT_MIN = 0.9;
export const SEMANTIC_RELATIONSHIP_ARC_HOVERLESS_LIFT_MAX = 4.8;
export const SEMANTIC_RELATIONSHIP_ARC_LIFT_DISTANCE_FACTOR = 0.18;
export const SEMANTIC_RELATIONSHIP_MIN_SCREEN_DISTANCE_PX = 54;
export const SEMANTIC_RELATIONSHIP_MAX_SCREEN_FRACTION = 0.82;
export const LABEL_OCCLUSION_RADIUS_MULTIPLIER = 1.14;
export const LABEL_OCCLUSION_DEPTH_PADDING = 0.08;
export const LABEL_OCCLUSION_FADE_BAND = 0.48;
export const LABEL_OCCLUSION_MAX_OPACITY_MULTIPLIER = 0.34;
export const LABEL_OCCLUSION_SCREEN_RADIUS_MULTIPLIER = 1.12;
export const LABEL_OCCLUSION_SCREEN_PADDING_PX = 18;
export const LABEL_OCCLUSION_SCREEN_FADE_BAND_PX = 44;
export const LABEL_OCCLUSION_SCREEN_HARD_CORE_MULTIPLIER = 0.82;
export const LABEL_DISTANCE_FADE_NEAR_MULTIPLIER = 4.2;
export const LABEL_DISTANCE_FADE_FAR_MULTIPLIER = 18;
export const LABEL_DISTANCE_FADE_BACKGROUND_MIN_OPACITY = 0.68;
export const LABEL_DISTANCE_FADE_CURRENT_MIN_OPACITY = 0.84;
export const LABEL_CURRENT_MIN_OPACITY_WHEN_VISIBLE = 0.78;

/**
 * Mode-driven relationship scanner.
 *
 * Relationship lines now behave as a visual lens. The active mode decides what
 * the arcs mean:
 *
 * - semantic_similarity: semantic neighborhood arcs
 * - confusion: shared confusion signal arcs
 * - insight: shared insight signal arcs
 * - off: no relationship arcs
 *
 * While the user rotates the view, scanner relationships are selected from the
 * current camera/view corridor. On release, the last scanner result stays
 * briefly before returning to the current mode's default focused relationships.
 */
export const VIEWPOINT_SCANNER_RELATIONSHIP_MAX_COUNT = 3;
export const VIEWPOINT_SCANNER_SETTLE_MS = 3000;
export const VIEWPOINT_SCANNER_CORRIDOR_RADIUS_PX = 280;
export const VIEWPOINT_SCANNER_CORE_RADIUS_PX = 82;
export const VIEWPOINT_SCANNER_MAX_SCREEN_FRACTION = 0.74;
export const VIEWPOINT_SCANNER_FAR_CORRIDOR_MIN_SCORE = 0.11;
export const VIEWPOINT_SCANNER_MIN_SCORE = 0.18;
export const VIEWPOINT_SCANNER_ACTIVE_TOPIC_BIAS = 0.2;
export const RELATIONSHIP_ARC_DEFAULT_TUBE_RADIUS_MIN = 0.014;
export const RELATIONSHIP_ARC_DEFAULT_TUBE_RADIUS_MAX = 0.058;
export const RELATIONSHIP_ARC_SCANNER_TUBE_RADIUS_MIN = 0.038;
export const RELATIONSHIP_ARC_SCANNER_TUBE_RADIUS_MAX = 0.135;
export const RELATIONSHIP_ARC_SETTLED_SCAN_TUBE_RADIUS_MIN = 0.034;
export const RELATIONSHIP_ARC_SETTLED_SCAN_TUBE_RADIUS_MAX = 0.112;
export const RELATIONSHIP_ARC_TUBE_RADIAL_SEGMENTS = 8;
export const RELATIONSHIP_ARC_TUBE_SEGMENTS = 48;

/**
 * Relationship-line occlusion rule.
 *
 * Non-connected topics should obey normal real-world depth:
 * if a relationship line is closer to the camera than an unrelated sphere, the
 * line can appear in front; if the unrelated sphere is closer, it hides the
 * line.
 *
 * Connected endpoint topics are different. Relationship lines should still tuck
 * into the topics they connect to, so each relationship creates its own tiny
 * stencil mask for only its two endpoint topics. The actual topic spheres do not
 * write the relationship stencil globally.
 */
export const RELATIONSHIP_ARC_ENDPOINT_COLOR_BLEND_FRACTION = 0.18;
export const VIEWPOINT_SCANNER_BLUE = "#7BAFD4";
export const VIEWPOINT_SCANNER_SETTLED_BLUE = VIEWPOINT_SCANNER_BLUE;

export const CONFUSION_SIGNAL_RELATIONSHIP_RED = "#fb7185";
export const INSIGHT_SIGNAL_RELATIONSHIP_GREEN = "#34d399";
export const RELATIONSHIP_VIEW_MODE_ARC_MAX_COUNT = 3;

/**
 * Probe surface thumbnail.
 *
 * Temporary dev mode keeps probe-like thumbnails visible on every topic so the
 * surface treatment can be tuned without repeatedly creating new eligible
 * probes. Turn this back to false once the thumbnail feels right.
 */
export const SHOW_DEBUG_PROBE_THUMBNAILS_FOR_ALL_TOPICS = false;

/**
 * The probe display should feel like the topic sphere itself becomes the
 * thumbnail, similar to a miniature Vegas Sphere. This is intentionally
 * viewer-facing so the probe stays upright and readable as the camera rotates.
 *
 * This display is visual-only for pointer behavior. Normal topic click,
 * double-click, and drag/scanning interactions still belong to the underlying
 * topic sphere.
 */
/**
 * Keep the probe display just far enough above the topic sphere to avoid
 * depth-buffer fighting/shimmer at distance. This is intentionally still close
 * enough to read as the sphere surface itself, not a separate badge.
 */
export const PROBE_DISPLAY_SPHERE_SCALE = 1.012;
export const PROBE_DISPLAY_GLOW_SCALE = 1.018;
export const PROBE_DISPLAY_RENDER_ORDER = 24;
export const PROBE_DISPLAY_GLOW_RENDER_ORDER = 23;
export const PROBE_DISPLAY_TEXTURE_WIDTH = 1024;
export const PROBE_DISPLAY_TEXTURE_HEIGHT = 512;
export const PROBE_DISPLAY_GLOW_OPACITY = 0;
export const PROBE_DISPLAY_FRONT_ROTATION_Y = -Math.PI / 2;
export const PROBE_EXIT_CAMERA_ALPHA = 0.068;
export const PROBE_EXIT_TARGET_ALPHA = 0.074;
export const PROBE_MARKER_DEFAULT_NORMAL = new THREE.Vector3(0.48, 0.55, 0.68).normalize();


export const RELATIONSHIP_DEFAULT_ENDPOINT_ACTIVE_COLOR = "#ead7ff";
export const RELATIONSHIP_DEFAULT_ENDPOINT_BACKGROUND_COLOR = "#d4d4d8";
export const TOPIC_SPHERE_RENDER_ORDER = 10;

/**
 * Probe availability icon.
 *
 * The probe marker is a small icon-only intervention invitation. It should stay
 * visually separate from the stable topic sphere body.
 */
export const PROBE_ICON_RENDER_ORDER = 24;
export const PROBE_ICON_SURFACE_OFFSET = 1.075;
export const PROBE_ICON_BASE_SCALE = 0.34;
export const PROBE_ICON_FOCUSED_SCALE = 0.42;


export const RELATIONSHIP_ENDPOINT_STENCIL_RENDER_ORDER = 18;
export const RELATIONSHIP_ARC_RENDER_ORDER = 20;
export const TOPIC_STENCIL_REF = 1;
export const RELATIONSHIP_STENCIL_REF_MIN = 2;
export const RELATIONSHIP_STENCIL_REF_MAX = 255;
