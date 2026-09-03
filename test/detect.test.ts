import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveConfig } from '../src/config';
import {
  buildPreflightParams,
  detectOffPhylax,
  normalizeTransaction,
} from '../src/detect';
import type { LooseTransactionRequest, TransactionRequest } from '../src/types';
import { RETRY_DELAYS } from '../src/errors/retry';
import { assertStatus, errorStringRevert, firstArg, MockProvider } from './helpers';

const config = resolveConfig({ rpcUrl: 'https://rpc.phylax.example' });
const tx: TransactionRequest = {
  from: '0x' + '11'.repeat(20),
  to: '0x' + '22'.repeat(20),
  data: '0xdeadbeef',
  gas: '0x5208',
  gasLimit: '0x5208',
};

describe('buildPreflightParams', () => {
  it('strips gas and gasLimit', () => {
    const obj = firstArg({ params: buildPreflightParams(tx, 'eth_estimateGas') });
    expect(obj.gas).toBeUndefined();
    expect(obj.gasLimit).toBeUndefined();
    expect(obj.data).toBe('0xdeadbeef');
  });

  it('appends "latest" for eth_call', () => {
    expect(buildPreflightParams(tx, 'eth_call')[1]).toBe('latest');
  });
});

describe('normalizeTransaction', () => {
  it('coerces a bigint value and strips gas fields', () => {
    const loose: LooseTransactionRequest = {
      from: '0x' + '11'.repeat(20),
      value: 1000000000000000000n,
      gas: 21000n,
      gasLimit: 21000n,
    };
    const out = normalizeTransaction(loose);
    expect(out.value).toBe('0xde0b6b3a7640000');
    expect(out.gas).toBeUndefined();
    expect(out.gasLimit).toBeUndefined();
  });

  it('coerces every numeric form across the fee fields', () => {
    const out = normalizeTransaction({
      value: '1000000000000000000',
      gasPrice: 255,
      maxFeePerGas: '0xFF',
      maxPriorityFeePerGas: { toHexString: () => '0x01' },
      nonce: 5n,
    });
    expect(out.value).toBe('0xde0b6b3a7640000');
    expect(out.gasPrice).toBe('0xff');
    expect(out.maxFeePerGas).toBe('0xff');
    expect(out.maxPriorityFeePerGas).toBe('0x1');
    expect(out.nonce).toBe('0x5');
  });

  it('leaves string address fields untouched and omits absent numerics', () => {
    const out = normalizeTransaction({ from: '0xABC', to: '0xDEF', data: '0xdeadbeef' });
    expect(out).toEqual({ from: '0xABC', to: '0xDEF', data: '0xdeadbeef' });
  });

  it('drops null fields (viem/ethers type to/from/value/data as `… | null`)', () => {
    const out = normalizeTransaction({
      from: null,
      to: '0x' + '22'.repeat(20),
      data: null,
      value: null,
      nonce: 7,
    });
    expect(out.from).toBeUndefined();
    expect(out.data).toBeUndefined();
    expect(out.value).toBeUndefined();
    expect(out.to).toBe('0x' + '22'.repeat(20));
    expect(out.nonce).toBe('0x7');
  });
});

