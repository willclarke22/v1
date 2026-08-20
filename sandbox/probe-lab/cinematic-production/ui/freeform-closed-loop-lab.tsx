"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  parseFreeformCinematicReproductionJson,
  sampleFreeformCinematicReproductionPlan,
  type CinematicReproductionPlanV1,
  type CinematicReproductionValidation,
} from "../cinematic-reproduction-plan";
import {
  CinematicProductionRuntimeCanvas,
  type CinematicLibraryAssetRecord,
} from "./cinematic-production-runtime-canvas";

type FreeformRole =
  | "tray"
  | "apple"
  | "burger"
  | "nigiri"
  | "cow"
  | "chicken"
  | "goldfish"
  | "hand";

type LibraryResponse = {
  ok?: boolean;
  error?: string;
  assets?: CinematicLibraryAssetRecord[];
};

type GenerateResponse = {
  ok?: boolean;
  error?: string;
  action?: "generate" | "repair";
  provider?: string;
  model?: string;
  raw_content?: string;
  repair_content?: string | null;
  json_text?: string;
  normalized_plan?: CinematicReproductionPlanV1;
  validation?: CinematicReproductionValidation;
  contract_repair_attempted?: boolean;
  timing?: {
    glm_initial_ms?: number;
    glm_initial_first_event_ms?: number | null;
    glm_initial_first_token_ms?: number | null;
    glm_initial_response_chars?: number;
    contract_repair_ms?: number;
    contract_repair_first_token_ms?: number | null;
    total_ms?: number;
  };
};

type CritiqueProblem = {
  time: string;
  problem: string;
  desired_change: string;
};

type FreeformCritique = {
  summary: string;
  preserve: string[];
  problems: CritiqueProblem[];
  top_repairs: string[];
};

type CritiqueResponse = {
  ok?: boolean;
  error?: string;
  provider?: string;
  model?: string;
  critique?: FreeformCritique;
  raw_content?: string;
  timing?: {
    omni_ms?: number;
    total_ms?: number;
  };
};

type CastSpec = {
  role: FreeformRole;
  label: string;
  search_terms: string[];
};

type Version = "v1" | "v2";

const FREEFORM_CAST: CastSpec[] = [
  {
    role: "tray",
    label: "Plate / tray",
    search_terms: ["plate", "tray", "dish"],
  },
  {
    role: "apple",
    label: "Apple",
    search_terms: ["apple"],
  },
  {
    role: "burger",
    label: "Burger",
    search_terms: ["burger", "cheeseburger"],
  },
  {
    role: "nigiri",
    label: "Salmon nigiri",
    search_terms: ["nigiri", "sushi", "salmon"],
  },
  {
    role: "cow",
    label: "Cow",
    search_terms: ["cow", "cattle"],
  },
  {
    role: "chicken",
    label: "Rooster",
    search_terms: ["rooster", "chicken", "hen"],
  },
  {
    role: "goldfish",
    label: "Goldfish",
    search_terms: ["goldfish", "fish"],
  },
  {
    role: "hand",
    label: "Simple hand",
    search_terms: ["hand", "glove"],
  },
];

const DEFAULT_FREEFORM_REQUEST = `Create a polished 20–30 second 3D educational cinematic using a burger, apple, salmon nigiri, a cow, a rooster, a goldfish, and a simple hand. Visually communicate relationships between the foods and animals without using text or narration. The scene should feel deliberately directed rather than like objects simply appearing one after another. Use physical 3D staging, depth, purposeful camera movement, clear visual emphasis, and visually understandable transitions. End with the burger as the main visual focus.

Make the result engaging and easy to understand purely by watching it.`;

const CAPTURE_FPS = 12;
const CAPTURE_BITS_PER_SECOND = 900_000;

function supportedMp4RecorderMimeType() {
  if (typeof MediaRecorder === "undefined") {
    return null;
  }
  const candidates = [
    'video/mp4;codecs="avc1.42E01E"',
    "video/mp4;codecs=avc1.42E01E",
    'video/mp4;codecs="avc1.4D401E"',
    "video/mp4;codecs=avc1.4D401E",
    "video/mp4;codecs=avc1",
    "video/mp4",
  ];
  return (
    candidates.find((candidate) =>
      MediaRecorder.isTypeSupported(candidate),
    ) ?? null
  );
}

function afterBrowserPaint(frames = 3) {
  return new Promise<void>((resolve) => {
    let remaining = Math.max(1, frames);
    const step = () => {
      remaining -= 1;
      if (remaining <= 0) {
        resolve();
      } else {
        window.requestAnimationFrame(step);
      }
    };
    window.requestAnimationFrame(step);
  });
}

function assetLabel(
  asset: CinematicLibraryAssetRecord | null,
) {
  return (
    asset?.display_name ||
    asset?.canonical_label ||
    asset?.asset_id ||
    "Unknown asset"
  );
}

