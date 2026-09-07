import { request } from './eip1193';
import { isHex } from './brands';
import { readProp } from './guards';
import { PREFLIGHT_METHODS } from './constants';
import { classifyRpcError, type RpcFailure } from './errors/rpc';
import {
  isTransient,
  retryDelay,
  shouldRetry,
  type RetryPolicy,
  wait,
} from './errors/retry';
import { isNumeric, toHexQuantity } from './hex';
import type {
  CredibleRevertMatch,
  DetectionResult,
  DetectOptions,
  Eip1193Provider,
  LooseTransactionRequest,
  PreflightMethod,
} from './types';

export type { DetectOptions, PreflightMethod } from './types';

/** The classifier kinds that carry revert data, and so become a `reverted` detection. */
type Revert = Extract<RpcFailure, { kind: 'assertion-rejected' | 'reverted' }>;

/** Numeric tx fields coerced to a hex QUANTITY before the preflight call. */
const NUMERIC_FIELDS = [
  'value',
  'gasPrice',
  'maxFeePerGas',
  'maxPriorityFeePerGas',
  'nonce',
] as const;

function matchesCredible(reason: string, match: CredibleRevertMatch): boolean {
  if (typeof match === 'function') return match(reason);
  // A caller-supplied `/g` or `/y` RegExp is stateful: `RegExp.test` advances `lastIndex`,
  // so back-to-back probes on the same matcher would alternate hit/miss. Reset first so each
  // detection is independent of prior calls (a no-op for non-sticky/non-global matchers).
  match.lastIndex = 0;
  return match.test(reason);
}

/**
 * Normalize a loose tx into a wallet-ready params object: drop `null`/`undefined` and
 * `gas`/`gasLimit` fields, then coerce every numeric field to a hex quantity.
 *
 * `null` is dropped because viem/ethers type most tx fields as `… | null`; a `null` `to`
 * would otherwise read as a contract-creation call in the preflight, and a `null` `from`
 * would defeat sender resolution. A pre-filled `gas`/`gasLimit` makes most wallets skip
 * estimation entirely, so the credible-require revert never surfaces before signing — we
 * never send one.
 */
export function normalizeTransaction(
  transaction: LooseTransactionRequest,
): Record<string, unknown> {
  const { gas: _gas, gasLimit: _gasLimit, ...rest } = transaction;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(rest)) {
    if (value != null) out[key] = value;
  }
  for (const field of NUMERIC_FIELDS) {
    const value = out[field];
    if (value == null) continue;
    if (!isNumeric(value)) {
      throw new TypeError(`normalizeTransaction: ${field} is not a numeric value`);
    }
    out[field] = toHexQuantity(value);
  }
  return out;
}

/**
 * Build preflight params from a (possibly loose) transaction — see
 * {@link normalizeTransaction} for the coercion and gas-stripping rules.
 */
export function buildPreflightParams(
  transaction: LooseTransactionRequest,
  method: PreflightMethod,
): unknown[] {
  const normalized = normalizeTransaction(transaction);
  switch (method) {
    case PREFLIGHT_METHODS.call:
      return [normalized, 'latest'];
    case PREFLIGHT_METHODS.estimateGas:
      return [normalized];
    case PREFLIGHT_METHODS.simulateV1:
      return [{ blockStateCalls: [{ calls: [normalized] }], validation: false }, 'latest'];
  }
}

/** A successful RPC response can still contain a failed simulated transaction. */
function checkSimulationResult(result: unknown): RequestResult {
  const calls = Array.isArray(result) && result.length === 1
    ? readProp(result[0], 'calls')
    : undefined;
  const call = Array.isArray(calls) && calls.length === 1 ? calls[0] : undefined;
  const status = readProp(call, 'status');
  const returnData = readProp(call, 'returnData');
  const error = readProp(call, 'error');

  if (
    !isHex(returnData) ||
    (status !== '0x0' && status !== '0x1') ||
    (status === '0x1' && error != null)
  ) {
    return {
      ok: false,
      failure: { kind: 'unknown' },
      error: new TypeError('eth_simulateV1 returned an invalid single-transaction result'),
    };
  }
  if (status === '0x0') {
    const executionError = { cause: error, data: returnData };
    const failure = classifyRpcError(executionError);
    // Zero status proves execution failed even without revert data or familiar node wording.
    // Keep decoded routing/assertion evidence, but never retry a completed failed execution.
    return {
      ok: false,
      failure: failure.kind === 'reverted' || failure.kind === 'assertion-rejected'
        ? failure
        : { kind: 'reverted', data: returnData },
      error: executionError,
    };
  }
  return { ok: true, value: result };
}

type RequestResult =
  | Readonly<{ ok: true; value: unknown }>
  | Readonly<{ ok: false; failure: RpcFailure; error: unknown }>;

interface RetryState {
  attempts: number;
}

