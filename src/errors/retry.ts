import type { RpcFailure } from './rpc';

/**
 * Backoff before each retry, in milliseconds, before jitter.
 *
 * Sized for the condition actually worth retrying: the assertion store catching up to the
 * chain head, which clears on a block boundary. A curve long enough to outlast that is long
 * enough to strand a user at a confirmation prompt, so this fails fast instead.
 */
export const RETRY_DELAYS = [250, 750, 2000] as const;

/**
 * How far each delay is randomised. Without it every client of a dApp retries on the same
 * schedule and arrives back at a recovering gate together.
 */
const JITTER = 0.3;

/** Randomised backoff before the retry following `attempt`, counted from zero. */
export function retryDelay(attempt: number, random: () => number = Math.random): number {
  const index = Math.min(Math.max(attempt, 0), RETRY_DELAYS.length - 1);
  const base = RETRY_DELAYS[index] ?? RETRY_DELAYS[0];
  const spread = (random() * 2 - 1) * JITTER;
  return Math.max(0, Math.round(base * (1 + spread)));
}

/**
 * Ceiling on {@link RetryPolicy.attempts}.
 *
 * The curve above repeats its last delay rather than growing, so nothing in the schedule itself
 * ends a retry loop — only the count does. Ten attempts is already some twenty seconds of
 * backoff in front of a caller waiting on a verdict, which is the outer edge of useful.
 */
export const MAX_RETRY_ATTEMPTS = 10;

/** How a caller adjusts retrying, or `false` to answer with the first attempt. */
export interface RetryPolicy {
  /**
   * Retries after the first attempt. Defaults to `RETRY_DELAYS.length`, `0` disables them, and
   * a larger count is clamped to {@link MAX_RETRY_ATTEMPTS}.
   */
  readonly attempts?: number;
  /** Abandons the wait when the caller is no longer interested. */
  readonly signal?: AbortSignal;
  /** Jitter source. Injectable so a test can pin the schedule. */
  readonly random?: () => number;
}

/**
 * The retry budget a policy asks for, as a count the loop is guaranteed to reach the end of.
 *
 * `attempts` arrives as unvalidated caller input, and the loop that consumes it only stops on
 * `attempt < attempts`, so `Infinity` retries until the user gives up and a fractional count
 * silently buys a retry the caller did not ask for. `NaN` reads as no retries because the
 * comparison already refuses every attempt, and making that explicit keeps the budget a number.
 */
function resolveAttempts(attempts: number | undefined): number {
  if (attempts === undefined) return RETRY_DELAYS.length;
  if (Number.isNaN(attempts)) return 0;
  return Math.min(Math.max(Math.floor(attempts), 0), MAX_RETRY_ATTEMPTS);
}

/** The kinds the RPC contract calls transient, and so the only ones worth reissuing. */
export type Transient = Extract<RpcFailure, { kind: 'assertions-unavailable' | 'transport' }>;

/** Whether a failure should be attempted again, given how many retries are left. */
export function shouldRetry(
  failure: RpcFailure,
  attempt: number,
  policy: RetryPolicy | false | undefined,
): boolean {
  if (policy === false || policy?.signal?.aborted) return false;
  return attempt < resolveAttempts(policy?.attempts) && isTransient(failure);
}

/**
 * Whether reissuing the same request could succeed.
 *
 * Only conditions the RPC contract calls transient qualify. Anything unrecognised is treated
 * as permanent: a probe that retries what it cannot identify loops instead of failing.
 */
export function isTransient(failure: RpcFailure): failure is Transient {
  return failure.kind === 'assertions-unavailable' || failure.kind === 'transport';
}

/** Wait out a backoff, settling early when the caller aborts. */
export function wait(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const done = (): void => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal?.addEventListener('abort', done, { once: true });
  });
}
