import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PhylaxRpcSwitch } from './client';
import type { PreflightMethod } from './detect';
import {
  connectedWallet,
  type ConnectedAccountLike,
  type ConnectedWallet,
} from './wagmi';
import type {
  DetectionResult,
  Eip1193Provider,
  Eip6963ProviderDetail,
  LooseTransactionRequest,
  PhylaxRpcConfig,
  SwitchResult,
  WalletClassification,
} from './types';
import type { DiscoverOptions } from './wallets';

export { ManualAddModal, type ManualAddModalProps } from './ManualAddModal';
export type {
  CloudflareImageFit,
  CloudflareImageFormat,
  CloudflareImageOptions,
  CloudflareImageQuality,
} from './cloudflare-images';

/**
 * Args for the hook's `detect`. `provider` is optional when the hook was given a wagmi
 * `account` — the connected provider is then resolved automatically.
 */
export interface HookDetectArgs {
  transaction: LooseTransactionRequest;
  provider?: Eip1193Provider;
  method?: PreflightMethod;
  /** Sender override when `transaction.from` is absent (see `DetectOptions.account`). */
  account?: string;
}

/**
 * Args for the hook's `attemptSwitch`. `provider`/`wallet` are optional when the hook was
 * given a wagmi `account`.
 */
export interface HookSwitchArgs {
  provider?: Eip1193Provider;
  wallet?: WalletClassification;
  verifyTransaction?: LooseTransactionRequest;
  /** Sender override for the verify probe when `verifyTransaction` omits `from`. */
  account?: string;
  force?: boolean;
}

export interface HookConnectionArgs {
  /** Optional wallet-backed provider. Resolved from the hook's wagmi account when omitted. */
  provider?: Eip1193Provider;
}

export interface UsePhylaxRpcSwitchResult {
  /** The underlying headless client. */
  client: PhylaxRpcSwitch;
  /** Providers discovered via EIP-6963 (populated after `refresh`). */
  providers: Eip6963ProviderDetail[];
  /** `true` while a discovery pass is in flight. */
  discovering: boolean;
  /**
   * The connected wallet resolved from the wagmi `account` passed to the hook, populated
   * after the first `detect`/`attemptSwitch` (or `undefined` for bare-injected setups).
   */
  connected?: ConnectedWallet;
  /** Re-run EIP-6963 discovery. */
  refresh: (options?: DiscoverOptions) => Promise<Eip6963ProviderDetail[]>;
  /** Silently check whether the connected wallet is routing through Phylax. */
  isConnectedToPhylax: (args?: HookConnectionArgs) => Promise<boolean>;
  /** Result of the most recent routing check. `undefined` before the first check. */
  connectedToPhylax?: boolean;
  /** `true` while a routing check is in flight. */
  checkingConnection: boolean;
  /** Run the off-Phylax detection probe; also stored on `detection`. */
  detect: (args: HookDetectArgs) => Promise<DetectionResult>;
  /** Attempt the assisted switch; also stored on `switchResult`. */
  attemptSwitch: (args: HookSwitchArgs) => Promise<SwitchResult>;
  /** Result of the most recent `detect` call. */
  detection?: DetectionResult;
  /** Result of the most recent `attemptSwitch` call. */
  switchResult?: SwitchResult;
}

/**
 * React hook wrapping {@link PhylaxRpcSwitch} with discovery/detection/switch state.
 * React is an optional peer dependency; import from `phylax-rpc/react`.
 *
 * Pass the wagmi `useAccount()` result as the second argument to skip EIP-6963 discovery
 * entirely: `detect`/`attemptSwitch` then resolve the connected provider via
 * {@link connectedWallet}, which also works for WalletConnect/Coinbase/embedded
 * connectors that never announce over EIP-6963.
 */
