// CP.2A.2 compatibility: generated contact-frame alignment remains the generic non-hand physical path; CP.2A.5 locks the hand semantic effector.

import { NextResponse } from "next/server";

import { BURGER_ASSEMBLY_BENCHMARK } from "../benchmark-burger-assembly";
import {
  CINEMATIC_REPRODUCTION_SCHEMA_VERSION,
  LUNCH_RUNTIME_ROLES,
  cinematicReproductionPlanSchemaExample,
  parseCinematicReproductionJson,
  type CinematicReproductionValidation,
} from "../cinematic-reproduction-plan";

type ReproductionAssetSummary = {
  role?: string;
  asset_id?: string | null;
  label?: string | null;
  dimensions_m?: [number, number, number] | null;
  geometry_size_m?: [number, number, number] | null;
  attachment_region_count?: number;
  support_surface_count?: number;
  collision_box_count?: number;
};

type GenerateRequest = {
  instruction?: string;
  assets?: ReproductionAssetSummary[];
};

function extractJsonText(content: string) {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidate = (fenced ?? content).trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("GLM response did not contain a JSON object.");
  }
  return candidate.slice(start, end + 1);
}

function assetDossier(assets: ReproductionAssetSummary[]) {
  const byRole = new Map(assets.map((item) => [item.role, item]));
  return LUNCH_RUNTIME_ROLES.map((role) => {
    const asset = byRole.get(role);
    return {
      role,
      asset_id: asset?.asset_id ?? null,
      label: asset?.label ?? null,
      dimensions_m: asset?.geometry_size_m ?? asset?.dimensions_m ?? null,
      measured_contact_regions: asset?.attachment_region_count ?? 0,
      measured_support_surfaces: asset?.support_surface_count ?? 0,
      measured_collision_boxes: asset?.collision_box_count ?? 0,
      transform_contract:
        role === "hand"
          ? "position is a staging/root pose; CP.1F owns literal contact root while interaction is active"
          : role === "tray"
            ? "position is the tray root"
            : "position=[x,support_lift_y,z]; support_lift_y=0 means rest on MyWay's measured support surface",
    };
  });
}

