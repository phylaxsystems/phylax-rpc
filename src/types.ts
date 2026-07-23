/**
 * Canonical type surface for the SDK. Every public type lives here so the release API is
 * described in one place; runtime guards/constructors for the branded primitives are in
 * {@link ./brands}.
 */

// ---------------------------------------------------------------------------
// Branded domain primitives
// ---------------------------------------------------------------------------

declare const brand: unique symbol;
type Branded<T, B extends string> = T & { readonly [brand]: B };

/** A 20-byte `0x` account/contract address. */
export type Address = Branded<string, 'Address'>;
/** Arbitrary `0x`-prefixed, whole-byte hex data. */
export type Hex = Branded<string, 'Hex'>;
/** A canonical hex QUANTITY (`0x0`, or no leading zeros) per the JSON-RPC spec. */
export type HexQuantity = Branded<string, 'HexQuantity'>;
/** A non-negative safe-integer EVM chain id. */
export type ChainId = Branded<number, 'ChainId'>;
/** A validated `http(s)` RPC endpoint. */
export type RpcUrl = Branded<string, 'RpcUrl'>;
/** An EIP-6963 reverse-DNS wallet identifier. */
export type WalletRdns = Branded<string, 'WalletRdns'>;
/** An EIP-6963 provider UUID. */
export type Uuid = Branded<string, 'UUID'>;
/** A non-negative duration in milliseconds. */
export type Milliseconds = Branded<number, 'Milliseconds'>;

// ---------------------------------------------------------------------------
// JSON-RPC method names
// ---------------------------------------------------------------------------

/** The subset of JSON-RPC / wallet methods this library issues. */
export type RpcMethod =
  | 'eth_accounts'
  | 'eth_requestAccounts'
  | 'eth_chainId'
  | 'eth_call'
  | 'eth_estimateGas'
  | 'wallet_addEthereumChain'
  | 'wallet_switchEthereumChain';

/** Preflight method used by the off-Phylax detection probe. */
export type PreflightMethod = 'eth_estimateGas' | 'eth_call';

// ---------------------------------------------------------------------------
// EIP-1193 / EIP-6963
// ---------------------------------------------------------------------------

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
  readonly uuid: Uuid;
  readonly name: string;
  readonly icon: string;
  readonly rdns: WalletRdns;
}

/** EIP-6963 announced provider detail. */
export interface Eip6963ProviderDetail {
  readonly info: Eip6963ProviderInfo;
  readonly provider: Eip1193Provider;
}

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface NativeCurrency {
  readonly name: string;
  readonly symbol: string;
  readonly decimals: number;
}

/** Predicate over the decoded `Error(string)` reason. */
export type CredibleRevertMatch = RegExp | ((reason: string) => boolean);

export interface PhylaxRpcConfig {
  /** The Phylax RPC endpoint to route protected transactions through. */
  readonly rpcUrl: string;
  /** Chain id served by the Phylax RPC. Defaults to mainnet (`1`). */
  readonly chainId?: number;
  /** Human-readable network name used in `wallet_addEthereumChain` and manual instructions. */
  readonly chainName?: string;
  readonly nativeCurrency?: NativeCurrency;
  readonly blockExplorerUrls?: readonly string[];
  /**
   * How to recognise the credible-require revert once `Error(string)` is decoded.
   * Defaults to {@link DEFAULT_CREDIBLE_REVERT_MATCH}. Pin this to the exact message
   * your Credible deployment reverts with to avoid matching unrelated reverts.
   */
  readonly credibleRevertMatch?: CredibleRevertMatch;
}

/** Config with all defaults applied and every field validated/branded. */
export interface ResolvedPhylaxRpcConfig {
  readonly rpcUrl: RpcUrl;
  readonly chainId: ChainId;
  readonly chainName: string;
  readonly nativeCurrency: NativeCurrency;
  readonly blockExplorerUrls?: readonly string[];
  readonly credibleRevertMatch: CredibleRevertMatch;
}

