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

  it('reads the non-enumerable message of a native Error', () => {
    // `Error.message` is non-enumerable, so an Object.values walk alone would miss it.
    expect(extractRevertData(new Error(`execution reverted, data: ${data}`))).toBe(data);
  });

  it('prefers the Error(string) blob over an address-shaped hex', () => {
    const addr = '0x' + '11'.repeat(20);
    expect(extractRevertData({ from: addr, data })).toBe(data);
  });

  it('ignores unrelated hex values outside known error fields', () => {
    expect(
      extractRevertData({
        transactionHash: '0x' + '11'.repeat(32),
        from: '0x' + '22'.repeat(20),
      }),
    ).toBeUndefined();
  });

  it('ignores a transaction hash embedded in a provider message', () => {
    // A network error like `transaction 0x… not found` carries a 32-byte hash in `message`
    // (a walked field). Its byte length is not `4 + 32·n`, so it must not be read as revert
    // data — otherwise a plain network failure is misclassified as a contract revert.
    const hash = '0x' + 'ab'.repeat(32);
    expect(
      extractRevertData(new Error(`transaction ${hash} not found`)),
    ).toBeUndefined();
    expect(extractRevertData({ data: hash })).toBeUndefined();
  });

  it('ignores an address-shaped hex in a walked field', () => {
    expect(extractRevertData({ data: '0x' + '11'.repeat(20) })).toBeUndefined();
  });

  it('accepts ABI-word-aligned payloads (bare selector, Panic)', () => {
    // 4-byte custom-error selector (n = 0) and a Panic(uint256) (selector + one 32-byte word).
    const selector = '0x12345678';
    const panic = '0x4e487b71' + '00'.repeat(31) + '01';
    expect(extractRevertData({ data: selector })).toBe(selector);
    expect(extractRevertData({ data: panic })).toBe(panic);
  });

  it('rejects hex values too short or malformed to be ABI revert data', () => {
    expect(extractRevertData({ data: '0x1' })).toBeUndefined();
    expect(extractRevertData({ data: '0x1234567' })).toBeUndefined();
    expect(extractRevertData({ data: '0x123456789' })).toBeUndefined();
    expect(extractRevertData({ data: '0x12345678zz' })).toBeUndefined();
    expect(extractRevertData({ message: 'data: 0x12345678zz' })).toBeUndefined();
    expect(extractRevertData({ message: `${data}zz` })).toBeUndefined();
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

  it('matches a rejection wrapped under cause/error', () => {
    expect(isUserRejection({ message: 'request failed', cause: { code: 4001 } })).toBe(true);
    expect(isUserRejection({ error: { code: 'ACTION_REJECTED' } })).toBe(true);
  });

  it('does not match unrelated errors', () => {
    expect(isUserRejection({ code: -32603 })).toBe(false);
    expect(isUserRejection(new Error('boom'))).toBe(false);
    // A bare "denied" in a contract revert message must not read as a user rejection.
    expect(isUserRejection({ message: 'transfer denied by contract guard' })).toBe(false);
  });
});