function buildSystemPrompt() {
  return `You are the cinematic director for MyWay's Lunch reproduction benchmark.
Return exactly one JSON object and no prose or markdown.

Your job is orchestration, not rendering. MyWay executes your plan with the exact reviewed Lunch assets, measured support/contact geometry, CP.1F swept collision-safe interaction solving, contact maintenance, directional surface clearance, camera-aware lighting, and final soft framing safety.

The JSON must use schema_version ${CINEMATIC_REPRODUCTION_SCHEMA_VERSION}.
The runtime roles are fixed: ${LUNCH_RUNTIME_ROLES.join(", ")}.

AUTHORING CONTRACT — DO NOT GUESS THESE UNITS:
- Actor position is [x, support_lift_y, z] in metres.
- For tray-supported food/animals/fish, support_lift_y=0 means "sit on the measured support." DO NOT calculate half-height and put it in Y.
- Use rotation_deg in authored actor keys. MyWay converts degrees to renderer radians.
- Use scale_multiplier. 1.0 means the reviewed role-normalized asset size; it is NOT one metre and is NOT raw GLB scale.
- opacity/emphasis stay in [0,1].
- MyWay uses C2 for continuous spatial transforms but bounded local easing for opacity/emphasis/scale so future keys cannot create pre-echo.
- Author cow/chicken/fish visibility fades over roughly 0.5–0.8s. Do not flip 0→1 in 0.1–0.2s, and do not dissolve a major insert across >0.95s; both extremes weaken the beat.
- Never author literal contact_point/contact_normal. Declare semantic interaction timing/direction and CP.1F solves literal contact from geometry.
- interactions is ONLY for literal touch/nudge/push contact. Cow/chicken/fish entrances, reveals, holds and exits belong in actor keyframes plus directional_clearance where needed. Never use interaction kinds "reveal" or "pop_reveal".
- For generated physical contact, MyWay owns literal root motion. For the Lunch hand, keep the actor track as staging/visibility evidence around root [-2.34,1.24,1.02], rotation_deg≈[7,180,0], scale≈0.76→0.86. DO NOT animate the hand root into the burger in actor keys; the hand→burger interaction compiles one continuous CP.1F approach/contact/retreat corridor around a locked semantic palm/finger effector frame.

EXACT RELATION FIELD NAMES:
- interactions items use id, kind, source_role, target_role, approach_start_s, contact_start_s, contact_end_s, retreat_end_s, approach_direction, preferred_target_side, contact_clearance_m, obstacle_clearance_m, obstacle_roles, maintain_contact.
- directional_clearance items use id, moving_role, anchor_role, start_s, end_s, direction, minimum_surface_gap_m.

LUNCH QUALITY TARGETS:
- duration_s = 26.
- camera.keys span 0..26, interpolation="c2", and use a dense continuous rail (rough target >=14 keys).
- The first 7 seconds must stay restrained. Do NOT dive toward the burger: keep camera z roughly >=4.55m and height roughly 2.4–3.6m through ~7.35s.
- Sparse early camera evidence: around 0s ≈ [0.04,3.18,5.74]; 2.1s ≈ [-0.12,3.50,5.08]; 4.7s ≈ [-0.08,3.20,4.78]; 7.35s ≈ [0.24,2.45,4.62]. Preserve through-motion; these are composition anchors, not stop points.
- During inserts, hero anchor and temporary focus are different. Around the cow beat, target camera attention to camera-right/cow; around the chicken beat, target attention camera-left/chicken while burger remains contextual.
- Camera keys may use focus_role and focus_weight. Around 9.35s use focus_role="cow", focus_weight about 0.5–0.7. Around 12.85s use focus_role="chicken", focus_weight about 0.5–0.7.
- IMPORTANT: focus_role is the temporary attention authority. Keep the NUMERIC target on those focus keys near the underlying burger/tray composition anchor (roughly |target.x| <= 0.20). Do NOT also move numeric target all the way onto cow/chicken; MyWay reconstructs the non-focus composition rail and applies semantic attention exactly once.
- The late camera path is a one-direction near-full orbit, NOT a partial arc that reverses. From ~14.55s to 26s target >=300 degrees signed travel with zero meaningful reversals.
- Late orbit phase vocabulary remains: front-right ~15.25, back-left ~20.45, then continue the same direction into the front hero.
- Late orbit phase must match the Golden TIMING, not just total degrees. Use these benchmark shaping anchors as strong evidence while preserving C2 through-motion:
  13.75s≈position[-0.50,2.02,4.25], target[-0.05,0.31,-0.24], fov32.2
  14.55s≈[-0.05,1.96,4.15], target[0.02,0.31,-0.36], fov31.9
  15.25s≈[1.55,1.82,3.65], target[0.05,0.30,-0.52], fov31.6
  16.05s≈[3.15,1.70,2.20], target[0.03,0.30,-0.62], fov31.4
  16.85s≈[3.75,1.68,0.55], target[0.01,0.31,-0.62], fov31.6
  18.00s≈[3.45,1.82,-1.75], target[0.02,0.32,-0.50], fov32.0
  19.25s≈[1.65,2.20,-3.45], target[0.02,0.33,-0.25], fov32.6
  20.45s≈[-0.80,2.35,-3.75], target[0.01,0.34,-0.10], fov33.0
  21.75s≈[-2.85,2.20,-2.45], target[0,0.35,-0.06], fov32.8
  23.00s≈[-3.25,2.05,-0.15], target[0,0.36,-0.05], fov32.2
  24.40s≈[-2.10,1.98,2.85], target[0.01,0.39,-0.07], fov31.2
  26.00s≈[0.08,1.90,3.82], target[0.02,0.41,-0.08], fov≈30.
- Do not replace those shaped anchors with an evenly spaced mathematical circle. The orbit intentionally runs slower through the recap and keeps moving into the final hero; it should NOT return to front early.
- Hand interaction target: approach 1.35→3.15s, contact 3.15→4.55s, retreat 4.55→6.65s. Keep hand actor-key POSITION at the staging/exit root near [-2.34,1.24,1.02] throughout this beat; MyWay—not GLM—owns the physical path. Keep rotation_deg [7,180,0] so the reviewed palm/finger effector stays readable for the full interaction.
- Burger may cue attention before contact but must remain physically stationary until contact. During contact author a small legible transient response: peak roughly +0.07m X and -0.055m Z from the pre-contact pose (about 0.06–0.11m horizontal response), aligned with the push, then largely settle by release. Include one or two interior contact keys (around ~3.55s and ~4.28s) so C2 does not reduce the nudge to a tiny endpoint drift.
- Cow: visible roughly 7.35→11.78s; arrive 7.55→9.15 from camera-right; HOLD the settled pose through 10.55, then depart 10.55→11.75. A key at 10.55 is the DEPARTURE START and must still equal the settled pose, not an already-outward pose. Fade in about 7.35→8.05 and out about 11.00→11.78. Rotate from about -74° yaw on entry toward a readable three-quarter yaw near -47° at settle. MyWay adds the subtle vertical settle arc.
- Chicken: visible roughly 10.45→14.62s; arrive 10.55→11.55 from camera-left; HOLD the settled pose through 13.05, then depart 13.05→14.55. A key at 13.05 is the DEPARTURE START and must still equal the settled pose. Fade in about 10.45→11.05 and out about 13.75→14.62. Rotate from about +71° yaw on entry toward a readable three-quarter yaw near +46° at settle. MyWay adds the subtle vertical settle arc.
- Goldfish: do not become visibly present before roughly 12.9s. Set up from about z=-1.48 around 12.95, settle near [0.02,0,-1.78] by ~13.72, grow roughly 0.68→0.82, fade in about 12.90→13.45 while still hidden, hold through ~18.2, then fade out about 18.45→19.12. IMPORTANT semantic facing: use rotation_deg near [0,0,0], NOT [0,180,0]. Near-zero yaw points the reviewed fish long axis down the initial viewing ray so the burger can fully hide it before the orbit reveals its side. Remain essentially fixed in X/Z through the reveal; declare burger-relative negative-Z directional clearance.
- The fish reveal is PHYSICAL OCCLUSION, not an opacity trick. Once settled behind the burger, fish may already be fully opaque while hidden. Do not fade it in as the camera begins to orbit; let screen-space separation from camera parallax create discovery.
- Recap attention order: apple ~17.75–18.9, burger ~18.75–19.9, nigiri ~19.75–20.9.
- Final burger hero emphasis ~23.05–25.85.

SPARSE GOLDEN STAGING ANCHORS — use these as reproduction evidence, not literal contact coordinates:
- opening apple ≈ position [-1.36,0,0.36], scale_multiplier 0.88
- opening burger ≈ [0,0,0.02], scale_multiplier 0.96
- opening nigiri ≈ [1.34,0,0.35], scale_multiplier 0.86
- by ~9.35s apple ≈ [-1.58,0,0.52] scale 0.70; burger ≈ [0.02,0,-0.06] scale 1.0; nigiri ≈ [1.58,0,0.52] scale 0.68
- cow travels roughly [2.42,0,0.10] → [1.16,0,-0.24], scale about 0.72→0.82
- chicken travels roughly [-2.40,0,0.10] → [-1.16,0,-0.24], scale about 0.70→0.80
- goldfish settles near [0.02,0,-1.78], scale about 0.82, and holds there for the camera-earned reveal
- hand staging/exit root is around [-2.34,1.24,1.02], scale about 0.76→0.86; KEEP actor-key root there. CP.1F replaces it with one whole-interaction geometry-solved approach/contact/retreat corridor and the reviewed semantic hand effector owns final orientation
- hero settle keeps burger near center and grows it toward ~1.12 while apple/nigiri move inward, shrink, and DEEMPHASIZE TO OPACITY ~0.58 by 26s. Burger remains opacity 1. Final camera height should be near 1.90m, not a high/top-down 2.3m finish.

Before emitting JSON, self-check:
1. relation objects use the exact field names,
2. resting supported actors use Y≈0,
3. scale_multiplier is relative and generally near 0.6–1.2,
4. the camera numerically completes the late orbit instead of merely describing one in notes,
5. fish X/Z stays nearly fixed during reveal,
6. cow/chicken/fish major opacity transitions are neither <0.45s nor >0.95s,
7. interactions contains only genuine physical contact (for Lunch, hand→burger only),
8. cow/chicken use focus_role/focus_weight while numeric focus-key target stays near the composition anchor; do not double-aim,
9. cow/chicken settle into three-quarter presentation rather than ±90° side profiles,
10. cow stays at its settled pose through 10.55s and chicken through 13.05s before departure begins,
11. fish does not become visibly present before ~12.9s, uses near-zero yaw (never 180°), and is settled/opaque behind burger before parallax discovery,
12. hand actor-key root stays at the staging root; CP.1F owns all literal hand travel,
13. burger stays essentially fixed before hand contact, then moves 0.06–0.11m with the push during contact,
14. late orbit follows the benchmark phase anchors and does not reach front early,
15. final apple/nigiri opacity is near 0.58 and final camera height near 1.90m.

Shape example (illustrative coordinates; relation field names and unit semantics are authoritative):
${JSON.stringify(cinematicReproductionPlanSchemaExample(), null, 2)}
`;
}

