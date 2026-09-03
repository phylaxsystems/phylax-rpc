import { describe, expect, it } from 'vitest';
import { RETRY_DELAYS, isTransient, retryDelay, shouldRetry } from '../../src/errors/retry';
import type { RpcFailure } from '../../src/errors/rpc';

describe('retryDelay', () => {
  it('follows the documented curve with jitter centred', () => {
    const centred = () => 0.5;

    expect(RETRY_DELAYS.map((_, i) => retryDelay(i, centred))).toEqual([...RETRY_DELAYS]);
  });

  it('stays within the jitter band and never goes backwards in time', () => {
    for (let attempt = 0; attempt < RETRY_DELAYS.length; attempt++) {
      const base = RETRY_DELAYS[attempt] ?? 0;
      for (let i = 0; i <= 100; i++) {
        const delay = retryDelay(attempt, () => i / 100);

        expect(delay).toBeGreaterThanOrEqual(Math.round(base * 0.7));
        expect(delay).toBeLessThanOrEqual(Math.round(base * 1.3));
      }
    }
  });

  it('holds at the last delay rather than growing without bound', () => {
    const last = RETRY_DELAYS[RETRY_DELAYS.length - 1] ?? 0;

    expect(retryDelay(99, () => 0.5)).toBe(last);
  });

  it('keeps the whole schedule short enough to sit in front of a user', () => {
    const worst = RETRY_DELAYS.reduce((total, base) => total + Math.round(base * 1.3), 0);

    expect(worst).toBeLessThan(5_000);
  });
});

// A verdict retried is a verdict the caller waits longer to hear; only the RPC's own transient
// conditions qualify, and an unrecognised failure must never loop.
describe('shouldRetry', () => {
  const failures: Array<[RpcFailure['kind'], RpcFailure, boolean]> = [
    ['assertions-unavailable', { kind: 'assertions-unavailable', reason: '' }, true],
    ['transport', { kind: 'transport' }, true],
    ['assertion-rejected', { kind: 'assertion-rejected', reason: '', data: '0x' as never }, false],
    ['reverted', { kind: 'reverted', data: '0x' as never }, false],
    ['invalid-transaction', { kind: 'invalid-transaction', detail: '' }, false],
    ['unsupported', { kind: 'unsupported', reason: '' }, false],
    ['user-rejected', { kind: 'user-rejected' }, false],
    ['unknown', { kind: 'unknown' }, false],
  ];

  it.each(failures)('%s is retried: %j', (_kind, failure, expected) => {
    expect(isTransient(failure)).toBe(expected);
    expect(shouldRetry(failure, 0, undefined)).toBe(expected);
  });

  it('stops at the attempt budget', () => {
    const transient: RpcFailure = { kind: 'transport' };

    expect(shouldRetry(transient, RETRY_DELAYS.length - 1, undefined)).toBe(true);
    expect(shouldRetry(transient, RETRY_DELAYS.length, undefined)).toBe(false);
    expect(shouldRetry(transient, 0, { attempts: 0 })).toBe(false);
  });

  it('never retries when the caller opted out or gave up', () => {
    const transient: RpcFailure = { kind: 'transport' };

    expect(shouldRetry(transient, 0, false)).toBe(false);
    expect(shouldRetry(transient, 0, { signal: AbortSignal.abort() })).toBe(false);
  });
});
