export {
  DEFAULT_CHAIN_NAME,
  DEFAULT_CREDIBLE_REVERT_MATCH,
  DEFAULT_DISCOVERY_TIMEOUT,
  DEFAULT_NATIVE_CURRENCY,
  ERROR_STRING_SELECTOR,
  MAINNET_CHAIN_ID,
  PANIC_SELECTOR,
  WALLET_RDNS,
} from './constants';

export { decodeErrorString, isErrorStringRevert } from './abi';
export { getSelector, hexToUtf8, normalizeHex, toHexChainId, toHexQuantity } from './hex';
export {
  collectHexStrings,
  extractRevertData,
  isUserRejection,
  request,
} from './eip1193';

export {
  buildPreflightParams,
  detectOffPhylax,
  normalizeTransaction,
  type DetectOptions,
  type PreflightMethod,
} from './detect';

export {
  classifyDetail,
  classifyWallet,
  discoverProviders,
  supportsAssistedSwitch,
  type ClassifyInput,
  type DiscoverOptions,
  type DiscoveryTarget,
} from './wallets';

export { attemptSwitch, type SwitchOptions } from './switch';

export {
  buildAddChainParams,
  manualInstructions,
  resolveConfig,
  type AddEthereumChainParameter,
} from './config';

export {
  toWeb3OnboardChain,
  type ToWeb3OnboardChainOptions,
  type Web3OnboardChain,
} from './web3onboard';

export {
  PhylaxRpcSwitch,
  type DetectArgs,
  type SwitchArgs,
} from './client';

export type {
  CredibleRevertMatch,
  DetectionResult,
  DetectionStatus,
  Eip1193Provider,
  Eip1193RequestArgs,
  Eip6963ProviderDetail,
  Eip6963ProviderInfo,
  LooseTransactionRequest,
  ManualInstructions,
  NativeCurrency,
  Numeric,
  PhylaxRpcConfig,
  ResolvedPhylaxRpcConfig,
  SwitchOutcome,
  SwitchResult,
  TransactionRequest,
  WalletClassification,
  WalletId,
  WalletPlatform,
} from './types';