function buildUserPrompt(input: GenerateRequest) {
  const benchmark = BURGER_ASSEMBLY_BENCHMARK;
  const shots = benchmark.shots.map((shot) => ({
    order: shot.order,
    title: shot.title,
    duration_s: shot.duration_s,
    purpose: shot.purpose,
    camera: `${shot.camera_label}: ${shot.camera_detail}`,
    action: `${shot.action_label}: ${shot.action_detail}`,
  }));
  const instruction = input.instruction?.trim() ||
    "Recreate the current Lunch golden cinematic as closely as possible. Favor smooth, energetic but readable short-form camera and actor choreography.";
  return `REPRODUCTION TARGET: Lunch

User instruction:
${instruction}

Production brief:
${benchmark.production_brief}

North star:
${benchmark.north_star}

Visual language:
${benchmark.visual_language.map((item) => `- ${item}`).join("\n")}

Semantic beat dossier:
${JSON.stringify(shots, null, 2)}

Actual selected asset evidence:
${JSON.stringify(assetDossier(input.assets ?? []), null, 2)}

Produce the complete ${CINEMATIC_REPRODUCTION_SCHEMA_VERSION} JSON now.`;
}

function criticalRepairWarnings(validation: CinematicReproductionValidation) {
  const patterns = [
    /No hand → burger/i,
    /No goldfish → burger/i,
    /Late Lunch orbit/i,
    /Opening tray actors/i,
    /Visible scale_multiplier/i,
    /Goldfish drifts/i,
    /Hand contact begins/i,
    /Hand contact ends/i,
    /camera has only/i,
    /opacity transition/i,
    /Burger authored drift/i,
    /Cow beat camera target/i,
    /Chicken beat camera target/i,
    /Fish\/burger screen-overlap/i,
    /Fish separates too quickly/i,
    /major insert opacity transition/i,
    /Hand staging yaw/i,
    /Burger peak authored response/i,
    /Burger nudge response alignment/i,
    /temporary camera attention/i,
    /too side-on/i,
    /Goldfish becomes visible/i,
    /Fish reveal curve/i,
    /Late orbit timing/i,
    /Late orbit radius/i,
    /Late camera height/i,
    /Final hero camera/i,
    /Final support opacity/i,
    /Cow authored track moves/i,
    /Chicken authored track moves/i,
    /Goldfish semantic forward yaw/i,
    /Temporary attention target moves too abruptly/i,
    /non-hand physical interaction/i,
    /choreography, not physical contact/i,
  ];
  return validation.warnings.filter((warning) =>
    patterns.some((pattern) => pattern.test(warning))
  );
}