/** Run one of detection's read-only provider calls with the configured transient retry policy. */
async function requestWithRetry(
  operation: () => Promise<unknown>,
  retry: RetryPolicy | false | undefined,
  state: RetryState,
): Promise<RequestResult> {
  const policy = retry === false ? undefined : retry;
  for (;;) {
    try {
      return { ok: true, value: await operation() };
    } catch (error) {
      const failure = classifyRpcError(error);
      if (isTransient(failure) && shouldRetry(failure, state.attempts, retry)) {
        await wait(retryDelay(state.attempts, policy?.random), policy?.signal);
        if (policy?.signal?.aborted) return { ok: false, failure, error };
        state.attempts += 1;
        continue;
      }
      return { ok: false, failure, error };
    }
  }
}

/**
 * Detect whether the wallet is routed off the Phylax RPC by running the SDK's *own*
 * preflight, `eth_call` by default, and recognising the credible-require revert.
 *
 * - Preflight succeeds → on Phylax (the Phylax RPC answers the require as-if in a
 *   credible block), or the tx is simply not credible-protected. Either way: no switch.
 * - Preflight reverts with the Credible RPC's own gate message → the request reached Phylax
 *   and an assertion refused the transaction: a genuine revert, and never a switch.
 * - Preflight reverts with `Error(string)` matching the credible message → off Phylax.
 * - Preflight carries any other revert evidence (empty data with a standard execution signal,
 *   a different `Error(string)`, a `Panic`, or a custom error) → a genuine revert, not a
 *   routing problem.
 * - No revert evidence (network error, opaque shape) → inconclusive.
 *
 * The wallet's own confirm-screen "tx will fail" verdict is deliberately ignored: it is
 * generic, runs against the wallet's centralized simulator, and fires even for
 * correctly-routed users on Rabby/Rainbow/Zerion/Coinbase.
 */
export async function detectOffPhylax(options: DetectOptions): Promise<DetectionResult> {
  const { provider, config } = options;
  const method = options.method ?? PREFLIGHT_METHODS.call;
  const retryState: RetryState = { attempts: 0 };

  // Resolve the sender: explicit tx `from` → `options.account` → silent `eth_accounts`.
  let from = options.transaction.from ?? options.account;
  if (!from) {
    const accounts = await requestWithRetry(
      () => request(provider, 'eth_accounts'),
      options.retry,
      retryState,
    );
    if (!accounts.ok) {
      const { failure, error } = accounts;
      // `eth_accounts` cannot execute EVM code. If a malformed provider nevertheless labels its
      // failure as a revert, keep detection inconclusive without claiming that the probe ran.
      return failure.kind === 'assertion-rejected' || failure.kind === 'reverted'
        ? inconclusive({ kind: 'unknown' }, error)
        : inconclusive(failure, error);
    }
    from =
      Array.isArray(accounts.value) && typeof accounts.value[0] === 'string'
        ? accounts.value[0]
        : undefined;
  }
  if (!from) {
    return {
      status: 'inconclusive',
      offPhylax: false,
      reason: 'no-sender',
      retryable: false,
      error: new Error(
        'detectOffPhylax: no `from` address available — pass `transaction.from`, ' +
          '`account`, or connect the wallet so `eth_accounts` returns a sender.',
      ),
    };
  }

  const transaction = options.transaction.from
    ? options.transaction
    : { ...options.transaction, from };
  const params = buildPreflightParams(transaction, method);

  const response = await requestWithRetry(
    () => request(provider, method, params),
    options.retry,
    retryState,
  );
  const preflight = response.ok && method === PREFLIGHT_METHODS.simulateV1
    ? checkSimulationResult(response.value)
    : response;
  if (preflight.ok) return { status: 'on-phylax', offPhylax: false };

  const { failure, error } = preflight;
  switch (failure.kind) {
    case 'assertion-rejected':
      return revertedBy(failure, error);

    case 'reverted':
      // Only a revert the classifier did not attribute to the gate can be a routing
      // signal; the credible matcher is broad enough to claim the gate's wording too.
      return failure.reason && matchesCredible(failure.reason, config.credibleRevertMatch)
        ? {
            status: 'off-phylax',
            offPhylax: true,
            revertReason: failure.reason,
            revertData: failure.data,
            error,
          }
        : revertedBy(failure, error);

    // Nothing about routing follows from the rest.
    default:
      return inconclusive(failure, error);
  }
}

/** The classifier's own kind is the reason, so the two cannot drift apart. */
function inconclusive(
  failure: Exclude<RpcFailure, Revert>,
  error: unknown,
): DetectionResult {
  return {
    status: 'inconclusive',
    offPhylax: false,
    reason: failure.kind,
    retryable: isTransient(failure),
    error,
  };
}

/** The verdict both revert kinds produce, carrying whatever the classifier could attribute. */
function revertedBy(failure: Revert, error: unknown): DetectionResult {
  return {
    status: 'reverted',
    offPhylax: false,
    ...(failure.reason !== undefined ? { revertReason: failure.reason } : {}),
    ...(failure.kind === 'assertion-rejected' && failure.rejection !== undefined
      ? { assertionRejection: failure.rejection }
      : {}),
    revertData: failure.data,
    error,
  };
}