/** EIP-3085 `wallet_addEthereumChain` parameter object for the Phylax RPC. */
export interface AddEthereumChainParameter {
  readonly chainId: HexQuantity;
  readonly chainName: string;
  readonly nativeCurrency: NativeCurrency;
  readonly rpcUrls: readonly string[];
  readonly blockExplorerUrls?: readonly string[];
}

/** Copy-paste fields for the manual-add modal (MetaMask ext / Rabby / Rainbow / Coinbase). */
export interface ManualInstructions {
  readonly networkName: string;
  readonly rpcUrl: RpcUrl;
  readonly chainId: ChainId;
  readonly chainIdHex: HexQuantity;
  readonly currencySymbol: string;
  readonly blockExplorerUrl?: string;
}

// ---------------------------------------------------------------------------
// Wallet classification
// ---------------------------------------------------------------------------

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
  readonly id: WalletId;
  readonly rdns?: WalletRdns;
  readonly name?: string;
  readonly platform: WalletPlatform;
  /**
   * Whether the assisted EIP `add + switch` path is known (from wallet source) to
   * actually activate the submitted RPC. Only `true` for the Zerion extension and
   * the MetaMask Mobile in-app provider; everything else must use the manual path.
   */
  readonly assistedSwitch: boolean;
}

// ---------------------------------------------------------------------------
// Detection result (discriminated union)
// ---------------------------------------------------------------------------

export type DetectionStatus = DetectionResult['status'];

/**
 * Outcome of the off-Phylax preflight probe. A discriminated union on `status`, so each
 * state carries exactly the fields it can have — no contradictory combinations.
 */
export type DetectionResult =
  /** Preflight succeeded → routed through Phylax (or the tx is not credible-protected). */
  | Readonly<{ status: 'on-phylax'; offPhylax: false }>
  /** Credible-require recognised in the revert → user is off Phylax, offer the switch. */
  | Readonly<{
      status: 'off-phylax';
      offPhylax: true;
      revertReason: string;
      revertData: Hex;
      error: unknown;
    }>
  /** Preflight reverted with decodable data for a non-credible reason → genuine tx error. */
  | Readonly<{
      status: 'reverted';
      offPhylax: false;
      /** Decoded `Error(string)` reason, when the revert used that selector. */
      revertReason?: string;
      revertData: Hex;
      error: unknown;
    }>
  /** No decodable revert data (network error, opaque shape). Cannot conclude. */
  | Readonly<{ status: 'inconclusive'; offPhylax: false; error: unknown }>;

// ---------------------------------------------------------------------------
// Switch result (discriminated union)
// ---------------------------------------------------------------------------

export type SwitchOutcome = SwitchResult['outcome'];

/**
 * Outcome of the assisted RPC switch. A discriminated union on `outcome`; `manualFallback`
 * and the add/switch progress flags are common to every state.
 */
export type SwitchResult = Readonly<
  { added: boolean; switched: boolean; manualFallback: boolean } & (
    | {
        /** Already routed through Phylax, or activation confirmed after switching. */
        outcome: 'activated';
        /** Verification probe result, when a compatibility probe confirmed the transition. */
        verification?: DetectionResult;
      }
    | {
        /** Add/switch ran but activation could not be confirmed. */
        outcome: 'unverified';
        verification?: DetectionResult;
        /** Underlying cause when a non-rejection error blocked confirmation. */
        error?: unknown;
      }
    | {
        /** User rejected the add or switch request. */
        outcome: 'rejected';
        error: unknown;
      }
    | {
        /** Wallet is not on the assisted allowlist — use the manual-add modal. */
        outcome: 'unsupported';
      }
    | {
        /** Unexpected failure during add/switch. */
        outcome: 'failed';
        error: unknown;
      }
  )
>;

// ---------------------------------------------------------------------------
// web3-onboard
// ---------------------------------------------------------------------------

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
  readonly publicRpcUrl?: string;
  /** Extra fields merged onto the chain config. */
  readonly extra?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Operation inputs
// ---------------------------------------------------------------------------

