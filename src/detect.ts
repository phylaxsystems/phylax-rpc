import { decodeErrorString, isErrorStringRevert } from './abi';
import { extractRevertData, request } from './eip1193';
import type {
  CredibleRevertMatch,
  DetectionResult,
  Eip1193Provider,
  ResolvedPhylaxRpcConfig,
  TransactionRequest,
} from './types';

export type PreflightMethod = 'eth_estimateGas' | 'eth_call';

export interface DetectOptions {
  provider: Eip1193Provider;
  transaction: TransactionRequest;
  config: ResolvedPhylaxRpcConfig;
  /** Preflight method. Defaults to `eth_estimateGas`. */
  method?: PreflightMethod;
}

function matchesCredible(reason: string, match: CredibleRevertMatch): boolean {
  return typeof match === 'function' ? match(reason) : match.test(reason);
}

/**
 * Build preflight params, stripping any gas fields.
 *
 * A pre-filled `gas`/`gasLimit` makes most wallets skip estimation entirely, so the
 * credible-require revert never surfaces before signing. We never send one.
 */
export function buildPreflightParams(
  transaction: TransactionRequest,
  method: PreflightMethod,
): unknown[] {
  const { gas: _gas, gasLimit: _gasLimit, ...rest } = transaction;
  return method === 'eth_call' ? [rest, 'latest'] : [rest];
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
  const { provider, transaction, config } = options;
  const method = options.method ?? 'eth_estimateGas';
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
