import { buildAddChainParams } from './config';
import { isConnectedToPhylax } from './connection';
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
   * Optional protected transaction used as a compatibility verification probe for older
   * Phylax RPC deployments that do not expose the versioned routing signal.
   */
  verifyTransaction?: LooseTransactionRequest;
  /** Sender for the compatibility probe when `verifyTransaction` omits `from`. */
  account?: string;
  /**
   * Run the assisted path even when the wallet is not on the allowlist. For testing or
   * advanced callers only — the spike showed the call is a no-op on non-allowlisted
   * wallets, so this will almost always end in `unverified` + manual fallback.
   */
  force?: boolean;
}

/**
 * Attempt the assisted RPC switch: check current routing →
 * `wallet_addEthereumChain(chainId, phylax)` → `wallet_switchEthereumChain` →
 * verify current routing again.
 *
 * Raw EIP-3085/3326 requests are used deliberately — viem's `addChain` with a different
 * RPC silently creates a *duplicate* network instead of activating the submitted one.
 */
export async function attemptSwitch(options: SwitchOptions): Promise<SwitchResult> {
  const { provider, wallet, config } = options;

  // Avoid reopening onboarding or touching the wallet's network configuration when the
  // requested provider is already routed through Phylax.
  if (await isConnectedToPhylax(provider)) {
    return {
      outcome: 'activated',
      added: false,
      switched: false,
      manualFallback: false,
    };
  }

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

  if (await isConnectedToPhylax(provider)) {
    return {
      outcome: 'activated',
      added,
      switched,
      manualFallback: false,
    };
  }

  // Older Phylax RPC deployments do not expose the versioned routing signal. Keep the
  // protected-transaction probe as a compatibility fallback when the caller supplied one.
  if (options.verifyTransaction) {
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

    return {
      outcome: 'unverified',
      added,
      switched,
      verification,
      manualFallback: true,
    };
  }

  return { outcome: 'unverified', added, switched, manualFallback: true };
}