function searchableText(
  asset: CinematicLibraryAssetRecord,
) {
  return [
    asset.asset_id,
    asset.display_name,
    asset.canonical_label,
    ...(asset.aliases ?? []),
    ...(asset.semantic_tags ?? []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function scoreAsset(
  asset: CinematicLibraryAssetRecord,
  spec: CastSpec,
) {
  const haystack =
    searchableText(asset);
  let score = 0;
  for (const term of spec.search_terms) {
    const normalized =
      term.toLowerCase();
    if (
      asset.canonical_label
        ?.toLowerCase() ===
        normalized
    ) {
      score += 120;
    }
    if (
      asset.display_name
        ?.toLowerCase() ===
        normalized
    ) {
      score += 100;
    }
    if (
      haystack.includes(
        normalized,
      )
    ) {
      score += 30;
    }
  }
  return score;
}

function formatMs(
  value: number | null | undefined,
) {
  if (
    value == null ||
    !Number.isFinite(value)
  ) {
    return "—";
  }
  return value < 1000
    ? `${Math.round(value)} ms`
    : `${(value / 1000).toFixed(1)} s`;
}

function safeJson(
  value: unknown,
) {
  return value == null
    ? "Not available yet."
    : JSON.stringify(
        value,
        null,
        2,
      );
}

export function FreeformClosedLoopLab() {
  const [instruction, setInstruction] =
    useState(
      DEFAULT_FREEFORM_REQUEST,
    );

  const [assets, setAssets] =
    useState<
      CinematicLibraryAssetRecord[]
    >([]);
  const [
    loadingAssets,
    setLoadingAssets,
  ] = useState(true);
  const [
    assetError,
    setAssetError,
  ] = useState<string | null>(
    null,
  );
  const [
    castSelections,
    setCastSelections,
  ] = useState<
    Record<string, string>
  >({});

  const [v1Plan, setV1Plan] =
    useState<
      CinematicReproductionPlanV1 | null
    >(null);
  const [v2Plan, setV2Plan] =
    useState<
      CinematicReproductionPlanV1 | null
    >(null);
  const [
    v1Validation,
    setV1Validation,
  ] =
    useState<
      CinematicReproductionValidation | null
    >(null);
  const [
    v2Validation,
    setV2Validation,
  ] =
    useState<
      CinematicReproductionValidation | null
    >(null);
  const [v1Raw, setV1Raw] =
    useState("");
  const [v2Raw, setV2Raw] =
    useState("");
  const [
    v1ContractRepair,
    setV1ContractRepair,
  ] = useState("");
  const [
    v2ContractRepair,
    setV2ContractRepair,
  ] = useState("");

  const [
    v1Critique,
    setV1Critique,
  ] =
    useState<FreeformCritique | null>(
      null,
    );
  const [
    v2Critique,
    setV2Critique,
  ] =
    useState<FreeformCritique | null>(
      null,
    );
  const [
    v1CritiqueRaw,
    setV1CritiqueRaw,
  ] = useState("");
  const [
    v2CritiqueRaw,
    setV2CritiqueRaw,
  ] = useState("");

  const [
    activeVersion,
    setActiveVersion,
  ] =
    useState<Version>("v1");
  const [
    playbackTimeS,
    setPlaybackTimeS,
  ] = useState(0);
  const [
    seekRequest,
    setSeekRequest,
  ] = useState({
    timeS: 0,
    revision: 0,
  });
  const [
    isPlaying,
    setIsPlaying,
  ] = useState(false);
  const [
    inspectMode,
    setInspectMode,
  ] = useState(false);
  const [
    runtimeRevision,
    setRuntimeRevision,
  ] = useState(0);
  const [
    isCapturing,
    setIsCapturing,
  ] = useState(false);
  const captureEndResolverRef =
    useRef<
      (() => void) | null
    >(null);

  const [busy, setBusy] =
    useState<
      | null
      | "v1"
      | "omni_v1"
      | "v2"
      | "omni_v2"
      | "loop"
    >(null);
  const [error, setError] =
    useState<string | null>(
      null,
    );
  const [status, setStatus] =
    useState(
      "Ready for a clean freeform production test.",
    );
  const [
    glmModel,
    setGlmModel,
  ] = useState<string | null>(
    null,
  );
  const [
    omniModel,
    setOmniModel,
  ] = useState<string | null>(
    null,
  );

  const [timing, setTiming] =
    useState<{
      v1_glm_ms?: number;
      v1_glm_first_event_ms?: number | null;
      v1_glm_first_token_ms?: number | null;
      v1_glm_response_chars?: number;
      v1_contract_repair_ms?: number;
      v1_ready_ms?: number;
      v1_capture_ms?: number;
      omni_v1_ms?: number;
      v2_glm_ms?: number;
      v2_glm_first_event_ms?: number | null;
      v2_glm_first_token_ms?: number | null;
      v2_glm_response_chars?: number;
      v2_contract_repair_ms?: number;
      v2_ready_ms?: number;
      v2_capture_ms?: number;
      omni_v2_ms?: number;
      total_loop_ms?: number;
    }>({});

  useEffect(() => {
    let cancelled = false;

    async function loadAssets() {
      setLoadingAssets(true);
      setAssetError(null);
      try {
        const response =
          await fetch(
            "/api/sandbox/probe-lab/assets/library",
          );
        const payload =
          (await response.json()) as LibraryResponse;
        if (
          !response.ok ||
          !payload.ok
        ) {
          throw new Error(
            payload.error ||
              "Asset Library request failed.",
          );
        }
        if (cancelled) {
          return;
        }
        const approved =
          (payload.assets ?? [])
            .filter(
              (asset) =>
                asset.scene_review_status ===
                  "approved" &&
                Boolean(
                  asset.public_path,
                ),
            )
            .sort((left, right) =>
              assetLabel(left).localeCompare(
                assetLabel(right),
              ),
            );
        setAssets(approved);
      } catch (caught) {
        if (!cancelled) {
          setAssetError(
            caught instanceof Error
              ? caught.message
              : String(caught),
          );
        }
      } finally {
        if (!cancelled) {
          setLoadingAssets(false);
        }
      }
    }

    void loadAssets();
    return () => {
      cancelled = true;
    };
  }, []);

  const autoMatches =
    useMemo(
      () =>
        Object.fromEntries(
          FREEFORM_CAST.map(
            (spec) => {
              const ranked =
                assets
                  .map((asset) => ({
                    asset,
                    score:
                      scoreAsset(
                        asset,
                        spec,
                      ),
                  }))
                  .filter(
                    (entry) =>
                      entry.score >
                      0,
                  )
                  .sort(
                    (left, right) =>
                      right.score -
                      left.score,
                  );
              return [
                spec.role,
                ranked[0]?.asset
                  .asset_id ??
                  null,
              ];
            },
          ),
        ) as Record<
          FreeformRole,
          string | null
        >,
      [assets],
    );

  useEffect(() => {
    setCastSelections(
      (current) => {
        const next = {
          ...current,
        };
        let changed = false;
        for (const spec of FREEFORM_CAST) {
          if (
            !next[spec.role] &&
            autoMatches[
              spec.role
            ]
          ) {
            next[spec.role] =
              autoMatches[
                spec.role
              ]!;
            changed = true;
          }
        }
        return changed
          ? next
          : current;
      },
    );
  }, [autoMatches]);

  const selectedAssets =
    useMemo(
      () =>
        Object.fromEntries(
          FREEFORM_CAST.map(
            (spec) => [
              spec.role,
              assets.find(
                (asset) =>
                  asset.asset_id ===
                  castSelections[
                    spec.role
                  ],
              ) ?? null,
            ],
          ),
        ) as Record<
          string,
          CinematicLibraryAssetRecord | null
        >,
      [
        assets,
        castSelections,
      ],
    );

  const resolvedCount =
    FREEFORM_CAST.filter(
      (spec) =>
        selectedAssets[
          spec.role
        ],
    ).length;

  const activePlan =
    activeVersion === "v2"
      ? v2Plan ?? v1Plan
      : v1Plan;
  const activeDurationS =
    activePlan?.duration_s ??
    24;

  const runtimeSampler =
    useMemo(
      () =>
        activePlan
          ? (timeS: number) =>
              sampleFreeformCinematicReproductionPlan(
                activePlan,
                timeS,
              )
          : null,
      [activePlan],
    );

  const requestSeek =
    useCallback(
      (timeS: number) => {
        const clamped =
          Math.max(
            0,
            Math.min(
              activeDurationS,
              timeS,
            ),
          );
        setPlaybackTimeS(
          clamped,
        );
        setSeekRequest(
          (current) => ({
            timeS:
              clamped,
            revision:
              current.revision +
              1,
          }),
        );
      },
      [activeDurationS],
    );

  const handleRuntimeTime =
    useCallback(
      (timeS: number) =>
        setPlaybackTimeS(
          timeS,
        ),
      [],
    );

  const handleRuntimeEnded =
    useCallback(() => {
      setPlaybackTimeS(
        activeDurationS,
      );
      setIsPlaying(false);
      const resolver =
        captureEndResolverRef.current;
      captureEndResolverRef.current =
        null;
      if (resolver) {
        setInspectMode(false);
        resolver();
      }
    }, [activeDurationS]);

  useEffect(() => {
    setIsPlaying(false);
    setInspectMode(false);
    setPlaybackTimeS(0);
    setSeekRequest(
      (current) => ({
        timeS: 0,
        revision:
          current.revision + 1,
      }),
    );
  }, [
    activeVersion,
    runtimeRevision,
  ]);

  function buildAssetSummary() {
    return FREEFORM_CAST.map(
      (spec) => {
        const asset =
          selectedAssets[
            spec.role
          ];
        return {
          role: spec.role,
          asset_id:
            asset?.asset_id ??
            null,
          label:
            assetLabel(asset),
          dimensions_m:
            asset?.dimensions_m ??
            null,
          geometry_size_m:
            asset
              ?.geometry_profile
              ?.local_bounds
              .size ?? null,
          attachment_region_count:
            asset
              ?.geometry_profile
              ?.attachment_regions
              ?.length ?? 0,
          support_surface_count:
            asset
              ?.geometry_profile
              ?.support_surfaces
              ?.length ?? 0,
          collision_box_count:
            asset
              ?.geometry_profile
              ?.collision_boxes
              ?.length ?? 0,
        };
      },
    );
  }

  async function requestPlan(
    action:
      | "generate"
      | "repair",
    currentPlan?: CinematicReproductionPlanV1 | null,
    critique?: FreeformCritique | null,
  ) {
    const response =
      await fetch(
        "/api/sandbox/probe-lab/cinematic-production/freeform",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            action,
            instruction,
            assets:
              buildAssetSummary(),
            current_plan:
              currentPlan ??
              undefined,
            critique:
              critique ??
              undefined,
          }),
        },
      );
    const payload =
      (await response.json()) as GenerateResponse;
    if (
      !response.ok ||
      !payload.ok ||
      !payload.normalized_plan
    ) {
      throw new Error(
        payload.error ||
          "GLM did not return an executable freeform cinematic plan.",
      );
    }
    return payload;
  }

  async function applyPlan(
    version: Version,
    payload: GenerateResponse,
  ) {
    const plan =
      payload.normalized_plan!;
    const validation =
      payload.validation ??
      parseFreeformCinematicReproductionJson(
        JSON.stringify(plan),
      ).validation;

    if (version === "v1") {
      setV1Plan(plan);
      setV1Validation(
        validation,
      );
      setV1Raw(
        payload.raw_content ??
          "",
      );
      setV1ContractRepair(
        payload.repair_content ??
          "",
      );
      setActiveVersion("v1");
    } else {
      setV2Plan(plan);
      setV2Validation(
        validation,
      );
      setV2Raw(
        payload.raw_content ??
          "",
      );
      setV2ContractRepair(
        payload.repair_content ??
          "",
      );
      setActiveVersion("v2");
    }

    setGlmModel(
      payload.model ?? null,
    );
    setRuntimeRevision(
      (value) => value + 1,
    );
    await afterBrowserPaint(4);
    return plan;
  }

  async function captureCurrentPreviewAsMp4(
    version: Version,
    planOverride?: CinematicReproductionPlanV1 | null,
  ) {
    const plan =
      planOverride ??
      (version === "v1"
        ? v1Plan
        : v2Plan);
    if (!plan) {
      throw new Error(
        `${version.toUpperCase()} does not have a rendered plan yet.`,
      );
    }

    const mimeType =
      supportedMp4RecorderMimeType();
    if (!mimeType) {
      throw new Error(
        "This browser does not expose H.264/MP4 MediaRecorder capture. The freeform Omni test currently requires MP4.",
      );
    }

    const captureStarted =
      performance.now();
    setIsCapturing(true);
    setIsPlaying(false);
    setInspectMode(false);
    setActiveVersion(
      version,
    );
    setPlaybackTimeS(0);
    setSeekRequest(
      (current) => ({
        timeS: 0,
        revision:
          current.revision + 1,
      }),
    );
    await afterBrowserPaint(4);

    const captureRoot =
      document.querySelector<HTMLElement>(
        '[data-freeform-cinematic-capture-root="true"]',
      );
    const canvas =
      captureRoot?.querySelector<HTMLCanvasElement>(
        "canvas",
      );
    if (
      !canvas ||
      typeof canvas.captureStream !==
        "function"
    ) {
      setIsCapturing(false);
      throw new Error(
        "The freeform cinematic WebGL canvas could not be found for video capture.",
      );
    }

    const stream =
      canvas.captureStream(
        CAPTURE_FPS,
      );
    const recorder =
      new MediaRecorder(
        stream,
        {
          mimeType,
          videoBitsPerSecond:
            CAPTURE_BITS_PER_SECOND,
        },
      );
    const chunks: BlobPart[] =
      [];
    recorder.addEventListener(
      "dataavailable",
      (event) => {
        if (
          event.data.size >
          0
        ) {
          chunks.push(
            event.data,
          );
        }
      },
    );

    const stopped =
      new Promise<void>(
        (
          resolve,
          reject,
        ) => {
          recorder.addEventListener(
            "stop",
            () => resolve(),
            { once: true },
          );
          recorder.addEventListener(
            "error",
            () =>
              reject(
                new Error(
                  "Browser video recording failed.",
                ),
              ),
            { once: true },
          );
        },
      );

    const playbackEnded =
      new Promise<void>(
        (resolve) => {
          captureEndResolverRef.current =
            resolve;
        },
      );

    try {
      recorder.start();
      setIsPlaying(true);
      await Promise.race([
        playbackEnded,
        new Promise<void>(
          (_, reject) => {
            window.setTimeout(
              () =>
                reject(
                  new Error(
                    `Timed out while recording ${version.toUpperCase()}. Keep this tab visible during the current real-time capture.`,
                  ),
                ),
              90_000,
            );
          },
        ),
      ]);
    } finally {
      setIsPlaying(false);
      captureEndResolverRef.current =
        null;
      if (
        recorder.state !==
        "inactive"
      ) {
        recorder.stop();
      }
      await stopped.catch(
        () => undefined,
      );
      stream
        .getTracks()
        .forEach((track) =>
          track.stop(),
        );
      setIsCapturing(false);
    }

    if (!chunks.length) {
      throw new Error(
        `The browser recorded no MP4 data for ${version.toUpperCase()}.`,
      );
    }

    const elapsed =
      performance.now() -
      captureStarted;
    setTiming((current) => ({
      ...current,
      [version === "v1"
        ? "v1_capture_ms"
        : "v2_capture_ms"]:
        elapsed,
    }));

    return new Blob(
      chunks,
      {
        type: mimeType,
      },
    );
  }

  async function requestCritique(
    blob: Blob,
    version: Version,
    durationS: number,
  ) {
    const body =
      new FormData();
    body.append(
      "video",
      blob,
      `${version}.mp4`,
    );
    body.append(
      "instruction",
      instruction,
    );
    body.append(
      "stage",
      version.toUpperCase(),
    );
    body.append(
      "duration_s",
      String(durationS),
    );

    const response =
      await fetch(
        "/api/sandbox/probe-lab/cinematic-production/freeform-vision",
        {
          method: "POST",
          body,
        },
      );
    const payload =
      (await response.json()) as CritiqueResponse;
    if (
      !response.ok ||
      !payload.ok ||
      !payload.critique
    ) {
      throw new Error(
        payload.error ||
          "Omni did not return a usable freeform critique.",
      );
    }
    setOmniModel(
      payload.model ?? null,
    );
    setTiming((current) => ({
      ...current,
      [version === "v1"
        ? "omni_v1_ms"
        : "omni_v2_ms"]:
        payload.timing
          ?.omni_ms ??
        payload.timing
          ?.total_ms,
    }));
    return payload;
  }

  async function generateV1() {
    if (
      busy ||
      resolvedCount <
        FREEFORM_CAST.length
    ) {
      return;
    }
    setBusy("v1");
    setError(null);
    setStatus(
      "GLM 5.2 is directing V1 from the creative request only…",
    );
    setV1Critique(null);
    setV2Critique(null);
    setV2Plan(null);
    setV2Validation(null);
    setV2Raw("");
    setV2ContractRepair("");

    try {
      const started =
        performance.now();
      const payload =
        await requestPlan(
          "generate",
        );
      await applyPlan(
        "v1",
        payload,
      );
      setTiming({
        v1_glm_ms:
          payload.timing
            ?.glm_initial_ms,
        v1_glm_first_event_ms:
          payload.timing
            ?.glm_initial_first_event_ms,
        v1_glm_first_token_ms:
          payload.timing
            ?.glm_initial_first_token_ms,
        v1_glm_response_chars:
          payload.timing
            ?.glm_initial_response_chars,
        v1_contract_repair_ms:
          payload.timing
            ?.contract_repair_ms,
        v1_ready_ms:
          performance.now() -
          started,
      });
      setStatus(
        "V1 is rendered through the freeform sampler + shared deterministic MyWay runtime. Watch it or ask Omni.",
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : String(caught),
      );
      setStatus(
        "V1 generation failed.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function critiqueV1() {
    if (
      busy ||
      !v1Plan
    ) {
      return;
    }
    setBusy("omni_v1");
    setError(null);
    setStatus(
      "Recording V1 in real time for Omni…",
    );
    try {
      const blob =
        await captureCurrentPreviewAsMp4(
          "v1",
        );
      setStatus(
        "V1 captured. Omni is judging the actual rendered film with no Golden reference…",
      );
      const payload =
        await requestCritique(
          blob,
          "v1",
          v1Plan.duration_s,
        );
      setV1Critique(
        payload.critique!,
      );
      setV1CritiqueRaw(
        payload.raw_content ??
          "",
      );
      setStatus(
        "Omni V1 critique is ready. Generate V2 to patch the existing direction.",
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : String(caught),
      );
      setStatus(
        "Omni V1 critique failed.",
      );
    } finally {
      setBusy(null);
      setActiveVersion("v1");
    }
  }

  async function generateV2() {
    if (
      busy ||
      !v1Plan ||
      !v1Critique
    ) {
      return;
    }
    setBusy("v2");
    setError(null);
    setStatus(
      "GLM 5.2 is repairing the existing V1 plan from Omni's perceptual notes…",
    );
    try {
      const started =
        performance.now();
      const payload =
        await requestPlan(
          "repair",
          v1Plan,
          v1Critique,
        );
      await applyPlan(
        "v2",
        payload,
      );
      setTiming(
        (current) => ({
          ...current,
          v2_glm_ms:
            payload.timing
              ?.glm_initial_ms,
          v2_glm_first_event_ms:
            payload.timing
              ?.glm_initial_first_event_ms,
          v2_glm_first_token_ms:
            payload.timing
              ?.glm_initial_first_token_ms,
          v2_glm_response_chars:
            payload.timing
              ?.glm_initial_response_chars,
          v2_contract_repair_ms:
            payload.timing
              ?.contract_repair_ms,
          v2_ready_ms:
            performance.now() -
            started,
        }),
      );
      setStatus(
        "V2 is ready. Compare V1/V2 visually, then run the optional final Omni check.",
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : String(caught),
      );
      setStatus(
        "V2 repair failed.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function critiqueV2() {
    if (
      busy ||
      !v2Plan
    ) {
      return;
    }
    setBusy("omni_v2");
    setError(null);
    setStatus(
      "Recording V2 for the optional final Omni check…",
    );
    try {
      const blob =
        await captureCurrentPreviewAsMp4(
          "v2",
        );
      setStatus(
        "V2 captured. Omni is judging the repaired film…",
      );
      const payload =
        await requestCritique(
          blob,
          "v2",
          v2Plan.duration_s,
        );
      setV2Critique(
        payload.critique!,
      );
      setV2CritiqueRaw(
        payload.raw_content ??
          "",
      );
      setStatus(
        "Final V2 Omni check is ready.",
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : String(caught),
      );
      setStatus(
        "Final Omni check failed.",
      );
    } finally {
      setBusy(null);
      setActiveVersion("v2");
    }
  }

  async function runClosedLoop() {
    if (
      busy ||
      resolvedCount <
        FREEFORM_CAST.length
    ) {
      return;
    }
    setBusy("loop");
    setError(null);
    setV1Critique(null);
    setV2Critique(null);
    setV2Plan(null);
    setV2Validation(null);
    setV2Raw("");
    setV2ContractRepair("");
    setTiming({});
    const loopStarted =
      performance.now();

    try {
      setStatus(
        "1/4 · GLM 5.2 is directing V1 from scratch…",
      );
      const v1Payload =
        await requestPlan(
          "generate",
        );
      const v1 =
        await applyPlan(
          "v1",
          v1Payload,
        );
      const v1ReadyAt =
        performance.now();
      setTiming({
        v1_glm_ms:
          v1Payload.timing
            ?.glm_initial_ms,
        v1_glm_first_event_ms:
          v1Payload.timing
            ?.glm_initial_first_event_ms,
        v1_glm_first_token_ms:
          v1Payload.timing
            ?.glm_initial_first_token_ms,
        v1_glm_response_chars:
          v1Payload.timing
            ?.glm_initial_response_chars,
        v1_contract_repair_ms:
          v1Payload.timing
            ?.contract_repair_ms,
        v1_ready_ms:
          v1ReadyAt -
          loopStarted,
      });

      setStatus(
        "2/4 · V1 ready for a viewer. Recording its real-time evaluation MP4…",
      );
      const blob =
        await captureCurrentPreviewAsMp4(
          "v1",
          v1,
        );

      setStatus(
        "3/4 · Omni is reviewing V1 with no Golden reference…",
      );
      const critiquePayload =
        await requestCritique(
          blob,
          "v1",
          v1.duration_s,
        );
      const critique =
        critiquePayload
          .critique!;
      setV1Critique(
        critique,
      );
      setV1CritiqueRaw(
        critiquePayload
          .raw_content ??
          "",
      );

      setStatus(
        "4/4 · GLM 5.2 is patching the V1 plan from Omni's highest-impact notes…",
      );
      const v2Payload =
        await requestPlan(
          "repair",
          v1,
          critique,
        );
      await applyPlan(
        "v2",
        v2Payload,
      );

      setTiming(
        (current) => ({
          ...current,
          v2_glm_ms:
            v2Payload.timing
              ?.glm_initial_ms,
          v2_glm_first_event_ms:
            v2Payload.timing
              ?.glm_initial_first_event_ms,
          v2_glm_first_token_ms:
            v2Payload.timing
              ?.glm_initial_first_token_ms,
          v2_glm_response_chars:
            v2Payload.timing
              ?.glm_initial_response_chars,
          v2_contract_repair_ms:
            v2Payload.timing
              ?.contract_repair_ms,
          v2_ready_ms:
            performance.now() -
            v1ReadyAt,
          total_loop_ms:
            performance.now() -
            loopStarted,
        }),
      );

      setStatus(
        "Closed loop complete: V1 → real-time capture → Omni → GLM repair → V2. Watch V1 and V2 before trusting the models' own scores.",
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : String(caught),
      );
      setStatus(
        "Closed-loop run stopped at the failed stage. Any completed V1/critique evidence has been preserved on this page.",
      );
    } finally {
      setBusy(null);
      setIsPlaying(false);
      setInspectMode(false);
    }
  }

  const validation =
    activeVersion === "v2"
      ? v2Validation ??
        v1Validation
      : v1Validation;

  const currentCritique =
    activeVersion === "v2"
      ? v2Critique ??
        v1Critique
      : v1Critique;

  return (
    <main style={pageStyle}>
      <div style={shellStyle}>
        <header style={headerStyle}>
          <div>
            <a
              href="/sandbox/probe-lab/cinematic-production"
              style={backLinkStyle}
            >
              ← Lunch Golden benchmark
            </a>
            <span style={eyebrowStyle}>
              MyWay · Cinematic Production · CP.2B.2
            </span>
            <h1 style={titleStyle}>
              Freeform Closed-Loop Production Test
            </h1>
            <p style={subtitleStyle}>
              No Golden video and no Lunch choreography template. GLM invents V1;
              MyWay supplies deterministic geometry/contact/clearance/camera safety;
              Omni watches the actual render; GLM patches the same plan into V2.
            </p>
          </div>
          <div style={principleStyle}>
            <strong>
              Creative freedom, deterministic laws.
            </strong>
            <span>
              This test is intentionally measuring both visual improvement and wall-clock latency.
            </span>
          </div>
        </header>

        <section style={cardStyle}>
          <div style={sectionHeaderStyle}>
            <div>
              <span style={eyebrowStyle}>
                Creative request
              </span>
              <h2 style={sectionTitleStyle}>
                What should GLM direct from scratch?
              </h2>
            </div>
            <span style={pillStyle}>
              no Golden context
            </span>
          </div>
          <textarea
            value={instruction}
            onChange={(event) =>
              setInstruction(
                event.target.value,
              )
            }
            disabled={Boolean(busy)}
            style={textareaStyle}
          />

          <div style={buttonRowStyle}>
            <button
              type="button"
              disabled={
                Boolean(busy) ||
                resolvedCount <
                  FREEFORM_CAST.length
              }
              onClick={() =>
                void runClosedLoop()
              }
              style={primaryButtonStyle}
            >
              {busy === "loop"
                ? "Running closed loop…"
                : "Run V1 → Omni → V2"}
            </button>
            <button
              type="button"
              disabled={
                Boolean(busy) ||
                resolvedCount <
                  FREEFORM_CAST.length
              }
              onClick={() =>
                void generateV1()
              }
              style={secondaryButtonStyle}
            >
              Generate V1 only
            </button>
            <span style={mutedStyle}>
              {resolvedCount}/
              {FREEFORM_CAST.length} approved cast assets resolved
            </span>
          </div>

          {assetError ? (
            <div style={errorStyle}>
              {assetError}
            </div>
          ) : null}
          <details style={detailsStyle}>
            <summary style={summaryStyle}>
              Cast bindings
            </summary>
            <div style={castGridStyle}>
              {FREEFORM_CAST.map(
                (spec) => (
                  <label
                    key={
                      spec.role
                    }
                    style={castRowStyle}
                  >
                    <span>
                      {spec.label}
                    </span>
                    <select
                      value={
                        castSelections[
                          spec.role
                        ] ?? ""
                      }
                      disabled={
                        Boolean(busy) ||
                        loadingAssets
                      }
                      onChange={(
                        event,
                      ) =>
                        setCastSelections(
                          (
                            current,
                          ) => ({
                            ...current,
                            [spec.role]:
                              event
                                .target
                                .value,
                          }),
                        )
                      }
                      style={selectStyle}
                    >
                      <option value="">
                        Choose approved asset
                      </option>
                      {assets.map(
                        (asset) => (
                          <option
                            key={
                              asset.asset_id
                            }
                            value={
                              asset.asset_id
                            }
                          >
                            {assetLabel(
                              asset,
                            )}
                          </option>
                        ),
                      )}
                    </select>
                  </label>
                ),
              )}
            </div>
          </details>
        </section>

        <section style={statusCardStyle}>
          <strong>{status}</strong>
          <span style={mutedStyle}>
            GLM: {glmModel ?? "not called"} · Omni: {omniModel ?? "not called"}
          </span>
          {error ? (
            <div style={errorStyle}>
              {error}
            </div>
          ) : null}
        </section>

        <section style={cardStyle}>
          <div style={sectionHeaderStyle}>
            <div>
              <span style={eyebrowStyle}>
                Actual render
              </span>
              <h2 style={sectionTitleStyle}>
                {activeVersion.toUpperCase()} preview
              </h2>
            </div>
            <div style={segmentedStyle}>
              <button
                type="button"
                disabled={!v1Plan || isCapturing}
                onClick={() =>
                  setActiveVersion(
                    "v1",
                  )
                }
                style={segmentButtonStyle(
                  activeVersion ===
                    "v1",
                )}
              >
                V1
              </button>
              <button
                type="button"
                disabled={!v2Plan || isCapturing}
                onClick={() =>
                  setActiveVersion(
                    "v2",
                  )
                }
                style={segmentButtonStyle(
                  activeVersion ===
                    "v2",
                )}
              >
                V2
              </button>
            </div>
          </div>

          {activePlan &&
          runtimeSampler ? (
            <div
              data-freeform-cinematic-capture-root="true"
            >
              <CinematicProductionRuntimeCanvas
                selectedAssets={
                  selectedAssets
                }
                isPlaying={
                  isPlaying
                }
                captureMode={
                  isCapturing
                }
                seekRequest={
                  seekRequest
                }
                inspectMode={
                  inspectMode
                }
                onPlaybackTime={
                  handleRuntimeTime
                }
                onPlaybackEnded={
                  handleRuntimeEnded
                }
                runtimeSampler={
                  runtimeSampler
                }
                durationS={
                  activeDurationS
                }
                runtimeRevision={
                  runtimeRevision
                }
              />
            </div>
          ) : (
            <div style={emptyViewerStyle}>
              Generate V1 to render the first freeform film.
            </div>
          )}

          <div style={buttonRowStyle}>
            <button
              type="button"
              disabled={
                !activePlan ||
                Boolean(busy)
              }
              onClick={() => {
                if (
                  !isPlaying &&
                  playbackTimeS >=
                    activeDurationS -
                      0.001
                ) {
                  requestSeek(0);
                }
                setInspectMode(
                  false,
                );
                setIsPlaying(
                  (value) =>
                    !value,
                );
              }}
              style={primaryButtonStyle}
            >
              {isPlaying
                ? "Pause"
                : "Play"}
            </button>
            <button
              type="button"
              disabled={
                !activePlan ||
                Boolean(busy)
              }
              onClick={() => {
                setIsPlaying(
                  false,
                );
                setInspectMode(
                  false,
                );
                requestSeek(0);
              }}
              style={secondaryButtonStyle}
            >
              Reset
            </button>
            <button
              type="button"
              disabled={
                !activePlan ||
                Boolean(busy)
              }
              onClick={() => {
                setIsPlaying(
                  false,
                );
                setInspectMode(
                  (value) =>
                    !value,
                );
              }}
              style={secondaryButtonStyle}
            >
              {inspectMode
                ? "Exit inspect"
                : "Inspect scene"}
            </button>
            <span style={mutedStyle}>
              {playbackTimeS.toFixed(1)} / {activeDurationS.toFixed(1)} s
            </span>
          </div>

          <input
            aria-label="Freeform cinematic timeline"
            type="range"
            min={0}
            max={activeDurationS}
            step={0.01}
            value={Math.min(
              playbackTimeS,
              activeDurationS,
            )}
            disabled={!activePlan || isCapturing}
            onChange={(event) => {
              setIsPlaying(false);
              setInspectMode(false);
              requestSeek(
                Number(
                  event.target.value,
                ),
              );
            }}
            style={{ width: "100%" }}
          />

          <div style={buttonRowStyle}>
            <button
              type="button"
              disabled={
                Boolean(busy) ||
                !v1Plan
              }
              onClick={() =>
                void critiqueV1()
              }
              style={secondaryButtonStyle}
            >
              Ask Omni about V1
            </button>
            <button
              type="button"
              disabled={
                Boolean(busy) ||
                !v1Plan ||
                !v1Critique
              }
              onClick={() =>
                void generateV2()
              }
              style={secondaryButtonStyle}
            >
              Generate V2 from Omni notes
            </button>
            <button
              type="button"
              disabled={
                Boolean(busy) ||
                !v2Plan
              }
              onClick={() =>
                void critiqueV2()
              }
              style={secondaryButtonStyle}
            >
              Optional final Omni check
            </button>
          </div>

          {validation ? (
            <div style={validationStyle}>
              <strong>
                Deterministic freeform validation:{" "}
                {validation.ok
                  ? "pass"
                  : "blocked"}
              </strong>
              <span>
                {validation.errors.length} error(s) · {validation.warnings.length} warning(s)
              </span>
              {validation.warnings.length ? (
                <ul style={{ margin: 0, paddingLeft: 20 }}>
                  {validation.warnings
                    .slice(0, 6)
                    .map((warning) => (
                      <li key={warning}>
                        {warning}
                      </li>
                    ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </section>

        <section style={cardStyle}>
          <div style={sectionHeaderStyle}>
            <div>
              <span style={eyebrowStyle}>
                Latency
              </span>
              <h2 style={sectionTitleStyle}>
                What did the loop actually cost?
              </h2>
            </div>
            <span style={pillStyle}>
              real wall clock
            </span>
          </div>

          <div style={timingGridStyle}>
            <TimingStat
              label="V1 first provider event"
              value={timing.v1_glm_first_event_ms ?? undefined}
            />
            <TimingStat
              label="V1 first content token"
              value={timing.v1_glm_first_token_ms ?? undefined}
            />
            <TimingStat
              label="V1 GLM complete"
              value={timing.v1_glm_ms}
            />
            <TimingStat
              label="V1 contract repair"
              value={timing.v1_contract_repair_ms}
            />
            <TimingStat
              label="Time to V1 ready"
              value={timing.v1_ready_ms}
            />
            <TimingStat
              label="V1 capture"
              value={timing.v1_capture_ms}
            />
            <TimingStat
              label="Omni V1"
              value={timing.omni_v1_ms}
            />
            <TimingStat
              label="V2 first content token"
              value={timing.v2_glm_first_token_ms ?? undefined}
            />
            <TimingStat
              label="V2 GLM complete"
              value={timing.v2_glm_ms}
            />
            <TimingStat
              label="Time from V1 to V2"
              value={timing.v2_ready_ms}
            />
            <TimingStat
              label="Full V1→Omni→V2"
              value={timing.total_loop_ms}
            />
          </div>
          <p style={mutedStyle}>
            GLM now streams provider output so first-event, first-content-token, and completion times are separated. The evaluation MP4 is still intentionally recorded in real time so this experiment exposes the actual latency tax.
          </p>
        </section>

        <section style={cardStyle}>
          <div style={sectionHeaderStyle}>
            <div>
              <span style={eyebrowStyle}>
                Perceptual feedback
              </span>
              <h2 style={sectionTitleStyle}>
                {activeVersion === "v2" && v2Critique
                  ? "V2 final check"
                  : activeVersion === "v2"
                    ? "V1 Omni notes used for V2"
                    : "V1 Omni notes"}
              </h2>
            </div>
          </div>

          {currentCritique ? (
            <div style={critiqueGridStyle}>
              <article style={{ ...critiqueCardStyle, gridColumn: "1 / -1" }}>
                <strong>
                  Summary
                </strong>
                <p>
                  {currentCritique.summary}
                </p>
              </article>

              <article style={critiqueCardStyle}>
                <strong>
                  Preserve
                </strong>
                {currentCritique.preserve.length ? (
                  <ol style={listStyle}>
                    {currentCritique.preserve.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ol>
                ) : (
                  <p style={mutedStyle}>
                    No explicit preserve notes returned.
                  </p>
                )}
              </article>

              <article style={{ ...critiqueCardStyle, gridColumn: "1 / -1" }}>
                <strong>
                  Highest-impact problems
                </strong>
                <ol style={listStyle}>
                  {currentCritique.problems.map((problem, index) => (
                    <li key={`${index}:${problem.time}:${problem.problem}`}>
                      <b>#{index + 1} · {problem.time}</b>
                      <div>{problem.problem}</div>
                      <div style={mutedStyle}>
                        Desired change: {problem.desired_change}
                      </div>
                    </li>
                  ))}
                </ol>
              </article>

              <article style={{ ...critiqueCardStyle, gridColumn: "1 / -1" }}>
                <strong>
                  Top repairs
                </strong>
                <ol style={listStyle}>
                  {currentCritique.top_repairs.map((repair) => (
                    <li key={repair}>{repair}</li>
                  ))}
                </ol>
              </article>
            </div>
          ) : (
            <div style={emptyEvidenceStyle}>
              No Omni critique yet. The V1 critique intentionally sees only the user request + rendered V1, not the Lunch Golden.
            </div>
          )}
        </section>

        <section style={cardStyle}>
          <div style={sectionHeaderStyle}>
            <div>
              <span style={eyebrowStyle}>
                Evidence
              </span>
              <h2 style={sectionTitleStyle}>
                Inspect who changed what
              </h2>
            </div>
          </div>

          <div style={evidenceGridStyle}>
            <details style={detailsStyle}>
              <summary style={summaryStyle}>
                GLM V1 raw response
              </summary>
              <pre style={preStyle}>
                {v1Raw || "Not generated yet."}
              </pre>
            </details>

            <details style={detailsStyle}>
              <summary style={summaryStyle}>
                V1 normalized plan
              </summary>
              <pre style={preStyle}>
                {safeJson(v1Plan)}
              </pre>
            </details>

            <details style={detailsStyle}>
              <summary style={summaryStyle}>
                Omni V1 critique
              </summary>
              <pre style={preStyle}>
                {v1CritiqueRaw ||
                  safeJson(v1Critique)}
              </pre>
            </details>

            <details style={detailsStyle}>
              <summary style={summaryStyle}>
                GLM V2 raw repair response
              </summary>
              <pre style={preStyle}>
                {v2Raw || "Not generated yet."}
              </pre>
            </details>

            <details style={detailsStyle}>
              <summary style={summaryStyle}>
                V2 normalized plan
              </summary>
              <pre style={preStyle}>
                {safeJson(v2Plan)}
              </pre>
            </details>

            <details style={detailsStyle}>
              <summary style={summaryStyle}>
                Optional V2 Omni critique
              </summary>
              <pre style={preStyle}>
                {v2CritiqueRaw ||
                  safeJson(v2Critique)}
              </pre>
            </details>

            {v1ContractRepair ? (
              <details style={detailsStyle}>
                <summary style={summaryStyle}>
                  V1 executable-contract repair
                </summary>
                <pre style={preStyle}>
                  {v1ContractRepair}
                </pre>
              </details>
            ) : null}

            {v2ContractRepair ? (
              <details style={detailsStyle}>
                <summary style={summaryStyle}>
                  V2 executable-contract repair
                </summary>
                <pre style={preStyle}>
                  {v2ContractRepair}
                </pre>
              </details>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}

function TimingStat({
  label,
  value,
}: {
  label: string;
  value:
    | number
    | null
    | undefined;
}) {
  return (
    <div style={timingStatStyle}>
      <span style={mutedStyle}>
        {label}
      </span>
      <strong>
        {formatMs(value)}
      </strong>
    </div>
  );
}

const pageStyle = {
  minHeight: "100vh",
  padding: "28px",
  background:
    "radial-gradient(circle at 10% 0%, rgba(56,189,248,.12), transparent 34%), #050816",
  color: "#e2e8f0",
} as const;

const shellStyle = {
  maxWidth: 1560,
  margin: "0 auto",
  display: "grid",
  gap: 18,
} as const;

const headerStyle = {
  display: "grid",
  gridTemplateColumns:
    "minmax(0,1fr) minmax(280px,420px)",
  gap: 18,
  alignItems: "end",
} as const;

const backLinkStyle = {
  display: "block",
  marginBottom: 14,
  color: "#7dd3fc",
  textDecoration: "none",
} as const;

const eyebrowStyle = {
  display: "block",
  color: "#38bdf8",
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: ".14em",
  textTransform: "uppercase",
} as const;

const titleStyle = {
  margin: "8px 0",
  fontSize:
    "clamp(34px,5vw,64px)",
  lineHeight: 1,
} as const;

const subtitleStyle = {
  margin: 0,
  maxWidth: 980,
  color: "#94a3b8",
  lineHeight: 1.65,
} as const;

const principleStyle = {
  display: "grid",
  gap: 8,
  padding: 18,
  borderRadius: 18,
  background:
    "rgba(15,23,42,.72)",
  border:
    "1px solid rgba(125,211,252,.22)",
  color: "#cbd5e1",
} as const;

const cardStyle = {
  padding: 20,
  borderRadius: 22,
  background:
    "rgba(15,23,42,.76)",
  border:
    "1px solid rgba(148,163,184,.18)",
  boxShadow:
    "0 20px 50px rgba(0,0,0,.22)",
  display: "grid",
  gap: 16,
} as const;

const statusCardStyle = {
  ...cardStyle,
  padding: 16,
} as const;

const sectionHeaderStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent:
    "space-between",
  gap: 14,
  flexWrap: "wrap",
} as const;

const sectionTitleStyle = {
  margin: "5px 0 0",
  fontSize: 22,
} as const;

const textareaStyle = {
  width: "100%",
  minHeight: 190,
  boxSizing: "border-box",
  resize: "vertical",
  borderRadius: 16,
  border:
    "1px solid rgba(148,163,184,.24)",
  background:
    "rgba(2,6,23,.78)",
  color: "#f8fafc",
  padding: 16,
  font: "inherit",
  lineHeight: 1.55,
} as const;

const buttonRowStyle = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  alignItems: "center",
} as const;

const primaryButtonStyle = {
  border: 0,
  borderRadius: 12,
  padding: "11px 16px",
  background: "#0ea5e9",
  color: "#02131c",
  fontWeight: 800,
  cursor: "pointer",
} as const;

const secondaryButtonStyle = {
  border:
    "1px solid rgba(148,163,184,.28)",
  borderRadius: 12,
  padding: "10px 14px",
  background:
    "rgba(30,41,59,.7)",
  color: "#e2e8f0",
  fontWeight: 700,
  cursor: "pointer",
} as const;

const mutedStyle = {
  color: "#94a3b8",
  fontSize: 13,
  lineHeight: 1.5,
} as const;

const pillStyle = {
  borderRadius: 999,
  padding: "6px 10px",
  background:
    "rgba(14,165,233,.12)",
  border:
    "1px solid rgba(56,189,248,.24)",
  color: "#7dd3fc",
  fontSize: 12,
  fontWeight: 800,
} as const;

const errorStyle = {
  padding: 12,
  borderRadius: 12,
  border:
    "1px solid rgba(248,113,113,.3)",
  background:
    "rgba(127,29,29,.2)",
  color: "#fecaca",
  whiteSpace: "pre-wrap",
} as const;

const detailsStyle = {
  border:
    "1px solid rgba(148,163,184,.18)",
  borderRadius: 14,
  background:
    "rgba(2,6,23,.35)",
  overflow: "hidden",
} as const;

const summaryStyle = {
  padding: 12,
  cursor: "pointer",
  fontWeight: 800,
} as const;

const castGridStyle = {
  display: "grid",
  gap: 10,
  padding: 12,
} as const;

const castRowStyle = {
  display: "grid",
  gridTemplateColumns:
    "160px minmax(0,1fr)",
  gap: 12,
  alignItems: "center",
} as const;

const selectStyle = {
  minWidth: 0,
  borderRadius: 10,
  border:
    "1px solid rgba(148,163,184,.24)",
  padding: "9px 10px",
  background: "#0f172a",
  color: "#e2e8f0",
} as const;

const segmentedStyle = {
  display: "flex",
  gap: 5,
  padding: 4,
  borderRadius: 12,
  background:
    "rgba(2,6,23,.72)",
} as const;

function segmentButtonStyle(
  active: boolean,
) {
  return {
    border: 0,
    borderRadius: 9,
    padding: "8px 14px",
    background: active
      ? "#e2e8f0"
      : "transparent",
    color: active
      ? "#020617"
      : "#94a3b8",
    fontWeight: 800,
    cursor: "pointer",
  } as const;
}

const emptyViewerStyle = {
  minHeight: 560,
  borderRadius: 22,
  border:
    "1px dashed rgba(148,163,184,.3)",
  display: "grid",
  placeItems: "center",
  color: "#64748b",
  background:
    "rgba(2,6,23,.46)",
} as const;

const validationStyle = {
  display: "grid",
  gap: 8,
  padding: 12,
  borderRadius: 14,
  background:
    "rgba(2,6,23,.45)",
  color: "#cbd5e1",
  fontSize: 13,
} as const;

const timingGridStyle = {
  display: "grid",
  gridTemplateColumns:
    "repeat(auto-fit,minmax(160px,1fr))",
  gap: 10,
} as const;

const timingStatStyle = {
  display: "grid",
  gap: 5,
  padding: 13,
  borderRadius: 14,
  background:
    "rgba(2,6,23,.5)",
  border:
    "1px solid rgba(148,163,184,.15)",
} as const;

const critiqueGridStyle = {
  display: "grid",
  gridTemplateColumns:
    "repeat(2,minmax(0,1fr))",
  gap: 12,
} as const;

const critiqueCardStyle = {
  padding: 14,
  borderRadius: 14,
  background:
    "rgba(2,6,23,.5)",
  border:
    "1px solid rgba(148,163,184,.15)",
  lineHeight: 1.55,
} as const;

const listStyle = {
  margin: "10px 0 0",
  paddingLeft: 22,
  display: "grid",
  gap: 10,
} as const;

const emptyEvidenceStyle = {
  padding: 18,
  borderRadius: 14,
  background:
    "rgba(2,6,23,.5)",
  color: "#94a3b8",
} as const;

const evidenceGridStyle = {
  display: "grid",
  gridTemplateColumns:
    "repeat(2,minmax(0,1fr))",
  gap: 12,
} as const;

const preStyle = {
  margin: 0,
  maxHeight: 520,
  overflow: "auto",
  padding: 14,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  fontSize: 12,
  lineHeight: 1.5,
  background:
    "rgba(2,6,23,.72)",
  color: "#cbd5e1",
} as const;
