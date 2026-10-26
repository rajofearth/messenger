/**
 * Pure rules for client-generated image variants.
 *
 * The server never renders a variant; it only checks that a client's claim is
 * plausible before storing it. Keeping these helpers free of Convex imports
 * lets the test suite exercise every rejection without a deployment.
 */

export const MEDIA_VARIANT_NAMES = ["w256", "w512", "w1080"] as const;
export type MediaVariantName = (typeof MEDIA_VARIANT_NAMES)[number];

/**
 * Per-name ceilings keep a hostile "thumbnail" from becoming a full-size
 * upload. They are also the maximum a variant's storage object may occupy.
 */
const MEDIA_VARIANT_LIMITS: Record<MediaVariantName, number> = {
  w256: 128 * 1024,
  w512: 384 * 1024,
  w1080: 1024 * 1024,
};

export const MAX_MEDIA_VARIANTS = 3;
export const MAX_VARIANT_WIDTH = 2048;
export const MAX_VARIANT_HEIGHT = 8192;

/** A rendered width may drift by a couple of pixels from its name. */
const WIDTH_TOLERANCE = 2;

export type MediaVariantCandidate = {
  storageId: string;
  name: string;
  mimeType: string;
  width: number;
  height: number;
  /** Client-reported size; informational only, never used for the stored row. */
  bytes: number;
};

export type VariantStorageInfo = {
  size: number;
  contentType?: string;
};

export type ValidatedMediaVariant<
  T extends MediaVariantCandidate = MediaVariantCandidate,
> = {
  source: T;
  mimeType: string;
  /** Size from Convex storage, not from the candidate's `bytes` field. */
  size: number;
};

export function isMediaVariantName(value: string): value is MediaVariantName {
  return (MEDIA_VARIANT_NAMES as readonly string[]).includes(value);
}

/** The width encoded in an allowed name, e.g. `w512` to 512. */
export function variantWidthForName(name: string): number | undefined {
  return isMediaVariantName(name) ? Number(name.slice(1)) : undefined;
}

/** The byte ceiling for an allowed name, otherwise undefined. */
export function variantByteLimit(name: string): number | undefined {
  return isMediaVariantName(name) ? MEDIA_VARIANT_LIMITS[name] : undefined;
}

export function normalizeMimeType(value: string): string {
  return value.split(";")[0].trim().toLowerCase();
}

/**
 * Storage's recorded type wins unless it is the generic upload fallback, the
 * same rule the main upload uses.
 */
export function resolveMimeType(claimed: string, stored?: string): string {
  const recorded = normalizeMimeType(stored ?? "");
  return recorded && recorded !== "application/octet-stream"
    ? recorded
    : normalizeMimeType(claimed);
}

export function isAllowedVariantMime(mimeType: string): boolean {
  return mimeType === "image/webp" || mimeType === "image/png";
}

/**
 * Validates every variant as one unit: one bad row rejects the whole batch so
 * the caller can delete all uploads and let the client retry the original.
 *
 * Returns `undefined` for an invalid batch and an empty list only when the
 * input is empty.
 */
export function validateMediaVariants<T extends MediaVariantCandidate>(
  variants: readonly T[],
  mainStorageId: string,
  storage: (storageId: string) => VariantStorageInfo | undefined,
): ValidatedMediaVariant<T>[] | undefined {
  if (variants.length > MAX_MEDIA_VARIANTS) return undefined;
  const names = new Set<string>();
  const storageIds = new Set<string>([mainStorageId]);
  const validated: ValidatedMediaVariant<T>[] = [];

  for (const variant of variants) {
    if (names.has(variant.name) || storageIds.has(variant.storageId)) {
      return undefined;
    }
    const expectedWidth = variantWidthForName(variant.name);
    const byteLimit = variantByteLimit(variant.name);
    if (expectedWidth === undefined || byteLimit === undefined) return undefined;
    if (
      !Number.isFinite(variant.width) ||
      Math.abs(variant.width - expectedWidth) > WIDTH_TOLERANCE ||
      variant.width > MAX_VARIANT_WIDTH
    ) {
      return undefined;
    }
    if (
      !Number.isFinite(variant.height) ||
      variant.height <= 0 ||
      variant.height > MAX_VARIANT_HEIGHT
    ) {
      return undefined;
    }

    const info = storage(variant.storageId);
    if (!info || !Number.isFinite(info.size) || info.size <= 0) return undefined;
    if (info.size > byteLimit) return undefined;
    const mimeType = resolveMimeType(variant.mimeType, info.contentType);
    if (!isAllowedVariantMime(mimeType)) return undefined;

    names.add(variant.name);
    storageIds.add(variant.storageId);
    validated.push({ source: variant, mimeType, size: info.size });
  }

  return validated;
}
