import { classifyWallet } from './wallets';
import type { Eip1193Provider, WalletClassification } from './types';

/**
 * Structural mirror of a wagmi connector — the fields this bridge reads. Defined locally
 * (not imported from `wagmi`) so the adapter has zero runtime dependency and consumers who
 * don't use wagmi never need it installed or resolvable.
 */
export interface ConnectorLike {
  id?: string;
  name?: string;
  /**
   * Present on EIP-6963-backed connectors; the most reliable classification key. wagmi
   * types this as `string | readonly string[]` (a connector may announce several), so this
   * matches that shape directly — `classifyWallet` reads the first entry of an array.
   */
  rdns?: string | readonly string[];
  getProvider(parameters?: { chainId?: number }): Promise<unknown>;
}

/** The relevant shape of wagmi's `useAccount()` result. */
export interface ConnectedAccountLike {
  address?: string;
  connector?: ConnectorLike;
}

export interface ConnectedWallet {
  /** The connected wallet's EIP-1193 provider — pass this to `detect`/`switch`. */
  provider: Eip1193Provider;
  /** Classification resolved from the connector's `rdns`/`name` and provider flags. */
  wallet: WalletClassification;
  /** The connected account address, when known. */
  account?: string;
}

/**
 * Resolve the **connected** wallet's provider and classification from a wagmi-style
 * account object — the bridge that `discoverProviders()` (EIP-6963) cannot provide for
 * WalletConnect / Coinbase / embedded connectors, whose provider only exists via
 * `connector.getProvider()`.
 *
 * ```ts
 * import { useAccount } from 'wagmi';
 * import { connectedWallet } from 'phylax-rpc/wagmi';
 *
 * const account = useAccount();
 * const connected = await connectedWallet(account);
 * if (connected) {
 *   await phylax.detect({ provider: connected.provider, transaction });
 * }
 * ```
 *
 * Returns `null` when no connector is present (wallet not connected).
 */
export async function connectedWallet(
  account: ConnectedAccountLike,
  userAgent?: string,
): Promise<ConnectedWallet | null> {
  if (!account.connector) return null;
  const provider = (await account.connector.getProvider()) as Eip1193Provider | null;
  if (!provider) return null;

  const wallet = classifyWallet({
    rdns: account.connector.rdns,
    name: account.connector.name,
    provider,
    userAgent,
  });

  return { provider, wallet, account: account.address };
}
