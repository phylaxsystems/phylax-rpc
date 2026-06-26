import { useCallback, useMemo, useRef, useState } from 'react';
import {
  PhylaxRpcSwitch,
  type DetectArgs,
  type SwitchArgs,
} from './client';
import type {
  DetectionResult,
  Eip6963ProviderDetail,
  PhylaxRpcConfig,
  SwitchResult,
} from './types';
import type { DiscoverOptions } from './wallets';

export { ManualAddModal, type ManualAddModalProps } from './ManualAddModal';

export interface UsePhylaxRpcSwitchResult {
  /** The underlying headless client. */
  client: PhylaxRpcSwitch;
  /** Providers discovered via EIP-6963 (populated after `refresh`). */
  providers: Eip6963ProviderDetail[];
  /** `true` while a discovery pass is in flight. */
  discovering: boolean;
  /** Re-run EIP-6963 discovery. */
  refresh: (options?: DiscoverOptions) => Promise<Eip6963ProviderDetail[]>;
  /** Run the off-Phylax detection probe; also stored on `detection`. */
  detect: (args: DetectArgs) => Promise<DetectionResult>;
  /** Attempt the assisted switch; also stored on `switchResult`. */
  attemptSwitch: (args: SwitchArgs) => Promise<SwitchResult>;
  /** Result of the most recent `detect` call. */
  detection?: DetectionResult;
  /** Result of the most recent `attemptSwitch` call. */
  switchResult?: SwitchResult;
}

/**
 * React hook wrapping {@link PhylaxRpcSwitch} with discovery/detection/switch state.
 * React is an optional peer dependency; import from `phylax-rpc/react`.
 */
export function usePhylaxRpcSwitch(config: PhylaxRpcConfig): UsePhylaxRpcSwitchResult {
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
  const [detection, setDetection] = useState<DetectionResult | undefined>();
  const [switchResult, setSwitchResult] = useState<SwitchResult | undefined>();

  // Keep the latest client accessible to stable callbacks without re-creating them.
  const clientRef = useRef(client);
  clientRef.current = client;

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

  const detect = useCallback(async (args: DetectArgs) => {
    const result = await clientRef.current.detect(args);
    setDetection(result);
    return result;
  }, []);

  const attemptSwitch = useCallback(async (args: SwitchArgs) => {
    const result = await clientRef.current.switch(args);
    setSwitchResult(result);
    return result;
  }, []);

  return {
    client,
    providers,
    discovering,
    refresh,
    detect,
    attemptSwitch,
    detection,
    switchResult,
  };
}
