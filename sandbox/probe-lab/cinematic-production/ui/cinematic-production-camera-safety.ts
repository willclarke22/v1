function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

function smootherStep(value: number) {
  const t = clamp01(value);
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/**
 * CP.1E.12 framing participation is continuous from first visibility through
 * full opacity. A newly fading-in actor can no longer jump from "ignored" to
 * "full measured bounds" in one frame.
 */
export function softFramingParticipation(opacity: number) {
  const normalized = clamp01((opacity - 0.005) / 0.72);
  return smootherStep(normalized);
}

/**
 * Deterministic soft guard for the desired post-rail camera distance.
 * There is no binary "cross threshold -> move camera" branch.
 */
export function softProtectedCameraDistance(
  authoredDistance: number,
  requiredDistance: number,
) {
  const authored = Math.max(0.2, authoredDistance);
  const required = Math.max(authored, requiredDistance);
  const excessRatio = Math.max(0, required / authored - 1);
  const softStartRatio = 0.015;
  const softFullRatio = 0.18;
  const protectionWeight = smootherStep(
    clamp01(
      (excessRatio - softStartRatio) /
        Math.max(0.001, softFullRatio - softStartRatio),
    ),
  );
  const fullyProtectedDistance = Math.min(
    required * 1.005,
    authored * 1.2,
  );
  return authored +
    (fullyProtectedDistance - authored) * protectionWeight;
}

/**
 * Playback-only temporal governor for the safety correction *offset*. The
 * authored master rail is never low-pass filtered; only the extra emergency
 * pull-back is eased. A rate cap prevents one-frame dolly pops even if measured
 * bounds change abruptly as an actor enters.
 */
export function advanceSoftCameraSafetyCorrection(
  previousCorrection: number,
  desiredCorrection: number,
  deltaS: number,
) {
  const dt = Math.max(0, Math.min(0.25, deltaS));
  if (dt <= 0) return desiredCorrection;

  const increasing = desiredCorrection > previousCorrection;
  const timeConstantS = increasing ? 0.24 : 0.36;
  const alpha = 1 - Math.exp(-dt / timeConstantS);
  const eased = previousCorrection +
    (desiredCorrection - previousCorrection) * alpha;

  const maxRatePerS = increasing ? 0.95 : 0.72;
  const maxStep = maxRatePerS * dt;
  const step = Math.max(
    -maxStep,
    Math.min(maxStep, eased - previousCorrection),
  );
  return previousCorrection + step;
}
