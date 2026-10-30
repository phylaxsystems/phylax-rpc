import { MAINNET_CHAIN_ID } from './constants';
import { request } from './eip1193';
import type { ChainId, Eip1193Provider } from './types';

/**
 * Version 2 of the Phylax routing signal.
 *
 * The sentinel is outside Ethereum's reachable block range. A Phylax-aware RPC applies
 * its credible-marker override for that block before executing the registry read, while
 * an ordinary RPC reads the actual latest marker. Reading `lastCredibleBlock()` directly
 * avoids treating the registry's zero-gas-price simulation bypass as routing evidence.
 *
 * The signal is defined for **mainnet only** — the registry and marker override live on
 * chain 1 — so routing verification via this path is unavailable on other chains.
 */
export const PHYLAX_ROUTING_SIGNAL_V2 = Object.freeze({
  version: 2,
  chainId: 1,
  registry: '0xF33F66b57dCD96b2729A50D95D6C2Ac2c8b2958c',
  blockNumber: '0xffffffffffffffff',
  // lastCredibleBlock()
  callData: '0x0cb140e6',
} as const);

/**
 * Tri-state result of the silent routing probe:
 * - `connected` — the versioned credible marker is active (definitely on Phylax).
 * - `disconnected` — a definitive negative signal (wrong chain, or no sentinel marker).
 * - `inconclusive` — the probe could not decide (transient error, malformed reply, or a
 *   non-mainnet config where the signal is undefined). Callers must NOT mutate wallet state
 *   on `inconclusive`.
 */
export type RoutingCheck = 'connected' | 'disconnected' | 'inconclusive';

function chainIdEquals(value: unknown, expected: ChainId): boolean | undefined {
  if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'bigint') {
    return undefined;
  }
  try {
    return BigInt(value) === BigInt(expected);
  } catch {
    return undefined;
  }
}

/** Decode an ABI uint256 word, or `undefined` when the reply is malformed. */
function decodeBlockNumber(value: unknown): bigint | undefined {
  if (typeof value !== 'string' || !/^0x[0-9a-f]{64}$/i.test(value)) return undefined;
  return BigInt(value);
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
  const matchesChain = chainIdEquals(chainId, expectedChainId);
  if (matchesChain === undefined) return 'inconclusive';
  if (!matchesChain) return 'disconnected';

  // The versioned marker lives on mainnet; for any other configured chain we cannot use it.
  if (BigInt(expectedChainId) !== BigInt(PHYLAX_ROUTING_SIGNAL_V2.chainId)) {
    return 'inconclusive';
  }

  try {
    const result = await request(provider, 'eth_call', [
      {
        to: PHYLAX_ROUTING_SIGNAL_V2.registry,
        data: PHYLAX_ROUTING_SIGNAL_V2.callData,
      },
      'latest',
      null,
      { number: PHYLAX_ROUTING_SIGNAL_V2.blockNumber },
    ]);
    const decoded = decodeBlockNumber(result);
    if (decoded === undefined) return 'inconclusive';
    return decoded === BigInt(PHYLAX_ROUTING_SIGNAL_V2.blockNumber) ? 'connected' : 'disconnected';
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
