/** Anatomy Director V1: a bounded, data-only model execution contract. */
export type Vec3 = [number, number, number];
export type DirectorAsset = {
  asset_id: string;
  member_id: string;
  label: string;
  display_name: string;
  system: string;
  dimensions_m: Vec3 | null;
  runtime_transform: { position: Vec3; rotation: Vec3; scale: Vec3 };
  model_url: string;
};
export type CameraKeyframe = { t: number; position: Vec3; target: Vec3 };
export type ObjectKeyframe = {
  t: number;
  position: Vec3;
  rotation_deg: Vec3;
  scale: number;
  opacity: number;
};
export type AnatomyDirectorProgram = {
  schema_version: "myway_anatomy_director_v1";
  duration_s: number;
  camera_keyframes: CameraKeyframe[];
  object_keyframes: ObjectKeyframe[];
};

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const vec3 = (value: unknown): value is Vec3 =>
  Array.isArray(value) && value.length === 3 && value.every(finite);
const length3 = (v: Vec3) => Math.hypot(v[0], v[1], v[2]);
const bounded = (v: Vec3, n: number) => v.every((part) => Math.abs(part) <= n);

/** Reject invalid output; never silently substitute a hard-coded scene. */
export function parseAnatomyDirectorProgram(raw: string): AnatomyDirectorProgram {
  if (raw.length > 80_000) throw new Error("Model output exceeds safe size.");
  const trimmed = raw.trim();
  const candidate = trimmed.startsWith("```")
    ? trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")
    : trimmed;
  let value: unknown;
  try { value = JSON.parse(candidate); }
  catch { throw new Error("GLM output is not a single valid JSON object. Inspect raw output."); }
  if (!record(value) || value.schema_version !== "myway_anatomy_director_v1") {
    throw new Error("Incorrect Anatomy Director schema_version.");
  }
  const duration = value.duration_s;
  if (!finite(duration) || duration < 2 || duration > 30) throw new Error("duration_s must be 2–30 seconds.");
  const safeDuration = duration as number;
  const camera = value.camera_keyframes;
  const object = value.object_keyframes;
  if (!Array.isArray(camera) || camera.length < 2 || camera.length > 16 ||
      !Array.isArray(object) || object.length < 2 || object.length > 16) {
    throw new Error("Camera and object tracks require 2–16 keyframes each.");
  }
  function validateTimes(track: unknown[], label: string) {
    let previous = -1;
    for (const item of track) {
      if (!record(item) || !finite(item.t) || item.t <= previous || item.t > safeDuration) {
        throw new Error(`${label} keyframe time must be strictly increasing and within duration.`);
      }
      previous = item.t;
    }
    if ((track[0] as { t: number }).t !== 0 || Math.abs(previous - safeDuration) > 0.001) {
      throw new Error(`${label} must start at 0 and end at duration_s.`);
    }
  }
  validateTimes(camera, "Camera");
  validateTimes(object, "Object");
  for (const entry of camera) {
    if (!record(entry) || !vec3(entry.position) || !vec3(entry.target) ||
        !bounded(entry.position, 12) || !bounded(entry.target, 2) ||
        length3([entry.position[0] - entry.target[0], entry.position[1] - entry.target[1], entry.position[2] - entry.target[2]]) < 0.8) {
      throw new Error("Camera frames need finite, bounded positions and targets separated by at least 0.8 units.");
    }
  }
  for (const entry of object) {
    if (!record(entry) || !vec3(entry.position) || !vec3(entry.rotation_deg) ||
        !bounded(entry.position, 2) || !bounded(entry.rotation_deg, 1080) ||
        !finite(entry.scale) || entry.scale < 0.35 || entry.scale > 2 ||
        !finite(entry.opacity) || entry.opacity < 0.15 || entry.opacity > 1) {
      throw new Error("Object frames require bounded position, rotation_deg, scale, and opacity.");
    }
  }
  return value as AnatomyDirectorProgram;
}

export function sampleKeyframes<T extends {t: number}>(
  frames: T[], t: number, blend: (a: T, b: T, alpha: number) => T,
): T {
  if (t <= 0) return frames[0]!;
  if (t >= frames[frames.length - 1]!.t) return frames[frames.length - 1]!;
  for (let i = 1; i < frames.length; i++) {
    const a = frames[i - 1]!;
    const b = frames[i]!;
    if (t <= b.t) {
      const x = (t - a.t) / (b.t - a.t);
      return blend(a, b, x * x * (3 - 2 * x));
    }
  }
  return frames[frames.length - 1]!;
}
export function lerpNumber(a: number, b: number, alpha: number) { return a + (b - a) * alpha; }
export function lerpVec(a: Vec3, b: Vec3, alpha: number): Vec3 {
  return [lerpNumber(a[0], b[0], alpha), lerpNumber(a[1], b[1], alpha), lerpNumber(a[2], b[2], alpha)];
}
