import { asHexQuantity } from './brands';
import { isObject } from './guards';
import type { ChainId, HexQuantity, Numeric } from './types';

/** Whether `value` duck-types as an ethers `BigNumber` (exposes `toHexString()`). */
function hasToHexString(value: unknown): value is { toHexString(): string } {
  return isObject(value) && typeof value.toHexString === 'function';
}

/** Trim whitespace and ensure a leading `0x`. */
export function normalizeHex(value: string): string {
  const s = value.trim();
  if (s.startsWith('0x') || s.startsWith('0X')) return '0x' + s.slice(2);
  return '0x' + s;
}

/** The 4-byte selector (`0x` + 8 hex chars), lowercased, or `undefined` if too short. */
export function getSelector(data: string): string | undefined {
  const hex = normalizeHex(data).slice(2);
  if (hex.length < 8) return undefined;
  return ('0x' + hex.slice(0, 8)).toLowerCase();
}

/**
 * Decode a hex byte string to a UTF-8 string. Throws on malformed UTF-8 when `fatal` is
 * set, so callers can distinguish genuine text from arbitrary bytes.
 */
export function hexToUtf8(hex: string, fatal = false): string {
  const clean = hex.replace(/^0x/i, '');
  const len = Math.floor(clean.length / 2);
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return new TextDecoder('utf-8', { fatal }).decode(bytes);
}

/** `1` → `"0x1"`. */
export function toHexChainId(chainId: ChainId): HexQuantity {
  return asHexQuantity('0x' + chainId.toString(16));
}

/**
 * Coerce a {@link Numeric} tx field to a canonical hex QUANTITY (`0x`-prefixed, no
 * leading zeros, `"0x0"` for zero).
 *
 * Accepts a `bigint` (viem), an integer `number`, a decimal or `0x` string, or an
 * ethers `BigNumber` (duck-typed via `toHexString()`). Every form is validated to be a
 * non-negative integer — a negative, fractional, `NaN`, or unsafe-magnitude `number`
 * throws rather than silently producing an invalid quantity like `"0x-1"`.
 */
export function toHexQuantity(value: Numeric): HexQuantity {
  const big = toNonNegativeBigInt(value);
  return asHexQuantity('0x' + big.toString(16));
}

/** Whether `value` is a {@link Numeric} the tx normalizer can coerce to a hex quantity. */
export function isNumeric(value: unknown): value is Numeric {
  return (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'bigint' ||
    hasToHexString(value)
  );
}

function toNonNegativeBigInt(value: Numeric): bigint {
  let big: bigint;
  if (typeof value === 'bigint') {
    big = value;
  } else if (typeof value === 'number') {
    if (!Number.isInteger(value)) {
      throw new TypeError(`toHexQuantity: expected an integer, got ${value}`);
    }
    if (!Number.isSafeInteger(value)) {
      throw new TypeError(
        `toHexQuantity: ${value} exceeds the safe-integer range — pass a bigint`,
      );
    }
    big = BigInt(value);
  } else if (typeof value === 'string') {
    const s = value.trim().replace(/^0X/, '0x');
    if (s.length === 0) throw new TypeError('toHexQuantity: empty string');
    big = BigInt(s);
  } else if (hasToHexString(value)) {
    big = BigInt(value.toHexString());
  } else {
    throw new TypeError(`toHexQuantity: unsupported value ${String(value)}`);
  }
  if (big < 0n) {
    throw new TypeError(`toHexQuantity: expected a non-negative value, got ${big}`);
  }
  return big;
}
