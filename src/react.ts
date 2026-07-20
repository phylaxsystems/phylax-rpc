import { useCallback, useMemo, useRef, useState } from 'react';
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
    // Re-create only when a meaningful config field changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      config.rpcUrl,
      config.chainId,
      config.chainName,
      config.nativeCurrency?.symbol,
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

  // Resolve (and cache) the connected wallet from the wagmi account, when one was passed.
  const resolveConnected = useCallback(async (): Promise<ConnectedWallet | undefined> => {
    const acct = accountRef.current;
    if (!acct?.connector) return undefined;
    const result = (await connectedWallet(acct)) ?? undefined;
    setConnected(result);
    return result;
  }, []);

  const refresh = useCallback(async (options?: DiscoverOptions) => {
    setDiscovering(true);
    try {
      const found = await clientRef.current.discoverProviders(options);
      setProviders(found);
      return found;
    } finally {
      setDiscovering(false);
    }
  }, []);

  const isConnectedToPhylax = useCallback(
    async (args: HookConnectionArgs = {}) => {
      const provider = args.provider ?? (await resolveConnected())?.provider;
      if (!provider) {
        throw new Error(
          'usePhylaxRpcSwitch.isConnectedToPhylax: no provider, pass `args.provider`, or ' +
            'pass the wagmi `account` to the hook so the connected provider can be resolved.',
        );
      }

      setCheckingConnection(true);
      try {
        const result = await clientRef.current.isConnectedToPhylax(provider);
        setConnectedToPhylax(result);
        return result;
      } finally {
        setCheckingConnection(false);
      }
    },
    [resolveConnected],
  );

  const detect = useCallback(
    async (args: HookDetectArgs) => {
      const provider = args.provider ?? (await resolveConnected())?.provider;
      if (!provider) {
        throw new Error(
          'usePhylaxRpcSwitch.detect: no provider — pass `args.provider`, or pass the ' +
            'wagmi `account` to the hook so the connected provider can be resolved.',
        );
      }
      const result = await clientRef.current.detect({
        provider,
        transaction: args.transaction,
        method: args.method,
        account: args.account,
      });
      setDetection(result);
      return result;
    },
    [resolveConnected],
  );

  const attemptSwitch = useCallback(
    async (args: HookSwitchArgs) => {
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
      const result = await clientRef.current.switch({
        provider,
        wallet,
        verifyTransaction: args.verifyTransaction,
        account: args.account,
        force: args.force,
      });
      setSwitchResult(result);
      setConnectedToPhylax(result.outcome === 'activated');
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
