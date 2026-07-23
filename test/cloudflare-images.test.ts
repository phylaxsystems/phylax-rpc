import { describe, expect, it } from 'vitest';
import { buildCloudflareImageUrl } from '../src/cloudflare-images';

const DELIVERY_URL =
  'https://imagedelivery.net/d5Lcqs_wQTDRwGl7Qqna0g/303a6ec3-a1d7-4227-5469-5dc8d06a0400/public';

describe('buildCloudflareImageUrl', () => {
  it('keeps the named variant when no transformations are supplied', () => {
    expect(buildCloudflareImageUrl(DELIVERY_URL)).toBe(DELIVERY_URL);
    expect(buildCloudflareImageUrl(DELIVERY_URL, {})).toBe(DELIVERY_URL);
  });

  it('replaces the named variant with ordered flexible transformations', () => {
    expect(
      buildCloudflareImageUrl(DELIVERY_URL, {
        width: 600,
        height: 390,
        fit: 'contain',
        dpr: 2,
        quality: 85,
        format: 'auto',
      }),
    ).toBe(
      'https://imagedelivery.net/d5Lcqs_wQTDRwGl7Qqna0g/303a6ec3-a1d7-4227-5469-5dc8d06a0400/width=600,height=390,fit=contain,dpr=2,quality=85,format=auto',
    );
  });

  it('supports Cloudflare automatic width and quality presets', () => {
    expect(
      buildCloudflareImageUrl(DELIVERY_URL, { width: 'auto', quality: 'medium-high' }),
    ).toContain('/width=auto,quality=medium-high');
  });

  it.each([
    [{ width: 0 }, /width/],
    [{ width: 10.5 }, /width/],
    [{ height: -1 }, /height/],
    [{ dpr: 0 }, /dpr/],
    [{ dpr: 2.1 }, /dpr/],
    [{ quality: 0 }, /quality/],
    [{ quality: 101 }, /quality/],
  ] as const)('rejects invalid transformation values', (options, message) => {
    expect(() => buildCloudflareImageUrl(DELIVERY_URL, options)).toThrow(message);
  });

  it.each([
    'not a URL',
    'http://imagedelivery.net/account/image/public',
    'https://example.com/account/image/public',
    'https://imagedelivery.net/account/image',
  ])('rejects invalid delivery URL %s', (url) => {
    expect(() => buildCloudflareImageUrl(url, { width: 600 })).toThrow(/deliveryUrl/);
  });
});
