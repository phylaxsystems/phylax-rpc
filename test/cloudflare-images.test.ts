import { describe, expect, it } from 'vitest';
import {
  buildCloudflareImageUrl,
  type CloudflareImageOptions,
} from '../src/cloudflare-images';
import type { ManualAddModalProps } from '../src/ManualAddModal.types';

function acceptsModalImageOptions(_options: ManualAddModalProps['imageOptions']): void {}

// A renderable format is accepted.
acceptsModalImageOptions({ format: 'auto' });

// Type-level assertion (no suppression directive): Cloudflare's JSON metadata response
// cannot be rendered by an <img>, so the modal's `format` must exclude 'json'. If 'json'
// ever became assignable, `JsonFormatExcluded` collapses to `never` and this fails to compile.
type ModalImageFormat = NonNullable<ManualAddModalProps['imageOptions']>['format'];
type JsonFormatExcluded = 'json' extends ModalImageFormat ? never : true;
const _jsonFormatExcluded: JsonFormatExcluded = true;
void _jsonFormatExcluded;

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

  it('supports Cloudflare automatic width, quality, and JSON metadata options', () => {
    expect(
      buildCloudflareImageUrl(DELIVERY_URL, { width: 'auto', quality: 'medium-high' }),
    ).toContain('/width=auto,quality=medium-high');
    expect(buildCloudflareImageUrl(DELIVERY_URL, { format: 'json' })).toContain('/format=json');
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
    [{ fit: 'contain,quality=1' }, /fit/],
    [{ quality: 'maximum' }, /quality/],
    [{ format: 'png,width=1' }, /format/],
  ])('rejects invalid runtime enum values', (options, message) => {
    expect(() =>
      buildCloudflareImageUrl(
        DELIVERY_URL,
        options as unknown as CloudflareImageOptions,
      ),
    ).toThrow(message);
  });

  it.each([
    'not a URL',
    'http://imagedelivery.net/account/image/public',
    'https://example.com/account/image/public',
    'https://imagedelivery.net/account/image',
    'https://user:pass@imagedelivery.net/account/image/public',
    'https://imagedelivery.net/account/image/public?width=1',
    'https://imagedelivery.net/account/image/public#fragment',
  ])('rejects invalid delivery URL %s', (url) => {
    expect(() => buildCloudflareImageUrl(url, { width: 600 })).toThrow(/deliveryUrl/);
  });
});
