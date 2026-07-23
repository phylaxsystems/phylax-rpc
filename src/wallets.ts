import { asWalletRdns, isUuid, isWalletRdns } from './brands';
import { DEFAULT_DISCOVERY_TIMEOUT, WALLET_RDNS } from './constants';
import type {
  ClassifyInput,
  DiscoverOptions,
  DiscoveryTarget,
  Eip1193Provider,
  Eip6963ProviderDetail,
  WalletClassification,
  WalletId,
  WalletPlatform,
} from './types';

export type { ClassifyInput, DiscoverOptions, DiscoveryTarget } from './types';

/** Whether `value` structurally satisfies the EIP-1193 provider surface we depend on. */
export function isEip1193Provider(value: unknown): value is Eip1193Provider {
  return (
    value != null &&
    typeof value === 'object' &&
    // Narrowing an `unknown` member requires one contained cast; the runtime check is real.
    typeof (value as { request?: unknown }).request === 'function'
  );
}

/**
 * Validate an EIP-6963 announcement detail before trusting it. A spoofed or malformed
 * announcement (missing `rdns`, non-string `icon`, no `provider.request`, …) is rejected
 * rather than stored, so downstream code never handles unchecked external data.
 */
function toValidDetail(detail: unknown): Eip6963ProviderDetail | undefined {
  if (detail == null || typeof detail !== 'object') return undefined;
  const info = (detail as { info?: unknown }).info;
  const provider = (detail as { provider?: unknown }).provider;
  if (info == null || typeof info !== 'object') return undefined;
  const { uuid, name, icon, rdns } = info as {
    uuid?: unknown;
    name?: unknown;
    icon?: unknown;
    rdns?: unknown;
  };
  if (
    !isUuid(uuid) ||
    typeof name !== 'string' ||
    typeof icon !== 'string' ||
    !isWalletRdns(rdns) ||
    !isEip1193Provider(provider)
  ) {
    return undefined;
  }
  return { info: { uuid, name, icon, rdns }, provider };
}

/**
 * Discover injected providers via EIP-6963.
 *
 * Dispatches `eip6963:requestProvider`, collects and validates `eip6963:announceProvider`
 * events for `timeout` ms, and de-duplicates by `info.uuid`. Resolves to `[]` outside a
 * browser.
 */
export function discoverProviders(
  options: DiscoverOptions = {},
): Promise<Eip6963ProviderDetail[]> {
  const timeout = options.timeout ?? DEFAULT_DISCOVERY_TIMEOUT;
  const target = options.target ?? defaultDiscoveryTarget();

  return new Promise((resolve) => {
    if (!target) {
      resolve([]);
      return;
    }

    const found = new Map<string, Eip6963ProviderDetail>();
    const onAnnounce = (event: Event): void => {
      const detail = toValidDetail((event as CustomEvent<unknown>).detail);
      if (detail) found.set(detail.info.uuid, detail);
    };

    target.addEventListener('eip6963:announceProvider', onAnnounce);
    target.dispatchEvent(new Event('eip6963:requestProvider'));

    setTimeout(() => {
      target.removeEventListener('eip6963:announceProvider', onAnnounce);
      resolve([...found.values()]);
    }, timeout);
  });
}

/** Wrap the ambient `window` as a {@link DiscoveryTarget}, or `undefined` outside a browser. */
function defaultDiscoveryTarget(): DiscoveryTarget | undefined {
  if (typeof globalThis === 'undefined' || typeof globalThis.window === 'undefined') {
    return undefined;
  }
  const w = globalThis.window;
  return {
    addEventListener: (type, listener) => w.addEventListener(type, listener),
    removeEventListener: (type, listener) => w.removeEventListener(type, listener),
    dispatchEvent: (event) => w.dispatchEvent(event),
  };
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

/**
 * Classify a wallet from its EIP-6963 `rdns` (preferred) or provider identity flags,
 * resolving the platform and whether the assisted switch path is viable.
 */
export function classifyWallet(input: ClassifyInput = {}): WalletClassification {
  const userAgent =
    input.userAgent ??
    (typeof navigator !== 'undefined' ? navigator.userAgent : '') ??
    '';

  // wagmi connectors may carry several rdns values; classify on the first.
  const rawRdns = typeof input.rdns === 'string' ? input.rdns : input.rdns?.[0];
  const rdns = asWalletRdns(rawRdns);

  const id: WalletId = rdns
    ? (RDNS_TO_ID[rdns] ?? idFromProviderFlags(input.provider))
    : idFromProviderFlags(input.provider);

  const platform = input.platform ?? detectPlatform(id, userAgent, rdns != null);

  return {
    id,
    rdns,
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
