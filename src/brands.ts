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
 * {@link ./types}. Each `as*` constructor validates through its `is*` type guard and returns
 * the guard-narrowed value, so branding needs no `as` assertion — the nominal type is applied
 * purely by control-flow narrowing. Every public value that enters the SDK from `unknown`
 * provider/announcement data is validated here before it is trusted downstream.
 */

const HEX_RE = /^0x(?:[0-9a-fA-F]{2})*$/;
const HEX_QUANTITY_RE = /^0x(0|[1-9a-fA-F][0-9a-fA-F]*)$/;
const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RDNS_LABEL_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;

/** Whether `value` is `0x`-prefixed whole-byte hex data. */
export function isHex(value: unknown): value is Hex {
  return typeof value === 'string' && HEX_RE.test(value);
}

/** Assert `value` is `0x`-prefixed whole-byte hex data. */
export function asHex(value: unknown): Hex {
  if (!isHex(value)) {
    throw new TypeError(`Expected 0x-prefixed whole-byte hex, got ${String(value)}`);
  }
  return value;
}

/** Brand `value` as {@link Hex} when it is whole-byte hex, else `undefined`. */
export function toHex(value: string): Hex | undefined {
  return isHex(value) ? value : undefined;
}

/** Whether `value` is a canonical hex quantity (`0x0`, or no leading zeros). */
export function isHexQuantity(value: unknown): value is HexQuantity {
  return typeof value === 'string' && HEX_QUANTITY_RE.test(value);
}

/** Assert and brand a canonical hex quantity string. */
export function asHexQuantity(value: unknown): HexQuantity {
  if (!isHexQuantity(value)) {
    throw new TypeError(`Expected a canonical hex quantity, got ${String(value)}`);
  }
  return value;
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
  return value;
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
  return value;
}

/** Whether `value` is a non-empty `http(s)` URL string. */
export function isRpcUrl(value: unknown): value is RpcUrl {
  if (typeof value !== 'string' || value.length === 0) return false;
  let protocol: string;
  try {
    protocol = new URL(value).protocol;
  } catch {
    return false;
  }
  return protocol === 'http:' || protocol === 'https:';
}

/** Assert `value` is an `http(s)` URL string. */
export function asRpcUrl(value: unknown): RpcUrl {
  if (isRpcUrl(value)) return value;
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError('rpcUrl is required and must be a non-empty string');
  }
  throw new TypeError(`rpcUrl must be a valid http(s) URL, got ${value}`);
}

/** Whether `value` is a valid reverse-DNS identifier. */
export function isWalletRdns(value: unknown): value is WalletRdns {
  if (typeof value !== 'string' || value.length > 253) return false;
  const labels = value.split('.');
  return labels.length >= 2 && labels.every((label) => RDNS_LABEL_RE.test(label));
}

/** Brand a validated reverse-DNS identifier, or `undefined` when absent/invalid. */
export function asWalletRdns(value: unknown): WalletRdns | undefined {
  return isWalletRdns(value) ? value : undefined;
}

/** Whether `value` is an RFC 4122 version 4 UUID, as required by EIP-6963. */
export function isUuid(value: unknown): value is Uuid {
  return typeof value === 'string' && UUID_V4_RE.test(value);
}

/** Whether `value` is a non-negative, finite millisecond duration. */
export function isMilliseconds(value: number): value is Milliseconds {
  return Number.isFinite(value) && value >= 0;
}

/** Assert a non-negative, finite millisecond duration. */
export function asMilliseconds(value: number): Milliseconds {
  if (!isMilliseconds(value)) {
    throw new TypeError(`Expected a non-negative duration in ms, got ${value}`);
  }
  return value;
}
