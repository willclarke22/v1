export type DirectorQualificationRenderGeometryInput = {
  dimensions_m?: readonly number[] | null;
  target_extent_m?: number | null;
  scale_bounds?: readonly [number, number] | null;
};

function finitePositive(value: unknown, fallback: number) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

function sourceDimensions(input: DirectorQualificationRenderGeometryInput) {
  if (!input.dimensions_m) return [1, 1, 1] as [number, number, number];
  return [0, 1, 2].map((index) => {
    const value = Math.abs(Number(input.dimensions_m?.[index]));
    return Number.isFinite(value) ? Math.max(0.001, value) : 0.001;
  }) as [number, number, number];
}

/**
 * Canonical scale used by Qualification Room visible GLBs, runtime actor bounds,
 * and measured physical-region casting. All three must reason about the same
 * world-space object.
 */
export function directorQualificationEffectiveRenderScale(
  input: DirectorQualificationRenderGeometryInput,
) {
  const dimensions = sourceDimensions(input);
  const largestDimension = Math.max(0.001, ...dimensions);
  const targetExtent = finitePositive(input.target_extent_m, 1.6);
  const minimumScale = finitePositive(input.scale_bounds?.[0], 0.08);
  const maximumScale = Math.max(
    minimumScale,
    finitePositive(input.scale_bounds?.[1], 6),
  );
  return Math.min(
    maximumScale,
    Math.max(minimumScale, targetExtent / largestDimension),
  );
}

export function directorQualificationRenderedWorldSize(
  input: DirectorQualificationRenderGeometryInput,
): [number, number, number] {
  const dimensions = sourceDimensions(input);
  const scale = directorQualificationEffectiveRenderScale(input);
  return dimensions.map((value) => Math.max(0.001, value * scale)) as [
    number,
    number,
    number,
  ];
}
