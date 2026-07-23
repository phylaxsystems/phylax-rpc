import { describe, expect, it } from 'vitest';
import {
  asHex,
  asHexQuantity,
  isHex,
  isUuid,
  isWalletRdns,
  toHex,
} from '../src/brands';

describe('hex brands', () => {
  it('accepts only whole-byte hex data', () => {
    expect(isHex('0x')).toBe(true);
    expect(isHex('0x00ff')).toBe(true);
    expect(isHex('0x0')).toBe(false);
    expect(toHex('0x123')).toBeUndefined();
    expect(() => asHex('0x123')).toThrow(/whole-byte hex/);
  });

  it('validates canonical JSON-RPC quantities before branding', () => {
    expect(asHexQuantity('0x0')).toBe('0x0');
    expect(asHexQuantity('0xabc')).toBe('0xabc');
    expect(asHexQuantity('0xABC')).toBe('0xABC');
    expect(() => asHexQuantity('0XABC')).toThrow(/canonical hex quantity/);
    expect(() => asHexQuantity('0x00')).toThrow(/canonical hex quantity/);
    expect(() => asHexQuantity('10')).toThrow(/canonical hex quantity/);
  });
});

describe('EIP-6963 brands', () => {
  it('accepts RFC 4122 version 4 UUIDs only', () => {
    expect(isUuid('00000000-0000-4000-8000-000000000001')).toBe(true);
    expect(isUuid('00000000-0000-1000-8000-000000000001')).toBe(false);
    expect(isUuid('uuid-wallet')).toBe(false);
  });

  it('accepts reverse-DNS identifiers only', () => {
    expect(isWalletRdns('io.metamask')).toBe(true);
    expect(isWalletRdns('com.example.wallet')).toBe(true);
    expect(isWalletRdns('wallet')).toBe(false);
    expect(isWalletRdns('com..wallet')).toBe(false);
    expect(isWalletRdns('com._wallet')).toBe(false);
  });
});
