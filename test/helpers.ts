import { expect } from 'vitest';
import type {
  DetectionResult,
  Eip1193Provider,
  Eip1193RequestArgs,
  SwitchResult,
} from '../src/types';

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
  return Object.assign(new Error(`execution reverted: ${message}`), {
    code,
    data: encodeErrorString(message),
  });
}

/** A standard EIP-1193 user-rejection error. */
export function userRejection(): unknown {
  return Object.assign(new Error('User rejected the request.'), { code: 4001 });
}

/** The first (object) argument of a recorded provider call. */
export function firstArg(call: { params: unknown } | undefined): Record<string, unknown> {
  if (!call) throw new Error('expected a recorded call');
  const { params } = call;
  if (!Array.isArray(params) || params[0] == null || typeof params[0] !== 'object') {
    throw new Error('expected an object as the first param');
  }
  // Guarded narrowing of a checked `unknown`, contained to this test helper.
  return params[0] as Record<string, unknown>;
}

/** Assert (and narrow) a {@link DetectionResult} to a specific status. */
export function assertStatus<S extends DetectionResult['status']>(
  result: DetectionResult,
  status: S,
): asserts result is Extract<DetectionResult, { status: S }> {
  expect(result.status).toBe(status);
}

/** Assert (and narrow) a {@link SwitchResult} to a specific outcome. */
export function assertOutcome<O extends SwitchResult['outcome']>(
  result: SwitchResult,
  outcome: O,
): asserts result is Extract<SwitchResult, { outcome: O }> {
  expect(result.outcome).toBe(outcome);
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
    const handler = hs.length > 1 ? hs.shift() : hs[0];
    if (!handler) return Promise.reject(new Error(`no handler for ${args.method}`));
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