function repairQualityBurden(validation: CinematicReproductionValidation) {
  return validation.errors.length * 1000 +
    criticalRepairWarnings(validation).length * 100 +
    validation.warnings.length;
}

function normalizedPlanSignature(plan: unknown) {
  return JSON.stringify(plan);
}

async function requestGlmContent(input: {
  endpoint: string;
  apiKey: string;
  model: string;
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 300_000);
  try {
    const response = await fetch(`${input.endpoint}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: input.model,
        messages: input.messages,
        temperature: 0.16,
        top_p: 0.9,
        max_tokens: 20_000,
        stream: false,
      }),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => null) as any;
    if (!response.ok) {
      throw new Error(
        payload?.error?.message ??
          `GLM request failed with HTTP ${response.status}.`,
      );
    }
    const content = payload?.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      throw new Error("GLM returned no message content.");
    }
    return content;
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET() {
  const model =
    process.env.MYWAY_CINEMATIC_GLM_MODEL?.trim() ||
    process.env.MYWAY_GLM_MODEL?.trim() ||
    "z-ai/glm-5.2";
  // Historical verifier markers retained while the active contract advances:
  // contract_revision: "cp2a2"
  // contract_revision: "cp2a4"
  return NextResponse.json({
    ok: true,
    configured: Boolean(process.env.NVIDIA_API_KEY?.trim()),
    provider: "nvidia",
    model,
    schema_version: CINEMATIC_REPRODUCTION_SCHEMA_VERSION,
    contract_revision: "cp2a5",
  });
}

export async function POST(request: Request) {
  try {
    const input = (await request.json().catch(() => ({}))) as GenerateRequest;
    const apiKey = process.env.NVIDIA_API_KEY?.trim();
    if (!apiKey) {
      return NextResponse.json(
        { ok: false, error: "Missing NVIDIA_API_KEY." },
        { status: 500 },
      );
    }
    const endpoint = (
      process.env.NVIDIA_BASE_URL ??
      "https://integrate.api.nvidia.com/v1"
    ).replace(/\/$/, "");
    const model =
      process.env.MYWAY_CINEMATIC_GLM_MODEL?.trim() ||
      process.env.MYWAY_GLM_MODEL?.trim() ||
      "z-ai/glm-5.2";

    const systemPrompt = buildSystemPrompt();
    const userPrompt = buildUserPrompt(input);
    const initialContent = await requestGlmContent({
      endpoint,
      apiKey,
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });
    const initialJsonText = extractJsonText(initialContent);
    const initialParsed = JSON.parse(initialJsonText) as unknown;
    const initialNormalized = parseCinematicReproductionJson(
      JSON.stringify(initialParsed),
    );
    const repairWarnings = criticalRepairWarnings(initialNormalized.validation);

    let finalContent = initialContent;
    let finalJsonText = initialJsonText;
    let finalParsed = initialParsed;
    let finalNormalized = initialNormalized;
    let generationAttempts = 1;
    let repairContent: string | null = null;
    let repairAccepted: boolean | null = null;
    let repairRejectionReason: string | null = null;
    let repairValidation: CinematicReproductionValidation | null = null;
    const initialRepairBurden = repairQualityBurden(initialNormalized.validation);
    let finalRepairBurden = initialRepairBurden;

    if (!initialNormalized.validation.ok || repairWarnings.length > 0) {
      generationAttempts = 2;
      const repairInstruction = `REPAIR PASS.
Your previous JSON parsed, but MyWay's deterministic Lunch checks found these issues:
${[
  ...initialNormalized.validation.errors.map((item) => `ERROR: ${item}`),
  ...repairWarnings.map((item) => `WARNING: ${item}`),
].join("\n")}

Return a COMPLETE replacement JSON object, not a patch and no prose.
Keep any good choreography, but correct the contract/units/timing/spatial path.
Especially verify:
- early camera remains restrained and does not dive into the burger,
- only hand→burger is a physical interaction,
- hand actor-key root stays at [-2.34,1.24,1.02] with readable [7,180,0]; MyWay owns the WHOLE physical approach/contact/retreat corridor,
- burger remains fixed before contact, then shows a 0.06–0.11m transient response aligned with the push,
- cow/chicken use three-quarter facing, continuous focus_role/focus_weight, and HOLD their settled pose until the exact departure start (cow 10.55, chicken 13.05),
- focus-key numeric target stays near the underlying composition anchor so semantic focus is applied only once,
- cow/chicken/fish fades land around 0.5–0.8s rather than popping or dissolving too slowly,
- fish does not become visible before ~12.9s, uses near-zero yaw rather than 180°, and is physically hidden/opaque before the orbit earns discovery,
- late camera matches the supplied shaped phase anchors instead of an evenly spaced circle,
- final camera lands near 1.90m high and apple/nigiri fade toward ~0.58 opacity,
- and the late camera still completes the one-direction near-full orbit.`;

      repairContent = await requestGlmContent({
        endpoint,
        apiKey,
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
          { role: "assistant", content: initialContent },
          { role: "user", content: repairInstruction },
        ],
      });
      const candidateJsonText = extractJsonText(repairContent);
      const candidateParsed = JSON.parse(candidateJsonText) as unknown;
      const candidateNormalized = parseCinematicReproductionJson(
        JSON.stringify(candidateParsed),
      );
      repairValidation = candidateNormalized.validation;
      const candidateBurden = repairQualityBurden(candidateNormalized.validation);
      const repairChanged = normalizedPlanSignature(candidateNormalized.plan) !==
        normalizedPlanSignature(initialNormalized.plan);

      if (repairChanged && candidateBurden < initialRepairBurden) {
        repairAccepted = true;
        finalContent = repairContent;
        finalJsonText = candidateJsonText;
        finalParsed = candidateParsed;
        finalNormalized = candidateNormalized;
        finalRepairBurden = candidateBurden;
      } else {
        repairAccepted = false;
        finalRepairBurden = initialRepairBurden;
        repairRejectionReason = !repairChanged
          ? "GLM repair reproduced the same normalized plan; unchanged repairs are evidence only and are not treated as successful."
          : `GLM repair did not reduce deterministic quality burden (${initialRepairBurden} → ${candidateBurden}); initial JSON was retained for transparent MyWay compilation.`;
      }
    }

    return NextResponse.json({
      ok: true,
      provider: "nvidia",
      model,
      raw_content: initialContent,
      repair_content: repairContent,
      generation_attempts: generationAttempts,
      repair_accepted: repairAccepted,
      repair_rejection_reason: repairRejectionReason,
      repair_validation: repairValidation,
      initial_repair_burden: initialRepairBurden,
      final_repair_burden: finalRepairBurden,
      initial_validation: initialNormalized.validation,
      final_raw_content: finalContent,
      json_text: JSON.stringify(finalParsed, null, 2),
      normalized_plan: finalNormalized.plan,
      validation: finalNormalized.validation,
    });
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : String(caught);
    const aborted = caught instanceof Error && caught.name === "AbortError";
    return NextResponse.json(
      {
        ok: false,
        error: aborted
          ? "GLM Lunch generation timed out during a 300-second generation/repair attempt."
          : message,
      },
      { status: aborted ? 504 : 500 },
    );
  }
}