export function usePhylaxRpcSwitch(
  config: PhylaxRpcConfig,
  account?: ConnectedAccountLike,
): UsePhylaxRpcSwitchResult {
  const client = useMemo(
    () => new PhylaxRpcSwitch(config),
    // Re-create only when a meaningful config field changes — every field the resolved
    // config depends on is listed (or normalized to a primitive) so config edits never
    // leave the client, add-chain params, or manual instructions stale.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      config.rpcUrl,
      config.chainId,
      config.chainName,
      config.nativeCurrency?.name,
      config.nativeCurrency?.symbol,
      config.nativeCurrency?.decimals,
      config.blockExplorerUrls?.join('\n'),
      config.credibleRevertMatch,
    ],
  );

  const [providers, setProviders] = useState<Eip6963ProviderDetail[]>([]);
  const [discovering, setDiscovering] = useState(false);
  const [connected, setConnected] = useState<ConnectedWallet | undefined>();
  const [connectedToPhylax, setConnectedToPhylax] = useState<boolean | undefined>();
  const [checkingConnection, setCheckingConnection] = useState(false);
  const [detection, setDetection] = useState<DetectionResult | undefined>();
  const [switchResult, setSwitchResult] = useState<SwitchResult | undefined>();

  // Keep the latest client/account accessible to stable callbacks without re-creating them.
  const clientRef = useRef(client);
  clientRef.current = client;
  const accountRef = useRef(account);
  accountRef.current = account;

  // Ignore results from superseded operations and from calls that complete after unmount,
  // so a slow earlier request can never overwrite newer state or clear loading early.
  const mountedRef = useRef(true);
  const resolveGenRef = useRef(0);
  const refreshGenRef = useRef(0);
  const checkGenRef = useRef(0);
  const detectGenRef = useRef(0);
  const switchGenRef = useRef(0);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const identityRef = useRef({
    client,
    address: account?.address,
    connector: account?.connector,
  });

  // State belongs to the current client and connected account. Invalidate pending work and
  // remove results from the previous identity as soon as either boundary changes.
  useEffect(() => {
    const previous = identityRef.current;
    if (
      previous.client === client &&
      previous.address === account?.address &&
      previous.connector === account?.connector
    ) {
      return;
    }
    identityRef.current = {
      client,
      address: account?.address,
      connector: account?.connector,
    };
    resolveGenRef.current += 1;
    refreshGenRef.current += 1;
    checkGenRef.current += 1;
    detectGenRef.current += 1;
    switchGenRef.current += 1;
    setProviders([]);
    setDiscovering(false);
    setConnected(undefined);
    setConnectedToPhylax(undefined);
    setCheckingConnection(false);
    setDetection(undefined);
    setSwitchResult(undefined);
  }, [client, account?.address, account?.connector]);

  // Resolve (and cache) the connected wallet from the wagmi account, when one was passed.
  const resolveConnected = useCallback(async (): Promise<ConnectedWallet | undefined> => {
    const gen = ++resolveGenRef.current;
    const acct = accountRef.current;
    const connector = acct?.connector;
    const address = acct?.address;
    if (!connector) return undefined;
    const result = (await connectedWallet(acct)) ?? undefined;
    const currentAccount = accountRef.current;
    const isCurrent =
      mountedRef.current &&
      gen === resolveGenRef.current &&
      connector === currentAccount?.connector &&
      address === currentAccount?.address;
    if (!isCurrent) return undefined;
    setConnected(result);
    return result;
  }, []);

  const refresh = useCallback(async (options?: DiscoverOptions) => {
    const gen = ++refreshGenRef.current;
    const operationClient = clientRef.current;
    setDiscovering(true);
    try {
      const found = await operationClient.discoverProviders(options);
      if (
        mountedRef.current &&
        gen === refreshGenRef.current &&
        operationClient === clientRef.current
      ) {
        setProviders(found);
      }
      return found;
    } finally {
      if (
        mountedRef.current &&
        gen === refreshGenRef.current &&
        operationClient === clientRef.current
      ) {
        setDiscovering(false);
      }
    }
  }, []);

  const isConnectedToPhylax = useCallback(
    async (args: HookConnectionArgs = {}) => {
      const gen = ++checkGenRef.current;
      const operationClient = clientRef.current;
      if (mountedRef.current) setCheckingConnection(true);
      try {
        const provider = args.provider ?? (await resolveConnected())?.provider;
        if (!provider) {
          throw new Error(
            'usePhylaxRpcSwitch.isConnectedToPhylax: no provider, pass `args.provider`, or ' +
              'pass the wagmi `account` to the hook so the connected provider can be resolved.',
          );
        }

        const result = await operationClient.isConnectedToPhylax(provider);
        if (
          mountedRef.current &&
          gen === checkGenRef.current &&
          operationClient === clientRef.current
        ) {
          setConnectedToPhylax(result);
        }
        return result;
      } finally {
        if (
          mountedRef.current &&
          gen === checkGenRef.current &&
          operationClient === clientRef.current
        ) {
          setCheckingConnection(false);
        }
      }
    },
    [resolveConnected],
  );

  const detect = useCallback(
    async (args: HookDetectArgs) => {
      const gen = ++detectGenRef.current;
      const operationClient = clientRef.current;
      const provider = args.provider ?? (await resolveConnected())?.provider;
      if (!provider) {
        throw new Error(
          'usePhylaxRpcSwitch.detect: no provider — pass `args.provider`, or pass the ' +
            'wagmi `account` to the hook so the connected provider can be resolved.',
        );
      }
      const result = await operationClient.detect({
        provider,
        transaction: args.transaction,
        method: args.method,
        account: args.account,
      });
      if (
        mountedRef.current &&
        gen === detectGenRef.current &&
        operationClient === clientRef.current
      ) {
        setDetection(result);
      }
      return result;
    },
    [resolveConnected],
  );

  const attemptSwitch = useCallback(
    async (args: HookSwitchArgs) => {
      const gen = ++switchGenRef.current;
      const operationClient = clientRef.current;
      let { provider, wallet } = args;
      if (!provider || !wallet) {
        const c = await resolveConnected();
        provider = provider ?? c?.provider;
        wallet = wallet ?? c?.wallet;
      }
      if (!provider || !wallet) {
        throw new Error(
          'usePhylaxRpcSwitch.attemptSwitch: missing provider/wallet — pass them, or ' +
            'pass the wagmi `account` to the hook so they can be resolved.',
        );
      }
      const result = await operationClient.switch({
        provider,
        wallet,
        verifyTransaction: args.verifyTransaction,
        account: args.account,
        force: args.force,
      });
      if (
        mountedRef.current &&
        gen === switchGenRef.current &&
        operationClient === clientRef.current
      ) {
        setSwitchResult(result);
        setConnectedToPhylax(result.outcome === 'activated');
      }
      return result;
    },
    [resolveConnected],
  );

  return {
    client,
    providers,
    discovering,
    connected,
    refresh,
    isConnectedToPhylax,
    connectedToPhylax,
    checkingConnection,
    detect,
    attemptSwitch,
    detection,
    switchResult,
  };
}
