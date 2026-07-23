import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import { isUuid, isWalletRdns } from '../src/brands';
import {
  usePhylaxRpcSwitch,
  type UsePhylaxRpcSwitchResult,
} from '../src/react';
import type {
  ConnectedAccountLike,
  Eip1193Provider,
  Eip6963ProviderDetail,
  PhylaxRpcConfig,
} from '../src/types';
import { errorStringRevert, MockProvider } from './helpers';

const config = { rpcUrl: 'https://rpc.phylax.example' };
const transaction = {
  from: '0x' + '11'.repeat(20),
  to: '0x' + '22'.repeat(20),
};

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function renderHook(
  initialConfig: PhylaxRpcConfig = config,
  initialAccount?: ConnectedAccountLike,
): {
  getResult: () => UsePhylaxRpcSwitchResult;
  rerender: (nextConfig: PhylaxRpcConfig, nextAccount?: ConnectedAccountLike) => void;
  renderer: ReactTestRenderer;
} {
  let result: UsePhylaxRpcSwitchResult | undefined;

  function Harness({
    hookConfig,
    account,
  }: {
    hookConfig: PhylaxRpcConfig;
    account?: ConnectedAccountLike;
  }): null {
    result = usePhylaxRpcSwitch(hookConfig, account);
    return null;
  }

  const renderer = create(
    createElement(Harness, { hookConfig: initialConfig, account: initialAccount }),
  );
  return {
    getResult: () => {
      if (!result) throw new Error('hook did not render');
      return result;
    },
    rerender: (nextConfig, nextAccount) => {
      renderer.update(createElement(Harness, { hookConfig: nextConfig, account: nextAccount }));
    },
    renderer,
  };
}

describe('usePhylaxRpcSwitch', () => {
  it('keeps the newest detection result when an older call finishes last', async () => {
    const slow = deferred<unknown>();
    const slowProvider = new MockProvider().setHandlers('eth_estimateGas', () => slow.promise);
    const fastProvider = new MockProvider().setHandlers('eth_estimateGas', () => '0x5208');
    const hook = renderHook();

    let slowCall!: Promise<unknown>;
    let fastCall!: Promise<unknown>;
    await act(async () => {
      slowCall = hook.getResult().detect({ provider: slowProvider, transaction });
      fastCall = hook.getResult().detect({ provider: fastProvider, transaction });
      await fastCall;
    });

    expect(hook.getResult().detection?.status).toBe('on-phylax');

    await act(async () => {
      slow.reject(errorStringRevert('assertion failed'));
      await slowCall;
    });

    expect(hook.getResult().detection?.status).toBe('on-phylax');
    hook.renderer.unmount();
  });

  it('keeps the newest discovery result and loading state', async () => {
    const first = deferred<Eip6963ProviderDetail[]>();
    const second = deferred<Eip6963ProviderDetail[]>();
    const hook = renderHook();
    vi.spyOn(hook.getResult().client, 'discoverProviders')
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);

    let firstCall!: Promise<Eip6963ProviderDetail[]>;
    let secondCall!: Promise<Eip6963ProviderDetail[]>;
    await act(async () => {
      firstCall = hook.getResult().refresh();
      secondCall = hook.getResult().refresh();
    });

    const uuid = '00000000-0000-4000-8000-000000000001';
    const rdns = 'example.latest';
    if (!isUuid(uuid) || !isWalletRdns(rdns)) throw new Error('invalid test provider info');
    const latest = [{ provider: {} as Eip1193Provider, info: {
      uuid,
      name: 'Latest',
      icon: 'data:image/svg+xml,<svg/>',
      rdns,
    } }];
    await act(async () => {
      second.resolve(latest);
      await secondCall;
    });

    expect(hook.getResult().providers).toEqual(latest);
    expect(hook.getResult().discovering).toBe(false);

    await act(async () => {
      first.resolve([]);
      await firstCall;
    });

    expect(hook.getResult().providers).toEqual(latest);
    expect(hook.getResult().discovering).toBe(false);
    hook.renderer.unmount();
  });

  it('does not use a provider resolved for a superseded account', async () => {
    const oldProvider = deferred<unknown>();
    const oldAccount: ConnectedAccountLike = {
      address: '0x' + '11'.repeat(20),
      connector: {
        name: 'Old wallet',
        getProvider: () => oldProvider.promise,
      },
    };
    const newAccount: ConnectedAccountLike = {
      address: '0x' + '22'.repeat(20),
      connector: {
        name: 'New wallet',
        getProvider: async () => new MockProvider(),
      },
    };
    const hook = renderHook(config, oldAccount);

    let detection!: Promise<unknown>;
    await act(async () => {
      detection = hook.getResult().detect({ transaction });
      hook.rerender(config, newAccount);
    });

    await act(async () => {
      oldProvider.resolve(new MockProvider().setHandlers('eth_estimateGas', () => '0x5208'));
      await expect(detection).rejects.toThrow(/no provider/);
    });

    expect(hook.getResult().connected).toBeUndefined();
    expect(hook.getResult().detection).toBeUndefined();
    hook.renderer.unmount();
  });

  it('does not commit operation state from a superseded client config', async () => {
    const slow = deferred<unknown>();
    const provider = new MockProvider().setHandlers('eth_estimateGas', () => slow.promise);
    const hook = renderHook();

    let detection!: Promise<unknown>;
    await act(async () => {
      detection = hook.getResult().detect({ provider, transaction });
      hook.rerender({ rpcUrl: 'https://rpc-next.phylax.example' });
    });

    await act(async () => {
      slow.reject(errorStringRevert('assertion failed'));
      await detection;
    });

    expect(hook.getResult().detection).toBeUndefined();
    hook.renderer.unmount();
  });
});
