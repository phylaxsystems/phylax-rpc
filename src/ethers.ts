import type { Eip1193Provider } from './types';

/**
 * Structural mirror of an ethers v6 `BrowserProvider`'s `send` method. Defined locally so
 * the adapter carries no runtime dependency on `ethers`.
 */
export interface SendProvider {
  send(method: string, params: unknown[]): Promise<unknown>;
}

/**
 * Wrap an ethers v6 `BrowserProvider` as an {@link Eip1193Provider} for `detect`/`switch`.
 *
 * ```ts
 * import { BrowserProvider } from 'ethers';
 * import { providerFromEthers } from 'phylax-rpc/ethers';
 * const provider = providerFromEthers(new BrowserProvider(window.ethereum));
 * ```
 *
 * Use a wallet-backed `BrowserProvider`, not a `JsonRpcProvider` pointed at a public RPC —
 * the latter probes the wrong endpoint and would always report `on-phylax`.
 */
export function providerFromEthers(provider: SendProvider): Eip1193Provider {
  return {
    request: ({ method, params }) =>
      provider.send(
        method,
        Array.isArray(params) ? params : params != null ? [params] : [],
      ),
  };
}
