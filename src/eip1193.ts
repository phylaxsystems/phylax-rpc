import type { Eip1193Provider, RpcMethod } from './types';

/**
 * Wrapper over `provider.request` that pins the method to a known {@link RpcMethod} and
 * returns the raw `unknown` reply. Callers narrow the result with a guard rather than
 * trusting a caller-supplied type argument, so no unchecked assertion is needed here.
 */
export function request(
  provider: Eip1193Provider,
  method: RpcMethod,
  params?: unknown[] | Record<string, unknown>,
): Promise<unknown> {
  return provider.request({ method, params });
}
