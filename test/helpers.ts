import type { Eip1193Provider, Eip1193RequestArgs } from '../src/types';

/** ABI-encode a Solidity `Error(string)` revert payload for a given message. */
export function encodeErrorString(message: string): string {
  const bytes = new TextEncoder().encode(message);
  const dataHex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  const offset = (32).toString(16).padStart(64, '0');
  const length = bytes.length.toString(16).padStart(64, '0');
  const padded = dataHex.padEnd(Math.ceil(dataHex.length / 64) * 64 || 64, '0');
  return '0x08c379a0' + offset + length + padded;
}

/** A provider error carrying an `Error(string)` revert in `data`. */
export function errorStringRevert(message: string, code: number | string = 3): unknown {
  const err = new Error(`execution reverted: ${message}`) as Error & {
    code?: unknown;
    data?: string;
  };
  err.code = code;
  err.data = encodeErrorString(message);
  return err;
}

/** A standard EIP-1193 user-rejection error. */
export function userRejection(): unknown {
  const err = new Error('User rejected the request.') as Error & { code?: number };
  err.code = 4001;
  return err;
}

type Handler = (params: unknown) => unknown;

/**
 * Mock EIP-1193 provider. Register one or more handlers per method; with multiple
 * handlers, each call consumes the next (the last one repeats).
 */
export class MockProvider implements Eip1193Provider {
  [key: string]: unknown;
  calls: Array<{ method: string; params: unknown }> = [];
  private handlers: Record<string, Handler[]> = {};

  constructor(public extra: Record<string, unknown> = {}) {
    Object.assign(this, extra);
  }

  setHandlers(method: string, ...handlers: Handler[]): this {
    this.handlers[method] = handlers;
    return this;
  }

  request(args: Eip1193RequestArgs): Promise<unknown> {
    this.calls.push({ method: args.method, params: args.params });
    const hs = this.handlers[args.method];
    if (!hs || hs.length === 0) {
      return Promise.reject(new Error(`no handler for ${args.method}`));
    }
    const handler = hs.length > 1 ? (hs.shift() as Handler) : hs[0]!;
    try {
      return Promise.resolve(handler(args.params));
    } catch (error) {
      return Promise.reject(error);
    }
  }

  callsTo(method: string): Array<{ method: string; params: unknown }> {
    return this.calls.filter((c) => c.method === method);
  }
}
