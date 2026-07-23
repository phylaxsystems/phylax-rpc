import type {
  Address,
  ChainId,
  Hex,
  HexQuantity,
  Milliseconds,
  RpcUrl,
  Uuid,
  WalletRdns,
} from './types';

/**
 * Runtime guards and smart constructors for the branded domain primitives declared in
 * {@link ./types}. This module is the single place a brand is applied: `brand()` performs
 * the one unavoidable widening a nominal type needs, so no other file casts. Every public
 * value that enters the SDK from `unknown` provider/announcement data is validated here
 * before it is trusted downstream.
 */

// The lone brand-application helper. Nominal typing has no runtime representation, so the
// cast here is inherent to the pattern; it is contained to this function by design.
const brand = <B>(value: unknown): B => value as B;

const HEX_RE = /^0x[0-9a-fA-F]*$/;
const HEX_QUANTITY_RE = /^0x(0|[1-9a-f][0-9a-f]*)$/;
const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

/** Whether `value` is `0x`-prefixed hex (even or odd length, empty body allowed). */
export function isHex(value: unknown): value is Hex {
  return typeof value === 'string' && HEX_RE.test(value);
}

/** Assert `value` is `0x`-prefixed hex with an even number of nibbles (whole bytes). */
export function asHex(value: unknown): Hex {
  if (typeof value !== 'string' || !HEX_RE.test(value)) {
    throw new TypeError(`Expected 0x-prefixed hex, got ${String(value)}`);
  }
  if ((value.length - 2) % 2 !== 0) {
    throw new TypeError(`Expected whole-byte hex (even length), got ${value}`);
  }
  return brand<Hex>(value);
}

/**
 * Brand `value` as {@link Hex} when it is `0x`-prefixed hex, else `undefined`. Unlike
 * {@link asHex} this tolerates odd-length blobs, since raw revert `data` pulled off a
 * provider error is not guaranteed to be whole-byte.
 */
export function toHex(value: string): Hex | undefined {
  return HEX_RE.test(value) ? brand<Hex>(value) : undefined;
}

/** Whether `value` is a canonical hex quantity (`0x0`, or no leading zeros). */
export function isHexQuantity(value: unknown): value is HexQuantity {
  return typeof value === 'string' && HEX_QUANTITY_RE.test(value.toLowerCase());
}

/** Brand an already-canonical hex quantity string. */
export function asHexQuantity(value: string): HexQuantity {
  return brand<HexQuantity>(value);
}

/** Whether `value` is a 20-byte `0x` address. */
export function isAddress(value: unknown): value is Address {
  return typeof value === 'string' && ADDRESS_RE.test(value);
}

/** Assert `value` is a 20-byte `0x` address. */
export function asAddress(value: unknown): Address {
  if (!isAddress(value)) {
    throw new TypeError(`Expected a 20-byte 0x address, got ${String(value)}`);
  }
  return brand<Address>(value);
}

/** Whether `value` is a non-negative safe-integer chain id. */
export function isChainId(value: unknown): value is ChainId {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

/** Assert `value` is a non-negative safe-integer chain id. */
export function asChainId(value: unknown): ChainId {
  if (!isChainId(value)) {
    throw new TypeError(`Expected a non-negative safe-integer chainId, got ${String(value)}`);
  }
  return brand<ChainId>(value);
}

/** Assert `value` is an `http(s)` URL string. */
export function asRpcUrl(value: unknown): RpcUrl {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError('rpcUrl is required and must be a non-empty string');
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new TypeError(`rpcUrl is not a valid URL: ${value}`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new TypeError(`rpcUrl must be http(s), got ${url.protocol}`);
  }
  return brand<RpcUrl>(value);
}

/** Whether `value` is a non-empty EIP-6963 `rdns` string. */
export function isWalletRdns(value: unknown): value is WalletRdns {
  return typeof value === 'string' && value.length > 0;
}

/** Brand a validated non-empty `rdns` string, or `undefined` when absent/invalid. */
export function asWalletRdns(value: unknown): WalletRdns | undefined {
  return isWalletRdns(value) ? value : undefined;
}

/** Whether `value` is a non-empty UUID-ish string. */
export function isUuid(value: unknown): value is Uuid {
  return typeof value === 'string' && value.length > 0;
}

/** Assert a non-negative, finite millisecond duration. */
export function asMilliseconds(value: number): Milliseconds {
  if (!Number.isFinite(value) || value < 0) {
    throw new TypeError(`Expected a non-negative duration in ms, got ${value}`);
  }
  return brand<Milliseconds>(value);
}
