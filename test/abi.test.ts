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

  it('rejects truncated data whose declared length exceeds the payload', () => {
    const selector = '08c379a0';
    const offset = (32).toString(16).padStart(64, '0');
    const length = (64).toString(16).padStart(64, '0'); // claims 64 bytes…
    const data = 'deadbeef'; // …but supplies only 4
    expect(decodeErrorString('0x' + selector + offset + length + data)).toBeUndefined();
  });

  it('rejects invalid UTF-8 string bytes', () => {
    const selector = '08c379a0';
    const offset = (32).toString(16).padStart(64, '0');
    const length = (2).toString(16).padStart(64, '0');
    const data = 'fffe'.padEnd(64, '0'); // 0xFFFE is not valid UTF-8
    expect(decodeErrorString('0x' + selector + offset + length + data)).toBeUndefined();
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
