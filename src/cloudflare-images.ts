export type CloudflareImageFit =
  | 'scale-down'
  | 'contain'
  | 'cover'
  | 'crop'
  | 'aspect-crop'
  | 'pad'
  | 'squeeze'
  | 'scale-up';

export type CloudflareImageFormat =
  | 'auto'
  | 'avif'
  | 'webp'
  | 'jpeg'
  | 'baseline-jpeg'
  | 'json';

export type CloudflareImageQuality =
  | number
  | 'high'
  | 'medium-high'
  | 'medium-low'
  | 'low';

/** Flexible-variant options supported by the SDK's Cloudflare Images URL builder. */
export interface CloudflareImageOptions {
  /** Output width in pixels, or `auto` for browser-driven responsive sizing. */
  readonly width?: number | 'auto';
  /** Output height in pixels. */
  readonly height?: number;
  /** How the source image fits the requested dimensions. */
  readonly fit?: CloudflareImageFit;
  /** Positive device pixel ratio, up to 2. */
  readonly dpr?: number;
  /** Output quality from 1 through 100, or a Cloudflare quality preset. */
  readonly quality?: CloudflareImageQuality;
  /** Requested output format. `auto` negotiates from the request's `Accept` header. */
  readonly format?: CloudflareImageFormat;
}

const positiveInteger = (name: string, value: number): string => {
  if (!Number.isInteger(value) || value <= 0) {
    throw new TypeError(`${name} must be a positive integer, got ${value}`);
  }
  return String(value);
};

/**
 * Apply flexible-variant transformations to an uploaded Cloudflare Images delivery URL.
 * With no options, the original named-variant URL is returned unchanged.
 */
export function buildCloudflareImageUrl(
  deliveryUrl: string,
  options: CloudflareImageOptions = {},
): string {
  let url: URL;
  try {
    url = new URL(deliveryUrl);
  } catch {
    throw new TypeError(`deliveryUrl must be a valid URL, got ${deliveryUrl}`);
  }

  if (url.protocol !== 'https:' || url.hostname !== 'imagedelivery.net') {
    throw new TypeError('deliveryUrl must be an https://imagedelivery.net URL');
  }

  const segments = url.pathname.split('/').filter(Boolean);
  if (segments.length !== 3) {
    throw new TypeError('deliveryUrl must include an account hash, image ID, and variant');
  }

  const transformations: string[] = [];
  if (options.width !== undefined) {
    transformations.push(`width=${options.width === 'auto' ? 'auto' : positiveInteger('width', options.width)}`);
  }
  if (options.height !== undefined) {
    transformations.push(`height=${positiveInteger('height', options.height)}`);
  }
  if (options.fit !== undefined) transformations.push(`fit=${options.fit}`);
  if (options.dpr !== undefined) {
    if (!Number.isFinite(options.dpr) || options.dpr <= 0 || options.dpr > 2) {
      throw new TypeError(`dpr must be greater than 0 and at most 2, got ${options.dpr}`);
    }
    transformations.push(`dpr=${options.dpr}`);
  }
  if (options.quality !== undefined) {
    if (typeof options.quality === 'number') {
      if (!Number.isInteger(options.quality) || options.quality < 1 || options.quality > 100) {
        throw new TypeError(`quality must be an integer in [1, 100], got ${options.quality}`);
      }
    }
    transformations.push(`quality=${options.quality}`);
  }
  if (options.format !== undefined) transformations.push(`format=${options.format}`);

  if (transformations.length === 0) return deliveryUrl;

  segments[2] = transformations.join(',');
  url.pathname = `/${segments.join('/')}`;
  return url.toString();
}
