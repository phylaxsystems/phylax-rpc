import { classifyWallet, isEip1193Provider } from './wallets';
import type { ConnectedAccountLike, ConnectedWallet } from './types';

export type { ConnectorLike, ConnectedAccountLike, ConnectedWallet } from './types';

/**
 * Resolve the **connected** wallet's provider and classification from a wagmi-style
 * account object — the bridge that `discoverProviders()` (EIP-6963) cannot provide for
 * WalletConnect / Coinbase / embedded connectors, whose provider only exists via
 * `connector.getProvider()`.
 *
 * ```ts
 * import { useAccount } from 'wagmi';
 * import { connectedWallet } from '@phylax-systems/phylax-rpc/wagmi';
 *
 * const account = useAccount();
 * const connected = await connectedWallet(account);
 * if (connected) {
 *   await phylax.detect({ provider: connected.provider, transaction });
 * }
 * ```
 *
 * Returns `null` when no connector is present (wallet not connected) or the connector
 * yields something that is not a usable EIP-1193 provider.
 */
export async function connectedWallet(
  account: ConnectedAccountLike,
  userAgent?: string,
): Promise<ConnectedWallet | null> {
  if (!account.connector) return null;
  const provider = await account.connector.getProvider();
  if (!isEip1193Provider(provider)) return null;

  const wallet = classifyWallet({
    rdns: account.connector.rdns,
    name: account.connector.name,
    provider,
    userAgent,
  });

  return { provider, wallet, account: account.address };
}
