import { isHex } from '../brands';
import { ERROR_STRING_SELECTOR, PANIC_SELECTOR } from '../constants';
import { isObject, readProp } from '../guards';
import type { Hex } from '../types';

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

function knownValues(node: unknown): unknown[] {
  const out: unknown[] = [];
  for (const key of KNOWN_ERROR_KEYS) {
    const value = readProp(node, key);
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
  return collectHexCandidates(error).map((candidate) => candidate.value);
}

/**
 * Free-text carried by a provider error and every error it wraps, lowercased and joined.
 *
 * A matcher reading only the outer `message` misses the node's own wording, which wallets nest
 * under `cause`/`error`/`info`. Traversal is cycle-safe and depth-bounded.
 */
export function collectErrorText(error: unknown): string {
  const parts: string[] = [];
  const seen = new Set<object>();
  const walk = (node: unknown, depth: number): void => {
    if (node == null || depth > 8) return;
    if (typeof node === 'string') {
      parts.push(node);
      return;
    }
    if (typeof node !== 'object' || seen.has(node)) return;
    seen.add(node);
    for (const value of knownValues(node)) walk(value, depth + 1);
  };
  walk(error, 0);
  return parts.join(' ').toLowerCase();
}

/**
 * A collected hex string plus where it was found. `structured` is true when the string was
 * reached through a `data` property — the field providers use for actual ABI revert data —
 * and false when it was scraped out of a free-text field (`message`, `reason`, `body`, …),
 * where any hex the provider happens to echo (hashes, addresses, calldata) can appear.
 */
interface HexCandidate {
  value: string;
  structured: boolean;
}

function collectHexCandidates(error: unknown): HexCandidate[] {
  const out: HexCandidate[] = [];
  const seen = new Set<object>();
  const walk = (node: unknown, depth: number, structured: boolean): void => {
    if (node == null || depth > 8) return;
    if (typeof node === 'string') {
      const matches = node.match(/0x[0-9a-fA-F]+(?![0-9A-Za-z])/g);
      if (matches) out.push(...matches.map((value) => ({ value, structured })));
      return;
    }
    if (typeof node === 'object') {
      if (seen.has(node)) return;
      seen.add(node);
      for (const key of KNOWN_ERROR_KEYS) {
        const value = readProp(node, key);
        if (value !== undefined) walk(value, depth + 1, key === 'data');
      }
    }
  };
  walk(error, 0, false);
  return out;
}

/**
 * Whether a hex string is shaped like ABI-encoded revert data: a 4-byte selector followed
 * by zero or more 32-byte words (byte length `4 + 32·n`).
 *
 * This rejects hex that is well-formed but cannot be a revert: a 32-byte transaction hash,
 * a 20-byte address, or echoed calldata of a non-conforming length. Such values routinely
 * appear inside a provider's free-text `message` (e.g. `transaction 0x… not found`), and
 * without this shape check a plain network error would be mis-read as a contract revert and
 * downgraded from `inconclusive` to `reverted`. Every real ABI payload the detector cares
 * about — `Error(string)`, `Panic(uint256)`, and custom errors (including a bare selector,
 * `n = 0`) — is word-aligned and therefore satisfies this, while a hash (28 bytes past the
 * selector) or address (16 bytes past it) never does.
 */
function isAbiRevertShape(value: string): boolean {
  const byteLength = (value.length - 2) / 2;
  return byteLength >= 4 && (byteLength - 4) % 32 === 0;
}

/**
 * Selectors that unambiguously mark a hex blob as revert data: Solidity's `Error(string)`
 * and `Panic(uint256)`. Only blobs starting with one of these are trusted when found inside
 * a free-text field, because ordinary calldata echoed into an error message (say, an ERC-20
 * `transfer`) is also `4 + 32·n` bytes and would otherwise pass the shape check.
 */
const KNOWN_REVERT_SELECTORS = [ERROR_STRING_SELECTOR, PANIC_SELECTOR] as const;

function hasKnownRevertSelector(value: string): boolean {
  const lower = value.toLowerCase();
  return KNOWN_REVERT_SELECTORS.some((selector) => lower.startsWith(selector));
}

/**
 * Extract revert `data` from a thrown provider error.
 *
 * Prefers a hex blob carrying the `Error(string)` selector; otherwise returns the longest
 * value shaped like ABI revert data (a 4-byte selector followed by whole 32-byte words).
 * Shape alone is not enough for hex scraped out of free-text fields — echoed calldata has
 * the same shape — so text-sourced blobs must additionally carry a known revert selector,
 * while blobs from structured `data` fields are accepted with any selector (custom errors).
 */
export function extractRevertData(error: unknown): Hex | undefined {
  const candidates: Hex[] = [];
  for (const { value, structured } of collectHexCandidates(error)) {
    if (!isHex(value) || !isAbiRevertShape(value)) continue;
    if (!structured && !hasKnownRevertSelector(value)) continue;
    candidates.push(value);
  }
  const withSelector = candidates.find((value) =>
    value.toLowerCase().startsWith(ERROR_STRING_SELECTOR),
  );
  if (withSelector) return withSelector;
  return candidates.reduce<Hex | undefined>(
    (longest, value) => (!longest || value.length > longest.length ? value : longest),
    undefined,
  );
}

/**
 * Whether any error in the tree satisfies `match`.
 *
 * Wallets wrap the provider's own error under `cause`/`error`/`info`, so a check reading only
 * the outer object misses the code or wording that identifies the failure. Traversal is
 * cycle-safe and depth-bounded.
 */
function someError(error: unknown, match: (node: Record<string, unknown>) => boolean): boolean {
  const seen = new Set<object>();
  const walk = (node: unknown, depth: number): boolean => {
    if (node == null || depth > 8) return false;
    if (!isObject(node)) return false;
    if (seen.has(node)) return false;
    seen.add(node);
    if (match(node)) return true;
    for (const value of knownValues(node)) {
      if (walk(value, depth + 1)) return true;
    }
    return false;
  };
  return walk(error, 0);
}

/** EIP-1193 user-rejection code, and ethers' string alias. */
const USER_REJECTION_CODES: ReadonlySet<unknown> = new Set([4001, 'ACTION_REJECTED']);
// Deliberately narrow: matches explicit rejection phrasing, not a bare "denied" that a
// contract revert message could also contain.
const USER_REJECTION_TEXT =
  /user rejected|user denied|user cancel|rejected the request|denied (the )?(request|transaction|signature)/i;

/** EIP-1193 disconnection: `4900` from every chain, `4901` from the requested one. */
const DISCONNECTED_CODES: ReadonlySet<unknown> = new Set([4900, 4901]);
/** Standard node/adapter signals for an execution revert whose payload may be empty. */
const EXECUTION_REVERT_CODES: ReadonlySet<unknown> = new Set([3, 'CALL_EXCEPTION']);

/** HTTP responses for which repeating the same request can reasonably succeed later. */
function isTransientHttpStatus(value: unknown): boolean {
  return (
    typeof value === 'number' &&
    (value === 408 || value === 425 || value === 429 || (value >= 500 && value <= 599))
  );
}

/**
 * Whether an error carries the EIP-1193 user-rejection code, including wrappers.
 *
 * Kept apart from {@link isUserRejection} because only the code is structural evidence. The
 * wording on its own also reaches a caller as a contract's `Error(string)` revert, which is a
 * genuine revert and not a dismissal, so a classifier has to rank the two differently.
 */
export function hasUserRejectionCode(error: unknown): boolean {
  return someError(error, (node) => USER_REJECTION_CODES.has(node.code));
}

/**
 * Whether an error looks like a user-rejected request (EIP-1193 `4001`), including wrappers.
 *
 * This numeric-code check is unrelated to the credible-require detection, which must never
 * branch on numeric codes.
 */
export function isUserRejection(error: unknown): boolean {
  return (
    hasUserRejectionCode(error) ||
    someError(
      error,
      (node) => typeof node.message === 'string' && USER_REJECTION_TEXT.test(node.message),
    )
  );
}

/**
 * Whether an EIP-1193 provider reported itself disconnected (`4900`/`4901`), including wrappers.
 *
 * Read from the code rather than the message because the accompanying prose is the wallet's to
 * word, and a disconnected provider never reached a node, so the request is worth reissuing.
 */
export function isProviderDisconnected(error: unknown): boolean {
  return someError(error, (node) => DISCONNECTED_CODES.has(node.code));
}

/** Whether a provider structurally identified an execution revert, including empty payloads. */
export function isExecutionRevert(error: unknown): boolean {
  if (
    someError(
      error,
      (node) =>
        EXECUTION_REVERT_CODES.has(node.code) || node.name === 'ExecutionRevertedError',
    )
  ) {
    return true;
  }
  return collectErrorText(error).includes('execution reverted');
}

/**
 * Whether a provider library structurally identified a request-level transport failure.
 *
 * viem's wrapper text is deliberately generic, so matching only its message loses an HTTP
 * status and a cause-less WebSocket failure. A status-less `HttpRequestError` means fetch itself
 * failed; responses are retryable only for timeout, throttling, early-data, and server errors.
 */
export function isProviderTransportError(error: unknown): boolean {
  return someError(error, (node) => {
    if (node.name === 'WebSocketRequestError' || node.name === 'SocketClosedError') return true;
    if (node.name !== 'HttpRequestError') return false;
    return node.status === undefined || isTransientHttpStatus(node.status);
  });
}