describe('detectOffPhylax', () => {
  it('reports on-phylax when the preflight succeeds', async () => {
    const provider = new MockProvider().setHandlers('eth_estimateGas', () => '0x5208');
    const result = await detectOffPhylax({ provider, transaction: tx, config });
    expect(result.status).toBe('on-phylax');
    expect(result.offPhylax).toBe(false);
  });

  it('never sends a gas field in the preflight', async () => {
    const provider = new MockProvider().setHandlers('eth_estimateGas', () => '0x1');
    await detectOffPhylax({ provider, transaction: tx, config });
    const sent = firstArg(provider.callsTo('eth_estimateGas')[0]);
    expect(sent.gas).toBeUndefined();
    expect(sent.gasLimit).toBeUndefined();
  });

  it('reports off-phylax for the credible-require revert', async () => {
    const provider = new MockProvider().setHandlers('eth_estimateGas', () => {
      throw errorStringRevert('assertion failed');
    });
    const result = await detectOffPhylax({ provider, transaction: tx, config });
    assertStatus(result, 'off-phylax');
    expect(result.offPhylax).toBe(true);
    expect(result.revertReason).toBe('assertion failed');
  });

  it('does not branch on the numeric code (works with -32000 etc.)', async () => {
    const provider = new MockProvider().setHandlers('eth_estimateGas', () => {
      throw errorStringRevert('assertion failed', -32000);
    });
    const result = await detectOffPhylax({ provider, transaction: tx, config });
    expect(result.offPhylax).toBe(true);
  });

  // The default matcher looks for "credible" anywhere in the reason, which the gate's own
  // rejection contains.
  it('treats a Credible RPC assertion rejection as a revert, never as off-phylax', async () => {
    const id = '0x' + 'ab'.repeat(32);
    const provider = new MockProvider().setHandlers('eth_estimateGas', () => {
      throw errorStringRevert(`credible layer: transaction rejected by assertion ${id}`);
    });

    const result = await detectOffPhylax({ provider, transaction: tx, config });

    assertStatus(result, 'reverted');
    expect(result.offPhylax).toBe(false);
    expect(result.assertionRejection).toEqual({ assertions: [id], omitted: 0 });
  });

  it('reports the assertions a capped rejection named and the count it left out', async () => {
    const ids = Array.from({ length: 10 }, (_, i) => '0x' + i.toString(16).repeat(64).slice(0, 64));
    const provider = new MockProvider().setHandlers('eth_estimateGas', () => {
      throw errorStringRevert(
        `credible layer: transaction rejected by assertions ${ids.join(', ')}, and 3 more`,
      );
    });

    const result = await detectOffPhylax({ provider, transaction: tx, config });

    assertStatus(result, 'reverted');
    expect(result.assertionRejection).toEqual({ assertions: ids, omitted: 3 });
  });

  // Wording the parser does not know is still not a routing signal.
  it('keeps an unparsable gate revert off the switch path', async () => {
    const provider = new MockProvider().setHandlers('eth_estimateGas', () => {
      throw errorStringRevert('credible layer: transaction refused by assertion 0xabcd');
    });

    const result = await detectOffPhylax({ provider, transaction: tx, config });

    assertStatus(result, 'reverted');
    expect(result.offPhylax).toBe(false);
    expect(result.assertionRejection).toBeUndefined();
  });

  // A custom matcher narrows what counts as off-phylax; it must not widen it back to the gate.
  it('does not let a custom credibleRevertMatch reclaim a gate rejection', async () => {
    const loose = resolveConfig({
      rpcUrl: config.rpcUrl,
      credibleRevertMatch: /rejected by assertion/,
    });
    const provider = new MockProvider().setHandlers('eth_estimateGas', () => {
      throw errorStringRevert('credible layer: transaction rejected by an assertion');
    });

    const result = await detectOffPhylax({ provider, transaction: tx, config: loose });

    assertStatus(result, 'reverted');
    expect(result.offPhylax).toBe(false);
    expect(result.assertionRejection).toEqual({ assertions: [], omitted: 0 });
  });

  it('leaves an ordinary revert without assertion metadata', async () => {
    const provider = new MockProvider().setHandlers('eth_estimateGas', () => {
      throw errorStringRevert('ERC20: transfer amount exceeds balance');
    });

    const result = await detectOffPhylax({ provider, transaction: tx, config });

    assertStatus(result, 'reverted');
    expect(result.assertionRejection).toBeUndefined();
  });

  it('treats a non-credible Error(string) as a genuine revert, not a routing issue', async () => {
    const provider = new MockProvider().setHandlers('eth_estimateGas', () => {
      throw errorStringRevert('ERC20: transfer amount exceeds balance');
    });
    const result = await detectOffPhylax({ provider, transaction: tx, config });
    assertStatus(result, 'reverted');
    expect(result.offPhylax).toBe(false);
    expect(result.revertReason).toContain('ERC20');
  });

  it('classifies a Panic/custom-error revert as reverted, not inconclusive', async () => {
    const panic = '0x4e487b71' + '0'.repeat(63) + '1'; // Panic(0x01)
    const provider = new MockProvider().setHandlers('eth_estimateGas', () => {
      throw Object.assign(new Error('execution reverted'), { data: panic });
    });
    const result = await detectOffPhylax({ provider, transaction: tx, config });
    assertStatus(result, 'reverted');
    expect(result.offPhylax).toBe(false);
    expect(result.revertReason).toBeUndefined();
  });

  // A contract is free to revert with the same phrase a wallet uses for a dismissal, and only
  // the revert data separates the two.
  it('classifies a revert worded like a dismissal as reverted', async () => {
    const provider = new MockProvider().setHandlers('eth_estimateGas', () => {
      throw errorStringRevert('User rejected the request');
    });

    const result = await detectOffPhylax({ provider, transaction: tx, config, retry: false });

    assertStatus(result, 'reverted');
    expect(result.revertReason).toBe('User rejected the request');
  });

  // The gate refusing to judge is a node condition, not a verdict, and carries no revert data.
  it('is inconclusive when the gate reports assertions unavailable', async () => {
    const provider = new MockProvider().setHandlers('eth_estimateGas', () => {
      throw Object.assign(
        new Error('credible layer: assertions are unavailable, try again shortly'),
        { code: -32603 },
      );
    });

    const result = await detectOffPhylax({ provider, transaction: tx, config, retry: false });

    expect(result.status).toBe('inconclusive');
    expect(result.offPhylax).toBe(false);
  });

  it('is inconclusive when no revert data can be decoded', async () => {
    const provider = new MockProvider().setHandlers('eth_estimateGas', () => {
      throw new Error('fetch failed: ECONNRESET');
    });
    const result = await detectOffPhylax({ provider, transaction: tx, config, retry: false });
    expect(result.status).toBe('inconclusive');
  });

  it('honours a custom credibleRevertMatch', async () => {
    const strict = resolveConfig({
      rpcUrl: config.rpcUrl,
      credibleRevertMatch: /CL: not in credible block/,
    });
    const provider = new MockProvider().setHandlers('eth_estimateGas', () => {
      throw errorStringRevert('CL: not in credible block');
    });
    expect((await detectOffPhylax({ provider, transaction: tx, config: strict })).offPhylax).toBe(true);

    const provider2 = new MockProvider().setHandlers('eth_estimateGas', () => {
      throw errorStringRevert('assertion failed');
    });
    // The default phrase should not match the strict pattern.
    expect((await detectOffPhylax({ provider: provider2, transaction: tx, config: strict })).status).toBe('reverted');
  });

  it('is stable across repeated calls with a stateful (/g) credibleRevertMatch', async () => {
    // A `/g` regex carries `lastIndex`; without a reset each identical call would alternate
    // between matching and not, flipping between off-phylax and reverted.
    const stateful = resolveConfig({
      rpcUrl: config.rpcUrl,
      credibleRevertMatch: /assertion failed/g,
    });
    for (let i = 0; i < 3; i++) {
      const provider = new MockProvider().setHandlers('eth_estimateGas', () => {
        throw errorStringRevert('assertion failed');
      });
      const result = await detectOffPhylax({ provider, transaction: tx, config: stateful });
      expect(result.offPhylax).toBe(true);
    }
  });

  it('auto-resolves `from` via silent eth_accounts when the tx omits it', async () => {
    const account = '0x' + '33'.repeat(20);
    const provider = new MockProvider()
      .setHandlers('eth_accounts', () => [account])
      .setHandlers('eth_estimateGas', () => '0x5208');
    const noFrom: LooseTransactionRequest = { to: '0x' + '22'.repeat(20), value: 1n };

    const result = await detectOffPhylax({ provider, transaction: noFrom, config });

    expect(result.status).toBe('on-phylax');
    // Never prompts: only the silent accounts read, never eth_requestAccounts.
    expect(provider.callsTo('eth_requestAccounts')).toHaveLength(0);
    const sent = firstArg(provider.callsTo('eth_estimateGas')[0]);
    expect(sent.from).toBe(account);
    expect(sent.value).toBe('0x1');
  });

  it('treats a null `from` as absent and resolves via silent eth_accounts', async () => {
    const account = '0x' + '55'.repeat(20);
    const provider = new MockProvider()
      .setHandlers('eth_accounts', () => [account])
      .setHandlers('eth_estimateGas', () => '0x5208');
    const result = await detectOffPhylax({
      provider,
      transaction: { from: null, to: '0x' + '22'.repeat(20) },
      config,
    });
    expect(result.status).toBe('on-phylax');
    const sent = firstArg(provider.callsTo('eth_estimateGas')[0]);
    expect(sent.from).toBe(account);
  });

  it('prefers the explicit `account` option over eth_accounts', async () => {
    const account = '0x' + '44'.repeat(20);
    const provider = new MockProvider().setHandlers('eth_estimateGas', () => '0x5208');
    await detectOffPhylax({ provider, transaction: { to: '0x0' }, account, config });
    const sent = firstArg(provider.callsTo('eth_estimateGas')[0]);
    expect(sent.from).toBe(account);
    expect(provider.callsTo('eth_accounts')).toHaveLength(0);
  });

  it('is inconclusive (not thrown) when no sender can be resolved', async () => {
    const provider = new MockProvider().setHandlers('eth_accounts', () => []);
    const result = await detectOffPhylax({ provider, transaction: { to: '0x0' }, config });
    assertStatus(result, 'inconclusive');
    const error = result.error;
    expect(error).toBeInstanceOf(Error);
    if (error instanceof Error) expect(error.message).toMatch(/no `from`/);
    expect(provider.callsTo('eth_estimateGas')).toHaveLength(0);
  });
});

