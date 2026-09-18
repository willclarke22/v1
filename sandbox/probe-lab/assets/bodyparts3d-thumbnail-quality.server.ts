import sharp from "sharp";

export type BodyParts3dThumbnailVisualStatus =
  | "healthy"
  | "visual_blank"
  | "visual_too_small"
  | "visual_decode_error";

export type BodyParts3dThumbnailVisualAssessment = {
  status: BodyParts3dThumbnailVisualStatus;
  width: number;
  height: number;
  alpha_threshold: number;
  visible_pixels: number;
  visible_fraction: number;
  bbox_width_fraction: number;
  bbox_height_fraction: number;
  bbox_area_fraction: number;
  max_span_fraction: number;
  reason: string;
};

const ALPHA_THRESHOLD = 16;
const MIN_VISIBLE_PIXELS = 128;
const MIN_MAX_SPAN_FRACTION = 0.22;

function decodeFailure(reason: string): BodyParts3dThumbnailVisualAssessment {
  return {
    status: "visual_decode_error",
    width: 0,
    height: 0,
    alpha_threshold: ALPHA_THRESHOLD,
    visible_pixels: 0,
    visible_fraction: 0,
    bbox_width_fraction: 0,
    bbox_height_fraction: 0,
    bbox_area_fraction: 0,
    max_span_fraction: 0,
    reason,
  };
}

export async function assessBodyParts3dThumbnailPng(
  input: Uint8Array | Buffer,
): Promise<BodyParts3dThumbnailVisualAssessment> {
  try {
    const { data, info } =
      await sharp(Buffer.from(input))
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

    const width = info.width;
    const height = info.height;
    const channels = info.channels;
    if (
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      width <= 0 ||
      height <= 0 ||
      channels < 4
    ) {
      return decodeFailure(
        `Decoded PNG dimensions/channels are invalid (${width}x${height}, channels=${channels}).`,
      );
    }

    let visiblePixels = 0;
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const alpha =
          data[(y * width + x) * channels + 3] ?? 0;
        if (alpha < ALPHA_THRESHOLD) continue;
        visiblePixels += 1;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }

    const totalPixels = width * height;
    if (visiblePixels === 0 || maxX < minX || maxY < minY) {
      return {
        status: "visual_blank",
        width,
        height,
        alpha_threshold: ALPHA_THRESHOLD,
        visible_pixels: 0,
        visible_fraction: 0,
        bbox_width_fraction: 0,
        bbox_height_fraction: 0,
        bbox_area_fraction: 0,
        max_span_fraction: 0,
        reason:
          "PNG decoded successfully but contains no visible non-transparent subject pixels.",
      };
    }

    const bboxWidth = maxX - minX + 1;
    const bboxHeight = maxY - minY + 1;
    const bboxWidthFraction = bboxWidth / width;
    const bboxHeightFraction = bboxHeight / height;
    const bboxAreaFraction =
      (bboxWidth * bboxHeight) / totalPixels;
    const maxSpanFraction =
      Math.max(bboxWidthFraction, bboxHeightFraction);
    const visibleFraction =
      visiblePixels / totalPixels;

    const tooSmall =
      visiblePixels < MIN_VISIBLE_PIXELS ||
      maxSpanFraction < MIN_MAX_SPAN_FRACTION;

    return {
      status: tooSmall ? "visual_too_small" : "healthy",
      width,
      height,
      alpha_threshold: ALPHA_THRESHOLD,
      visible_pixels: visiblePixels,
      visible_fraction: visibleFraction,
      bbox_width_fraction: bboxWidthFraction,
      bbox_height_fraction: bboxHeightFraction,
      bbox_area_fraction: bboxAreaFraction,
      max_span_fraction: maxSpanFraction,
      reason: tooSmall
        ? `Visible subject is too small for a catalog thumbnail (pixels=${visiblePixels}, max-span=${maxSpanFraction.toFixed(4)}).`
        : `Visible subject occupies a usable catalog frame (pixels=${visiblePixels}, max-span=${maxSpanFraction.toFixed(4)}).`,
    };
  } catch (caught) {
    return decodeFailure(
      caught instanceof Error
        ? caught.message
        : String(caught),
    );
  }
}
