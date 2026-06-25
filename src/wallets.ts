import { DEFAULT_DISCOVERY_TIMEOUT, WALLET_RDNS } from './constants';
import type {
  Eip1193Provider,
  Eip6963ProviderDetail,
  WalletClassification,
  WalletId,
  WalletPlatform,
} from './types';

/** Event-target surface used for EIP-6963 discovery (defaults to `window`). */
export interface DiscoveryTarget {
  addEventListener(type: string, listener: (event: Event) => void): void;
  removeEventListener(type: string, listener: (event: Event) => void): void;
  dispatchEvent(event: Event): boolean;
}

export interface DiscoverOptions {
  /** How long to listen for announcements, in ms. */
  timeout?: number;
  /** Event target to use. Defaults to `globalThis.window`. */
  target?: DiscoveryTarget;
}

/**
 * Discover injected providers via EIP-6963.
 *
 * Dispatches `eip6963:requestProvider`, collects `eip6963:announceProvider` events for
 * `timeout` ms, and de-duplicates by `info.uuid`. Resolves to `[]` outside a browser.
 */
export function discoverProviders(
  options: DiscoverOptions = {},
): Promise<Eip6963ProviderDetail[]> {
  const timeout = options.timeout ?? DEFAULT_DISCOVERY_TIMEOUT;
  const target =
    options.target ??
    (typeof globalThis !== 'undefined'
      ? (globalThis as { window?: DiscoveryTarget }).window
      : undefined);

  return new Promise((resolve) => {
    if (!target) {
      resolve([]);
      return;
    }

    const found = new Map<string, Eip6963ProviderDetail>();
    const onAnnounce = (event: Event): void => {
      const detail = (event as CustomEvent<Eip6963ProviderDetail>).detail;
      if (detail?.info?.uuid) found.set(detail.info.uuid, detail);
    };

    target.addEventListener('eip6963:announceProvider', onAnnounce);
    target.dispatchEvent(new Event('eip6963:requestProvider'));

    setTimeout(() => {
      target.removeEventListener('eip6963:announceProvider', onAnnounce);
      resolve([...found.values()]);
    }, timeout);
  });
}

const RDNS_TO_ID: Record<string, WalletId> = {
  [WALLET_RDNS.metamask]: 'metamask',
  [WALLET_RDNS.zerion]: 'zerion',
  [WALLET_RDNS.rabby]: 'rabby',
  [WALLET_RDNS.rainbow]: 'rainbow',
  [WALLET_RDNS.coinbase]: 'coinbase',
  [WALLET_RDNS.walletconnect]: 'walletconnect',
};

function idFromProviderFlags(provider?: Eip1193Provider): WalletId {
  if (!provider) return 'unknown';
  // Order matters: Rabby and others also set `isMetaMask`, so check specifics first.
  if (provider.isRabby) return 'rabby';
  if (provider.isZerion) return 'zerion';
  if (provider.isRainbow) return 'rainbow';
  if (provider.isCoinbaseWallet) return 'coinbase';
  if (provider.isWalletConnect) return 'walletconnect';
  if (provider.isMetaMask) return 'metamask';
  return 'unknown';
}

function detectPlatform(
  id: WalletId,
  userAgent: string,
  hasEip6963: boolean,
): WalletPlatform {
  const isMobileUa = /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent);

  switch (id) {
    case 'metamask':
      // MetaMask Mobile's in-app browser tags its UA; the desktop extension does not.
      if (/MetaMaskMobile/i.test(userAgent)) return 'mobile-in-app';
      return isMobileUa ? 'unknown' : 'extension';
    case 'zerion':
      if (/Zerion/i.test(userAgent)) return 'mobile-in-app';
      return isMobileUa ? 'unknown' : 'extension';
    case 'coinbase':
      if (/CoinbaseWallet/i.test(userAgent)) return 'mobile-in-app';
      return isMobileUa ? 'unknown' : 'extension';
    case 'walletconnect':
      // WalletConnect is a relay, not an injected/in-app provider.
      return 'unknown';
    default:
      if (isMobileUa) return 'unknown';
      return hasEip6963 ? 'extension' : 'unknown';
  }
}

/**
 * Whether the assisted EIP add+switch path is known to actually activate the submitted
 * RPC for this (wallet, platform). Per the spike's source review, only:
 *   - Zerion **extension**
 *   - MetaMask **Mobile in-app** provider
 *
 * Everywhere else the add/switch is a silent no-op and the manual path must be used.
 */
export function supportsAssistedSwitch(id: WalletId, platform: WalletPlatform): boolean {
  return (
    (id === 'zerion' && platform === 'extension') ||
    (id === 'metamask' && platform === 'mobile-in-app')
  );
}

export interface ClassifyInput {
  rdns?: string;
  name?: string;
  provider?: Eip1193Provider;
  /** Defaults to `navigator.userAgent` when available. */
  userAgent?: string;
  /** Override the heuristic platform detection when the host already knows it. */
  platform?: WalletPlatform;
}

/**
 * Classify a wallet from its EIP-6963 `rdns` (preferred) or provider identity flags,
 * resolving the platform and whether the assisted switch path is viable.
 */
export function classifyWallet(input: ClassifyInput = {}): WalletClassification {
  const userAgent =
    input.userAgent ??
    (typeof navigator !== 'undefined' ? navigator.userAgent : '') ??
    '';

  const id: WalletId = input.rdns
    ? (RDNS_TO_ID[input.rdns] ?? idFromProviderFlags(input.provider))
    : idFromProviderFlags(input.provider);

  const platform =
    input.platform ?? detectPlatform(id, userAgent, input.rdns != null);

  return {
    id,
    rdns: input.rdns,
    name: input.name,
    platform,
    assistedSwitch: supportsAssistedSwitch(id, platform),
  };
}

/** Classify an EIP-6963 announced provider detail. */
export function classifyDetail(
  detail: Eip6963ProviderDetail,
  userAgent?: string,
): WalletClassification {
  return classifyWallet({
    rdns: detail.info.rdns,
    name: detail.info.name,
    provider: detail.provider,
    userAgent,
  });
}
