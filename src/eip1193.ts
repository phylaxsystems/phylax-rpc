import { isHex } from './brands';
import { ERROR_STRING_SELECTOR } from './constants';
import type { Eip1193Provider, Hex, RpcMethod } from './types';

/**
 * Wrapper over `provider.request` that pins the method to a known {@link RpcMethod} and
 * returns the raw `unknown` reply. Callers narrow the result with a guard rather than
 * trusting a caller-supplied type argument, so no unchecked assertion is needed here.
 */
export function request(
  provider: Eip1193Provider,
  method: RpcMethod,
  params?: unknown[] | Record<string, unknown>,
): Promise<unknown> {
  return provider.request({ method, params });
}

/**
 * Error properties that commonly carry nested provider errors or embedded revert data.
 * Read explicitly because some (notably `message`/`stack` on a native `Error`) are
 * non-enumerable and would be missed by an `Object.values` walk alone.
 */
const KNOWN_ERROR_KEYS = [
  'message',
  'data',
  'cause',
  'error',
  'info',
  'originalError',
  'reason',
  'body',
  'shortMessage',
] as const;

function knownValues(node: object): unknown[] {
  const out: unknown[] = [];
  for (const key of KNOWN_ERROR_KEYS) {
    const value = (node as Record<string, unknown>)[key];
    if (value !== undefined) out.push(value);
  }
  return out;
}

/**
 * Collect `0x`-prefixed hex strings from known provider-error fields.
 *
 * Provider errors nest revert `data` in several common places: `error.data`,
 * `error.data.originalError.data`, `error.info.error.data` (ethers v6), `error.cause`, or
 * a non-enumerable `message` string. Restricting traversal to those fields prevents unrelated
 * transaction hashes, addresses, and chain IDs from being classified as revert data.
 */
export function collectHexStrings(error: unknown): string[] {
  const out: string[] = [];
  const seen = new Set<object>();
  const walk = (node: unknown, depth: number): void => {
    if (node == null || depth > 8) return;
    if (typeof node === 'string') {
      const matches = node.match(/0x[0-9a-fA-F]+(?![0-9A-Za-z])/g);
      if (matches) out.push(...matches);
      return;
    }
    if (typeof node === 'object') {
      if (seen.has(node)) return;
      seen.add(node);
      for (const value of knownValues(node)) walk(value, depth + 1);
    }
  };
  walk(error, 0);
  return out;
}

/**
 * Extract revert `data` from a thrown provider error.
 *
 * Prefers a hex blob carrying the `Error(string)` selector; otherwise returns the longest
 * value shaped like ABI revert data (a 4-byte selector followed by whole bytes).
 */
export function extractRevertData(error: unknown): Hex | undefined {
  const candidates = collectHexStrings(error).filter(
    (value): value is Hex => value.length >= 10 && isHex(value),
  );
  const withSelector = candidates.find((value) =>
    value.toLowerCase().startsWith(ERROR_STRING_SELECTOR),
  );
  if (withSelector) return withSelector;
  return candidates.reduce<Hex | undefined>(
    (longest, value) => (!longest || value.length > longest.length ? value : longest),
    undefined,
  );
}

/** EIP-1193 user-rejection code, and ethers' string alias. */
const USER_REJECTION_CODES: ReadonlySet<unknown> = new Set([4001, 'ACTION_REJECTED']);
// Deliberately narrow: matches explicit rejection phrasing, not a bare "denied" that a
// contract revert message could also contain.
const USER_REJECTION_TEXT =
  /user rejected|user denied|user cancel|rejected the request|denied (the )?(request|transaction|signature)/i;

/**
 * Whether an error looks like a user-rejected request (EIP-1193 `4001`), including wrappers.
 *
 * Wallets often wrap the rejection under `cause`/`error`/`data`, so the standard code is
 * matched cycle-safely across the error tree. This numeric-code check is unrelated to the
 * credible-require detection, which must never branch on numeric codes.
 */
export function isUserRejection(error: unknown): boolean {
  const seen = new Set<object>();
  const walk = (node: unknown, depth: number): boolean => {
    if (node == null || depth > 8) return false;
    if (typeof node !== 'object') return false;
    if (seen.has(node)) return false;
    seen.add(node);
    const e = node as { code?: unknown; message?: unknown };
    if (USER_REJECTION_CODES.has(e.code)) return true;
    if (typeof e.message === 'string' && USER_REJECTION_TEXT.test(e.message)) return true;
    for (const value of knownValues(node)) {
      if (walk(value, depth + 1)) return true;
    }
    return false;
  };
  return walk(error, 0);
}
