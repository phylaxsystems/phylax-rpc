import { toHex } from './brands';
import { ERROR_STRING_SELECTOR } from './constants';
import type { Eip1193Provider, Hex, RpcMethod } from './types';

/** Typed wrapper over `provider.request`. */
export function request<T = unknown>(
  provider: Eip1193Provider,
  method: RpcMethod,
  params?: unknown[] | Record<string, unknown>,
): Promise<T> {
  return provider.request({ method, params }) as Promise<T>;
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
 * Collect every `0x`-prefixed hex string found anywhere in an error object.
 *
 * Provider errors nest revert `data` in wildly different places — `error.data`,
 * `error.data.originalError.data`, `error.info.error.data` (ethers v6), `error.cause`, or
 * embedded in a non-enumerable `message` string — so we walk the whole tree, reading known
 * error keys explicitly (to reach non-enumerable ones) in addition to own-enumerable props.
 */
export function collectHexStrings(error: unknown): string[] {
  const out: string[] = [];
  const seen = new Set<object>();
  const walk = (node: unknown, depth: number): void => {
    if (node == null || depth > 8) return;
    if (typeof node === 'string') {
      const matches = node.match(/0x[0-9a-fA-F]+/g);
      if (matches) out.push(...matches);
      return;
    }
    if (typeof node === 'object') {
      if (seen.has(node)) return;
      seen.add(node);
      for (const value of knownValues(node)) walk(value, depth + 1);
      for (const value of Object.values(node as Record<string, unknown>)) {
        walk(value, depth + 1);
      }
    }
  };
  walk(error, 0);
  return out;
}

/**
 * Extract revert `data` from a thrown provider error.
 *
 * Prefers a hex blob carrying the `Error(string)` selector; otherwise returns the
 * longest hex blob found (best-effort). Returns `undefined` if none is present.
 */
export function extractRevertData(error: unknown): Hex | undefined {
  const hexes = collectHexStrings(error);
  if (hexes.length === 0) return undefined;
  const withSelector = hexes.find((h) =>
    h.toLowerCase().startsWith(ERROR_STRING_SELECTOR),
  );
  const chosen = withSelector ?? hexes.slice().sort((a, b) => b.length - a.length)[0];
  return chosen === undefined ? undefined : toHex(chosen);
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
