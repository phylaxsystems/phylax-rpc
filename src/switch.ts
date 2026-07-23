import { buildAddChainParams } from './config';
import { checkPhylaxRouting } from './connection';
import { detectOffPhylax } from './detect';
import { isUserRejection, request } from './eip1193';
import { toHexChainId } from './hex';
import type { DetectionResult, SwitchOptions, SwitchResult } from './types';

export type { SwitchOptions } from './types';

/** Whether an add-chain failure means the chain is already present (safe to switch to). */
function isAlreadyAddedError(error: unknown): boolean {
  const message =
    error != null && typeof error === 'object' && typeof (error as { message?: unknown }).message === 'string'
      ? (error as { message: string }).message.toLowerCase()
      : '';
  return /already (been )?(added|exists?)|already present|duplicate/.test(message);
}

/**
 * Attempt the assisted RPC switch: verify current routing →
 * `wallet_addEthereumChain(chainId, phylax)` → `wallet_switchEthereumChain` →
 * verify routing again.
 *
 * Raw EIP-3085/3326 requests are used deliberately — viem's `addChain` with a different
 * RPC silently creates a *duplicate* network instead of activating the submitted one.
 *
 * Activation is only reported when it can be proven: either the versioned routing signal
 * reads `connected` after the switch, or — for older deployments without that signal — a
 * caller-supplied `verifyTransaction` reverts off-Phylax *before* the switch (proving it is
 * credible-protected) and then passes *after*. A bare preflight success is never treated as
 * activation, since it can equally mean the probe tx simply is not credible-protected.
 */
export async function attemptSwitch(options: SwitchOptions): Promise<SwitchResult> {
  const { provider, wallet, config } = options;

  // Already routed through Phylax — don't reopen onboarding or touch network config.
  const initial = await checkPhylaxRouting(provider, config.chainId);
  if (initial === 'connected') {
    return { outcome: 'activated', added: false, switched: false, manualFallback: false };
  }

  if (!wallet.assistedSwitch && !options.force) {
    return { outcome: 'unsupported', added: false, switched: false, manualFallback: true };
  }

  // We couldn't determine current routing (transient error / non-mainnet config). Do NOT
  // mutate wallet state on a guess — an already-connected wallet must not be disrupted.
  if (initial === 'inconclusive') {
    return { outcome: 'unverified', added: false, switched: false, manualFallback: true };
  }

  // Establish a protected baseline BEFORE mutating: only a probe that reverts off-Phylax
  // now proves the tx is credible-protected, so a later success is a real off→on transition.
  let baseline: DetectionResult | undefined;
  if (options.verifyTransaction) {
    baseline = await detectOffPhylax({
      provider,
      transaction: options.verifyTransaction,
      account: options.account,
      config,
    });
  }

  let added = false;
  let switched = false;
  let addError: unknown;

  try {
    await request(provider, 'wallet_addEthereumChain', [buildAddChainParams(config)]);
    added = true;
  } catch (error) {
    if (isUserRejection(error)) {
      return { outcome: 'rejected', added, switched, manualFallback: true, error };
    }
    // Only tolerate an explicitly recognised already-added chain. Any other add failure is
    // preserved and surfaced, so switching to a pre-existing ordinary chain can't mask it.
    if (!isAlreadyAddedError(error)) addError = error;
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

  if ((await checkPhylaxRouting(provider, config.chainId)) === 'connected') {
    return { outcome: 'activated', added, switched, manualFallback: false };
  }

  // Compatibility fallback for older Phylax RPC deployments without the versioned signal.
  if (options.verifyTransaction) {
    const verification = await detectOffPhylax({
      provider,
      transaction: options.verifyTransaction,
      account: options.account,
      config,
    });

    if (baseline?.status === 'off-phylax' && verification.status === 'on-phylax') {
      return { outcome: 'activated', added, switched, verification, manualFallback: false };
    }

    return {
      outcome: 'unverified',
      added,
      switched,
      verification,
      manualFallback: true,
      ...(addError !== undefined ? { error: addError } : {}),
    };
  }

  return {
    outcome: 'unverified',
    added,
    switched,
    manualFallback: true,
    ...(addError !== undefined ? { error: addError } : {}),
  };
}
