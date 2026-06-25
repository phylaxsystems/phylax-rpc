import { ERROR_STRING_SELECTOR } from './constants';
import type { Eip1193Provider } from './types';

/** Typed wrapper over `provider.request`. */
export function request<T = unknown>(
  provider: Eip1193Provider,
  method: string,
  params?: unknown[] | Record<string, unknown>,
): Promise<T> {
  return provider.request({ method, params }) as Promise<T>;
}

/**
 * Collect every `0x`-prefixed hex string found anywhere in an error object.
 *
 * Provider errors nest revert `data` in wildly different places — `error.data`,
 * `error.data.originalError.data`, `error.info.error.data` (ethers v6),
 * `error.cause`, or embedded in the `message` string — so we walk the whole tree
 * rather than guessing the shape.
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
      if (seen.has(node as object)) return;
      seen.add(node as object);
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
export function extractRevertData(error: unknown): string | undefined {
  const hexes = collectHexStrings(error);
  if (hexes.length === 0) return undefined;
  const withSelector = hexes.find((h) =>
    h.toLowerCase().startsWith(ERROR_STRING_SELECTOR),
  );
  if (withSelector) return withSelector;
  return hexes.slice().sort((a, b) => b.length - a.length)[0];
}

/**
 * Whether an error looks like a user-rejected request (EIP-1193 `4001`).
 *
 * This *is* a numeric-code check — but only for the standard user-rejection code,
 * which is stable across wallets. It is unrelated to the credible-require detection,
 * which must never branch on numeric codes.
 */
export function isUserRejection(error: unknown): boolean {
  if (error == null || typeof error !== 'object') return false;
  const e = error as { code?: unknown; message?: unknown };
  if (e.code === 4001 || e.code === 'ACTION_REJECTED') return true;
  const message = typeof e.message === 'string' ? e.message.toLowerCase() : '';
  return /user rejected|user denied|rejected the request|denied/.test(message);
}