// An inconclusive answer that cannot say why leaves a caller string-matching the error, which
// is the habit this whole contract exists to remove.
describe('detectOffPhylax inconclusive reasons', () => {
  it.each([
    [
      'the gate cannot judge yet',
      () => {
        throw Object.assign(
          new Error('credible layer: assertions are unavailable, try again shortly'),
          { code: -32603 },
        );
      },
      'assertions-unavailable',
      true,
    ],
    [
      'the request never landed',
      () => {
        throw new Error('fetch failed: ECONNRESET');
      },
      'transport',
      true,
    ],
    [
      'the sender cannot pay',
      () => {
        throw Object.assign(new Error('insufficient funds for gas * price + value'), {
          code: -32000,
        });
      },
      'invalid-transaction',
      false,
    ],
    [
      'nothing recognisable',
      () => {
        throw new Error('something went sideways');
      },
      'unknown',
      false,
    ],
  ])('says %s', async (_label, handler, reason, retryable) => {
    const provider = new MockProvider().setHandlers('eth_estimateGas', handler);

    const result = await detectOffPhylax({
      provider,
      transaction: tx,
      config,
      retry: false,
    });

    assertStatus(result, 'inconclusive');
    expect(result.reason).toBe(reason);
    expect(result.retryable).toBe(retryable);
  });

  it('says so when there is no sender to preflight as', async () => {
    const provider = new MockProvider().setHandlers('eth_accounts', () => []);

    const result = await detectOffPhylax({
      provider,
      transaction: { to: '0x' + '22'.repeat(20) },
      config,
    });

    assertStatus(result, 'inconclusive');
    expect(result.reason).toBe('no-sender');
    expect(result.retryable).toBe(false);
  });
});

