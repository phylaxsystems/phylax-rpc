export {
  DEFAULT_CHAIN_NAME,
  DEFAULT_CREDIBLE_REVERT_MATCH,
  DEFAULT_DISCOVERY_TIMEOUT,
  DEFAULT_NATIVE_CURRENCY,
  MAINNET_CHAIN_ID,
  WALLET_RDNS,
} from './constants';

export { isConnectedToPhylax, PHYLAX_ROUTING_SIGNAL_V1 } from './connection';

export { detectOffPhylax } from './detect';

export {
  classifyDetail,
  classifyWallet,
  discoverProviders,
  supportsAssistedSwitch,
} from './wallets';

export { attemptSwitch } from './switch';

export { toWeb3OnboardChain } from './web3onboard';

export { PhylaxRpcSwitch } from './client';

export type {
  Address,
  AddEthereumChainParameter,
  ChainId,
  ClassifyInput,
  ConnectedAccountLike,
  ConnectedWallet,
  ConnectorLike,
  CredibleRevertMatch,
  DetectArgs,
  DetectOptions,
  DetectionResult,
  DetectionStatus,
  DiscoverOptions,
  DiscoveryTarget,
  Eip1193Provider,
  Eip1193RequestArgs,
  Eip6963ProviderDetail,
  Eip6963ProviderInfo,
  Hex,
  HexQuantity,
  LooseTransactionRequest,
  ManualInstructions,
  Milliseconds,
  NativeCurrency,
  Numeric,
  PhylaxRpcConfig,
  PreflightMethod,
  RequestFnClient,
  ResolvedPhylaxRpcConfig,
  RpcMethod,
  RpcUrl,
  SendProvider,
  SwitchArgs,
  SwitchOptions,
  SwitchOutcome,
  SwitchResult,
  ToWeb3OnboardChainOptions,
  TransactionRequest,
  Uuid,
  WalletClassification,
  WalletId,
  WalletPlatform,
  WalletRdns,
  Web3OnboardChain,
} from './types';