export interface DetectOptions {
  readonly provider: Eip1193Provider;
  readonly transaction: LooseTransactionRequest;
  readonly config: ResolvedPhylaxRpcConfig;
  /** Preflight method. Defaults to `eth_estimateGas`. */
  readonly method?: PreflightMethod;
  /**
   * The sender to preflight as, when the transaction omits `from`. If neither this nor
   * `transaction.from` is set, the provider is queried with `eth_accounts` (silent — no
   * wallet popup). An `eth_requestAccounts` prompt is never triggered from here.
   */
  readonly account?: string;
}

export interface SwitchOptions {
  readonly provider: Eip1193Provider;
  readonly wallet: WalletClassification;
  readonly config: ResolvedPhylaxRpcConfig;
  /**
   * Optional protected transaction used as a compatibility verification probe for older
   * Phylax RPC deployments that do not expose the versioned routing signal. Only confirms
   * activation when it reverts off-Phylax *before* the switch and passes *after* — see
   * {@link attemptSwitch}.
   */
  readonly verifyTransaction?: LooseTransactionRequest;
  /** Sender for the compatibility probe when `verifyTransaction` omits `from`. */
  readonly account?: string;
  /** Run the assisted path even when the wallet is not on the allowlist (testing/advanced). */
  readonly force?: boolean;
}

/** {@link DetectOptions} without `config` — the config is bound by the client/hook. */
export interface DetectArgs {
  readonly provider: Eip1193Provider;
  readonly transaction: LooseTransactionRequest;
  readonly method?: PreflightMethod;
  readonly account?: string;
}

/** {@link SwitchOptions} without `config` — the config is bound by the client/hook. */
export interface SwitchArgs {
  readonly provider: Eip1193Provider;
  readonly wallet: WalletClassification;
  readonly verifyTransaction?: LooseTransactionRequest;
  readonly account?: string;
  readonly force?: boolean;
}

/** Event-target surface used for EIP-6963 discovery (defaults to `window`). */
export interface DiscoveryTarget {
  addEventListener(type: string, listener: (event: Event) => void): void;
  removeEventListener(type: string, listener: (event: Event) => void): void;
  dispatchEvent(event: Event): boolean;
}

export interface DiscoverOptions {
  /** How long to listen for announcements, in ms. */
  readonly timeout?: number;
  /** Event target to use. Defaults to `globalThis.window`. */
  readonly target?: DiscoveryTarget;
}

export interface ClassifyInput {
  /** A single `rdns`, or wagmi's `readonly string[]` — the first entry is used. */
  readonly rdns?: string | readonly string[];
  readonly name?: string;
  readonly provider?: Eip1193Provider;
  /** Defaults to `navigator.userAgent` when available. */
  readonly userAgent?: string;
  /** Override the heuristic platform detection when the host already knows it. */
  readonly platform?: WalletPlatform;
}

// ---------------------------------------------------------------------------
// Framework adapters
// ---------------------------------------------------------------------------

/**
 * Structural mirror of a wagmi connector — the fields this bridge reads. Defined here (not
 * imported from `wagmi`) so the adapter has zero runtime dependency and consumers who don't
 * use wagmi never need it installed.
 */
export interface ConnectorLike {
  readonly id?: string;
  readonly name?: string;
  /**
   * Present on EIP-6963-backed connectors; the most reliable classification key. wagmi
   * types this as `string | readonly string[]`, matched directly here.
   */
  readonly rdns?: string | readonly string[];
  getProvider(parameters?: { chainId?: number }): Promise<unknown>;
}

/** The relevant shape of wagmi's `useAccount()` result. */
export interface ConnectedAccountLike {
  readonly address?: string;
  readonly connector?: ConnectorLike;
}

export interface ConnectedWallet {
  /** The connected wallet's EIP-1193 provider — pass this to `detect`/`switch`. */
  readonly provider: Eip1193Provider;
  /** Classification resolved from the connector's `rdns`/`name` and provider flags. */
  readonly wallet: WalletClassification;
  /** The connected account address, when known. */
  readonly account?: string;
}

/** Structural mirror of a viem client's `request` entrypoint. */
export interface RequestFnClient {
  request(args: { method: string; params?: unknown }): Promise<unknown>;
}

/** Structural mirror of an ethers v6 `BrowserProvider`'s `send` method. */
export interface SendProvider {
  send(method: string, params: unknown[]): Promise<unknown>;
}
