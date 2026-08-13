import type { MotionProgramEasing } from "./motion-program-contract";

export function clampMotionProgress(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

/** Mirrors the existing Director runtime easing semantics for dual-run parity. */
export function sampleMotionEasing(
  value: number,
  easing: MotionProgramEasing = "ease_in_out",
) {
  const t = clampMotionProgress(value);
  if (easing === "linear") return t;
  if (easing === "ease_in") return t * t;
  if (easing === "ease_out") return 1 - (1 - t) * (1 - t);
  if (easing === "step") return t >= 1 ? 1 : 0;
  if (easing === "spring") {
    const damped =
      1 - Math.exp(-6 * t) * Math.cos(t * Math.PI * 4.5);
    return Math.max(0, Math.min(1.08, damped));
  }
  return t * t * (3 - 2 * t);
}
