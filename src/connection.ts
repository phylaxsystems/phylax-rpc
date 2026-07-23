import { MAINNET_CHAIN_ID } from './constants';
import { request } from './eip1193';
import type { ChainId, Eip1193Provider } from './types';

/**
 * Version 1 of the Phylax routing signal.
 *
 * The sentinel is outside Ethereum's reachable block range. A Phylax-aware RPC applies
 * its credible-marker override for that block before executing the registry read, while
 * an ordinary RPC reads the unchanged `false` value from the registry.
 *
 * The signal is defined for **mainnet only** — the registry and marker override live on
 * chain 1 — so routing verification via this path is unavailable on other chains.
 */
export const PHYLAX_ROUTING_SIGNAL_V1 = Object.freeze({
  version: 1,
  chainId: 1,
  registry: '0xF33F66b57dCD96b2729A50D95D6C2Ac2c8b2958c',
  blockNumber: '0xffffffffffffffff',
  // isCredibleBlock(uint256) with uint64::MAX as the argument.
  callData:
    '0x3412ad22000000000000000000000000000000000000000000000000ffffffffffffffff',
} as const);

/**
 * Tri-state result of the silent routing probe:
 * - `connected` — the versioned credible marker is active (definitely on Phylax).
 * - `disconnected` — a definitive negative signal (wrong chain, or the marker read false).
 * - `inconclusive` — the probe could not decide (transient error, malformed reply, or a
 *   non-mainnet config where the signal is undefined). Callers must NOT mutate wallet state
 *   on `inconclusive`.
 */
export type RoutingCheck = 'connected' | 'disconnected' | 'inconclusive';

function chainIdEquals(value: unknown, expected: ChainId): boolean {
  if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'bigint') {
    return false;
  }
  try {
    return BigInt(value) === BigInt(expected);
  } catch {
    return false;
  }
}

/** Decode a 32-byte boolean word, or `undefined` when the reply is malformed. */
function decodeBool(value: unknown): boolean | undefined {
  if (typeof value !== 'string') return undefined;
  if (/^0x0*1$/i.test(value)) return true;
  if (/^0x0+$/i.test(value)) return false;
  return undefined;
}

/**
 * Silently probe whether a wallet-backed provider is routing through Phylax, returning a
 * {@link RoutingCheck}. No account access, signature, or transaction is requested.
 *
 * A transient failure resolves to `inconclusive` (never a false negative), so callers can
 * avoid disrupting an already-connected wallet.
 */
export async function checkPhylaxRouting(
  provider: Eip1193Provider,
  expectedChainId: ChainId,
): Promise<RoutingCheck> {
  let chainId: unknown;
  try {
    chainId = await request(provider, 'eth_chainId');
  } catch {
    return 'inconclusive';
  }

  // On the wrong chain the wallet is definitively not routed to the Phylax chain.
  if (!chainIdEquals(chainId, expectedChainId)) return 'disconnected';

  // The versioned marker lives on mainnet; for any other configured chain we cannot use it.
  if (BigInt(expectedChainId) !== BigInt(PHYLAX_ROUTING_SIGNAL_V1.chainId)) {
    return 'inconclusive';
  }

  try {
    const result = await request(provider, 'eth_call', [
      {
        to: PHYLAX_ROUTING_SIGNAL_V1.registry,
        data: PHYLAX_ROUTING_SIGNAL_V1.callData,
      },
      'latest',
      null,
      { number: PHYLAX_ROUTING_SIGNAL_V1.blockNumber },
    ]);
    const decoded = decodeBool(result);
    if (decoded === undefined) return 'inconclusive';
    return decoded ? 'connected' : 'disconnected';
  } catch {
    return 'inconclusive';
  }
}

/**
 * Silently check whether a wallet-backed EIP-1193 provider is routing through Phylax on
 * **mainnet**. Convenience boolean wrapper over {@link checkPhylaxRouting}; only a
 * definitive `connected` returns `true`, so unsupported providers and transient failures
 * read as `false` and keep onboarding fail-closed.
 */
export async function isConnectedToPhylax(provider: Eip1193Provider): Promise<boolean> {
  return (await checkPhylaxRouting(provider, MAINNET_CHAIN_ID)) === 'connected';
}
