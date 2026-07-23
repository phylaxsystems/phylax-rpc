import { describe, expect, it } from 'vitest';
import { asChainId } from '../src/brands';
import { toHexChainId, toHexQuantity } from '../src/hex';

describe('toHexQuantity', () => {
  it('coerces a bigint', () => {
    expect(toHexQuantity(1000000000000000000n)).toBe('0xde0b6b3a7640000');
  });

  it('coerces an integer number', () => {
    expect(toHexQuantity(255)).toBe('0xff');
  });

  it('coerces a decimal string', () => {
    expect(toHexQuantity('255')).toBe('0xff');
  });

  it('canonicalizes a hex string (lowercases prefix, strips leading zeros)', () => {
    expect(toHexQuantity('0X00FF')).toBe('0xff');
  });

  it('coerces an ethers BigNumber via toHexString()', () => {
    const bn = { toHexString: () => '0x01' };
    expect(toHexQuantity(bn)).toBe('0x1');
  });

  it('encodes zero as 0x0', () => {
    expect(toHexQuantity(0)).toBe('0x0');
    expect(toHexQuantity(0n)).toBe('0x0');
    expect(toHexQuantity('0')).toBe('0x0');
  });

  it('rejects a non-integer number', () => {
    expect(() => toHexQuantity(1.5)).toThrow(/integer/);
  });

  it('rejects an empty string', () => {
    expect(() => toHexQuantity('   ')).toThrow();
  });

  it('rejects negative values instead of producing "0x-1"', () => {
    expect(() => toHexQuantity(-1)).toThrow(/non-negative/);
    expect(() => toHexQuantity(-1n)).toThrow(/non-negative/);
    expect(() => toHexQuantity('-5')).toThrow(/non-negative/);
  });

  it('rejects NaN and unsafe-magnitude numbers', () => {
    expect(() => toHexQuantity(Number.NaN)).toThrow();
    expect(() => toHexQuantity(2 ** 53)).toThrow(/safe-integer/);
  });
});

describe('toHexChainId', () => {
  it('encodes mainnet', () => {
    expect(toHexChainId(asChainId(1))).toBe('0x1');
  });
});
