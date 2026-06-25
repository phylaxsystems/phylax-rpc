import { describe, expect, it } from 'vitest';
import { decodeErrorString, isErrorStringRevert } from '../src/abi';
import { encodeErrorString } from './helpers';

describe('decodeErrorString', () => {
  it('round-trips a message', () => {
    expect(decodeErrorString(encodeErrorString('assertion failed'))).toBe(
      'assertion failed',
    );
  });

  it('handles messages that are not 32-byte aligned', () => {
    const msg = 'credible-builder: not in a credible block';
    expect(decodeErrorString(encodeErrorString(msg))).toBe(msg);
  });

  it('handles unicode', () => {
    const msg = 'crédible ✓ phylax';
    expect(decodeErrorString(encodeErrorString(msg))).toBe(msg);
  });

  it('returns undefined for non-Error(string) data', () => {
    // Panic(uint256) selector
    expect(decodeErrorString('0x4e487b710000000000000000000000000000000000000000000000000000000000000001')).toBeUndefined();
  });

  it('returns undefined for malformed/short data', () => {
    expect(decodeErrorString('0x08c379a0')).toBeUndefined();
    expect(decodeErrorString('0x')).toBeUndefined();
  });
});

describe('isErrorStringRevert', () => {
  it('recognises the Error(string) selector regardless of case / 0x prefix', () => {
    expect(isErrorStringRevert(encodeErrorString('x'))).toBe(true);
    expect(isErrorStringRevert('08C379A0deadbeef')).toBe(true);
  });

  it('rejects other selectors', () => {
    expect(isErrorStringRevert('0x4e487b71')).toBe(false);
    expect(isErrorStringRevert('0xdeadbeef')).toBe(false);
  });
});
