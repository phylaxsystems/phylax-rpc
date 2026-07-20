import { request } from './eip1193';
import type { Eip1193Provider } from './types';

/**
 * Version 1 of the Phylax routing signal.
 *
 * The sentinel is outside Ethereum's reachable block range. A Phylax-aware RPC applies
 * its credible-marker override for that block before executing the registry read, while
 * an ordinary RPC reads the unchanged `false` value from the registry.
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

function isMainnetChainId(chainId: unknown): boolean {
  if (typeof chainId !== 'string' && typeof chainId !== 'number' && typeof chainId !== 'bigint') {
    return false;
  }
  try {
    return BigInt(chainId) === BigInt(PHYLAX_ROUTING_SIGNAL_V1.chainId);
  } catch {
    return false;
  }
}

function isEncodedTrue(value: unknown): boolean {
  return typeof value === 'string' && /^0x0*1$/i.test(value);
}

/**
 * Silently check whether a wallet-backed EIP-1193 provider is routing through Phylax.
 *
 * No account access, signature, or transaction is requested. Failures and unsupported
 * providers resolve to `false`, which keeps onboarding fail-closed.
 */
export async function isConnectedToPhylax(provider: Eip1193Provider): Promise<boolean> {
  try {
    const chainId = await request<unknown>(provider, 'eth_chainId');
    if (!isMainnetChainId(chainId)) return false;

    const result = await request<unknown>(provider, 'eth_call', [
      {
        to: PHYLAX_ROUTING_SIGNAL_V1.registry,
        data: PHYLAX_ROUTING_SIGNAL_V1.callData,
      },
      'latest',
      null,
      { number: PHYLAX_ROUTING_SIGNAL_V1.blockNumber },
    ]);

    return isEncodedTrue(result);
  } catch {
    return false;
  }
}
