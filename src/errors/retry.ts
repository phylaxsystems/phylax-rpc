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

/** How a caller adjusts retrying, or `false` to answer with the first attempt. */
export interface RetryPolicy {
  /** Retries after the first attempt. Defaults to `RETRY_DELAYS.length`; `0` disables them. */
  readonly attempts?: number;
  /** Abandons the wait when the caller is no longer interested. */
  readonly signal?: AbortSignal;
  /** Jitter source. Injectable so a test can pin the schedule. */
  readonly random?: () => number;
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
  const attempts = policy?.attempts ?? RETRY_DELAYS.length;
  return attempt < attempts && isTransient(failure);
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
