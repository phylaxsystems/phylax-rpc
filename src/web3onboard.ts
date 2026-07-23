import { toHexChainId } from './hex';
import type {
  ResolvedPhylaxRpcConfig,
  ToWeb3OnboardChainOptions,
  Web3OnboardChain,
} from './types';

export type { ToWeb3OnboardChainOptions, Web3OnboardChain } from './types';

/**
 * Build a web3-onboard chain config that wires the Phylax RPC into `protectedRpcUrl`,
 * the field web3-onboard uses to route transaction submission while reads stay on a
 * public endpoint.
 */
export function toWeb3OnboardChain(
  config: ResolvedPhylaxRpcConfig,
  options: ToWeb3OnboardChainOptions = {},
): Web3OnboardChain {
  return {
    id: toHexChainId(config.chainId),
    token: config.nativeCurrency.symbol,
    label: config.chainName,
    rpcUrl: options.publicRpcUrl ?? config.rpcUrl,
    protectedRpcUrl: config.rpcUrl,
    ...options.extra,
  };
}
