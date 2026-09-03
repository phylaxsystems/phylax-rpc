import { describe, expect, it } from 'vitest';
import {
  MAX_RETRY_ATTEMPTS,
  RETRY_DELAYS,
  type RetryPolicy,
  isTransient,
  retryDelay,
  shouldRetry,
} from '../../src/errors/retry';
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

  /**
   * Retries a policy actually allows, counted the way the detection loop consumes it. The hard
   * stop is well past the ceiling, so a policy that fails to bound itself fails the test rather
   * than hanging it.
   */
  function countRetries(policy: RetryPolicy): number {
    const transient: RpcFailure = { kind: 'transport' };
    let attempt = 0;
    while (attempt <= 1_000 && shouldRetry(transient, attempt, policy)) attempt++;
    return attempt;
  }

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

  // `attempts` is caller input, and the only thing ending the detection loop is running out of
  // budget, so a count the loop cannot reach the end of has to be normalised rather than trusted.
  it.each([
    ['Infinity', Number.POSITIVE_INFINITY, MAX_RETRY_ATTEMPTS],
    ['a count past the ceiling', 1_000_000, MAX_RETRY_ATTEMPTS],
    ['a fractional count', 2.5, 2],
    ['a negative count', -3, 0],
    ['-Infinity', Number.NEGATIVE_INFINITY, 0],
    ['NaN', Number.NaN, 0],
  ])('bounds %s', (_label, attempts, expected) => {
    expect(countRetries({ attempts })).toBe(expected);
  });

  it('never retries when the caller opted out or gave up', () => {
    const transient: RpcFailure = { kind: 'transport' };

    expect(shouldRetry(transient, 0, false)).toBe(false);
    expect(shouldRetry(transient, 0, { signal: AbortSignal.abort() })).toBe(false);
  });
});
