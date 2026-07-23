import { asChainId, asRpcUrl } from './brands';
import {
  DEFAULT_CHAIN_NAME,
  DEFAULT_CREDIBLE_REVERT_MATCH,
  DEFAULT_NATIVE_CURRENCY,
  MAINNET_CHAIN_ID,
} from './constants';
import { toHexChainId } from './hex';
import type {
  AddEthereumChainParameter,
  ManualInstructions,
  NativeCurrency,
  PhylaxRpcConfig,
  ResolvedPhylaxRpcConfig,
} from './types';

/** Apply defaults and validate a {@link PhylaxRpcConfig}. */
export function resolveConfig(config: PhylaxRpcConfig): ResolvedPhylaxRpcConfig {
  if (config == null || typeof config !== 'object') {
    throw new TypeError('PhylaxRpcConfig is required');
  }
  const rpcUrl = asRpcUrl(config.rpcUrl);
  const chainId = asChainId(config.chainId ?? MAINNET_CHAIN_ID);
  const nativeCurrency = validateNativeCurrency(
    config.nativeCurrency ?? DEFAULT_NATIVE_CURRENCY,
  );
  return {
    rpcUrl,
    chainId,
    chainName: config.chainName ?? DEFAULT_CHAIN_NAME,
    nativeCurrency,
    blockExplorerUrls: config.blockExplorerUrls,
    credibleRevertMatch: config.credibleRevertMatch ?? DEFAULT_CREDIBLE_REVERT_MATCH,
  };
}

function validateNativeCurrency(currency: NativeCurrency): NativeCurrency {
  const { name, symbol, decimals } = currency;
  if (typeof name !== 'string' || name.length === 0) {
    throw new TypeError('nativeCurrency.name is required');
  }
  if (typeof symbol !== 'string' || symbol.length === 0) {
    throw new TypeError('nativeCurrency.symbol is required');
  }
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) {
    throw new TypeError(`nativeCurrency.decimals must be an integer in [0, 36], got ${decimals}`);
  }
  return { name, symbol, decimals };
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
