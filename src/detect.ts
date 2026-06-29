import { decodeErrorString, isErrorStringRevert } from './abi';
import { extractRevertData, request } from './eip1193';
import { toHexQuantity } from './hex';
import type {
  CredibleRevertMatch,
  DetectionResult,
  Eip1193Provider,
  LooseTransactionRequest,
  Numeric,
  ResolvedPhylaxRpcConfig,
} from './types';

export type PreflightMethod = 'eth_estimateGas' | 'eth_call';

export interface DetectOptions {
  provider: Eip1193Provider;
  transaction: LooseTransactionRequest;
  config: ResolvedPhylaxRpcConfig;
  /** Preflight method. Defaults to `eth_estimateGas`. */
  method?: PreflightMethod;
  /**
   * The sender to preflight as, when the transaction omits `from`. If neither this nor
   * `transaction.from` is set, the provider is queried with `eth_accounts` (silent — no
   * wallet popup). A `eth_requestAccounts` prompt is never triggered from here.
   */
  account?: string;
}

/** Numeric tx fields coerced to a hex QUANTITY before the preflight call. */
const NUMERIC_FIELDS = [
  'value',
  'gasPrice',
  'maxFeePerGas',
  'maxPriorityFeePerGas',
  'nonce',
] as const;

function matchesCredible(reason: string, match: CredibleRevertMatch): boolean {
  return typeof match === 'function' ? match(reason) : match.test(reason);
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
    if (value != null) out[field] = toHexQuantity(value as Numeric);
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
    const accounts = await request<unknown>(provider, 'eth_accounts');
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
 * - Preflight reverts for another reason → a genuine tx error, not a routing problem.
 * - Anything else (network error, opaque shape) → inconclusive.
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

    if (revertData && isErrorStringRevert(revertData)) {
      const revertReason = decodeErrorString(revertData);
      if (revertReason && matchesCredible(revertReason, config.credibleRevertMatch)) {
        return {
          status: 'off-phylax',
          offPhylax: true,
          revertReason,
          revertData,
          error,
        };
      }
      // A different Error(string) — a real contract revert, not a routing signal.
      return {
        status: 'reverted',
        offPhylax: false,
        revertReason,
        revertData,
        error,
      };
    }

    // No decodable revert data: network failure, rate limit, opaque error shape, etc.
    return { status: 'inconclusive', offPhylax: false, error };
  }
}
