/**
 * Selector for Solidity's `Error(string)` (`keccak256("Error(string)")[:4]`).
 *
 * The credible-builder require reverts with `Error(string)`; the SDK recognises
 * the off-Phylax signal by this `data` selector, never by the numeric JSON-RPC
 * error code (`3` / `-32000` / `-32603` / `-32015` all appear depending on the
 * provider or gateway, so the code is not load-bearing).
 */
export const ERROR_STRING_SELECTOR = '0x08c379a0';

/** Selector for Solidity's `Panic(uint256)` — used only to *exclude* `assert`/panic reverts. */
export const PANIC_SELECTOR = '0x4e487b71';

/** Ethereum mainnet. The Phylax RPC serves chainId 1, which is why the duplicate-network wall exists. */
export const MAINNET_CHAIN_ID = 1;

/**
 * Known EIP-6963 `rdns` identifiers for the wallets the spike investigated.
 * Used to branch detection/switch logic per-wallet.
 */
export const WALLET_RDNS = {
  metamask: 'io.metamask',
  zerion: 'io.zerion.wallet',
  rabby: 'io.rabby',
  rainbow: 'me.rainbow',
  coinbase: 'com.coinbase.wallet',
  walletconnect: 'com.walletconnect',
} as const;

export const DEFAULT_NATIVE_CURRENCY = {
  name: 'Ether',
  symbol: 'ETH',
  decimals: 18,
} as const;

export const DEFAULT_CHAIN_NAME = 'Ethereum (Phylax)';

/**
 * Default matcher for the credible-require revert string after decoding `Error(string)`.
 * Matches the canonical `assertion failed` message and anything mentioning "credible"
 * or "phylax". Override via {@link PhylaxRpcConfig.credibleRevertMatch} to pin the exact
 * message emitted by your Credible deployment.
 */
export const DEFAULT_CREDIBLE_REVERT_MATCH = /assertion failed|credible|phylax/i;

/** How long {@link discoverProviders} listens for EIP-6963 announcements, in ms. */
export const DEFAULT_DISCOVERY_TIMEOUT = 300;
