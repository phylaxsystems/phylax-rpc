import type { Eip1193Provider } from './types';

/**
 * Structural mirror of a viem client's `request` entrypoint. Defined locally so the
 * adapter carries no runtime dependency on `viem`.
 */
export interface RequestFnClient {
  request(args: { method: string; params?: unknown }): Promise<unknown>;
}

/**
 * Wrap a viem **wallet** client as an {@link Eip1193Provider} for `detect`/`switch`.
 *
 * ```ts
 * import { providerFromWalletClient } from 'phylax-rpc/viem';
 * const provider = providerFromWalletClient(walletClient);
 * ```
 *
 * IMPORTANT: pass a client backed by the connected wallet (`custom(window.ethereum)` /
 * an injected or connector transport), **not** one built on an `http` transport — an
 * http client routes to a public RPC URL, so detection would probe the wrong endpoint
 * and always report `on-phylax`.
 */
export function providerFromWalletClient(client: RequestFnClient): Eip1193Provider {
  return {
    request: ({ method, params }) => client.request({ method, params }),
  };
}
