/** Minimal EIP-1193 request shape. */
export interface Eip1193RequestArgs {
  method: string;
  params?: unknown[] | Record<string, unknown>;
}

/** Minimal EIP-1193 provider — the surface this library actually uses. */
export interface Eip1193Provider {
  request(args: Eip1193RequestArgs): Promise<unknown>;
  on?(event: string, listener: (...args: unknown[]) => void): void;
  removeListener?(event: string, listener: (...args: unknown[]) => void): void;
  /** Common wallet-identity flags, used as a fallback when EIP-6963 `rdns` is absent. */
  isMetaMask?: boolean;
  isRabby?: boolean;
  isZerion?: boolean;
  isRainbow?: boolean;
  isCoinbaseWallet?: boolean;
  isWalletConnect?: boolean;
  [key: string]: unknown;
}

/** EIP-6963 provider info. */
export interface Eip6963ProviderInfo {
  uuid: string;
  name: string;
  icon: string;
  rdns: string;
}

/** EIP-6963 announced provider detail. */
export interface Eip6963ProviderDetail {
  info: Eip6963ProviderInfo;
  provider: Eip1193Provider;
}

/**
 * Transaction request used for the preflight probe.
 *
 * Note: any `gas`/`gasLimit` field is stripped before the preflight call — if a
 * gas limit is supplied, most wallets skip `eth_estimateGas` and the credible
 * signal never surfaces pre-signing.
 */
export interface TransactionRequest {
  from: string;
  to?: string;
  data?: string;
  value?: string;
  gas?: string;
  gasLimit?: string;
  gasPrice?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  nonce?: string;
  [key: string]: unknown;
}

/**
 * A numeric tx field as it arrives from real-world tooling: a hex string, a decimal
 * string, a `number`, a `bigint` (viem), or an ethers `BigNumber` (duck-typed via
 * `toHexString()`). Normalized to a hex quantity by {@link normalizeTransaction}.
 */
export type Numeric = string | number | bigint | { toHexString(): string };

/**
 * Loose superset of {@link TransactionRequest} accepted at the public boundary.
 *
 * `from` is optional (auto-resolved via `eth_accounts` when absent) and the numeric
 * fields accept any {@link Numeric} form, so a tx object straight out of viem/ethers/wagmi
 * can be passed without hand-conversion. Coerced internally before the preflight call.
 *
 * Every field also accepts `null`: viem types `to` as `\`0x${string}\` | null` and ethers
 * v6 types `to`/`from`/`value`/`data` as `… | null`, so a framework-typed tx assigns here
 * without a cast or spread. A `null` field is treated as absent and dropped before the
 * preflight (see {@link normalizeTransaction}).
 *
 * Deliberately has no `[key: string]` index signature: an index signature would block a
 * plain `interface`-typed tx (e.g. a Safe `MetaTransactionData`, an ethers
 * `ContractTransaction`) from assigning, since named interfaces get no implicit index
 * signature. Extra fields a caller includes (`type`, `chainId`, `accessList`, …) are still
 * forwarded at runtime — {@link normalizeTransaction} iterates own-enumerable keys — and a
 * tx held in a variable assigns regardless of extra properties; only a fresh object literal
 * with an undeclared key would be flagged, in which case spread it.
 */
export interface LooseTransactionRequest {
  from?: string | null;
  to?: string | null;
  data?: string | null;
  value?: Numeric | null;
  gas?: Numeric | null;
  gasLimit?: Numeric | null;
  gasPrice?: Numeric | null;
  maxFeePerGas?: Numeric | null;
  maxPriorityFeePerGas?: Numeric | null;
  nonce?: Numeric | null;
}

export interface NativeCurrency {
  name: string;
  symbol: string;
  decimals: number;
}

/** Predicate over the decoded `Error(string)` reason. */
export type CredibleRevertMatch = RegExp | ((reason: string) => boolean);

export interface PhylaxRpcConfig {
  /** The Phylax RPC endpoint to route protected transactions through. */
  rpcUrl: string;
  /** Chain id served by the Phylax RPC. Defaults to mainnet (`1`). */
  chainId?: number;
  /** Human-readable network name used in `wallet_addEthereumChain` and manual instructions. */
  chainName?: string;
  nativeCurrency?: NativeCurrency;
  blockExplorerUrls?: string[];
  /**
   * How to recognise the credible-require revert once `Error(string)` is decoded.
   * Defaults to {@link DEFAULT_CREDIBLE_REVERT_MATCH}. Pin this to the exact message
   * your Credible deployment reverts with to avoid matching unrelated reverts.
   */
  credibleRevertMatch?: CredibleRevertMatch;
}

/** Config with all defaults applied. */
export interface ResolvedPhylaxRpcConfig {
  rpcUrl: string;
  chainId: number;
  chainName: string;
  nativeCurrency: NativeCurrency;
  blockExplorerUrls?: string[];
  credibleRevertMatch: CredibleRevertMatch;
}

export type WalletId =
  | 'metamask'
  | 'zerion'
  | 'rabby'
  | 'rainbow'
  | 'coinbase'
  | 'walletconnect'
  | 'unknown';

export type WalletPlatform = 'extension' | 'mobile-in-app' | 'unknown';

export interface WalletClassification {
  id: WalletId;
  rdns?: string;
  name?: string;
  platform: WalletPlatform;
  /**
   * Whether the assisted EIP `add + switch` path is known (from wallet source) to
   * actually activate the submitted RPC. Only `true` for the Zerion extension and
   * the MetaMask Mobile in-app provider; everything else must use the manual path.
   */
  assistedSwitch: boolean;
}

export type DetectionStatus =
  /** Credible-require recognised in the preflight revert → user is off Phylax, offer the switch. */
  | 'off-phylax'
  /** Preflight succeeded → routed through Phylax (or the tx is not credible-protected). */
  | 'on-phylax'
  /** Preflight reverted for a non-credible reason → a genuine tx error, not a routing problem. */
  | 'reverted'
  /** No decodable signal (network error, unknown error shape). Cannot conclude. */
  | 'inconclusive';

export interface DetectionResult {
  status: DetectionStatus;
  /** Convenience: `status === 'off-phylax'`. */
  offPhylax: boolean;
  /** Decoded `Error(string)` reason, when a revert with that selector was seen. */
  revertReason?: string;
  /** Raw revert `data` hex, when extractable. */
  revertData?: string;
  /** The raw error thrown by the provider, if any. */
  error?: unknown;
}

export type SwitchOutcome =
  /** The wallet was already routed through Phylax, or activation was confirmed after switching. */
  | 'activated'
  /** Add/switch ran but activation could not be confirmed (wallet may have ignored the URL). */
  | 'unverified'
  /** User rejected the add or switch request. */
  | 'rejected'
  /** Wallet is not on the assisted allowlist — use the manual-add modal. */
  | 'unsupported'
  /** Unexpected failure during add/switch. */
  | 'failed';

export interface SwitchResult {
  outcome: SwitchOutcome;
  added: boolean;
  switched: boolean;
  /** Result of the compatibility transaction probe, when one was needed and supplied. */
  verification?: DetectionResult;
  /** `true` when the caller should fall back to the manual-add modal. */
  manualFallback: boolean;
  error?: unknown;
}

/** Copy-paste fields for the manual-add modal (the dominant path on MetaMask ext / Rabby / Rainbow / Coinbase). */
export interface ManualInstructions {
  networkName: string;
  rpcUrl: string;
  chainId: number;
  chainIdHex: string;
  currencySymbol: string;
  blockExplorerUrl?: string;
}
