import {
  DEFAULT_CHAIN_NAME,
  DEFAULT_CREDIBLE_REVERT_MATCH,
  DEFAULT_NATIVE_CURRENCY,
  MAINNET_CHAIN_ID,
} from './constants';
import { toHexChainId } from './hex';
import type {
  ManualInstructions,
  PhylaxRpcConfig,
  ResolvedPhylaxRpcConfig,
} from './types';

/** Apply defaults and validate a {@link PhylaxRpcConfig}. */
export function resolveConfig(config: PhylaxRpcConfig): ResolvedPhylaxRpcConfig {
  if (!config || typeof config.rpcUrl !== 'string' || config.rpcUrl.length === 0) {
    throw new Error('PhylaxRpcConfig.rpcUrl is required');
  }
  return {
    rpcUrl: config.rpcUrl,
    chainId: config.chainId ?? MAINNET_CHAIN_ID,
    chainName: config.chainName ?? DEFAULT_CHAIN_NAME,
    nativeCurrency: config.nativeCurrency ?? { ...DEFAULT_NATIVE_CURRENCY },
    blockExplorerUrls: config.blockExplorerUrls,
    credibleRevertMatch: config.credibleRevertMatch ?? DEFAULT_CREDIBLE_REVERT_MATCH,
  };
}

/** EIP-3085 `wallet_addEthereumChain` parameter object for the Phylax RPC. */
export interface AddEthereumChainParameter {
  chainId: string;
  chainName: string;
  nativeCurrency: { name: string; symbol: string; decimals: number };
  rpcUrls: string[];
  blockExplorerUrls?: string[];
}

export function buildAddChainParams(
  config: ResolvedPhylaxRpcConfig,
): AddEthereumChainParameter {
  return {
    chainId: toHexChainId(config.chainId),
    chainName: config.chainName,
    nativeCurrency: config.nativeCurrency,
    rpcUrls: [config.rpcUrl],
    ...(config.blockExplorerUrls
      ? { blockExplorerUrls: config.blockExplorerUrls }
      : {}),
  };
}

/** Copy-paste fields for a manual-add modal. */
export function manualInstructions(
  config: ResolvedPhylaxRpcConfig,
): ManualInstructions {
  return {
    networkName: config.chainName,
    rpcUrl: config.rpcUrl,
    chainId: config.chainId,
    chainIdHex: toHexChainId(config.chainId),
    currencySymbol: config.nativeCurrency.symbol,
    blockExplorerUrl: config.blockExplorerUrls?.[0],
  };
}
