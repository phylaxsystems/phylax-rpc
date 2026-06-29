import { buildAddChainParams } from './config';
import { detectOffPhylax } from './detect';
import { isUserRejection, request } from './eip1193';
import { toHexChainId } from './hex';
import type {
  Eip1193Provider,
  LooseTransactionRequest,
  ResolvedPhylaxRpcConfig,
  SwitchResult,
  WalletClassification,
} from './types';

export interface SwitchOptions {
  provider: Eip1193Provider;
  wallet: WalletClassification;
  config: ResolvedPhylaxRpcConfig;
  /**
   * Transaction used for the **mandatory** verify-activation probe. Several wallets
   * accept `wallet_addEthereumChain`/`wallet_switchEthereumChain` and then ignore the
   * submitted URL, so the only reliable confirmation is re-running the preflight and
   * seeing the credible-require now pass. Strongly recommended; without it the outcome
   * can only ever be `unverified`.
   */
  verifyTransaction?: LooseTransactionRequest;
  /** Sender for the verify probe when `verifyTransaction` omits `from` (see {@link DetectOptions.account}). */
  account?: string;
  /**
   * Run the assisted path even when the wallet is not on the allowlist. For testing or
   * advanced callers only — the spike showed the call is a no-op on non-allowlisted
   * wallets, so this will almost always end in `unverified` + manual fallback.
   */
  force?: boolean;
}

/**
 * Attempt the assisted RPC switch: `wallet_addEthereumChain(chainId, phylax)` →
 * `wallet_switchEthereumChain` → mandatory verify-activation probe.
 *
 * Raw EIP-3085/3326 requests are used deliberately — viem's `addChain` with a different
 * RPC silently creates a *duplicate* network instead of activating the submitted one.
 */
export async function attemptSwitch(options: SwitchOptions): Promise<SwitchResult> {
  const { provider, wallet, config } = options;

  if (!wallet.assistedSwitch && !options.force) {
    return {
      outcome: 'unsupported',
      added: false,
      switched: false,
      manualFallback: true,
    };
  }

  let added = false;
  let switched = false;

  try {
    await request(provider, 'wallet_addEthereumChain', [buildAddChainParams(config)]);
    added = true;
  } catch (error) {
    if (isUserRejection(error)) {
      return { outcome: 'rejected', added, switched, manualFallback: true, error };
    }
    // Non-rejection add failures (e.g. "chain already added") are non-fatal — the chain
    // may already exist with our RPC. Proceed to the switch and let the probe decide.
  }

  try {
    await request(provider, 'wallet_switchEthereumChain', [
      { chainId: toHexChainId(config.chainId) },
    ]);
    switched = true;
  } catch (error) {
    if (isUserRejection(error)) {
      return { outcome: 'rejected', added, switched, manualFallback: true, error };
    }
    return { outcome: 'failed', added, switched, manualFallback: true, error };
  }

  // Mandatory verify-activation probe.
  if (!options.verifyTransaction) {
    return { outcome: 'unverified', added, switched, manualFallback: true };
  }

  const verification = await detectOffPhylax({
    provider,
    transaction: options.verifyTransaction,
    account: options.account,
    config,
  });

  if (verification.status === 'on-phylax') {
    return {
      outcome: 'activated',
      added,
      switched,
      verification,
      manualFallback: false,
    };
  }

  // Still off Phylax, reverted for another reason, or inconclusive — the wallet did not
  // activate the submitted RPC. Be conservative and route the user to the manual path.
  return {
    outcome: 'unverified',
    added,
    switched,
    verification,
    manualFallback: true,
  };
}
