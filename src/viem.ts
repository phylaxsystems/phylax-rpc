import type { Eip1193Provider, RequestFnClient } from './types';

export type { RequestFnClient } from './types';

/**
 * Wrap a viem **wallet** client as an {@link Eip1193Provider} for `detect`/`switch`.
 *
 * ```ts
 * import { providerFromWalletClient } from '@phylaxsystems/phylax-rpc/viem';
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