// The preflight is a read, so reissuing it cannot double-submit; what matters is that only a
// transient refusal is reissued, and that a user is not left waiting on one that never clears.
describe('detectOffPhylax retries', () => {
  const unavailable = (): never => {
    throw Object.assign(new Error('credible layer: assertions are unavailable, try again shortly'), {
      code: -32603,
    });
  };
  const centred = { random: () => 0.5 };

  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('waits out the backoff, then answers with the attempt that lands', async () => {
    const provider = new MockProvider().setHandlers(
      'eth_estimateGas',
      unavailable,
      unavailable,
      () => '0x5208',
    );

    const pending = detectOffPhylax({ provider, transaction: tx, config, retry: centred });

    await vi.advanceTimersByTimeAsync(249);
    expect(provider.callsTo('eth_estimateGas')).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(provider.callsTo('eth_estimateGas')).toHaveLength(2);

    await vi.runAllTimersAsync();
    expect((await pending).status).toBe('on-phylax');
    expect(provider.callsTo('eth_estimateGas')).toHaveLength(3);
  });

  it('gives up after the budget instead of looping', async () => {
    const provider = new MockProvider().setHandlers('eth_estimateGas', unavailable);

    const pending = detectOffPhylax({ provider, transaction: tx, config, retry: centred });
    await vi.runAllTimersAsync();

    expect((await pending).status).toBe('inconclusive');
    expect(provider.callsTo('eth_estimateGas')).toHaveLength(RETRY_DELAYS.length + 1);
  });

  // Retrying a verdict only delays telling the caller what the node already decided.
  it('never retries a verdict', async () => {
    const provider = new MockProvider().setHandlers('eth_estimateGas', () => {
      throw errorStringRevert(`credible layer: transaction rejected by assertion 0x${'ab'.repeat(32)}`);
    });

    const pending = detectOffPhylax({ provider, transaction: tx, config, retry: centred });
    await vi.runAllTimersAsync();

    assertStatus(await pending, 'reverted');
    expect(provider.callsTo('eth_estimateGas')).toHaveLength(1);
  });

  it('answers with the first attempt when retrying is switched off', async () => {
    const provider = new MockProvider().setHandlers('eth_estimateGas', unavailable);

    const pending = detectOffPhylax({ provider, transaction: tx, config, retry: false });
    await vi.runAllTimersAsync();

    expect((await pending).status).toBe('inconclusive');
    expect(provider.callsTo('eth_estimateGas')).toHaveLength(1);
  });

  it('stops when the caller aborts mid-backoff', async () => {
    const provider = new MockProvider().setHandlers('eth_estimateGas', unavailable);
    const controller = new AbortController();

    const pending = detectOffPhylax({
      provider,
      transaction: tx,
      config,
      retry: { ...centred, signal: controller.signal },
    });

    await vi.advanceTimersByTimeAsync(1);
    controller.abort();
    await vi.runAllTimersAsync();

    expect((await pending).status).toBe('inconclusive');
    expect(provider.callsTo('eth_estimateGas')).toHaveLength(1);
  });

  it('retries a transient failure while resolving the sender', async () => {
    const account = '0x' + '33'.repeat(20);
    const disconnected = (): never => {
      throw Object.assign(new Error('The Provider is disconnected from all chains.'), {
        code: 4900,
      });
    };
    const provider = new MockProvider()
      .setHandlers('eth_accounts', disconnected, () => [account])
      .setHandlers('eth_estimateGas', () => '0x5208');

    const pending = detectOffPhylax({
      provider,
      transaction: { to: tx.to },
      config,
      retry: centred,
    });
    await vi.runAllTimersAsync();

    expect((await pending).status).toBe('on-phylax');
    expect(provider.callsTo('eth_accounts')).toHaveLength(2);
    expect(provider.callsTo('eth_estimateGas')).toHaveLength(1);
  });

  it('preserves a transport failure from sender resolution', async () => {
    const disconnected = Object.assign(
      new Error('The Provider is disconnected from all chains.'),
      { code: 4900 },
    );
    const provider = new MockProvider().setHandlers('eth_accounts', () => {
      throw disconnected;
    });

    const result = await detectOffPhylax({
      provider,
      transaction: { to: tx.to },
      config,
      retry: false,
    });

    assertStatus(result, 'inconclusive');
    expect(result.reason).toBe('transport');
    expect(result.retryable).toBe(true);
    expect(result.error).toBe(disconnected);
  });

  it('shares the retry budget across sender resolution and preflight', async () => {
    const account = '0x' + '33'.repeat(20);
    const disconnected = (): never => {
      throw Object.assign(new Error('The Provider is disconnected from all chains.'), {
        code: 4900,
      });
    };
    const provider = new MockProvider()
      .setHandlers('eth_accounts', disconnected, () => [account])
      .setHandlers('eth_estimateGas', unavailable);

    const pending = detectOffPhylax({
      provider,
      transaction: { to: tx.to },
      config,
      retry: centred,
    });
    await vi.runAllTimersAsync();

    expect((await pending).status).toBe('inconclusive');
    expect(provider.callsTo('eth_accounts')).toHaveLength(2);
    expect(provider.callsTo('eth_estimateGas')).toHaveLength(RETRY_DELAYS.length);
  });
});
