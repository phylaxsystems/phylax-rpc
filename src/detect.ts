import { decodeErrorString, isErrorStringRevert } from './abi';
import { extractRevertData, request } from './eip1193';
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
  return method === 'eth_call' ? [normalized, 'latest'] : [normalized];
}

/** Silently read the connected account (`eth_accounts`), never prompting. */
async function resolveAccount(provider: Eip1193Provider): Promise<string | undefined> {
  try {
    const accounts = await request(provider, 'eth_accounts');
    return Array.isArray(accounts) && typeof accounts[0] === 'string'
      ? accounts[0]
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Detect whether the wallet is routed off the Phylax RPC by running the SDK's *own*
 * preflight (`eth_estimateGas`/`eth_call`) and recognising the credible-require revert.
 *
 * - Preflight succeeds → on Phylax (the Phylax RPC answers the require as-if in a
 *   credible block), or the tx is simply not credible-protected. Either way: no switch.
 * - Preflight reverts with `Error(string)` matching the credible message → off Phylax.
 * - Preflight reverts with any other decodable data (a different `Error(string)`, a
 *   `Panic`, or a custom error) → a genuine revert, not a routing problem.
 * - No decodable revert data (network error, opaque shape) → inconclusive.
 *
 * The wallet's own confirm-screen "tx will fail" verdict is deliberately ignored: it is
 * generic, runs against the wallet's centralized simulator, and fires even for
 * correctly-routed users on Rabby/Rainbow/Zerion/Coinbase.
 */
export async function detectOffPhylax(options: DetectOptions): Promise<DetectionResult> {
  const { provider, config } = options;
  const method = options.method ?? 'eth_estimateGas';

  // Resolve the sender: explicit tx `from` → `options.account` → silent `eth_accounts`.
  let from = options.transaction.from ?? options.account;
  if (!from) from = await resolveAccount(provider);
  if (!from) {
    return {
      status: 'inconclusive',
      offPhylax: false,
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

  try {
    await request(provider, method, params);
    return { status: 'on-phylax', offPhylax: false };
  } catch (error) {
    const revertData = extractRevertData(error);
    if (!revertData) {
      // Network failure, rate limit, opaque error shape — nothing to conclude.
      return { status: 'inconclusive', offPhylax: false, error };
    }

    const revertReason = isErrorStringRevert(revertData)
      ? decodeErrorString(revertData)
      : undefined;

    if (revertReason && matchesCredible(revertReason, config.credibleRevertMatch)) {
      return {
        status: 'off-phylax',
        offPhylax: true,
        revertReason,
        revertData,
        error,
      };
    }

    // Valid revert data that is not the credible signal — a real contract revert
    // (a different `Error(string)`, `Panic(uint256)`, or a custom error).
    return {
      status: 'reverted',
      offPhylax: false,
      ...(revertReason !== undefined ? { revertReason } : {}),
      revertData,
      error,
    };
  }
}
