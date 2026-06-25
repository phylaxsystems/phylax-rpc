import { describe, expect, it } from 'vitest';
import { extractRevertData, isUserRejection } from '../src/eip1193';
import { encodeErrorString } from './helpers';

describe('extractRevertData', () => {
  const data = encodeErrorString('assertion failed');

  it('finds data on a flat error', () => {
    expect(extractRevertData({ code: 3, data })).toBe(data);
  });

  it('finds data nested under data.originalError (MetaMask shape)', () => {
    expect(extractRevertData({ data: { originalError: { data } } })).toBe(data);
  });

  it('finds data under info.error (ethers v6 shape)', () => {
    expect(extractRevertData({ info: { error: { code: 3, data } } })).toBe(data);
  });

  it('finds data embedded in a message string', () => {
    expect(
      extractRevertData({ message: `execution reverted, data: ${data}` }),
    ).toBe(data);
  });

  it('prefers the Error(string) blob over an address-shaped hex', () => {
    const addr = '0x' + '11'.repeat(20);
    expect(extractRevertData({ from: addr, data })).toBe(data);
  });

  it('returns undefined when there is no hex anywhere', () => {
    expect(extractRevertData(new Error('network timeout'))).toBeUndefined();
    expect(extractRevertData(null)).toBeUndefined();
  });

  it('does not loop on circular references', () => {
    const obj: Record<string, unknown> = { data };
    obj.self = obj;
    expect(extractRevertData(obj)).toBe(data);
  });
});

describe('isUserRejection', () => {
  it('matches EIP-1193 code 4001', () => {
    expect(isUserRejection({ code: 4001 })).toBe(true);
  });

  it('matches ACTION_REJECTED and message text', () => {
    expect(isUserRejection({ code: 'ACTION_REJECTED' })).toBe(true);
    expect(isUserRejection({ message: 'User denied transaction signature' })).toBe(true);
  });

  it('does not match unrelated errors', () => {
    expect(isUserRejection({ code: -32603 })).toBe(false);
    expect(isUserRejection(new Error('boom'))).toBe(false);
  });
});
