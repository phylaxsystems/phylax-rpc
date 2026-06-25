import { toHexChainId } from './hex';
import type { ResolvedPhylaxRpcConfig } from './types';

/** Subset of a Blocknative web3-onboard `Chain` config relevant to Phylax routing. */
export interface Web3OnboardChain {
  id: string;
  token: string;
  label: string;
  rpcUrl: string;
  /** web3-onboard's purpose-built field for a protected submission endpoint. */
  protectedRpcUrl: string;
  [key: string]: unknown;
}

export interface ToWeb3OnboardChainOptions {
  /**
   * The public RPC web3-onboard uses for reads. Defaults to the Phylax RPC, but you can
   * point reads at a separate public endpoint and keep Phylax as `protectedRpcUrl` only.
   */
  publicRpcUrl?: string;
  /** Extra fields merged onto the chain config. */
  extra?: Record<string, unknown>;
}

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
